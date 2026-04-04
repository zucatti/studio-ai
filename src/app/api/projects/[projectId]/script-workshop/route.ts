import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// GET: Load script workshop chat history
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
      .select('id, script_workshop_messages')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({
      messages: project.script_workshop_messages || [],
    });
  } catch (error) {
    console.error('Error loading script workshop:', error);
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
  }
}

// DELETE: Clear script workshop chat
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const supabase = createServerSupabaseClient();

    // Verify ownership and clear
    const { error } = await supabase
      .from('projects')
      .update({ script_workshop_messages: [] })
      .eq('id', projectId)
      .eq('user_id', session.user.sub);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error clearing script workshop:', error);
    return NextResponse.json({ error: 'Failed to clear' }, { status: 500 });
  }
}
