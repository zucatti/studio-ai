'use client';

import { useState, useEffect } from 'react';
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
  Cpu,
  Image as ImageIcon,
  Video,
  DollarSign,
  Zap,
  ExternalLink,
  Clock,
  Hash,
  TrendingUp,
} from 'lucide-react';

interface ClaudeUsageData {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  byModel: Record<string, { input: number; output: number; cost: number }>;
}

interface ReplicateStats {
  totalPredictions: number;
  successfulPredictions: number;
  failedPredictions: number;
  totalGpuTime: number;
  estimatedCost: number;
  byModel: Record<string, { count: number; cost: number; gpuTime: number }>;
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
    account?: {
      username: string;
      name: string;
      type: string;
    };
    stats?: ReplicateStats;
    error?: string;
  };
}

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

function StatCard({ icon: Icon, label, value, subValue, color }: {
  icon: any;
  label: string;
  value: string;
  subValue?: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-900/50">
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <div className="text-lg font-bold text-white">{value}</div>
        <div className="text-xs text-slate-400">{label}</div>
        {subValue && <div className="text-xs text-slate-500">{subValue}</div>}
      </div>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-slate-400" />
          <h1 className="text-xl font-semibold text-white">Configuration & Usage</h1>
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

      {/* ========== CLAUDE ========== */}
      <Card className="bg-slate-800/50 border-white/10">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-orange-400" />
              Claude (Anthropic)
            </CardTitle>
            <StatusBadge status={usage?.claude?.status || 'not_configured'} />
          </div>
          <p className="text-sm text-slate-400">
            Scripts, prompts, extraction, suggestions de durée
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {usage?.claude?.status === 'connected' ? (
            <>
              <div className="flex items-center gap-2 text-sm">
                <Key className="w-4 h-4 text-slate-500" />
                <span className="text-slate-400">API Key:</span>
                <span className="text-green-400">Configurée</span>
                {usage.claude.hasAdminKey && (
                  <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded">
                    + Admin Key
                  </span>
                )}
              </div>

              {usage.claude.usage ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard
                      icon={DollarSign}
                      label="Coût total (30j)"
                      value={`$${usage.claude.usage.totalCost.toFixed(2)}`}
                      color="bg-yellow-500/20 text-yellow-400"
                    />
                    <StatCard
                      icon={Zap}
                      label="Tokens input"
                      value={formatNumber(usage.claude.usage.totalInputTokens)}
                      color="bg-blue-500/20 text-blue-400"
                    />
                    <StatCard
                      icon={Zap}
                      label="Tokens output"
                      value={formatNumber(usage.claude.usage.totalOutputTokens)}
                      color="bg-purple-500/20 text-purple-400"
                    />
                    <StatCard
                      icon={Hash}
                      label="Modèles utilisés"
                      value={Object.keys(usage.claude.usage.byModel).length.toString()}
                      color="bg-green-500/20 text-green-400"
                    />
                  </div>

                  {/* By model breakdown */}
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-slate-300">Coût par modèle</div>
                    {Object.entries(usage.claude.usage.byModel)
                      .sort(([, a], [, b]) => b.cost - a.cost)
                      .map(([model, data]) => (
                        <div key={model} className="flex items-center justify-between text-sm p-2 rounded bg-slate-900/50">
                          <span className="text-slate-300 truncate max-w-[200px]">{model}</span>
                          <div className="flex items-center gap-4">
                            <span className="text-slate-500 text-xs">
                              {formatNumber(data.input + data.output)} tokens
                            </span>
                            <span className="text-yellow-400 font-medium">
                              ${data.cost.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-500 bg-slate-900/50 p-3 rounded">
                  <p>Pour voir les statistiques détaillées, ajoutez <code className="text-orange-400">AI_CLAUDE_ADMIN_KEY</code></p>
                  <p className="mt-1 text-xs">Obtenez une clé Admin sur console.anthropic.com → Settings → API Keys</p>
                </div>
              )}

              <a
                href="https://console.anthropic.com/settings/usage"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-orange-400 hover:text-orange-300"
              >
                <ExternalLink className="w-3 h-3" />
                Voir sur console.anthropic.com
              </a>
            </>
          ) : usage?.claude?.status === 'error' ? (
            <div className="text-sm text-red-400">{usage.claude.error}</div>
          ) : (
            <div className="text-sm text-slate-500">
              Ajoutez <code className="text-orange-400">AI_CLAUDE_KEY</code> dans .env.local
            </div>
          )}
        </CardContent>
      </Card>

      {/* ========== FAL.AI ========== */}
      <Card className="bg-slate-800/50 border-white/10">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Video className="w-5 h-5 text-purple-400" />
              fal.ai (Kling Video)
            </CardTitle>
            <StatusBadge status={usage?.fal?.status || 'not_configured'} />
          </div>
          <p className="text-sm text-slate-400">
            Génération vidéo IA avec Kling (interpolation first/last frame)
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {usage?.fal?.status === 'connected' ? (
            <>
              <div className="flex items-center gap-2 text-sm">
                <Key className="w-4 h-4 text-slate-500" />
                <span className="text-slate-400">API Key:</span>
                <span className="text-green-400">Configurée</span>
              </div>

              {usage.fal.usage ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <StatCard
                      icon={DollarSign}
                      label="Coût total (30j)"
                      value={`$${usage.fal.usage.totalCost.toFixed(2)}`}
                      color="bg-yellow-500/20 text-yellow-400"
                    />
                    <StatCard
                      icon={Zap}
                      label="Requêtes"
                      value={usage.fal.usage.totalRequests.toString()}
                      color="bg-purple-500/20 text-purple-400"
                    />
                    <StatCard
                      icon={Hash}
                      label="Endpoints"
                      value={Object.keys(usage.fal.usage.byEndpoint).length.toString()}
                      color="bg-blue-500/20 text-blue-400"
                    />
                  </div>

                  {/* By endpoint breakdown */}
                  {Object.keys(usage.fal.usage.byEndpoint).length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-slate-300">Coût par endpoint</div>
                      {Object.entries(usage.fal.usage.byEndpoint)
                        .sort(([, a], [, b]) => b.cost - a.cost)
                        .map(([endpoint, data]) => (
                          <div key={endpoint} className="flex items-center justify-between text-sm p-2 rounded bg-slate-900/50">
                            <span className="text-slate-300 truncate max-w-[200px]">{endpoint}</span>
                            <div className="flex items-center gap-4">
                              <span className="text-slate-500 text-xs">
                                {data.requests} requêtes
                              </span>
                              <span className="text-yellow-400 font-medium">
                                ${data.cost.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-slate-500 bg-slate-900/50 p-3 rounded">
                  <p>Aucune donnée d'usage disponible pour les 30 derniers jours.</p>
                </div>
              )}

              <a
                href="https://fal.ai/dashboard/billing"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300"
              >
                <ExternalLink className="w-3 h-3" />
                Voir le billing sur fal.ai
              </a>
            </>
          ) : usage?.fal?.status === 'error' ? (
            <div className="text-sm text-red-400">{usage.fal.error}</div>
          ) : (
            <div className="text-sm text-slate-500">
              Ajoutez <code className="text-purple-400">AI_FAL_KEY</code> dans .env.local
            </div>
          )}
        </CardContent>
      </Card>

      {/* ========== REPLICATE ========== */}
      <Card className="bg-slate-800/50 border-white/10">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-blue-400" />
              Replicate
            </CardTitle>
            <StatusBadge status={usage?.replicate?.status || 'not_configured'} />
          </div>
          <p className="text-sm text-slate-400">
            Génération d'images pour la bibliothèque (fallback)
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {usage?.replicate?.status === 'connected' && usage.replicate.account ? (
            <>
              <div className="flex items-center gap-2 text-sm">
                <Key className="w-4 h-4 text-slate-500" />
                <span className="text-slate-400">Compte:</span>
                <span className="text-white">{usage.replicate.account.username}</span>
                <span className="text-xs text-slate-500">({usage.replicate.account.type})</span>
              </div>

              {usage.replicate.stats && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard
                      icon={DollarSign}
                      label="Coût estimé"
                      value={`$${usage.replicate.stats.estimatedCost.toFixed(2)}`}
                      subValue="100 dernières"
                      color="bg-yellow-500/20 text-yellow-400"
                    />
                    <StatCard
                      icon={Zap}
                      label="Prédictions"
                      value={usage.replicate.stats.totalPredictions.toString()}
                      subValue={`${usage.replicate.stats.successfulPredictions} réussies`}
                      color="bg-green-500/20 text-green-400"
                    />
                    <StatCard
                      icon={Clock}
                      label="Temps GPU"
                      value={`${usage.replicate.stats.totalGpuTime.toFixed(0)}s`}
                      color="bg-purple-500/20 text-purple-400"
                    />
                    <StatCard
                      icon={TrendingUp}
                      label="Modèles"
                      value={Object.keys(usage.replicate.stats.byModel).length.toString()}
                      color="bg-blue-500/20 text-blue-400"
                    />
                  </div>

                  {/* By model breakdown */}
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-slate-300">Coût par modèle</div>
                    {Object.entries(usage.replicate.stats.byModel)
                      .sort(([, a], [, b]) => b.cost - a.cost)
                      .map(([model, data]) => (
                        <div key={model} className="flex items-center justify-between text-sm p-2 rounded bg-slate-900/50">
                          <span className="text-slate-300 truncate max-w-[200px]">{model}</span>
                          <div className="flex items-center gap-4">
                            <span className="text-slate-500 text-xs">
                              {data.count} images • {data.gpuTime.toFixed(1)}s GPU
                            </span>
                            <span className="text-yellow-400 font-medium">
                              ${data.cost.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <a
                href="https://replicate.com/account/billing"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
              >
                <ExternalLink className="w-3 h-3" />
                Voir le billing sur replicate.com
              </a>
            </>
          ) : usage?.replicate?.status === 'error' ? (
            <div className="text-sm text-red-400">{usage.replicate.error}</div>
          ) : (
            <div className="text-sm text-slate-500">
              Ajoutez <code className="text-blue-400">AI_REPLICATE_KEY</code> dans .env.local
            </div>
          )}
        </CardContent>
      </Card>

      {/* Environment Variables Guide */}
      <Card className="bg-slate-800/50 border-white/10">
        <CardHeader>
          <CardTitle className="text-white text-base">Variables d'environnement</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 font-mono text-sm">
            <div>
              <div className="text-slate-400 mb-1"># Claude (requis)</div>
              <div className="bg-slate-900/50 p-2 rounded text-green-400">
                AI_CLAUDE_KEY=sk-ant-api03-xxxxx
              </div>
              <div className="bg-slate-900/50 p-2 rounded text-orange-400 mt-1">
                AI_CLAUDE_ADMIN_KEY=sk-ant-admin-xxxxx <span className="text-slate-500"># optionnel, pour stats</span>
              </div>
            </div>

            <div>
              <div className="text-slate-400 mb-1"># Replicate (génération images)</div>
              <div className="bg-slate-900/50 p-2 rounded text-blue-400">
                AI_REPLICATE_KEY=r8_xxxxx
              </div>
            </div>

            <div>
              <div className="text-slate-400 mb-1"># fal.ai (génération vidéos Kling)</div>
              <div className="bg-slate-900/50 p-2 rounded text-purple-400">
                AI_FAL_KEY=xxxxx
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
