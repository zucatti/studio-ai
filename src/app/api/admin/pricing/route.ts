import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getAllPrices, refreshCache, needsSync } from '@/lib/pricing-service';

// Admin user IDs that can modify pricing
const ADMIN_USER_IDS = [
  process.env.ADMIN_USER_ID,
].filter(Boolean);

/**
 * GET /api/admin/pricing
 * Get all current prices
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider');

    const supabase = createServerSupabaseClient();

    let query = supabase
      .from('provider_pricing')
      .select('*')
      .eq('is_active', true)
      .order('provider')
      .order('category')
      .order('display_name');

    if (provider) {
      query = query.eq('provider', provider);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Check if sync is needed
    const syncNeeded = await needsSync();

    return NextResponse.json({
      prices: data,
      count: data?.length || 0,
      syncNeeded,
    });
  } catch (error) {
    console.error('[Pricing API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/pricing
 * Update or create prices (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth0.getSession();
    if (!session?.user || !ADMIN_USER_IDS.includes(session.user.sub)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, prices } = body;

    const supabase = createServerSupabaseClient();

    if (action === 'sync') {
      // Trigger price sync from providers
      const result = await syncPricesFromProviders(supabase);
      await refreshCache();
      return NextResponse.json(result);
    }

    if (action === 'update' && prices) {
      // Manual price update
      const updates = [];
      const errors = [];

      for (const price of prices) {
        const { provider, model, price_per_unit, display_name, is_active } = price;

        const { error } = await supabase
          .from('provider_pricing')
          .upsert({
            provider,
            model,
            price_per_unit,
            display_name,
            is_active: is_active ?? true,
            source: 'manual',
            last_synced_at: new Date().toISOString(),
          }, {
            onConflict: 'provider,model',
          });

        if (error) {
          errors.push({ model, error: error.message });
        } else {
          updates.push(model);
        }
      }

      await refreshCache();

      return NextResponse.json({
        success: true,
        updated: updates.length,
        errors: errors.length > 0 ? errors : undefined,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[Pricing API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Sync prices from provider APIs
 */
async function syncPricesFromProviders(supabase: ReturnType<typeof createServerSupabaseClient>) {
  const results = {
    wavespeed: { updated: 0, errors: [] as string[] },
    fal: { updated: 0, errors: [] as string[] },
    runway: { updated: 0, errors: [] as string[] },
  };

  // Sync WaveSpeed prices
  try {
    const wavespeedPrices = await fetchWavespeedPrices();
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
          source: 'api',
          last_synced_at: new Date().toISOString(),
        }, {
          onConflict: 'provider,model',
        });

      if (error) {
        results.wavespeed.errors.push(price.model);
      } else {
        results.wavespeed.updated++;
      }
    }
  } catch (error) {
    results.wavespeed.errors.push(`Sync failed: ${error}`);
  }

  // Log sync
  await supabase.from('pricing_sync_log').insert({
    provider: 'all',
    status: 'success',
    models_updated: results.wavespeed.updated + results.fal.updated + results.runway.updated,
    sync_source: 'api',
  });

  return results;
}

/**
 * Fetch prices from WaveSpeed API
 * Note: This is a placeholder - implement actual API call when available
 */
async function fetchWavespeedPrices(): Promise<Array<{
  model: string;
  alias?: string;
  price: number;
  unitType: string;
  category: string;
  displayName: string;
}>> {
  // WaveSpeed pricing page: https://wavespeed.ai/pricing
  // If they have an API, we'd call it here

  // For now, return current known prices (March 2026)
  return [
    // Kling
    { model: 'kwaivgi/kling-video-o3-pro/image-to-video', alias: 'kling-o3-pro', price: 0.02, unitType: 'per_generation', category: 'video', displayName: 'Kling O3 Pro' },
    { model: 'kwaivgi/kling-video-o3-std/image-to-video', alias: 'kling-o3-std', price: 0.015, unitType: 'per_generation', category: 'video', displayName: 'Kling O3 Std' },
    // Sora
    { model: 'openai/sora-2/image-to-video', alias: 'sora-2', price: 0.10, unitType: 'per_generation', category: 'video', displayName: 'Sora 2' },
    { model: 'openai/sora-2-pro/image-to-video', alias: 'sora-2-pro', price: 0.15, unitType: 'per_generation', category: 'video', displayName: 'Sora 2 Pro' },
    // Veo
    { model: 'google/veo3.1/image-to-video', alias: 'veo-3.1', price: 0.40, unitType: 'per_generation', category: 'video', displayName: 'Veo 3.1' },
    // Seedance
    { model: 'bytedance/seedance-v2.0/image-to-video', alias: 'seedance-2', price: 0.03, unitType: 'per_generation', category: 'video', displayName: 'Seedance 2.0' },
    { model: 'bytedance/seedance-v1.5-pro/image-to-video', alias: 'seedance-1.5', price: 0.025, unitType: 'per_generation', category: 'video', displayName: 'Seedance 1.5' },
    // WAN
    { model: 'alibaba/wan-2.6/image-to-video', alias: 'wan-2.6', price: 0.02, unitType: 'per_generation', category: 'video', displayName: 'WAN 2.6' },
    { model: 'alibaba/wan-2.5/image-to-video', alias: 'wan-2.5', price: 0.05, unitType: 'per_generation', category: 'video', displayName: 'WAN 2.5' },
    // OmniHuman
    { model: 'bytedance/omnihuman-1.5/image-to-video', alias: 'omnihuman-1.5', price: 0.05, unitType: 'per_generation', category: 'video', displayName: 'OmniHuman 1.5' },
    // Image
    { model: 'flux-dev', price: 0.005, unitType: 'per_generation', category: 'image', displayName: 'Flux Dev' },
    { model: 'flux-schnell', price: 0.005, unitType: 'per_generation', category: 'image', displayName: 'Flux Schnell' },
  ];
}
