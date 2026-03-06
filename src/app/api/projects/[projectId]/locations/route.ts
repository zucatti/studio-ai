import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

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

    const { data: locations, error } = await supabase
      .from('locations')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching locations:', error);
      return NextResponse.json({ error: 'Failed to fetch locations' }, { status: 500 });
    }

    return NextResponse.json({ locations });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
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

    const { data: location, error } = await supabase
      .from('locations')
      .insert({
        project_id: projectId,
        name: body.name,
        type: body.type || 'interior',
        visual_description: body.visual_description || '',
        lighting: body.lighting || null,
        mood: body.mood || null,
        reference_images: body.reference_images || [],
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating location:', error);
      return NextResponse.json({ error: 'Failed to create location' }, { status: 500 });
    }

    return NextResponse.json({ location }, { status: 201 });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
