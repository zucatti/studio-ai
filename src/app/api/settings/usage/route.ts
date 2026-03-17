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

interface ReplicateAccount {
  type: string;
  username: string;
  name: string;
  github_url?: string;
}

interface ReplicatePrediction {
  id: string;
  model: string;
  status: string;
  created_at: string;
  completed_at?: string;
  metrics?: {
    predict_time?: number;
  };
}

interface ClaudeUsageData {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  byModel: Record<string, { input: number; output: number; cost: number }>;
}

interface FalUsageData {
  totalCost: number;
  totalRequests: number;
  byEndpoint: Record<string, { requests: number; cost: number }>;
}

interface ElevenLabsUsageData {
  characterCount: number;
  characterLimit: number;
  nextResetUnix: number;
  estimatedCost: number;
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
  replicate: {
    status: 'connected' | 'error' | 'not_configured';
    account?: ReplicateAccount;
    recentPredictions?: ReplicatePrediction[];
    stats?: {
      totalPredictions: number;
      successfulPredictions: number;
      failedPredictions: number;
      totalGpuTime: number;
      estimatedCost: number;
      byModel: Record<string, { count: number; cost: number; gpuTime: number }>;
    };
    error?: string;
  };
  elevenlabs: {
    status: 'connected' | 'error' | 'not_configured';
    usage?: ElevenLabsUsageData;
    error?: string;
  };
  piapi: {
    status: 'connected' | 'error' | 'not_configured';
    balance?: number;
    plan?: string;
    error?: string;
  };
  creatomate: {
    status: 'connected' | 'error' | 'not_configured';
    error?: string;
  };
}

// Claude model pricing (per 1M tokens)
const CLAUDE_PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-4-20250514': { input: 15, output: 75 },
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  'claude-3-sonnet-20240229': { input: 3, output: 15 },
  'claude-3-opus-20240229': { input: 15, output: 75 },
};

// Replicate model pricing (per image/prediction)
const REPLICATE_PRICES: Record<string, number> = {
  'flux-1.1-pro': 0.04,
  'flux-pro': 0.055,
  'flux-dev': 0.025,
  'flux-schnell': 0.003,
  'sdxl': 0.002,
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
      replicate: { status: 'not_configured' },
      elevenlabs: { status: 'not_configured' },
      piapi: { status: 'not_configured' },
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

        const url = new URL('https://api.fal.ai/v1/models/usage');
        url.searchParams.set('start', startDate);
        url.searchParams.set('end', endDate);
        url.searchParams.append('expand', 'summary');

        const usageRes = await fetch(url.toString(), {
          headers: {
            Authorization: `Key ${adminKey}`,
          },
        });

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
            usage: totalRequests > 0 ? {
              totalCost: Math.round(totalCost * 100) / 100,
              totalRequests,
              byEndpoint,
            } : undefined,
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

    // ========== REPLICATE ==========
    if (process.env.AI_REPLICATE_KEY) {
      try {
        // Get account info
        const accountRes = await fetch('https://api.replicate.com/v1/account', {
          headers: {
            Authorization: `Bearer ${process.env.AI_REPLICATE_KEY}`,
          },
        });

        if (accountRes.ok) {
          const account = await accountRes.json();

          // Get recent predictions (last 100)
          const predictionsRes = await fetch('https://api.replicate.com/v1/predictions?limit=100', {
            headers: {
              Authorization: `Bearer ${process.env.AI_REPLICATE_KEY}`,
            },
          });

          let recentPredictions: ReplicatePrediction[] = [];
          let stats = {
            totalPredictions: 0,
            successfulPredictions: 0,
            failedPredictions: 0,
            totalGpuTime: 0,
            estimatedCost: 0,
            byModel: {} as Record<string, { count: number; cost: number; gpuTime: number }>,
          };

          if (predictionsRes.ok) {
            const data = await predictionsRes.json();
            recentPredictions = data.results || [];

            // Calculate stats
            for (const pred of recentPredictions) {
              stats.totalPredictions++;

              if (pred.status === 'succeeded') {
                stats.successfulPredictions++;
              } else if (pred.status === 'failed') {
                stats.failedPredictions++;
              }

              const gpuTime = pred.metrics?.predict_time || 0;
              stats.totalGpuTime += gpuTime;

              // Get model name
              let modelName = pred.model.split('/').pop() || pred.model;
              modelName = modelName.split(':')[0];

              // Calculate cost
              const price = getReplicatePrice(modelName);
              stats.estimatedCost += price;

              if (!stats.byModel[modelName]) {
                stats.byModel[modelName] = { count: 0, cost: 0, gpuTime: 0 };
              }
              stats.byModel[modelName].count++;
              stats.byModel[modelName].cost += price;
              stats.byModel[modelName].gpuTime += gpuTime;
            }

            stats.estimatedCost = Math.round(stats.estimatedCost * 100) / 100;
            stats.totalGpuTime = Math.round(stats.totalGpuTime * 10) / 10;
          }

          usage.replicate = {
            status: 'connected',
            account,
            recentPredictions,
            stats,
          };
        } else {
          const error = await accountRes.text();
          usage.replicate = {
            status: 'error',
            error: `API error: ${accountRes.status} - ${error}`,
          };
        }
      } catch (e) {
        usage.replicate = {
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

    // ========== PIAPI ==========
    if (process.env.AI_PIAPI_KEY) {
      try {
        // Get account info including balance
        const accountRes = await fetch('https://api.piapi.ai/account/info', {
          headers: {
            'X-API-Key': process.env.AI_PIAPI_KEY,
          },
        });

        if (accountRes.ok) {
          const data = await accountRes.json();
          if (data.code === 200 && data.data) {
            const balance = data.data.equivalent_in_usd || 0;
            usage.piapi = {
              status: 'connected',
              balance,
              plan: data.data.plan,
            };
          } else {
            usage.piapi = {
              status: 'connected',
            };
          }
        } else if (accountRes.status === 401) {
          usage.piapi = {
            status: 'error',
            error: 'Clé API invalide',
          };
        } else {
          usage.piapi = {
            status: 'connected',
          };
        }
      } catch (e) {
        usage.piapi = {
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

function getReplicatePrice(modelName: string): number {
  const name = modelName.toLowerCase();
  if (name.includes('flux-1.1-pro')) return REPLICATE_PRICES['flux-1.1-pro'];
  if (name.includes('flux-pro')) return REPLICATE_PRICES['flux-pro'];
  if (name.includes('flux-dev')) return REPLICATE_PRICES['flux-dev'];
  if (name.includes('flux-schnell')) return REPLICATE_PRICES['flux-schnell'];
  if (name.includes('sdxl')) return REPLICATE_PRICES['sdxl'];
  return 0.02; // Default
}
