import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// Valid enum values
const VALID_INT_EXT = ['INT', 'EXT', 'INT/EXT'] as const;
const VALID_TIME_OF_DAY = ['JOUR', 'NUIT', 'AUBE', 'CREPUSCULE'] as const;

function validateIntExt(value: string): typeof VALID_INT_EXT[number] {
  const upper = value?.toUpperCase?.() || 'INT';
  if (VALID_INT_EXT.includes(upper as typeof VALID_INT_EXT[number])) {
    return upper as typeof VALID_INT_EXT[number];
  }
  return 'INT';
}

function validateTimeOfDay(value: string): typeof VALID_TIME_OF_DAY[number] {
  const upper = value?.toUpperCase?.() || 'JOUR';
  if (VALID_TIME_OF_DAY.includes(upper as typeof VALID_TIME_OF_DAY[number])) {
    return upper as typeof VALID_TIME_OF_DAY[number];
  }
  return 'JOUR';
}

interface SynopsisScene {
  id: string;
  scene_number: number;
  int_ext: string;
  location: string;
  time_of_day: string;
  description: string | null;
  start_time: number | null;
  end_time: number | null;
}

// POST - Save synopsis scenes
export async function POST(request: Request, { params }: RouteParams) {
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

    const body = await request.json();
    const { scenes } = body as { scenes: SynopsisScene[] };

    if (!scenes || !Array.isArray(scenes)) {
      return NextResponse.json({ error: 'Invalid scenes data' }, { status: 400 });
    }

    // Get existing scenes to determine what to update/create/delete
    const { data: existingScenes } = await supabase
      .from('scenes')
      .select('id')
      .eq('project_id', projectId);

    const existingIds = new Set((existingScenes || []).map(s => s.id));
    const incomingIds = new Set(scenes.filter(s => !s.id.startsWith('temp-')).map(s => s.id));

    // Delete scenes that are no longer in the list
    const toDelete = [...existingIds].filter(id => !incomingIds.has(id));
    if (toDelete.length > 0) {
      // Delete shots first (cascade)
      const { data: shotsToDelete } = await supabase
        .from('shots')
        .select('id')
        .in('scene_id', toDelete);

      if (shotsToDelete && shotsToDelete.length > 0) {
        const shotIds = shotsToDelete.map(s => s.id);
        await supabase.from('dialogues').delete().in('shot_id', shotIds);
        await supabase.from('actions').delete().in('shot_id', shotIds);
        await supabase.from('shots').delete().in('scene_id', toDelete);
      }
      await supabase.from('scenes').delete().in('id', toDelete);
    }

    // Upsert scenes
    const savedScenes: SynopsisScene[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const isNew = scene.id.startsWith('temp-');

      const sceneData = {
        project_id: projectId,
        scene_number: scene.scene_number || i + 1,
        int_ext: validateIntExt(scene.int_ext),
        location: (scene.location || '').toUpperCase(),
        time_of_day: validateTimeOfDay(scene.time_of_day),
        description: scene.description || '',
        sort_order: i,
        start_time: scene.start_time,
        end_time: scene.end_time,
      };

      if (isNew) {
        // Insert new scene
        const { data: newScene, error } = await supabase
          .from('scenes')
          .insert(sceneData)
          .select()
          .single();

        if (error) {
          console.error('Error inserting scene:', error);
          continue;
        }
        savedScenes.push(newScene);
      } else {
        // Update existing scene
        const { data: updatedScene, error } = await supabase
          .from('scenes')
          .update(sceneData)
          .eq('id', scene.id)
          .select()
          .single();

        if (error) {
          console.error('Error updating scene:', error);
          continue;
        }
        savedScenes.push(updatedScene);
      }
    }

    // Update project step
    await supabase
      .from('projects')
      .update({ current_step: 'synopsis' })
      .eq('id', projectId);

    return NextResponse.json({
      success: true,
      scenes: savedScenes,
    });
  } catch (error) {
    console.error('Error saving synopsis:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la sauvegarde du synopsis' },
      { status: 500 }
    );
  }
}

// GET - Get synopsis scenes
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

    // Get scenes (synopsis view - no shots needed)
    const { data: scenes, error } = await supabase
      .from('scenes')
      .select('id, scene_number, int_ext, location, time_of_day, description, sort_order, start_time, end_time')
      .eq('project_id', projectId)
      .order('sort_order');

    if (error) {
      console.error('Error fetching scenes:', error);
      return NextResponse.json({ error: 'Erreur lors du chargement' }, { status: 500 });
    }

    return NextResponse.json({ scenes: scenes || [] });
  } catch (error) {
    console.error('Error fetching synopsis:', error);
    return NextResponse.json(
      { error: 'Erreur lors du chargement du synopsis' },
      { status: 500 }
    );
  }
}
