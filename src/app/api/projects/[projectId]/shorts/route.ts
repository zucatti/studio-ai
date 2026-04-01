import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getSignedFileUrl } from '@/lib/storage';

// Helper to sign B2 URLs
async function signB2Url(url: string | null): Promise<string | null> {
  if (!url) return null;
  if (!url.startsWith('b2://')) return url;
  const match = url.match(/^b2:\/\/[^/]+\/(.+)$/);
  if (!match) return url;
  try {
    return await getSignedFileUrl(match[1]);
  } catch {
    return url;
  }
}

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// GET /api/projects/[projectId]/shorts - Get all shorts for a project
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const supabase = createServerSupabaseClient();

    // Verify project ownership and type
    const { data: project } = await supabase
      .from('projects')
      .select('id, project_type')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.project_type !== 'shorts_project') {
      return NextResponse.json({ error: 'Not a shorts project' }, { status: 400 });
    }

    // Get all scenes (shorts) with their shots (plans)
    // First try with cinematic columns, fall back to basic query if columns don't exist
    let scenes;
    let error;

    // Try with all columns (including cinematic)
    const fullQuery = await supabase
      .from('scenes')
      .select(`
        id,
        project_id,
        scene_number,
        title,
        description,
        sort_order,
        assembled_video_url,
        assembled_video_duration,
        cinematic_header,
        character_mappings,
        generation_mode,
        dialogue_language,
        created_at,
        updated_at,
        shots (
          id,
          shot_number,
          description,
          duration,
          shot_type,
          camera_angle,
          camera_movement,
          storyboard_image_url,
          first_frame_url,
          last_frame_url,
          generated_video_url,
          generation_status,
          sort_order,
          frame_in,
          frame_out,
          animation_prompt,
          has_dialogue,
          dialogue_text,
          dialogue_character_id,
          dialogue_audio_url,
          audio_mode,
          audio_asset_id,
          audio_start,
          audio_end,
          shot_subject,
          framing,
          action,
          environment,
          dialogue_tone,
          start_time,
          title,
          cinematic_header,
          segments
        )
      `)
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });

    if (fullQuery.error && fullQuery.error.message?.includes('column')) {
      // Fallback: columns don't exist yet, use basic query
      console.log('[Shorts API] Cinematic columns not found, using basic query');
      const basicQuery = await supabase
        .from('scenes')
        .select(`
          id,
          project_id,
          scene_number,
          title,
          description,
          sort_order,
          assembled_video_url,
          assembled_video_duration,
          created_at,
          updated_at,
          shots (
            id,
            shot_number,
            description,
            duration,
            shot_type,
            camera_angle,
            camera_movement,
            storyboard_image_url,
            first_frame_url,
            last_frame_url,
            generated_video_url,
            generation_status,
            sort_order,
            frame_in,
            frame_out,
            animation_prompt,
            has_dialogue,
            dialogue_text,
            dialogue_character_id,
            dialogue_audio_url,
            audio_mode,
            audio_asset_id,
            audio_start,
            audio_end
          )
        `)
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true });

      scenes = basicQuery.data;
      error = basicQuery.error;
    } else {
      scenes = fullQuery.data;
      error = fullQuery.error;
    }

    if (error) {
      console.error('Error fetching shorts:', error);
      return NextResponse.json({ error: 'Failed to fetch shorts' }, { status: 500 });
    }

    // Transform to shorts format with signed URLs
    const shorts = await Promise.all((scenes || []).map(async (scene) => {
      const plans = await Promise.all((scene.shots || [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(async (shot) => ({
          id: shot.id,
          short_id: scene.id,
          shot_number: shot.shot_number,
          description: shot.description || '',
          duration: shot.duration || 5,
          shot_type: shot.shot_type,
          camera_angle: shot.camera_angle,
          camera_movement: shot.camera_movement,
          storyboard_image_url: await signB2Url(shot.storyboard_image_url),
          first_frame_url: await signB2Url(shot.first_frame_url || shot.storyboard_image_url),
          last_frame_url: await signB2Url(shot.last_frame_url),
          generated_video_url: await signB2Url(shot.generated_video_url),
          generation_status: shot.generation_status || 'not_started',
          sort_order: shot.sort_order,
          frame_in: shot.frame_in ?? 0,
          frame_out: shot.frame_out ?? 100,
          animation_prompt: shot.animation_prompt,
          has_dialogue: shot.has_dialogue ?? false,
          dialogue_text: shot.dialogue_text,
          dialogue_character_id: shot.dialogue_character_id,
          dialogue_audio_url: await signB2Url(shot.dialogue_audio_url),
          // Audio/Music
          audio_mode: shot.audio_mode || 'mute',
          audio_asset_id: shot.audio_asset_id,
          audio_start: shot.audio_start ?? 0,
          audio_end: shot.audio_end,
          // Cinematic shot details (optional - may not exist if migration not run)
          shot_subject: (shot as Record<string, unknown>).shot_subject ?? null,
          framing: (shot as Record<string, unknown>).framing ?? null,
          action: (shot as Record<string, unknown>).action ?? null,
          environment: (shot as Record<string, unknown>).environment ?? null,
          dialogue_tone: (shot as Record<string, unknown>).dialogue_tone ?? null,
          start_time: (shot as Record<string, unknown>).start_time ?? null,
          // Plan-level cinematic fields
          title: (shot as Record<string, unknown>).title ?? null,
          cinematic_header: (shot as Record<string, unknown>).cinematic_header ?? null,
          segments: (shot as Record<string, unknown>).segments ?? [],
        })));

      const totalDuration = plans.reduce((sum, p) => sum + p.duration, 0);

      return {
        id: scene.id,
        project_id: scene.project_id,
        title: scene.title || `Short ${scene.scene_number}`,
        description: scene.description,
        scene_number: scene.scene_number,
        sort_order: scene.sort_order,
        plans,
        totalDuration,
        assembled_video_url: scene.assembled_video_url || null,
        assembled_video_duration: scene.assembled_video_duration || null,
        // Cinematic fields (optional - may not exist if migration not run)
        cinematic_header: (scene as Record<string, unknown>).cinematic_header || null,
        character_mappings: (scene as Record<string, unknown>).character_mappings || null,
        generation_mode: (scene as Record<string, unknown>).generation_mode || 'standard',
        dialogue_language: (scene as Record<string, unknown>).dialogue_language || 'en',
        created_at: scene.created_at,
        updated_at: scene.updated_at,
      };
    }));

    return NextResponse.json({ shorts });
  } catch (error) {
    console.error('Error fetching shorts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/shorts - Create a new short
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { title } = body;

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Verify project ownership and type
    const { data: project } = await supabase
      .from('projects')
      .select('id, project_type')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.project_type !== 'shorts_project') {
      return NextResponse.json({ error: 'Not a shorts project' }, { status: 400 });
    }

    // Get max sort_order and scene_number
    const { data: maxData } = await supabase
      .from('scenes')
      .select('sort_order, scene_number')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxData?.sort_order ?? -1) + 1;
    const nextNumber = (maxData?.scene_number ?? 0) + 1;

    // Create the short (scene)
    const { data: scene, error } = await supabase
      .from('scenes')
      .insert({
        project_id: projectId,
        scene_number: nextNumber,
        title: title.trim(),
        int_ext: 'INT', // Default values for shorts
        location: '',
        time_of_day: 'JOUR',
        sort_order: nextOrder,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating short:', error);
      return NextResponse.json({ error: 'Failed to create short' }, { status: 500 });
    }

    return NextResponse.json({
      short: {
        id: scene.id,
        project_id: scene.project_id,
        title: scene.title,
        description: scene.description,
        scene_number: scene.scene_number,
        sort_order: scene.sort_order,
        created_at: scene.created_at,
        updated_at: scene.updated_at,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating short:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
