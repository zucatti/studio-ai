import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { isSimplifiedProject } from '@/lib/project-types';
import type { ProjectType } from '@/types/database';

// GET /api/projects - Get all projects for the current user
export async function GET() {
  try {
    const session = await auth0.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    const { data: projects, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', session.user.sub)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching projects:', error);
      return NextResponse.json(
        { error: 'Failed to fetch projects' },
        { status: 500 }
      );
    }

    return NextResponse.json({ projects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/projects - Create a new project
export async function POST(request: Request) {
  try {
    const session = await auth0.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, thumbnail_url, thumbnail_focal_point, aspect_ratio, project_type, master_audio_id } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    const projectTypeValue: ProjectType = project_type || 'short';

    const supabase = createServerSupabaseClient();
    const { data: project, error } = await supabase
      .from('projects')
      .insert({
        user_id: session.user.sub,
        name: name.trim(),
        description: description?.trim() || null,
        thumbnail_url: thumbnail_url || null,
        thumbnail_focal_point: thumbnail_focal_point || { x: 50, y: 25 },
        aspect_ratio: aspect_ratio || '16:9',
        project_type: projectTypeValue,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating project:', error);
      return NextResponse.json(
        { error: 'Failed to create project' },
        { status: 500 }
      );
    }

    // Only create brainstorming entry for full pipeline projects
    if (!isSimplifiedProject(projectTypeValue)) {
      await supabase
        .from('brainstorming')
        .insert({
          project_id: project.id,
          content: '',
        });
    }

    // Link master audio asset to project for music_video projects
    if (master_audio_id && projectTypeValue === 'music_video') {
      // First verify the audio asset exists and belongs to the user
      const { data: audioAsset, error: audioError } = await supabase
        .from('global_assets')
        .select('id, data')
        .eq('id', master_audio_id)
        .eq('user_id', session.user.sub)
        .single();

      if (audioAsset && !audioError) {
        // Create project_assets link with master flag
        await supabase
          .from('project_assets')
          .insert({
            project_id: project.id,
            global_asset_id: master_audio_id,
            local_overrides: { is_master_audio: true },
          });
      }
    }

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
