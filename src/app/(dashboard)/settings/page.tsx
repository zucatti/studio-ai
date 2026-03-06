'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Settings,
  Key,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Loader2,
  BarChart3,
  Cpu,
  Image as ImageIcon,
  DollarSign,
  TrendingUp,
  Zap,
} from 'lucide-react';

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
    account?: {
      username: string;
      name: string;
      type: string;
    };
    recentPredictions?: ReplicatePrediction[];
    error?: string;
  };
  anthropic: {
    status: 'connected' | 'error' | 'not_configured';
    error?: string;
  };
}

// Simple bar chart component
function SimpleBarChart({ data, label }: { data: { date: string; count: number }[]; label: string }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="space-y-2">
      <div className="text-sm text-slate-400">{label}</div>
      <div className="flex items-end gap-1 h-32">
        {data.map((item, idx) => (
          <div key={idx} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full bg-blue-500/80 rounded-t transition-all hover:bg-blue-400"
              style={{ height: `${(item.count / maxCount) * 100}%`, minHeight: item.count > 0 ? '4px' : '0' }}
              title={`${item.date}: ${item.count}`}
            />
            <span className="text-[10px] text-slate-500 -rotate-45 origin-center whitespace-nowrap">
              {item.date.slice(5)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'connected':
      return (
        <span className="flex items-center gap-1 text-green-400 text-sm">
          <CheckCircle className="w-4 h-4" />
          Connecté
        </span>
      );
    case 'error':
      return (
        <span className="flex items-center gap-1 text-red-400 text-sm">
          <XCircle className="w-4 h-4" />
          Erreur
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-1 text-slate-500 text-sm">
          <AlertCircle className="w-4 h-4" />
          Non configuré
        </span>
      );
  }
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchUsage = async () => {
    try {
      const res = await fetch('/api/settings/usage');
      const data = await res.json();
      setUsage(data);
    } catch (error) {
      console.error('Error fetching usage:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchUsage();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchUsage();
  };

  // Model pricing (approximate per image)
  const MODEL_PRICES: Record<string, number> = {
    'flux-1.1-pro': 0.04,
    'flux-pro': 0.055,
    'flux-dev': 0.025,
    'flux-schnell': 0.003,
    'sdxl': 0.002,
  };

  // Get price for a model
  const getModelPrice = (modelName: string): number => {
    const name = modelName.toLowerCase();
    if (name.includes('flux-1.1-pro')) return MODEL_PRICES['flux-1.1-pro'];
    if (name.includes('flux-pro')) return MODEL_PRICES['flux-pro'];
    if (name.includes('flux-dev')) return MODEL_PRICES['flux-dev'];
    if (name.includes('flux-schnell')) return MODEL_PRICES['flux-schnell'];
    if (name.includes('sdxl')) return MODEL_PRICES['sdxl'];
    return 0.02; // Default
  };

  // Process Replicate predictions for charts
  const replicateStats = useMemo(() => {
    if (!usage?.replicate?.recentPredictions) {
      return { dailyUsage: [], totalPredictions: 0, modelUsage: {}, modelCosts: {}, estimatedCost: 0 };
    }

    const predictions = usage.replicate.recentPredictions;
    const dailyMap = new Map<string, number>();
    const modelMap = new Map<string, number>();
    const modelCostMap = new Map<string, number>();
    let estimatedCost = 0;

    // Get last 7 days
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const key = date.toISOString().split('T')[0];
      dailyMap.set(key, 0);
    }

    predictions.forEach((p) => {
      const date = p.created_at.split('T')[0];
      if (dailyMap.has(date)) {
        dailyMap.set(date, (dailyMap.get(date) || 0) + 1);
      }

      // Clean model name (remove version hash)
      let modelName = p.model.split('/').pop() || p.model;
      modelName = modelName.split(':')[0]; // Remove :version_hash

      modelMap.set(modelName, (modelMap.get(modelName) || 0) + 1);

      // Calculate cost for this model
      const price = getModelPrice(modelName);
      estimatedCost += price;
      modelCostMap.set(modelName, (modelCostMap.get(modelName) || 0) + price);
    });

    const dailyUsage = Array.from(dailyMap.entries()).map(([date, count]) => ({
      date,
      count,
    }));

    const modelUsage = Object.fromEntries(modelMap);
    const modelCosts = Object.fromEntries(modelCostMap);

    return {
      dailyUsage,
      totalPredictions: predictions.length,
      modelUsage,
      modelCosts,
      estimatedCost: Math.round(estimatedCost * 100) / 100,
    };
  }, [usage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-slate-400" />
          <h1 className="text-xl font-semibold text-white">Configuration</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="border-white/10"
        >
          {refreshing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          <span className="ml-2">Actualiser</span>
        </Button>
      </div>

      {/* API Keys Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Replicate */}
        <Card className="bg-slate-800/50 border-white/10">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-blue-400" />
                Replicate
              </CardTitle>
              <StatusBadge status={usage?.replicate?.status || 'not_configured'} />
            </div>
          </CardHeader>
          <CardContent>
            {usage?.replicate?.status === 'connected' && usage.replicate.account && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Key className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-400">Compte:</span>
                  <span className="text-white">{usage.replicate.account.username}</span>
                </div>
                <div className="text-xs text-slate-500">
                  Utilisé pour la génération d'images (FLUX, SDXL)
                </div>
                <a
                  href="https://replicate.com/account/billing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 underline"
                >
                  Voir le billing sur replicate.com →
                </a>
              </div>
            )}
            {usage?.replicate?.status === 'error' && (
              <div className="text-sm text-red-400">{usage.replicate.error}</div>
            )}
            {usage?.replicate?.status === 'not_configured' && (
              <div className="text-sm text-slate-500">
                Ajoutez AI_REPLICATE_KEY dans .env.local
              </div>
            )}
          </CardContent>
        </Card>

        {/* Anthropic */}
        <Card className="bg-slate-800/50 border-white/10">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white flex items-center gap-2">
                <Cpu className="w-5 h-5 text-orange-400" />
                Claude (Anthropic)
              </CardTitle>
              <StatusBadge status={usage?.anthropic?.status || 'not_configured'} />
            </div>
          </CardHeader>
          <CardContent>
            {usage?.anthropic?.status === 'connected' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Key className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-400">Clé API:</span>
                  <span className="text-white">Configurée</span>
                </div>
                <div className="text-xs text-slate-500">
                  Utilisé pour le script, traduction, extraction
                </div>
                <a
                  href="https://console.anthropic.com/settings/usage"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-orange-400 hover:text-orange-300 underline"
                >
                  Voir les stats sur console.anthropic.com →
                </a>
              </div>
            )}
            {usage?.anthropic?.status === 'error' && (
              <div className="text-sm text-red-400">{usage.anthropic.error}</div>
            )}
            {usage?.anthropic?.status === 'not_configured' && (
              <div className="text-sm text-slate-500">
                Ajoutez AI_CLAUDE_KEY dans .env.local
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Usage Statistics */}
      {usage?.replicate?.status === 'connected' && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-slate-800/50 border-white/10">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <Zap className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">
                      {replicateStats.totalPredictions}
                    </div>
                    <div className="text-xs text-slate-400">Générations (7j)</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-white/10">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/20">
                    <ImageIcon className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">
                      ${replicateStats.totalPredictions > 0
                        ? (replicateStats.estimatedCost / replicateStats.totalPredictions).toFixed(3)
                        : '0.00'}
                    </div>
                    <div className="text-xs text-slate-400">Coût moyen/image</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-white/10">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-yellow-500/20">
                    <DollarSign className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">
                      ~${replicateStats.estimatedCost}
                    </div>
                    <div className="text-xs text-slate-400">Coût estimé</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-white/10">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/20">
                    <TrendingUp className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">
                      {Object.keys(replicateStats.modelUsage).length}
                    </div>
                    <div className="text-xs text-slate-400">Modèles utilisés</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Daily Usage Chart */}
            <Card className="bg-slate-800/50 border-white/10">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2 text-base">
                  <BarChart3 className="w-4 h-4 text-blue-400" />
                  Générations par jour
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SimpleBarChart data={replicateStats.dailyUsage} label="7 derniers jours" />
              </CardContent>
            </Card>

            {/* Model Usage with Costs */}
            <Card className="bg-slate-800/50 border-white/10">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2 text-base">
                  <Cpu className="w-4 h-4 text-purple-400" />
                  Coût par modèle
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(replicateStats.modelUsage)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5)
                    .map(([model, count]) => {
                      const cost = replicateStats.modelCosts[model] || 0;
                      const pricePerImage = count > 0 ? cost / count : 0;
                      return (
                        <div key={model} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300 truncate max-w-[180px]">
                              {model}
                            </span>
                            <span className="text-sm font-medium text-yellow-400">
                              ${cost.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>{count} images × ${pricePerImage.toFixed(3)}/img</span>
                            <div
                              className="h-1.5 bg-purple-500/60 rounded"
                              style={{
                                width: `${(cost / replicateStats.estimatedCost) * 80}px`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Environment Variables Guide */}
      <Card className="bg-slate-800/50 border-white/10">
        <CardHeader>
          <CardTitle className="text-white text-base">Variables d'environnement</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 font-mono text-sm">
            <div className="flex items-start gap-2">
              <span className="text-slate-500">#</span>
              <span className="text-slate-400">Replicate (génération d'images)</span>
            </div>
            <div className="bg-slate-900/50 p-2 rounded text-green-400">
              AI_REPLICATE_KEY=r8_xxxxx
            </div>

            <div className="flex items-start gap-2 mt-4">
              <span className="text-slate-500">#</span>
              <span className="text-slate-400">Anthropic Claude (script, traduction)</span>
            </div>
            <div className="bg-slate-900/50 p-2 rounded text-green-400">
              AI_CLAUDE_KEY=sk-ant-api03-xxxxx
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
