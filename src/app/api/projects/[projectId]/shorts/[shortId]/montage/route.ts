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
  // Format: https://f005.backblazeb2.com/file/bucket-name/path/file.jpg?...
  const backblazeMatch = url.match(/https:\/\/[^/]+\.backblazeb2\.com\/file\/([^/]+)\/([^?]+)/);
  if (backblazeMatch) {
    const bucket = backblazeMatch[1];
    const key = backblazeMatch[2];
    return `b2://${bucket}/${key}`;
  }

  // Check if it's a virtual-hosted style S3 URL (bucket in subdomain)
  // Format: https://bucket-name.s3.region.backblazeb2.com/path/file.jpg?...
  const virtualHostMatch = url.match(/https:\/\/([^.]+)\.s3\.[^/]+\.backblazeb2\.com\/([^?]+)/);
  if (virtualHostMatch) {
    const bucket = virtualHostMatch[1];
    const key = virtualHostMatch[2];
    return `b2://${bucket}/${key}`;
  }

  // Check if it's a path-style S3 URL (bucket in path)
  // Format: https://s3.region.backblazeb2.com/bucket-name/path/file.jpg?...
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
  // Safety check for malformed data
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

    // Normalize URLs in existing data (handles legacy data with expired signed URLs)
    let montageData = short.montage_data || null;
    if (montageData) {
      const typedData = montageData as MontageExport;
      console.log('[Montage GET] Raw data:', {
        clipCount: typedData.clips?.length || 0,
        trackCount: typedData.tracks?.length || 0,
        sampleClip: typedData.clips?.[0] ? {
          id: typedData.clips[0].id,
          assetUrl: typedData.clips[0].assetUrl?.substring(0, 50),
          thumbnailUrl: typedData.clips[0].thumbnailUrl?.substring(0, 50),
        } : null,
      });
      montageData = normalizeMontageData(typedData);
      console.log('[Montage GET] Normalized data:', {
        clipCount: (montageData as MontageExport).clips?.length || 0,
        sampleClip: (montageData as MontageExport).clips?.[0] ? {
          id: (montageData as MontageExport).clips[0].id,
          assetUrl: (montageData as MontageExport).clips[0].assetUrl?.substring(0, 50),
          thumbnailUrl: (montageData as MontageExport).clips[0].thumbnailUrl?.substring(0, 50),
        } : null,
      });
    } else {
      console.log('[Montage GET] No montage data saved for short:', shortId);
    }

    return NextResponse.json({
      montageData,
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

    // Normalize URLs to b2:// format before saving
    // This ensures URLs don't expire and can be re-signed on load
    const normalizedData = normalizeMontageData(montageData);

    // Update short with montage data
    const { error: updateError } = await supabase
      .from('scenes')
      .update({
        montage_data: normalizedData,
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
