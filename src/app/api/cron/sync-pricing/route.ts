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

    // Sync WaveSpeed prices
    const wavespeedPrices = await fetchWavespeedPrices();
    let updated = 0;
    let errors = 0;

    for (const price of wavespeedPrices) {
      const { error } = await supabase
        .from('provider_pricing')
        .upsert({
          provider: 'wavespeed',
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
        console.error(`[Cron] Failed to update ${price.model}:`, error);
      } else {
        updated++;
      }
    }

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
 * Fetch WaveSpeed prices
 * TODO: Implement actual API call when WaveSpeed provides one
 */
async function fetchWavespeedPrices() {
  // Current prices as of March 2026
  return [
    { model: 'kwaivgi/kling-video-o3-pro/image-to-video', alias: 'kling-o3-pro', price: 0.02, unitType: 'per_generation', category: 'video', displayName: 'Kling O3 Pro' },
    { model: 'kwaivgi/kling-video-o3-std/image-to-video', alias: 'kling-o3-std', price: 0.015, unitType: 'per_generation', category: 'video', displayName: 'Kling O3 Std' },
    { model: 'openai/sora-2/image-to-video', alias: 'sora-2', price: 0.10, unitType: 'per_generation', category: 'video', displayName: 'Sora 2' },
    { model: 'openai/sora-2-pro/image-to-video', alias: 'sora-2-pro', price: 0.15, unitType: 'per_generation', category: 'video', displayName: 'Sora 2 Pro' },
    { model: 'google/veo3.1/image-to-video', alias: 'veo-3.1', price: 0.40, unitType: 'per_generation', category: 'video', displayName: 'Veo 3.1' },
    { model: 'bytedance/seedance-v2.0/image-to-video', alias: 'seedance-2', price: 0.03, unitType: 'per_generation', category: 'video', displayName: 'Seedance 2.0' },
    { model: 'bytedance/seedance-v1.5-pro/image-to-video', alias: 'seedance-1.5', price: 0.025, unitType: 'per_generation', category: 'video', displayName: 'Seedance 1.5' },
    { model: 'alibaba/wan-2.6/image-to-video', alias: 'wan-2.6', price: 0.02, unitType: 'per_generation', category: 'video', displayName: 'WAN 2.6' },
    { model: 'alibaba/wan-2.5/image-to-video', alias: 'wan-2.5', price: 0.05, unitType: 'per_generation', category: 'video', displayName: 'WAN 2.5' },
    { model: 'bytedance/omnihuman-1.5/image-to-video', alias: 'omnihuman-1.5', price: 0.05, unitType: 'per_generation', category: 'video', displayName: 'OmniHuman 1.5' },
    { model: 'flux-dev', price: 0.005, unitType: 'per_generation', category: 'image', displayName: 'Flux Dev' },
    { model: 'flux-schnell', price: 0.005, unitType: 'per_generation', category: 'image', displayName: 'Flux Schnell' },
  ];
}

/**
 * Fetch fal.ai prices
 * TODO: Implement actual API call
 */
async function fetchFalPrices() {
  return [
    { model: 'fal-ai/nano-banana-2', alias: 'nano-banana-2', price: 0.04, unitType: 'per_generation', category: 'image', displayName: 'Nano Banana 2' },
    { model: 'fal-ai/seedream-v4', alias: 'seedream-v4', price: 0.03, unitType: 'per_generation', category: 'image', displayName: 'Seedream v4' },
    { model: 'fal-ai/flux/schnell', alias: 'flux-schnell', price: 0.003, unitType: 'per_generation', category: 'image', displayName: 'Flux Schnell' },
    { model: 'fal-ai/flux/dev', alias: 'flux-dev', price: 0.01, unitType: 'per_generation', category: 'image', displayName: 'Flux Dev' },
    { model: 'fal-ai/kling-video/v1/pro/image-to-video', alias: 'kling-pro', price: 0.10, unitType: 'per_generation', category: 'video', displayName: 'Kling Pro' },
    { model: 'fal-ai/wan-2.5', alias: 'wan-2.5', price: 0.05, unitType: 'per_generation', category: 'video', displayName: 'WAN 2.5' },
  ];
}
