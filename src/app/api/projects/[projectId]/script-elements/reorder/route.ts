import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// POST /api/projects/[projectId]/script-elements/reorder - Reorder an element
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { elementId, direction } = body;

    if (!elementId || !direction || !['up', 'down'].includes(direction)) {
      return NextResponse.json(
        { error: 'elementId and direction (up/down) are required' },
        { status: 400 }
      );
    }

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

    // Get the element
    const { data: element } = await supabase
      .from('script_elements')
      .select('id, scene_id, sort_order')
      .eq('id', elementId)
      .single();

    if (!element) {
      return NextResponse.json({ error: 'Element not found' }, { status: 404 });
    }

    // Verify scene belongs to project
    const { data: scene } = await supabase
      .from('scenes')
      .select('project_id')
      .eq('id', element.scene_id)
      .single();

    if (!scene || scene.project_id !== projectId) {
      return NextResponse.json({ error: 'Element not found' }, { status: 404 });
    }

    // Get all elements in the same scene
    const { data: allElements } = await supabase
      .from('script_elements')
      .select('id, sort_order')
      .eq('scene_id', element.scene_id)
      .order('sort_order', { ascending: true });

    if (!allElements) {
      return NextResponse.json({ error: 'Failed to get elements' }, { status: 500 });
    }

    // Find current index
    const currentIndex = allElements.findIndex((e) => e.id === elementId);
    if (currentIndex === -1) {
      return NextResponse.json({ error: 'Element not found in list' }, { status: 404 });
    }

    // Calculate target index
    const targetIndex =
      direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    // Check bounds
    if (targetIndex < 0 || targetIndex >= allElements.length) {
      return NextResponse.json({ message: 'Already at boundary' });
    }

    // Swap sort orders
    const currentElement = allElements[currentIndex];
    const targetElement = allElements[targetIndex];

    // Update both elements
    await supabase
      .from('script_elements')
      .update({ sort_order: targetElement.sort_order })
      .eq('id', currentElement.id);

    await supabase
      .from('script_elements')
      .update({ sort_order: currentElement.sort_order })
      .eq('id', targetElement.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
