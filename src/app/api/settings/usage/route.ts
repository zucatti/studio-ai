import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';

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

export async function GET() {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const usage: UsageData = {
      claude: { status: 'not_configured', hasAdminKey: false },
      fal: { status: 'not_configured' },
      replicate: { status: 'not_configured' },
    };

    // ========== CLAUDE ==========
    if (process.env.AI_CLAUDE_KEY) {
      try {
        // Test API key
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.AI_CLAUDE_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'Hi' }],
          }),
        });

        if (res.ok || res.status === 400) {
          usage.claude = {
            status: 'connected',
            hasAdminKey: !!process.env.AI_CLAUDE_ADMIN_KEY,
          };

          // If admin key available, fetch usage data
          if (process.env.AI_CLAUDE_ADMIN_KEY) {
            try {
              const usageRes = await fetch(
                'https://api.anthropic.com/v1/organizations/usage_report/messages?' +
                new URLSearchParams({
                  start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                  end_date: new Date().toISOString().split('T')[0],
                  group_by: 'model',
                }),
                {
                  headers: {
                    'x-api-key': process.env.AI_CLAUDE_ADMIN_KEY,
                    'anthropic-version': '2023-06-01',
                  },
                }
              );

              if (usageRes.ok) {
                const data = await usageRes.json();
                let totalInputTokens = 0;
                let totalOutputTokens = 0;
                let totalCost = 0;
                const byModel: Record<string, { input: number; output: number; cost: number }> = {};

                for (const item of data.data || []) {
                  const model = item.model || 'unknown';
                  const inputTokens = item.input_tokens || 0;
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

                usage.claude.usage = {
                  totalInputTokens,
                  totalOutputTokens,
                  totalCost: Math.round(totalCost * 100) / 100,
                  byModel,
                };
              }
            } catch (e) {
              console.error('Error fetching Claude usage:', e);
            }
          }
        } else if (res.status === 401) {
          usage.claude = {
            status: 'error',
            hasAdminKey: false,
            error: 'Invalid API key',
          };
        } else {
          usage.claude = {
            status: 'error',
            hasAdminKey: false,
            error: `API error: ${res.status}`,
          };
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
    if (process.env.AI_FAL_KEY) {
      try {
        // Fetch usage from fal.ai API (last 30 days)
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const endDate = new Date().toISOString();

        // Build URL with array-style expand parameter
        const url = new URL('https://api.fal.ai/v1/models/usage');
        url.searchParams.set('start', startDate);
        url.searchParams.set('end', endDate);
        url.searchParams.append('expand', 'summary');
        url.searchParams.append('expand', 'time_series');

        const usageRes = await fetch(url.toString(), {
          headers: {
            Authorization: `Key ${process.env.AI_FAL_KEY}`,
          },
        });

        if (usageRes.ok) {
          const data = await usageRes.json();
          console.log('fal.ai usage response:', JSON.stringify(data, null, 2));

          let totalCost = 0;
          let totalRequests = 0;
          const byEndpoint: Record<string, { requests: number; cost: number }> = {};

          // Parse summary data (array of aggregated records)
          const summaryData = data.summary || [];
          for (const item of summaryData) {
            const endpointId = item.endpoint_id || 'unknown';
            const cost = parseFloat(item.cost) || 0;
            const quantity = parseInt(item.quantity) || 1;

            totalCost += cost;
            totalRequests += quantity;

            // Extract readable endpoint name
            let displayName = endpointId;
            if (endpointId.includes('/')) {
              const parts = endpointId.split('/');
              displayName = parts.slice(1).join('-').replace(/image-to-video|text-to-video/g, '').replace(/--+/g, '-').replace(/-$/, '');
            }

            if (!byEndpoint[displayName]) {
              byEndpoint[displayName] = { requests: 0, cost: 0 };
            }
            byEndpoint[displayName].requests += quantity;
            byEndpoint[displayName].cost += cost;
          }

          // Also parse time_series if summary is empty
          if (summaryData.length === 0 && data.time_series) {
            for (const item of data.time_series) {
              const endpointId = item.endpoint_id || 'unknown';
              const cost = parseFloat(item.cost) || 0;
              const quantity = parseInt(item.quantity) || 1;

              totalCost += cost;
              totalRequests += quantity;

              let displayName = endpointId;
              if (endpointId.includes('/')) {
                const parts = endpointId.split('/');
                displayName = parts.slice(1).join('-').replace(/image-to-video|text-to-video/g, '').replace(/--+/g, '-').replace(/-$/, '');
              }

              if (!byEndpoint[displayName]) {
                byEndpoint[displayName] = { requests: 0, cost: 0 };
              }
              byEndpoint[displayName].requests += quantity;
              byEndpoint[displayName].cost += cost;
            }
          }

          // Only set usage if we have data
          if (totalRequests > 0 || totalCost > 0) {
            usage.fal = {
              status: 'connected',
              usage: {
                totalCost: Math.round(totalCost * 100) / 100,
                totalRequests,
                byEndpoint,
              },
            };
          } else {
            // Connected but no usage data
            usage.fal = {
              status: 'connected',
            };
          }
        } else if (usageRes.status === 401 || usageRes.status === 403) {
          // Key is valid but might not have admin permissions, show as connected without usage
          usage.fal = {
            status: 'connected',
          };
        } else {
          const errorText = await usageRes.text();
          console.error('fal.ai usage error:', usageRes.status, errorText);
          usage.fal = {
            status: 'error',
            error: `API error: ${usageRes.status} - ${errorText}`,
          };
        }
      } catch (e) {
        console.error('fal.ai usage exception:', e);
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
