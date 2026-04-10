import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createClient } from '@supabase/supabase-js';
import type { MontageExport, MontageClip } from '@/store/montage-store';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Convert signed HTTPS Backblaze URLs back to b2:// format.
 * This ensures we always store canonical b2:// URLs that can be re-signed on load.
 */
function normalizeToB2Url(url: string | undefined | null): string | undefined {
  if (!url) return undefined;

  // Already a b2:// URL - return as-is
  if (url.startsWith('b2://')) return url;

  // Check if it's a Backblaze signed URL (native B2 format)
  const backblazeMatch = url.match(/https:\/\/[^/]+\.backblazeb2\.com\/file\/([^/]+)\/([^?]+)/);
  if (backblazeMatch) {
    const bucket = backblazeMatch[1];
    const key = backblazeMatch[2];
    return `b2://${bucket}/${key}`;
  }

  // Check if it's a virtual-hosted style S3 URL (bucket in subdomain)
  const virtualHostMatch = url.match(/https:\/\/([^.]+)\.s3\.[^/]+\.backblazeb2\.com\/([^?]+)/);
  if (virtualHostMatch) {
    const bucket = virtualHostMatch[1];
    const key = virtualHostMatch[2];
    return `b2://${bucket}/${key}`;
  }

  // Check if it's a path-style S3 URL (bucket in path)
  const pathStyleMatch = url.match(/https:\/\/s3\.[^/]+\.backblazeb2\.com\/([^/]+)\/([^?]+)/);
  if (pathStyleMatch) {
    const bucket = pathStyleMatch[1];
    const key = pathStyleMatch[2];
    return `b2://${bucket}/${key}`;
  }

  // Not a Backblaze URL - return as-is (could be external URL)
  return url;
}

/**
 * Normalize all URLs in montage clips to b2:// format before saving.
 */
function normalizeMontageData(data: MontageExport): MontageExport {
  if (!data || !Array.isArray(data.clips)) {
    return data;
  }

  return {
    ...data,
    clips: data.clips.map((clip: MontageClip) => ({
      ...clip,
      assetUrl: normalizeToB2Url(clip.assetUrl),
      thumbnailUrl: normalizeToB2Url(clip.thumbnailUrl),
    })),
  };
}

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/timeline
 *
 * Load project-level timeline data.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;

    // Get project with timeline data
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id, timeline_data')
      .eq('id', projectId)
      .single();

    if (projectError) {
      console.error('[Timeline GET] Project query error:', projectError);
      return NextResponse.json({ error: `Project error: ${projectError.message}` }, { status: 404 });
    }

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.user_id !== session.user.sub) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Normalize URLs in existing data
    let montageData = project.timeline_data || null;
    if (montageData) {
      const typedData = montageData as MontageExport;
      console.log('[Timeline GET] Raw data:', {
        clipCount: typedData.clips?.length || 0,
        trackCount: typedData.tracks?.length || 0,
      });
      montageData = normalizeMontageData(typedData);
    } else {
      console.log('[Timeline GET] No timeline data saved for project:', projectId);
    }

    return NextResponse.json({ montageData });

  } catch (error) {
    console.error('Load timeline error:', error);
    return NextResponse.json({ error: 'Failed to load timeline' }, { status: 500 });
  }
}

/**
 * PUT /api/projects/[projectId]/timeline
 *
 * Save project-level timeline data.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
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

    // Normalize URLs to b2:// format before saving
    const normalizedData = normalizeMontageData(montageData);

    // Update project with timeline data
    const { error: updateError } = await supabase
      .from('projects')
      .update({
        timeline_data: normalizedData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);

    if (updateError) {
      console.error('Update timeline error:', updateError);
      return NextResponse.json({ error: 'Failed to save timeline' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      savedAt: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Save timeline error:', error);
    return NextResponse.json({ error: 'Failed to save timeline' }, { status: 500 });
  }
}
