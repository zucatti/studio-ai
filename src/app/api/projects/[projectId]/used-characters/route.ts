import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// GET /api/projects/[projectId]/used-characters - Get all character IDs used in the project
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

    // Get all character IDs used in script_elements (dialogues)
    const { data: scriptElements, error: scriptError } = await supabase
      .from('script_elements')
      .select('character_id, scene_id')
      .not('character_id', 'is', null);

    if (scriptError) {
      console.error('Error fetching script elements:', scriptError);
    }

    // Filter to only script elements from scenes in this project
    const { data: scenes } = await supabase
      .from('scenes')
      .select('id')
      .eq('project_id', projectId);

    const sceneIds = new Set((scenes || []).map((s) => s.id));

    // Collect unique character IDs from project's scenes
    const characterIds = new Set<string>();

    (scriptElements || []).forEach((element) => {
      if (element.character_id && sceneIds.has(element.scene_id)) {
        characterIds.add(element.character_id);
      }
    });

    // Also check dialogues table if it exists
    try {
      const { data: dialogues } = await supabase
        .from('dialogues')
        .select('character_id, scene_id')
        .not('character_id', 'is', null);

      (dialogues || []).forEach((dialogue) => {
        if (dialogue.character_id && sceneIds.has(dialogue.scene_id)) {
          characterIds.add(dialogue.character_id);
        }
      });
    } catch {
      // dialogues table might not exist
    }

    return NextResponse.json({
      characterIds: Array.from(characterIds),
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
