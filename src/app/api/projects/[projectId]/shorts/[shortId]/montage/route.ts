import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createClient } from '@supabase/supabase-js';
import type { MontageExport } from '@/store/montage-store';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface RouteParams {
  params: Promise<{ projectId: string; shortId: string }>;
}

/**
 * GET /api/projects/[projectId]/shorts/[shortId]/montage
 *
 * Load montage timeline data for a short.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shortId } = await params;

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.user_id !== session.user.sub) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get short with montage data
    const { data: short, error: shortError } = await supabase
      .from('scenes')
      .select('id, montage_data')
      .eq('id', shortId)
      .eq('project_id', projectId)
      .single();

    if (shortError || !short) {
      return NextResponse.json({ error: 'Short not found' }, { status: 404 });
    }

    return NextResponse.json({
      montageData: short.montage_data || null,
    });

  } catch (error) {
    console.error('Load montage error:', error);
    return NextResponse.json({ error: 'Failed to load montage' }, { status: 500 });
  }
}

/**
 * PUT /api/projects/[projectId]/shorts/[shortId]/montage
 *
 * Save montage timeline data for a short.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shortId } = await params;
    const body = await request.json();
    const montageData: MontageExport = body.montageData;

    if (!montageData) {
      return NextResponse.json({ error: 'montageData required' }, { status: 400 });
    }

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.user_id !== session.user.sub) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Update short with montage data
    const { error: updateError } = await supabase
      .from('scenes')
      .update({
        montage_data: montageData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', shortId)
      .eq('project_id', projectId);

    if (updateError) {
      console.error('Update montage error:', updateError);
      return NextResponse.json({ error: 'Failed to save montage' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      savedAt: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Save montage error:', error);
    return NextResponse.json({ error: 'Failed to save montage' }, { status: 500 });
  }
}
