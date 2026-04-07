'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  RefreshCw,
  TrendingUp,
  Calendar,
  Clock,
} from 'lucide-react';
import { PROVIDERS, type DashboardProvider } from '@/lib/credits';

// SVG Icons for each provider
const ProviderIcons: Record<DashboardProvider, React.FC<{ className?: string; style?: React.CSSProperties }>> = {
  claude: ({ className, style }) => (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="currentColor"/>
    </svg>
  ),
  fal: ({ className, style }) => (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 2v11h3v9l7-12h-4l4-8H7z" fill="currentColor"/>
    </svg>
  ),
  runway: ({ className, style }) => (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  ),
  elevenlabs: ({ className, style }) => (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" fill="currentColor"/>
    </svg>
  ),
};

interface ProviderSpendingData {
  current: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
  unit: string;
  balance?: number;
  characterCount?: number;
  characterLimit?: number;
  status: 'connected' | 'not_configured';
}

interface MonthlyData {
  month: string;
  providers: Record<string, number>;
  total: number;
}

interface SpendingResponse {
  spending: Record<string, ProviderSpendingData>;
  monthlyHistory: MonthlyData[];
  lastSnapshotAt: string | null;
  currentTime: string;
}

// Provider order for display
const PROVIDER_ORDER: DashboardProvider[] = ['claude', 'fal', 'runway', 'elevenlabs'];

function formatCurrency(amount: number): string {
  return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return num.toString();
}

function formatMonthShort(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString('fr-FR', { month: 'short' });
}

function formatMonthFull(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return 'maintenant';
  if (diffMins < 60) return `il y a ${diffMins}min`;
  if (diffHours < 24) return `il y a ${diffHours}h`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// Yearly bar chart component
function YearlyBarChart({ data, currentMonthTotal }: { data: MonthlyData[]; currentMonthTotal: number }) {
  const currentMonth = new Date().toISOString().slice(0, 7);

  // Ensure we have 12 months for the current year
  const yearData = data.map(d => {
    if (d.month === currentMonth) {
      return { ...d, total: currentMonthTotal };
    }
    return d;
  });

  const maxValue = Math.max(...yearData.map(d => d.total), 1);

  return (
    <div className="space-y-1">
      {/* Value labels */}
      <div className="flex gap-0.5">
        {yearData.map((item) => (
          <div key={item.month} className="flex-1 text-center">
            <span className={`text-[9px] font-medium ${item.total > 0 ? 'text-white' : 'text-slate-600'}`}>
              {item.total > 0 ? `$${item.total.toFixed(0)}` : ''}
            </span>
          </div>
        ))}
      </div>

      {/* Bars */}
      <div className="flex items-end gap-0.5 h-16">
        {yearData.map((item) => {
          const isCurrentMonth = item.month === currentMonth;
          const hasData = item.total > 0;
          const barHeight = hasData ? Math.max(6, (item.total / maxValue) * 64) : 4;

          return (
            <div
              key={item.month}
              className="flex-1 flex items-end group relative"
            >
              {/* Tooltip on hover */}
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                <div className="bg-slate-900 border border-slate-700 rounded px-2 py-1 shadow-xl text-center whitespace-nowrap">
                  <div className="text-[10px] text-slate-400">{formatMonthFull(item.month)}</div>
                  <div className="text-xs font-semibold text-white">{formatCurrency(item.total)}</div>
                </div>
              </div>

              {/* Bar */}
              <div
                className={`w-full rounded-t transition-all duration-300 ${
                  hasData
                    ? isCurrentMonth
                      ? 'bg-gradient-to-t from-emerald-600 to-emerald-400 group-hover:from-emerald-500 group-hover:to-emerald-300'
                      : 'bg-gradient-to-t from-blue-600 to-blue-400 group-hover:from-blue-500 group-hover:to-blue-300'
                    : 'bg-slate-700/30'
                }`}
                style={{ height: `${barHeight}px` }}
              />
            </div>
          );
        })}
      </div>

      {/* Month labels */}
      <div className="flex gap-0.5">
        {yearData.map((item) => (
          <div key={item.month} className="flex-1 text-center">
            <span className="text-[8px] text-slate-500">
              {formatMonthShort(item.month).slice(0, 3)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Compact provider card
function CompactCard({
  provider,
  data,
  loading,
  onOpenDashboard,
}: {
  provider: DashboardProvider;
  data: ProviderSpendingData | null;
  loading: boolean;
  onOpenDashboard: () => void;
}) {
  const config = PROVIDERS[provider];
  const IconComponent = ProviderIcons[provider];

  const isElevenLabs = provider === 'elevenlabs';
  const isBalanceBased = provider === 'fal' || provider === 'runway';

  let displayValue: string;
  let subtitle: string = '';

  if (loading || !data) {
    displayValue = '...';
  } else if (isElevenLabs) {
    const remaining = (data.characterLimit || 0) - (data.characterCount || 0);
    displayValue = formatNumber(remaining);
    subtitle = 'chars';
  } else if (isBalanceBased) {
    displayValue = data.balance !== undefined ? formatCurrency(data.balance) : '—';
  } else {
    // Claude - show 30-day cumulative cost
    displayValue = formatCurrency(data.current);
    subtitle = '30j';
  }

  const statusColor = loading ? 'bg-blue-500 animate-pulse' :
                      data?.status === 'connected' ? 'bg-emerald-500' : 'bg-slate-500';

  return (
    <button
      onClick={onOpenDashboard}
      className="flex-1 min-w-0 bg-slate-800/60 hover:bg-slate-700/60 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 transition-all duration-200 cursor-pointer group"
    >
      <div className="flex items-center justify-between gap-3">
        {/* Left: Icon + Name */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative flex-shrink-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${config.color}15` }}
            >
              <IconComponent className="w-4 h-4" style={{ color: config.color }} />
            </div>
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ${statusColor} border border-slate-800`}
            />
          </div>
          <span className="text-sm text-slate-300 group-hover:text-white transition-colors truncate">
            {config.displayName}
          </span>
        </div>

        {/* Right: Amount */}
        <div className="flex items-baseline gap-1 flex-shrink-0">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          ) : (
            <>
              <span className="text-lg font-bold text-white">
                {displayValue}
              </span>
              {subtitle && (
                <span className="text-[10px] text-slate-500">{subtitle}</span>
              )}
            </>
          )}
        </div>
      </div>
    </button>
  );
}

// Donut chart for total spending
function DonutChart({ data, total, loading }: { data: Record<string, number>; total: number; loading: boolean }) {
  const entries = Object.entries(data).filter(([, v]) => v > 0);

  if (loading) {
    return (
      <div className="relative w-44 h-44 mx-auto">
        <svg viewBox="0 0 100 100" className="transform -rotate-90 animate-pulse">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#334155" strokeWidth="10" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="relative w-44 h-44 mx-auto">
        <svg viewBox="0 0 100 100" className="transform -rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#334155" strokeWidth="10" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-2xl font-bold text-white">$0</div>
            <div className="text-xs text-slate-400">dépensé</div>
          </div>
        </div>
      </div>
    );
  }

  let currentAngle = 0;
  const segments = entries.map(([provider, value]) => {
    const config = PROVIDERS[provider as keyof typeof PROVIDERS];
    const percent = total > 0 ? (value / total) : 0;
    const angle = percent * 360;
    const segment = {
      provider,
      color: config?.color || '#6B7280',
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
      percent,
      value,
    };
    currentAngle += angle;
    return segment;
  });

  return (
    <div className="relative w-44 h-44 mx-auto">
      <svg viewBox="0 0 100 100" className="transform -rotate-90">
        {segments.map((seg) => {
          const r = 40;
          const circumference = 2 * Math.PI * r;
          const strokeDasharray = `${(seg.percent * circumference)} ${circumference}`;
          const rotation = (seg.startAngle / 360) * circumference;

          return (
            <circle
              key={seg.provider}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth="10"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={-rotation}
              className="transition-all duration-500"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold text-white">{formatCurrency(total)}</div>
          <div className="text-sm text-slate-400">dépensé</div>
        </div>
      </div>
    </div>
  );
}

interface CreditDashboardProps {
  isActive?: boolean;
}

export function CreditDashboard({ isActive = true }: CreditDashboardProps) {
  const [data, setData] = useState<SpendingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/settings/spending-snapshots', { signal });
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      console.error('Error fetching spending data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const takeSnapshot = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch('/api/settings/spending-snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'manual' }),
      });
      await fetchData();
    } catch (e) {
      console.error('Error taking snapshot:', e);
    } finally {
      setRefreshing(false);
    }
  }, [fetchData]);

  // Initial load
  useEffect(() => {
    if (!isActive) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      return;
    }

    if (hasFetched) return;

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    fetchData(signal).then(() => {
      if (!signal.aborted) {
        setHasFetched(true);
      }
    });

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [isActive, hasFetched, fetchData]);

  const handleOpenDashboard = (provider: DashboardProvider) => {
    const config = PROVIDERS[provider];
    window.open(config.dashboardUrl, '_blank');
  };

  // Calculate totals for donut chart (only $ providers)
  const spendingByProvider: Record<string, number> = {};
  let totalSpentThisMonth = 0;

  if (data?.spending) {
    PROVIDER_ORDER.forEach(p => {
      const providerData = data.spending[p];
      if (providerData && providerData.unit === '$') {
        spendingByProvider[p] = providerData.thisMonth;
        totalSpentThisMonth += providerData.thisMonth;
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Consommation API</h2>
          <p className="text-sm text-slate-400">Suivi basé sur les snapshots provider</p>
        </div>
        <div className="flex items-center gap-3">
          {data?.lastSnapshotAt && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatRelativeTime(data.lastSnapshotAt)}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={takeSnapshot}
            disabled={refreshing}
            className="bg-transparent border-white/10"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Snapshot
          </Button>
        </div>
      </div>

      {/* Total Spending Card */}
      <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-white/10">
        <CardContent className="p-8">
          <div className="grid md:grid-cols-3 gap-8 items-center">
            {/* Donut Chart */}
            <div className="flex flex-col items-center justify-center py-4">
              <DonutChart data={spendingByProvider} total={totalSpentThisMonth} loading={loading} />
            </div>

            {/* Stats */}
            <div className="space-y-4">
              <div className="mb-6">
                <div className="text-3xl font-bold text-white">
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </span>
                  ) : (
                    formatCurrency(totalSpentThisMonth)
                  )}
                </div>
                <div className="text-sm text-slate-400 flex items-center gap-2 mt-1">
                  <Calendar className="w-4 h-4" />
                  Dépensé ce mois
                </div>
              </div>

              {/* Provider breakdown */}
              <div className="space-y-2">
                {PROVIDER_ORDER.map(provider => {
                  const config = PROVIDERS[provider];
                  const providerData = data?.spending[provider];
                  const isElevenLabs = provider === 'elevenlabs';
                  const spent = providerData?.thisMonth || 0;
                  const percent = totalSpentThisMonth > 0 && !isElevenLabs ? (spent / totalSpentThisMonth) * 100 : 0;

                  return (
                    <div key={provider} className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: config.color }}
                      />
                      <span className="text-xs text-slate-400 flex-1">{config.displayName}</span>
                      {loading ? (
                        <Loader2 className="w-3 h-3 animate-spin text-slate-500" />
                      ) : isElevenLabs ? (
                        <span className="text-xs font-medium text-white">
                          {formatNumber(spent)} <span className="text-slate-500">chars</span>
                        </span>
                      ) : (
                        <>
                          <span className="text-xs font-medium text-white">
                            {formatCurrency(spent)}
                          </span>
                          <span className="text-xs text-slate-500 w-10 text-right">
                            {percent.toFixed(0)}%
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Period breakdown */}
              {data?.spending && !loading && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="text-slate-500">Aujourd'hui</div>
                      <div className="text-white font-medium">
                        {formatCurrency(
                          PROVIDER_ORDER.reduce((sum, p) => {
                            const d = data.spending[p];
                            return sum + (d && d.unit === '$' ? d.today : 0);
                          }, 0)
                        )}
                      </div>
                      {data.spending.elevenlabs && data.spending.elevenlabs.today > 0 && (
                        <div className="text-slate-500 text-[10px]">
                          +{formatNumber(data.spending.elevenlabs.today)} chars
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-slate-500">Cette semaine</div>
                      <div className="text-white font-medium">
                        {formatCurrency(
                          PROVIDER_ORDER.reduce((sum, p) => {
                            const d = data.spending[p];
                            return sum + (d && d.unit === '$' ? d.thisWeek : 0);
                          }, 0)
                        )}
                      </div>
                      {data.spending.elevenlabs && data.spending.elevenlabs.thisWeek > 0 && (
                        <div className="text-slate-500 text-[10px]">
                          +{formatNumber(data.spending.elevenlabs.thisWeek)} chars
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Yearly History */}
            <div>
              <div className="text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Historique {new Date().getFullYear()}
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              ) : (
                <YearlyBarChart
                  data={data?.monthlyHistory || []}
                  currentMonthTotal={totalSpentThisMonth}
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Provider Cards Row */}
      <div className="flex gap-6">
        {/* Crédits disponibles - fal.ai, Runway ML, ElevenLabs */}
        <div className="flex-[3] space-y-3">
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide">
            Crédits disponibles
          </h3>
          <div className="flex gap-3">
            {(['fal', 'runway', 'elevenlabs'] as DashboardProvider[]).map(provider => (
              <CompactCard
                key={provider}
                provider={provider}
                data={data?.spending[provider] || null}
                loading={loading}
                onOpenDashboard={() => handleOpenDashboard(provider)}
              />
            ))}
          </div>
        </div>

        {/* Crédits dépensés - Claude */}
        <div className="flex-1 space-y-3">
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide">
            Coût 30 jours
          </h3>
          <div className="flex gap-3">
            <CompactCard
              provider="claude"
              data={data?.spending.claude || null}
              loading={loading}
              onOpenDashboard={() => handleOpenDashboard('claude')}
            />
          </div>
        </div>
      </div>

      {/* Hint */}
      <p className="text-xs text-slate-600">
        Les dépenses sont calculées par diff entre snapshots. Le worker prend automatiquement des snapshots toutes les 30 minutes et un snapshot daily_start à minuit.
      </p>
    </div>
  );
}
