import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string; referenceId: string }>;
}

// DELETE /api/projects/[projectId]/references/[referenceId] - Unlink reference from project
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, referenceId } = await params;
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

    // Delete link (referenceId here is the link_id)
    const { error } = await supabase
      .from('project_reference_links')
      .delete()
      .eq('id', referenceId)
      .eq('project_id', projectId);

    if (error) {
      console.error('Error unlinking reference:', error);
      return NextResponse.json({ error: 'Failed to unlink reference' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /projects/[id]/references/[id]:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
