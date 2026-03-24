import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string; sectionId: string }>;
}

// GET /api/projects/[projectId]/sections/[sectionId]/shots - Get all shots for a section
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, sectionId } = await params;
    const supabase = createServerSupabaseClient();

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Verify section exists
    const { data: section, error: sectionError } = await supabase
      .from('music_sections')
      .select('id, start_time, end_time')
      .eq('id', sectionId)
      .eq('project_id', projectId)
      .single();

    if (sectionError || !section) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }

    // Fetch shots for this section
    const { data: shots, error: shotsError } = await supabase
      .from('shots')
      .select('id, description, relative_start, sort_order, shot_type, storyboard_image_url, first_frame_url')
      .eq('section_id', sectionId)
      .order('relative_start', { ascending: true });

    if (shotsError) {
      console.error('Error fetching shots:', shotsError);
      return NextResponse.json({ error: 'Failed to fetch shots' }, { status: 500 });
    }

    return NextResponse.json({ shots: shots || [], section });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/sections/[sectionId]/shots - Create a new shot in the section
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, sectionId } = await params;
    const body = await request.json();
    const { relative_start, duration, description } = body;

    // Shot duration constraints (matching AI video generators)
    const MIN_SHOT_DURATION = 3;
    const MAX_SHOT_DURATION = 15;

    // Validate inputs
    if (typeof relative_start !== 'number' || relative_start < 0) {
      return NextResponse.json({ error: 'Invalid relative_start: ' + relative_start }, { status: 400 });
    }
    if (typeof duration !== 'number' || duration < MIN_SHOT_DURATION - 0.1 || duration > MAX_SHOT_DURATION + 0.1) {
      return NextResponse.json({ error: `Duration must be between ${MIN_SHOT_DURATION}s and ${MAX_SHOT_DURATION}s (got ${duration.toFixed(1)}s)` }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Verify project ownership and get project info
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Verify section exists and get duration
    const { data: section, error: sectionError } = await supabase
      .from('music_sections')
      .select('id, start_time, end_time')
      .eq('id', sectionId)
      .eq('project_id', projectId)
      .single();

    if (sectionError || !section) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }

    const sectionDuration = section.end_time - section.start_time;

    // Validate that shot fits within section (with small tolerance for floating point)
    if (relative_start + duration > sectionDuration + 0.1) {
      return NextResponse.json(
        { error: `Shot extends beyond section duration (${relative_start} + ${duration} > ${sectionDuration})` },
        { status: 400 }
      );
    }

    // Get the first scene for this project (shots require a scene_id)
    // For music videos, we create a default scene if needed
    let { data: scenes } = await supabase
      .from('scenes')
      .select('id')
      .eq('project_id', projectId)
      .order('scene_number', { ascending: true })
      .limit(1);

    let sceneId: string;

    if (!scenes || scenes.length === 0) {
      // Create a default scene for music video shots
      const { data: newScene, error: sceneCreateError } = await supabase
        .from('scenes')
        .insert({
          project_id: projectId,
          scene_number: 1,
          location: 'Clip',
          description: 'Scène principale du clip',
          int_ext: 'INT',
          time_of_day: 'JOUR',
        })
        .select('id')
        .single();

      if (sceneCreateError || !newScene) {
        console.error('Error creating default scene:', sceneCreateError);
        return NextResponse.json({ error: 'Failed to create default scene: ' + sceneCreateError.message }, { status: 500 });
      }
      sceneId = newScene.id;
    } else {
      sceneId = scenes[0].id;
    }

    // Get the next shot number for this scene
    const { data: existingShots } = await supabase
      .from('shots')
      .select('shot_number')
      .eq('scene_id', sceneId)
      .order('shot_number', { ascending: false })
      .limit(1);

    const nextShotNumber = existingShots && existingShots.length > 0
      ? existingShots[0].shot_number + 1
      : 1;

    // Create the shot
    const { data: shot, error: insertError } = await supabase
      .from('shots')
      .insert({
        scene_id: sceneId,
        section_id: sectionId,
        shot_number: nextShotNumber,
        relative_start: relative_start,
        description: description || '',
        sort_order: Math.round(relative_start * 1000), // Use relative start as sort order (rounded to int)
      })
      .select('id, description, relative_start, sort_order')
      .single();

    if (insertError) {
      console.error('Error creating shot:', insertError);
      return NextResponse.json({ error: 'Failed to create shot: ' + insertError.message }, { status: 500 });
    }

    // Return shot with calculated duration
    return NextResponse.json({
      shot: {
        ...shot,
        duration,
      },
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
