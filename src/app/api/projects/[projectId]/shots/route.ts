import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// GET all shots for a project (through scenes)
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const supabase = createServerSupabaseClient();

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get all scenes for this project, ordered
    const { data: scenes } = await supabase
      .from('scenes')
      .select('id, scene_number, int_ext, location, time_of_day, sort_order')
      .eq('project_id', projectId)
      .order('sort_order');

    if (!scenes || scenes.length === 0) {
      return NextResponse.json({ shots: [] });
    }

    const sceneIds = scenes.map(s => s.id);

    // Create a map of scene_id to scene sort_order for ordering
    const sceneOrderMap = new Map(scenes.map((s, idx) => [s.id, idx]));

    // Get all shots for these scenes, including dialogues
    const { data: shots } = await supabase
      .from('shots')
      .select(`
        id,
        scene_id,
        shot_number,
        description,
        shot_type,
        camera_angle,
        camera_movement,
        camera_notes,
        storyboard_image_url,
        first_frame_url,
        last_frame_url,
        first_frame_prompt,
        last_frame_prompt,
        generated_video_url,
        generation_status,
        generation_error,
        suggested_duration,
        video_provider,
        video_duration,
        video_generation_id,
        video_generation_progress,
        sort_order,
        dialogues (
          id,
          character_name,
          content,
          parenthetical,
          sort_order
        )
      `)
      .in('scene_id', sceneIds)
      .order('sort_order');

    // Attach scene info to each shot and sort by scene order, then shot order
    const shotsWithScenes = (shots || [])
      .map(shot => ({
        ...shot,
        video_generation_progress: shot.video_generation_progress
          ? (typeof shot.video_generation_progress === 'string'
              ? JSON.parse(shot.video_generation_progress)
              : shot.video_generation_progress)
          : null,
        scene: scenes.find(s => s.id === shot.scene_id),
      }))
      .sort((a, b) => {
        // First sort by scene order
        const sceneOrderA = sceneOrderMap.get(a.scene_id) ?? 0;
        const sceneOrderB = sceneOrderMap.get(b.scene_id) ?? 0;
        if (sceneOrderA !== sceneOrderB) {
          return sceneOrderA - sceneOrderB;
        }
        // Then sort by shot sort_order within the scene
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });

    return NextResponse.json({ shots: shotsWithScenes });
  } catch (error) {
    console.error('Error fetching shots:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shots: ' + String(error) },
      { status: 500 }
    );
  }
}
