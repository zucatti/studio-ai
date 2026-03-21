/**
 * Pricing Service
 *
 * Fetches prices from database with in-memory cache.
 * Cache is refreshed every 5 minutes or on demand.
 */

import { createServerSupabaseClient } from '@/lib/supabase';

export interface PriceEntry {
  provider: string;
  model: string;
  modelAlias: string | null;
  pricePerUnit: number;
  unitType: 'per_generation' | 'per_second' | 'per_character' | 'per_1m_tokens_input' | 'per_1m_tokens_output';
  category: string | null;
  displayName: string | null;
}

// In-memory cache
let priceCache: Map<string, PriceEntry> | null = null;
let lastCacheUpdate: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get cache key for a model
 */
function getCacheKey(provider: string, model: string): string {
  return `${provider}:${model}`;
}

/**
 * Load all prices into cache
 */
async function loadPriceCache(): Promise<Map<string, PriceEntry>> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('provider_pricing')
    .select('provider, model, model_alias, price_per_unit, unit_type, category, display_name')
    .eq('is_active', true);

  if (error) {
    console.error('[PricingService] Error loading prices:', error);
    // Return existing cache if available, or empty map
    return priceCache || new Map();
  }

  const cache = new Map<string, PriceEntry>();

  for (const row of data || []) {
    const entry: PriceEntry = {
      provider: row.provider,
      model: row.model,
      modelAlias: row.model_alias,
      pricePerUnit: parseFloat(row.price_per_unit),
      unitType: row.unit_type,
      category: row.category,
      displayName: row.display_name,
    };

    // Index by full model name
    cache.set(getCacheKey(row.provider, row.model), entry);

    // Also index by alias if exists
    if (row.model_alias) {
      cache.set(getCacheKey(row.provider, row.model_alias), entry);
    }
  }

  console.log(`[PricingService] Loaded ${cache.size} price entries`);
  return cache;
}

/**
 * Ensure cache is fresh
 */
async function ensureCache(): Promise<Map<string, PriceEntry>> {
  const now = Date.now();

  if (!priceCache || (now - lastCacheUpdate) > CACHE_TTL_MS) {
    priceCache = await loadPriceCache();
    lastCacheUpdate = now;
  }

  return priceCache;
}

/**
 * Get price for a specific model
 */
export async function getPrice(provider: string, model: string): Promise<PriceEntry | null> {
  const cache = await ensureCache();
  return cache.get(getCacheKey(provider, model)) || null;
}

/**
 * Get price with fallback to default
 */
export async function getPriceOrDefault(
  provider: string,
  model: string,
  defaultPrice: number = 0.02
): Promise<number> {
  const entry = await getPrice(provider, model);
  return entry?.pricePerUnit ?? defaultPrice;
}

/**
 * Calculate cost for a generation
 */
export async function calculateCost(
  provider: string,
  model: string,
  metrics: {
    count?: number;
    durationSeconds?: number;
    characters?: number;
    inputTokens?: number;
    outputTokens?: number;
  }
): Promise<number> {
  const entry = await getPrice(provider, model);

  if (!entry) {
    console.warn(`[PricingService] No price found for ${provider}/${model}, using default`);
    return 0.02 * (metrics.count || 1);
  }

  const price = entry.pricePerUnit;

  switch (entry.unitType) {
    case 'per_generation':
      return price * (metrics.count || 1);

    case 'per_second':
      return price * (metrics.durationSeconds || 5);

    case 'per_character':
      return price * (metrics.characters || 0);

    case 'per_1m_tokens_input':
      return (price * (metrics.inputTokens || 0)) / 1_000_000;

    case 'per_1m_tokens_output':
      return (price * (metrics.outputTokens || 0)) / 1_000_000;

    default:
      return price * (metrics.count || 1);
  }
}

/**
 * Calculate Claude cost (input + output tokens)
 */
export async function calculateClaudeCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): Promise<number> {
  const inputEntry = await getPrice('claude', model);
  const outputEntry = await getPrice('claude', `${model}-output`);

  // Fallback to hardcoded defaults if not in DB
  const inputPrice = inputEntry?.pricePerUnit ?? 3; // Default to Sonnet pricing
  const outputPrice = outputEntry?.pricePerUnit ?? 15;

  const inputCost = (inputTokens * inputPrice) / 1_000_000;
  const outputCost = (outputTokens * outputPrice) / 1_000_000;

  return inputCost + outputCost;
}

/**
 * Get all prices for a provider
 */
export async function getPricesForProvider(provider: string): Promise<PriceEntry[]> {
  const cache = await ensureCache();
  const prices: PriceEntry[] = [];
  const seen = new Set<string>();

  for (const [key, entry] of cache.entries()) {
    if (entry.provider === provider && !seen.has(entry.model)) {
      prices.push(entry);
      seen.add(entry.model);
    }
  }

  return prices;
}

/**
 * Get all prices grouped by provider
 */
export async function getAllPrices(): Promise<Record<string, PriceEntry[]>> {
  const cache = await ensureCache();
  const byProvider: Record<string, PriceEntry[]> = {};
  const seen = new Set<string>();

  for (const entry of cache.values()) {
    if (seen.has(entry.model)) continue;
    seen.add(entry.model);

    if (!byProvider[entry.provider]) {
      byProvider[entry.provider] = [];
    }
    byProvider[entry.provider].push(entry);
  }

  return byProvider;
}

/**
 * Force cache refresh
 */
export async function refreshCache(): Promise<void> {
  priceCache = await loadPriceCache();
  lastCacheUpdate = Date.now();
}

/**
 * Check if prices need sync (last sync > 24h ago)
 */
export async function needsSync(): Promise<boolean> {
  const supabase = createServerSupabaseClient();

  const { data } = await supabase
    .from('provider_pricing')
    .select('last_synced_at')
    .order('last_synced_at', { ascending: false })
    .limit(1)
    .single();

  if (!data?.last_synced_at) {
    return true; // Never synced
  }

  const lastSync = new Date(data.last_synced_at).getTime();
  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  return (now - lastSync) > ONE_DAY_MS;
}
