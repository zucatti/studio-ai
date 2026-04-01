import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { refreshCache, needsSync } from '@/lib/pricing-service';

/**
 * GET /api/cron/sync-pricing
 *
 * Daily cron job to sync provider pricing.
 * Called by Vercel Cron at 6:00 AM UTC every day.
 *
 * Security: Protected by CRON_SECRET header
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check if sync is actually needed
    const syncRequired = await needsSync();
    if (!syncRequired) {
      return NextResponse.json({
        success: true,
        message: 'Sync not needed, last sync was within 24h',
        synced: false,
      });
    }

    const supabase = createServerSupabaseClient();
    let updated = 0;
    let errors = 0;

    // Sync fal.ai prices
    const falPrices = await fetchFalPrices();
    for (const price of falPrices) {
      const { error } = await supabase
        .from('provider_pricing')
        .upsert({
          provider: 'fal',
          model: price.model,
          model_alias: price.alias,
          price_per_unit: price.price,
          unit_type: price.unitType,
          category: price.category,
          display_name: price.displayName,
          source: 'cron',
          last_synced_at: new Date().toISOString(),
        }, {
          onConflict: 'provider,model',
        });

      if (error) {
        errors++;
      } else {
        updated++;
      }
    }

    // Sync Runway prices
    const runwayPrices = await fetchRunwayPrices();
    for (const price of runwayPrices) {
      const { error } = await supabase
        .from('provider_pricing')
        .upsert({
          provider: 'runway',
          model: price.model,
          model_alias: price.alias,
          price_per_unit: price.price,
          unit_type: price.unitType,
          category: price.category,
          display_name: price.displayName,
          source: 'cron',
          last_synced_at: new Date().toISOString(),
        }, {
          onConflict: 'provider,model',
        });

      if (error) {
        errors++;
      } else {
        updated++;
      }
    }

    // Log sync result
    await supabase.from('pricing_sync_log').insert({
      provider: 'all',
      status: errors > 0 ? 'partial' : 'success',
      models_updated: updated,
      error_message: errors > 0 ? `${errors} models failed to update` : null,
      sync_source: 'cron',
    });

    // Refresh cache
    await refreshCache();

    console.log(`[Cron] Pricing sync complete: ${updated} updated, ${errors} errors`);

    return NextResponse.json({
      success: true,
      synced: true,
      updated,
      errors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron] Pricing sync failed:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * Fetch fal.ai prices
 */
async function fetchFalPrices() {
  return [
    { model: 'fal-ai/nano-banana-2', alias: 'nano-banana-2', price: 0.04, unitType: 'per_generation', category: 'image', displayName: 'Nano Banana 2' },
    { model: 'fal-ai/seedream-v4', alias: 'seedream-v4', price: 0.03, unitType: 'per_generation', category: 'image', displayName: 'Seedream v4' },
    { model: 'fal-ai/flux/schnell', alias: 'flux-schnell', price: 0.003, unitType: 'per_generation', category: 'image', displayName: 'Flux Schnell' },
    { model: 'fal-ai/flux/dev', alias: 'flux-dev', price: 0.01, unitType: 'per_generation', category: 'image', displayName: 'Flux Dev' },
    { model: 'fal-ai/kling-video/v3/standard/image-to-video', alias: 'kling-omni', price: 0.10, unitType: 'per_generation', category: 'video', displayName: 'Kling 3.0 Omni' },
    { model: 'fal-ai/veo3.1/fast/image-to-video', alias: 'veo-3', price: 0.40, unitType: 'per_generation', category: 'video', displayName: 'Veo 3.1' },
    { model: 'fal-ai/bytedance/omnihuman/v1.5', alias: 'omnihuman', price: 0.05, unitType: 'per_generation', category: 'video', displayName: 'OmniHuman 1.5' },
    { model: 'fal-ai/sora-2/image-to-video', alias: 'sora-2', price: 0.10, unitType: 'per_generation', category: 'video', displayName: 'Sora 2' },
  ];
}

/**
 * Fetch Runway prices
 */
async function fetchRunwayPrices() {
  return [
    { model: 'gen4', alias: 'gen4', price: 0.05, unitType: 'per_second', category: 'video', displayName: 'Gen-4 Turbo' },
    { model: 'gen4.5', alias: 'gen4.5', price: 0.10, unitType: 'per_second', category: 'video', displayName: 'Gen-4.5' },
    { model: 'gen4-image', alias: 'gen4-image', price: 0.05, unitType: 'per_generation', category: 'image', displayName: 'Gen-4 Image' },
  ];
}
