import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createClient } from '@supabase/supabase-js';
import { getSignedFileUrl, parseStorageUrl } from '@/lib/storage';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/fix-audio-durations
 *
 * Returns audio assets that need duration fix with signed URLs.
 */
export async function GET() {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all audio assets with duration 0 or null
    const { data: audioAssets, error: fetchError } = await supabase
      .from('global_assets')
      .select('id, name, data')
      .eq('asset_type', 'audio');

    if (fetchError) {
      console.error('Failed to fetch audio assets:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 });
    }

    const assetsToFix: Array<{ id: string; name: string; signedUrl: string }> = [];

    for (const asset of audioAssets || []) {
      const data = asset.data as { fileUrl?: string; duration?: number } | null;
      const fileUrl = data?.fileUrl;
      const currentDuration = data?.duration || 0;

      // Skip if no URL or already has duration
      if (!fileUrl || currentDuration > 0) continue;

      try {
        let signedUrl = fileUrl;
        if (fileUrl.startsWith('b2://')) {
          const parsed = parseStorageUrl(fileUrl);
          if (parsed) {
            signedUrl = await getSignedFileUrl(parsed.key, 600);
          }
        }

        assetsToFix.push({
          id: asset.id,
          name: asset.name,
          signedUrl
        });
      } catch (error) {
        console.error(`Failed to sign URL for ${asset.name}:`, error);
      }
    }

    return NextResponse.json({ assets: assetsToFix });

  } catch (error) {
    console.error('Fix audio durations error:', error);
    return NextResponse.json({ error: 'Failed to get assets' }, { status: 500 });
  }
}

/**
 * PATCH /api/fix-audio-durations
 *
 * Update duration for a specific audio asset.
 * Body: { id: string, duration: number }
 */
export async function PATCH(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, duration } = body;

    if (!id || typeof duration !== 'number') {
      return NextResponse.json({ error: 'id and duration required' }, { status: 400 });
    }

    // Fetch current data
    const { data: asset, error: fetchError } = await supabase
      .from('global_assets')
      .select('data')
      .eq('id', id)
      .single();

    if (fetchError || !asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    // Update duration in data
    const updatedData = {
      ...(asset.data as object || {}),
      duration
    };

    const { error: updateError } = await supabase
      .from('global_assets')
      .update({ data: updatedData })
      .eq('id', id);

    if (updateError) {
      console.error('Failed to update asset:', updateError);
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }

    return NextResponse.json({ success: true, id, duration });

  } catch (error) {
    console.error('Update audio duration error:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
