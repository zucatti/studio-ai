import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';

// Simple in-memory cache to avoid hitting rate limits
// Cache Claude admin API results for 5 minutes
interface CachedClaudeUsage {
  data: ClaudeUsageData;
  timestamp: number;
}
let claudeUsageCache: CachedClaudeUsage | null = null;
const CLAUDE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface ClaudeUsageData {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  byModel: Record<string, { input: number; output: number; cost: number }>;
}

interface FalUsageData {
  totalCost: number;
  totalRequests: number;
  currentBalance?: number;
  byEndpoint: Record<string, { requests: number; cost: number }>;
}

interface ElevenLabsUsageData {
  characterCount: number;
  characterLimit: number;
  nextResetUnix: number;
  estimatedCost: number;
}

interface ProviderUsageData {
  status: 'connected' | 'error' | 'not_configured';
  usage?: { totalCost?: number; totalRequests?: number; currentBalance?: number };
  error?: string;
}

interface UsageData {
  claude: {
    status: 'connected' | 'error' | 'not_configured';
    hasAdminKey: boolean;
    usage?: ClaudeUsageData;
    error?: string;
  };
  fal: {
    status: 'connected' | 'error' | 'not_configured';
    usage?: FalUsageData;
    error?: string;
  };
  wavespeed: ProviderUsageData;
  runway: ProviderUsageData;
  modelslab: ProviderUsageData;
  elevenlabs: {
    status: 'connected' | 'error' | 'not_configured';
    usage?: ElevenLabsUsageData;
    error?: string;
  };
  creatomate: {
    status: 'connected' | 'error' | 'not_configured';
    error?: string;
  };
}

// Claude model pricing (per 1M tokens) - Updated March 2026
// https://platform.claude.com/docs/en/about-claude/pricing
const CLAUDE_PRICES: Record<string, { input: number; output: number }> = {
  // Opus 4.6 / 4.5: $5 / $25
  'claude-opus-4-6-20260301': { input: 5, output: 25 },
  'claude-opus-4-5-20251101': { input: 5, output: 25 },
  // Opus 4.1 / 4: $15 / $75
  'claude-opus-4-1-20250514': { input: 15, output: 75 },
  'claude-opus-4-20250514': { input: 15, output: 75 },
  // Sonnet 4.x: $3 / $15
  'claude-sonnet-4-6-20260301': { input: 3, output: 15 },
  'claude-sonnet-4-5-20251022': { input: 3, output: 15 },
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
  // Haiku 4.5: $1 / $5
  'claude-haiku-4-5-20251022': { input: 1, output: 5 },
  // Haiku 3.5: $0.80 / $4
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
  // Haiku 3: $0.25 / $1.25
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  // Opus 3: $15 / $75
  'claude-3-opus-20240229': { input: 15, output: 75 },
};


export async function GET(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check for force refresh parameter
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get('refresh') === 'true';
    if (forceRefresh) {
      claudeUsageCache = null;
      console.log('Force refresh: cleared Claude cache');
    }

    const usage: UsageData = {
      claude: { status: 'not_configured', hasAdminKey: false },
      fal: { status: 'not_configured' },
      wavespeed: { status: 'not_configured' },
      runway: { status: 'not_configured' },
      modelslab: { status: 'not_configured' },
      elevenlabs: { status: 'not_configured' },
      creatomate: { status: 'not_configured' },
    };

    // ========== CLAUDE ==========
    if (process.env.AI_CLAUDE_KEY) {
      try {
        // Don't test the API key with a real call - just check if admin key exists
        // and try to fetch usage data. This avoids wasting tokens and rate limits.
        usage.claude = {
          status: 'connected',
          hasAdminKey: !!process.env.AI_CLAUDE_ADMIN_KEY,
        };

        // If admin key available, fetch usage data
        if (process.env.AI_CLAUDE_ADMIN_KEY) {
            // Check cache first to avoid rate limiting
            if (claudeUsageCache && Date.now() - claudeUsageCache.timestamp < CLAUDE_CACHE_TTL) {
              console.log('Using cached Claude usage data');
              usage.claude.usage = claudeUsageCache.data;
            } else {
            try {
              // Use the correct Anthropic usage API endpoint with proper parameters
              // Note: group_by must be sent as array parameter (group_by[]=model)
              const startingAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
              const endingAt = new Date().toISOString();

              let totalInputTokens = 0;
              let totalOutputTokens = 0;
              let totalCost = 0;
              const byModel: Record<string, { input: number; output: number; cost: number }> = {};

              // Fetch all pages of usage data
              let nextPage: string | null = null;
              let pageCount = 0;
              const maxPages = 10; // Safety limit

              while (pageCount < maxPages) {
                const url = new URL('https://api.anthropic.com/v1/organizations/usage_report/messages');
                url.searchParams.set('starting_at', startingAt);
                url.searchParams.set('ending_at', endingAt);
                url.searchParams.append('group_by[]', 'model');
                url.searchParams.set('bucket_width', '1d');
                if (nextPage) {
                  url.searchParams.set('page', nextPage);
                }

                const usageRes: Response = await fetch(url.toString(), {
                  headers: {
                    'x-api-key': process.env.AI_CLAUDE_ADMIN_KEY!,
                    'anthropic-version': '2023-06-01',
                  },
                });

                if (!usageRes.ok) {
                  const errorText = await usageRes.text();
                  console.error('Claude admin API error:', usageRes.status, errorText);
                  // Set error message for rate limiting or other API errors
                  if (usageRes.status === 429) {
                    usage.claude.error = 'API rate limitée';
                  } else {
                    usage.claude.error = `Erreur API: ${usageRes.status}`;
                  }
                  break;
                }

                const data: {
                  data?: Array<{
                    results?: Array<{
                      model?: string;
                      uncached_input_tokens?: number;
                      cache_read_input_tokens?: number;
                      output_tokens?: number;
                    }>
                  }>;
                  has_more?: boolean;
                  next_page?: string;
                } = await usageRes.json();

                // Parse the response - data is array of daily buckets with results
                const buckets = data.data || [];
                for (const bucket of buckets) {
                  const results = bucket.results || [];
                  for (const item of results) {
                    const model = item.model || 'unknown';
                    // API returns uncached_input_tokens + cache_read_input_tokens, not input_tokens
                    const inputTokens = (item.uncached_input_tokens || 0) + (item.cache_read_input_tokens || 0);
                    const outputTokens = item.output_tokens || 0;

                    totalInputTokens += inputTokens;
                    totalOutputTokens += outputTokens;

                    // Calculate cost
                    const prices = CLAUDE_PRICES[model] || { input: 3, output: 15 };
                    const cost = (inputTokens * prices.input + outputTokens * prices.output) / 1000000;
                    totalCost += cost;

                    if (!byModel[model]) {
                      byModel[model] = { input: 0, output: 0, cost: 0 };
                    }
                    byModel[model].input += inputTokens;
                    byModel[model].output += outputTokens;
                    byModel[model].cost += cost;
                  }
                }

                if (!data.has_more) break;
                nextPage = data.next_page || null;
                pageCount++;
              }

              console.log('Claude usage totals:', { totalInputTokens, totalOutputTokens, totalCost, byModel });

              const usageData = {
                totalInputTokens,
                totalOutputTokens,
                totalCost: Math.round(totalCost * 100) / 100,
                byModel,
              };
              usage.claude.usage = usageData;

              // Only cache if we have actual data (don't cache empty results)
              if (totalInputTokens > 0 || totalOutputTokens > 0) {
                claudeUsageCache = {
                  data: usageData,
                  timestamp: Date.now(),
                };
              }
            } catch (e) {
              console.error('Error fetching Claude usage:', e);
              usage.claude.error = 'Erreur lors de la récupération des données';
            }
            } // end of cache else block
          } else {
            console.log('No AI_CLAUDE_ADMIN_KEY configured');
          }
      } catch (e) {
        usage.claude = {
          status: 'error',
          hasAdminKey: false,
          error: String(e),
        };
      }
    }

    // ========== FAL.AI ==========
    if (process.env.AI_FAL_KEY || process.env.AI_FAL_ADMIN_KEY) {
      try {
        // Use admin key for usage API if available, otherwise try regular key
        const adminKey = process.env.AI_FAL_ADMIN_KEY || process.env.AI_FAL_KEY;

        // Fetch usage from fal.ai API (last 30 days) - requires ADMIN key
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const endDate = new Date().toISOString();

        const usageUrl = new URL('https://api.fal.ai/v1/models/usage');
        usageUrl.searchParams.set('start', startDate);
        usageUrl.searchParams.set('end', endDate);
        usageUrl.searchParams.append('expand', 'summary');

        // Fetch both usage and billing in parallel
        const [usageRes, billingRes] = await Promise.all([
          fetch(usageUrl.toString(), {
            headers: { Authorization: `Key ${adminKey}` },
          }),
          fetch('https://api.fal.ai/v1/account/billing?expand=credits', {
            headers: { Authorization: `Key ${adminKey}` },
          }),
        ]);

        let currentBalance: number | undefined;
        if (billingRes.ok) {
          const billingData = await billingRes.json();
          currentBalance = billingData.credits?.current_balance;
        }

        if (usageRes.ok) {
          const data = await usageRes.json();

          let totalCost = 0;
          let totalRequests = 0;
          const byEndpoint: Record<string, { requests: number; cost: number }> = {};

          const summaryData = data.summary || [];
          for (const item of summaryData) {
            const cost = parseFloat(item.cost) || 0;
            const quantity = parseInt(item.quantity) || 1;
            totalCost += cost;
            totalRequests += quantity;
          }

          usage.fal = {
            status: 'connected',
            usage: {
              totalCost: Math.round(totalCost * 100) / 100,
              totalRequests,
              currentBalance,
              byEndpoint,
            },
          };
        } else if (usageRes.status === 403) {
          // Key works but no admin permissions for usage API
          usage.fal = {
            status: 'connected',
            error: 'Clé non-admin: créez une clé ADMIN sur fal.ai/dashboard/keys',
          };
        } else if (usageRes.status === 401) {
          usage.fal = {
            status: 'error',
            error: 'Clé API invalide',
          };
        } else {
          usage.fal = {
            status: 'connected',
          };
        }
      } catch (e) {
        usage.fal = {
          status: 'error',
          error: String(e),
        };
      }
    }

    // ========== WAVESPEED ==========
    if (process.env.AI_WAVESPEED) {
      try {
        // WaveSpeed balance endpoint: GET /api/v3/balance
        // Docs: https://wavespeed.ai/docs/docs-common-api/balance
        const balanceRes = await fetch('https://api.wavespeed.ai/api/v3/balance', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${process.env.AI_WAVESPEED}`,
            'Content-Type': 'application/json',
          },
        });

        if (balanceRes.ok) {
          const data = await balanceRes.json();
          console.log('[WaveSpeed] Balance response:', JSON.stringify(data));
          // Response format: { data: { balance: number } } or { balance: number }
          const balance = data.data?.balance ?? data.balance;
          usage.wavespeed = {
            status: 'connected',
            usage: balance !== undefined ? {
              currentBalance: typeof balance === 'number' ? balance : parseFloat(balance),
            } : undefined,
          };
        } else if (balanceRes.status === 401) {
          usage.wavespeed = {
            status: 'error',
            error: 'Clé API invalide',
          };
        } else {
          const errorText = await balanceRes.text();
          console.log('[WaveSpeed] Error response:', balanceRes.status, errorText);
          usage.wavespeed = { status: 'connected' };
        }
      } catch (e) {
        console.error('[WaveSpeed] Exception:', e);
        usage.wavespeed = {
          status: 'error',
          error: String(e),
        };
      }
    }

    // ========== RUNWAY ==========
    if (process.env.AI_RUNWAY_ML) {
      try {
        // Fetch organization info including credit balance
        const orgRes = await fetch('https://api.dev.runwayml.com/v1/organization', {
          headers: {
            Authorization: `Bearer ${process.env.AI_RUNWAY_ML}`,
            'X-Runway-Version': '2024-11-06',
          },
        });

        if (orgRes.ok) {
          const data = await orgRes.json();
          console.log('[Runway] Organization data:', JSON.stringify(data));
          // Runway returns credits, 1 credit = $0.01
          const creditBalance = data.creditBalance;
          const balanceInDollars = typeof creditBalance === 'number' ? creditBalance * 0.01 : undefined;
          usage.runway = {
            status: 'connected',
            usage: balanceInDollars !== undefined ? {
              currentBalance: Math.round(balanceInDollars * 100) / 100,
            } : undefined,
          };
        } else if (orgRes.status === 401) {
          usage.runway = {
            status: 'error',
            error: 'Clé API invalide',
          };
        } else {
          const errorText = await orgRes.text();
          console.log('[Runway] Error response:', orgRes.status, errorText);
          usage.runway = { status: 'connected' };
        }
      } catch (e) {
        console.error('[Runway] Exception:', e);
        usage.runway = {
          status: 'error',
          error: String(e),
        };
      }
    }

    // ========== MODELSLAB ==========
    if (process.env.AI_MODELS_LAB) {
      try {
        // ModelsLab v6 API doesn't have a balance endpoint for regular API keys
        // The wallet endpoint (/api/agents/v1/wallet/balance) requires a separate agent token
        // We verify the key by making a test fetch request
        const testRes = await fetch('https://modelslab.com/api/v6/images/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: process.env.AI_MODELS_LAB,
            request_id: 'test-connection-check',
          }),
        });

        const testData = await testRes.json();
        console.log('[ModelsLab] Test response:', JSON.stringify(testData));

        // If key is invalid, we get a specific error message
        if (testData.status === 'error' &&
            (testData.message?.toLowerCase().includes('invalid') ||
             testData.message?.toLowerCase().includes('api key'))) {
          usage.modelslab = {
            status: 'error',
            error: 'Clé API invalide',
          };
        } else {
          // Key is valid - no balance API available for v6 keys
          usage.modelslab = { status: 'connected' };
        }
      } catch (e) {
        console.error('[ModelsLab] Exception:', e);
        usage.modelslab = {
          status: 'error',
          error: String(e),
        };
      }
    }

    // ========== ELEVENLABS ==========
    if (process.env.AI_ELEVEN_LABS) {
      try {
        // Get subscription info which includes character usage
        const subRes = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
          headers: {
            'xi-api-key': process.env.AI_ELEVEN_LABS,
          },
        });

        if (subRes.ok) {
          const data = await subRes.json();

          const characterCount = data.character_count || 0;
          const characterLimit = data.character_limit || 0;
          // Estimate cost: ~$0.30 per 1000 characters for multilingual_v2
          const estimatedCost = Math.round((characterCount * 0.0003) * 100) / 100;

          usage.elevenlabs = {
            status: 'connected',
            usage: {
              characterCount,
              characterLimit,
              nextResetUnix: data.next_character_count_reset_unix || 0,
              estimatedCost,
            },
          };
        } else if (subRes.status === 401) {
          // Check if key works for TTS but not for user info
          const errorData = await subRes.json().catch(() => ({}));
          if (errorData?.detail?.status === 'missing_permissions') {
            usage.elevenlabs = {
              status: 'connected',
              error: 'Clé sans permission user_read - régénérez avec toutes les permissions',
            };
          } else {
            usage.elevenlabs = {
              status: 'error',
              error: 'Clé API invalide',
            };
          }
        } else {
          usage.elevenlabs = {
            status: 'connected',
          };
        }
      } catch (e) {
        usage.elevenlabs = {
          status: 'error',
          error: String(e),
        };
      }
    }

    // ========== CREATOMATE ==========
    if (process.env.AI_CREATOMATE_API) {
      try {
        // Test the key by listing templates
        const testRes = await fetch('https://api.creatomate.com/v1/templates?page_size=1', {
          headers: {
            'Authorization': `Bearer ${process.env.AI_CREATOMATE_API}`,
          },
        });

        if (testRes.ok) {
          usage.creatomate = {
            status: 'connected',
          };
        } else if (testRes.status === 401 || testRes.status === 403) {
          usage.creatomate = {
            status: 'error',
            error: 'Invalid API key',
          };
        } else {
          usage.creatomate = {
            status: 'connected', // Assume connected if we get other errors
          };
        }
      } catch (e) {
        usage.creatomate = {
          status: 'error',
          error: String(e),
        };
      }
    }

    return NextResponse.json(usage);
  } catch (error) {
    console.error('Error fetching usage:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

