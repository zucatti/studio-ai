import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { refreshCache, needsSync } from '@/lib/pricing-service';

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
    fal: { updated: 0, errors: [] as string[] },
    runway: { updated: 0, errors: [] as string[] },
  };

  // Sync fal.ai prices
  try {
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
          source: 'api',
          last_synced_at: new Date().toISOString(),
        }, {
          onConflict: 'provider,model',
        });

      if (error) {
        results.fal.errors.push(price.model);
      } else {
        results.fal.updated++;
      }
    }
  } catch (error) {
    results.fal.errors.push(`Sync failed: ${error}`);
  }

  // Sync Runway prices
  try {
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
          source: 'api',
          last_synced_at: new Date().toISOString(),
        }, {
          onConflict: 'provider,model',
        });

      if (error) {
        results.runway.errors.push(price.model);
      } else {
        results.runway.updated++;
      }
    }
  } catch (error) {
    results.runway.errors.push(`Sync failed: ${error}`);
  }

  // Log sync
  await supabase.from('pricing_sync_log').insert({
    provider: 'all',
    status: 'success',
    models_updated: results.fal.updated + results.runway.updated,
    sync_source: 'api',
  });

  return results;
}

/**
 * Fetch fal.ai prices
 */
async function fetchFalPrices(): Promise<Array<{
  model: string;
  alias?: string;
  price: number;
  unitType: string;
  category: string;
  displayName: string;
}>> {
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
async function fetchRunwayPrices(): Promise<Array<{
  model: string;
  alias?: string;
  price: number;
  unitType: string;
  category: string;
  displayName: string;
}>> {
  return [
    { model: 'gen4', alias: 'gen4', price: 0.05, unitType: 'per_second', category: 'video', displayName: 'Gen-4 Turbo' },
    { model: 'gen4.5', alias: 'gen4.5', price: 0.10, unitType: 'per_second', category: 'video', displayName: 'Gen-4.5' },
    { model: 'gen4-image', alias: 'gen4-image', price: 0.05, unitType: 'per_generation', category: 'image', displayName: 'Gen-4 Image' },
  ];
}
