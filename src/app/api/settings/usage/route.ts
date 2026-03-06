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

interface UsageData {
  replicate: {
    status: 'connected' | 'error' | 'not_configured';
    account?: ReplicateAccount;
    recentPredictions?: ReplicatePrediction[];
    error?: string;
  };
  anthropic: {
    status: 'connected' | 'error' | 'not_configured';
    error?: string;
  };
}

export async function GET() {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const usage: UsageData = {
      replicate: { status: 'not_configured' },
      anthropic: { status: 'not_configured' },
    };

    // Check Replicate
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

          // Get recent predictions
          const predictionsRes = await fetch('https://api.replicate.com/v1/predictions?limit=50', {
            headers: {
              Authorization: `Bearer ${process.env.AI_REPLICATE_KEY}`,
            },
          });

          let recentPredictions: ReplicatePrediction[] = [];
          if (predictionsRes.ok) {
            const data = await predictionsRes.json();
            recentPredictions = data.results || [];
          }

          usage.replicate = {
            status: 'connected',
            account,
            recentPredictions,
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

    // Check Anthropic
    if (process.env.AI_CLAUDE_KEY) {
      try {
        // Test API key by making a simple request
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
          // Key is valid (400 might be from the minimal request)
          usage.anthropic = {
            status: 'connected',
          };
        } else if (res.status === 401) {
          usage.anthropic = {
            status: 'error',
            error: 'Invalid API key',
          };
        } else {
          usage.anthropic = {
            status: 'error',
            error: `API error: ${res.status}`,
          };
        }
      } catch (e) {
        usage.anthropic = {
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
