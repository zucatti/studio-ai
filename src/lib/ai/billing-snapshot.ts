/**
 * Billing Snapshot Service
 *
 * Captures provider balances before/after API calls to calculate real consumption.
 * The delta between snapshots gives the actual cost instead of estimates.
 *
 * Supported providers:
 * - fal.ai: currentBalance (credits)
 * - Runway: creditBalance (credits, 1 credit = $0.01)
 * - ElevenLabs: character_count (characters used)
 * - Claude: Uses token-based estimation (API not real-time)
 */

export type SnapshotProvider = 'fal' | 'runway' | 'elevenlabs';

export interface BillingSnapshot {
  provider: SnapshotProvider;
  timestamp: number;
  balance?: number;        // For fal, runway (in dollars)
  characterCount?: number; // For ElevenLabs
  error?: string;
}

export interface ConsumptionResult {
  provider: SnapshotProvider;
  cost: number;           // Actual cost in dollars
  rawDelta: number;       // Raw delta (credits, chars, etc.)
  unit: 'dollars' | 'credits' | 'characters';
  reliable: boolean;      // Whether the measurement is reliable
}

// ElevenLabs pricing: ~$0.30 per 1000 characters for multilingual_v2
const ELEVENLABS_COST_PER_CHAR = 0.0003;

/**
 * Capture a billing snapshot for a provider
 */
export async function captureSnapshot(provider: SnapshotProvider): Promise<BillingSnapshot> {
  const snapshot: BillingSnapshot = {
    provider,
    timestamp: Date.now(),
  };

  try {
    switch (provider) {
      case 'fal':
        snapshot.balance = await getFalBalance();
        break;
      case 'runway':
        snapshot.balance = await getRunwayBalance();
        break;
      case 'elevenlabs':
        snapshot.characterCount = await getElevenLabsCharacterCount();
        break;
    }
  } catch (error) {
    snapshot.error = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`[BillingSnapshot] Failed to capture ${provider}:`, error);
  }

  return snapshot;
}

/**
 * Calculate consumption from two snapshots
 */
export function calculateConsumption(
  before: BillingSnapshot,
  after: BillingSnapshot
): ConsumptionResult | null {
  if (before.provider !== after.provider) {
    console.error('[BillingSnapshot] Provider mismatch');
    return null;
  }

  const provider = before.provider;

  // Check for errors
  if (before.error || after.error) {
    return {
      provider,
      cost: 0,
      rawDelta: 0,
      unit: 'dollars',
      reliable: false,
    };
  }

  switch (provider) {
    case 'fal':
    case 'runway': {
      const balanceBefore = before.balance ?? 0;
      const balanceAfter = after.balance ?? 0;
      const delta = balanceBefore - balanceAfter;

      return {
        provider,
        cost: Math.max(0, delta), // Cost should be positive
        rawDelta: delta,
        unit: 'dollars',
        reliable: balanceBefore > 0 && delta >= 0,
      };
    }

    case 'elevenlabs': {
      const charsBefore = before.characterCount ?? 0;
      const charsAfter = after.characterCount ?? 0;
      const delta = charsAfter - charsBefore;
      const cost = delta * ELEVENLABS_COST_PER_CHAR;

      return {
        provider,
        cost: Math.max(0, cost),
        rawDelta: delta,
        unit: 'characters',
        reliable: delta >= 0,
      };
    }

    default:
      return null;
  }
}

/**
 * Helper to wrap an API call with billing snapshots
 */
export async function withBillingTracking<T>(
  provider: SnapshotProvider,
  apiCall: () => Promise<T>,
  onConsumption?: (result: ConsumptionResult) => void
): Promise<{ result: T; consumption: ConsumptionResult | null }> {
  // Capture before snapshot
  const before = await captureSnapshot(provider);

  // Execute the API call
  const result = await apiCall();

  // Small delay to allow billing to update (some APIs have slight delays)
  await new Promise(resolve => setTimeout(resolve, 500));

  // Capture after snapshot
  const after = await captureSnapshot(provider);

  // Calculate consumption
  const consumption = calculateConsumption(before, after);

  if (consumption && onConsumption) {
    onConsumption(consumption);
  }

  return { result, consumption };
}

// ============================================================================
// Provider-specific balance fetchers
// ============================================================================

async function getFalBalance(): Promise<number | undefined> {
  const apiKey = process.env.AI_FAL_KEY || process.env.AI_FAL_ADMIN_KEY;
  if (!apiKey) {
    console.log('[BillingSnapshot] fal: No API key');
    return undefined;
  }

  const res = await fetch('https://api.fal.ai/v1/account/billing?expand=credits', {
    headers: { Authorization: `Key ${apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`fal.ai billing API error: ${res.status}`);
  }

  const data = await res.json();

  // Debug: log the full response structure
  console.log('[BillingSnapshot] fal raw response:', JSON.stringify(data, null, 2));

  // Try multiple paths to find the balance
  const balance = data.credits?.current_balance
    ?? data.credits?.balance
    ?? data.balance
    ?? data.current_balance;

  console.log(`[BillingSnapshot] fal balance: ${balance}`);
  return balance;
}

async function getRunwayBalance(): Promise<number | undefined> {
  const apiKey = process.env.AI_RUNWAY_ML;
  if (!apiKey) {
    console.log('[BillingSnapshot] runway: No API key');
    return undefined;
  }

  const res = await fetch('https://api.dev.runwayml.com/v1/organization', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'X-Runway-Version': '2024-11-06',
    },
  });

  if (!res.ok) {
    throw new Error(`Runway billing API error: ${res.status}`);
  }

  const data = await res.json();

  // Debug: log the full response structure
  console.log('[BillingSnapshot] runway raw response:', JSON.stringify(data, null, 2));

  // Runway returns credits, 1 credit = $0.01
  const creditBalance = data.creditBalance ?? data.credits ?? data.balance;
  const balanceInDollars = typeof creditBalance === 'number' ? creditBalance * 0.01 : undefined;

  console.log(`[BillingSnapshot] runway creditBalance: ${creditBalance}, in dollars: ${balanceInDollars}`);
  return balanceInDollars;
}

async function getElevenLabsCharacterCount(): Promise<number | undefined> {
  const apiKey = process.env.AI_ELEVEN_LABS;
  if (!apiKey) {
    console.log('[BillingSnapshot] elevenlabs: No API key');
    return undefined;
  }

  const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
    headers: { 'xi-api-key': apiKey },
  });

  if (!res.ok) {
    throw new Error(`ElevenLabs billing API error: ${res.status}`);
  }

  const data = await res.json();

  // Debug: log the full response structure
  console.log('[BillingSnapshot] elevenlabs raw response:', JSON.stringify(data, null, 2));
  console.log(`[BillingSnapshot] elevenlabs character_count: ${data.character_count}, limit: ${data.character_limit}`);

  return data.character_count;
}
