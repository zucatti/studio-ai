import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { uploadFile, getSignedFileUrl, parseStorageUrl } from '@/lib/storage';
import sharp from 'sharp';

interface RouteParams {
  params: Promise<{ assetId: string }>;
}

// Image type order for the 2x2 grid
const IMAGE_ORDER = ['front', 'profile', 'three_quarter', 'back'] as const;

/**
 * POST /api/global-assets/[assetId]/generate-matrix
 *
 * Generates a 2048x2048 character matrix image from the 4 reference views.
 * Layout:
 *   ┌────────────┬────────────┐
 *   │   FRONT    │   PROFILE  │
 *   ├────────────┼────────────┤
 *   │    3/4     │    BACK    │
 *   └────────────┴────────────┘
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { assetId } = await params;
    const body = await request.json().catch(() => ({}));
    const isGenericAsset = body.isGenericAsset === true;
    const projectId = body.projectId as string | undefined;

    console.log('[GenerateMatrix] Request for assetId:', assetId, 'isGenericAsset:', isGenericAsset);

    const supabase = createServerSupabaseClient();

    // Get the asset and its reference images
    let referenceImages: Array<{ url: string; type: string }> = [];
    let assetName = 'character';
    let updateTarget: 'global_asset' | 'project_generic_asset' = 'global_asset';

    if (isGenericAsset && projectId) {
      // Generic character - get from project_generic_assets
      const { data: genericAsset, error } = await supabase
        .from('project_generic_assets')
        .select('*')
        .eq('id', assetId)
        .eq('project_id', projectId)
        .single();

      if (error || !genericAsset) {
        return NextResponse.json({ error: 'Generic asset not found' }, { status: 404 });
      }

      const localOverrides = (genericAsset.local_overrides || {}) as {
        reference_images_metadata?: Array<{ url: string; type: string }>;
      };
      referenceImages = localOverrides.reference_images_metadata || [];
      assetName = genericAsset.name_override || 'generic_character';
      updateTarget = 'project_generic_asset';
    } else {
      // Global asset - verify ownership
      const { data: asset, error } = await supabase
        .from('global_assets')
        .select('*')
        .eq('id', assetId)
        .eq('user_id', session.user.sub)
        .single();

      if (error || !asset) {
        return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
      }

      if (asset.asset_type !== 'character') {
        return NextResponse.json({ error: 'Asset is not a character' }, { status: 400 });
      }

      // For global assets, reference_images is an array of URLs
      // We need to determine types from the order or use metadata
      const urls = asset.reference_images || [];
      const assetData = (asset.data || {}) as { reference_images_metadata?: Array<{ url: string; type: string }> };

      if (assetData.reference_images_metadata?.length) {
        referenceImages = assetData.reference_images_metadata;
      } else {
        // Fallback: assume order is front, profile, three_quarter, back
        referenceImages = urls.map((url: string, index: number) => ({
          url,
          type: IMAGE_ORDER[index] || 'unknown',
        }));
      }
      assetName = asset.name || 'character';
    }

    // Check we have all 4 images
    const imagesByType = new Map(referenceImages.map(img => [img.type, img.url]));
    const missingTypes = IMAGE_ORDER.filter(type => !imagesByType.has(type));

    if (missingTypes.length > 0) {
      return NextResponse.json({
        error: `Missing reference images: ${missingTypes.join(', ')}`,
        missingTypes,
      }, { status: 400 });
    }

    // Download and process all 4 images
    const CELL_SIZE = 1024;
    const MATRIX_SIZE = 2048;

    const imageBuffers: Buffer[] = [];

    for (const type of IMAGE_ORDER) {
      const url = imagesByType.get(type)!;

      // Get signed URL if it's a B2 URL
      let fetchUrl = url;
      if (url.startsWith('b2://')) {
        const parsed = parseStorageUrl(url);
        if (parsed) {
          fetchUrl = await getSignedFileUrl(parsed.key);
        }
      }

      // Download the image
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        return NextResponse.json({
          error: `Failed to download ${type} image`,
        }, { status: 500 });
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Resize to cell size with cover fit (crop to fill)
      const resized = await sharp(buffer)
        .resize(CELL_SIZE, CELL_SIZE, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 90 })
        .toBuffer();

      imageBuffers.push(resized);
    }

    // Compose the 2x2 grid
    const matrix = await sharp({
      create: {
        width: MATRIX_SIZE,
        height: MATRIX_SIZE,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite([
        { input: imageBuffers[0], left: 0, top: 0 },           // Front (top-left)
        { input: imageBuffers[1], left: CELL_SIZE, top: 0 },   // Profile (top-right)
        { input: imageBuffers[2], left: 0, top: CELL_SIZE },   // 3/4 (bottom-left)
        { input: imageBuffers[3], left: CELL_SIZE, top: CELL_SIZE }, // Back (bottom-right)
      ])
      .jpeg({ quality: 92 })
      .toBuffer();

    // Upload to B2
    const sanitizedUserId = session.user.sub.replace(/[|]/g, '_');
    const timestamp = Date.now();
    const safeName = assetName.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
    const storageKey = `characters/${sanitizedUserId}/${assetId}/${safeName}_matrix_${timestamp}.jpg`;

    const { url: matrixUrl } = await uploadFile(storageKey, matrix, 'image/jpeg');

    // Update the asset with the matrix URL
    if (updateTarget === 'project_generic_asset') {
      // Get current local_overrides
      const { data: current } = await supabase
        .from('project_generic_assets')
        .select('local_overrides')
        .eq('id', assetId)
        .single();

      const currentOverrides = (current?.local_overrides || {}) as Record<string, unknown>;

      const { error: updateError } = await supabase
        .from('project_generic_assets')
        .update({
          local_overrides: {
            ...currentOverrides,
            character_matrix_url: matrixUrl,
          },
        })
        .eq('id', assetId);

      if (updateError) {
        console.error('Error updating project_generic_assets:', updateError);
        return NextResponse.json({ error: 'Failed to save matrix URL' }, { status: 500 });
      }
    } else {
      // Global asset - update data field
      // IMPORTANT: Filter by both id AND user_id to prevent cross-user updates
      const { data: current } = await supabase
        .from('global_assets')
        .select('data')
        .eq('id', assetId)
        .eq('user_id', session.user.sub)
        .single();

      if (!current) {
        console.error('[GenerateMatrix] Asset not found for update:', assetId);
        return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
      }

      const currentData = (current?.data || {}) as Record<string, unknown>;

      console.log('[GenerateMatrix] Updating asset:', assetId, 'name:', assetName);
      console.log('[GenerateMatrix] New matrix URL:', matrixUrl);

      const { error: updateError } = await supabase
        .from('global_assets')
        .update({
          data: {
            ...currentData,
            character_matrix_url: matrixUrl,
          },
        })
        .eq('id', assetId)
        .eq('user_id', session.user.sub);

      if (updateError) {
        console.error('Error updating global_assets:', updateError);
        return NextResponse.json({ error: 'Failed to save matrix URL' }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      characterMatrixUrl: matrixUrl,
    });

  } catch (error) {
    console.error('Error generating character matrix:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
