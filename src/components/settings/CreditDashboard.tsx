'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  RefreshCw,
  TrendingUp,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { ProviderSpending } from '@/types/database';
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
  wavespeed: ({ className, style }) => (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 12h2l2-6 3 12 3-8 2 4h2l2-4h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  ),
  runway: ({ className, style }) => (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  ),
  modelslab: ({ className, style }) => (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L2 7v10l10 5 10-5V7l-10-5z" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M12 22V12M2 7l10 5 10-5" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  elevenlabs: ({ className, style }) => (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" fill="currentColor"/>
    </svg>
  ),
  creatomate: ({ className, style }) => (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4zM4 12h16v6H4v-6z" fill="currentColor"/>
    </svg>
  ),
};

interface MonthlyData {
  month: string;
  providers: Record<string, number>;
  total: number;
}

// Provider order for display
const PROVIDER_ORDER: DashboardProvider[] = ['claude', 'fal', 'wavespeed', 'runway', 'modelslab', 'elevenlabs', 'creatomate'];

// Per-provider state
interface ProviderState {
  loading: boolean;
  spent: number; // Spending from app logs (for donut chart & histogram)
  apiSpent?: number; // Spending from provider API (for provider cards)
  budget: number; // Manual budget set by user
  balance?: number; // Credit balance from API
  characterCount?: number; // For ElevenLabs
  characterLimit?: number; // For ElevenLabs
  status: 'connected' | 'error' | 'not_configured' | 'loading';
  message?: string;
  hasBalanceApi: boolean; // Whether this provider exposes balance via API
}

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

// Generate calendar year data (Jan to Dec) including empty months
function generateYearData(data: MonthlyData[], currentMonthTotal: number): MonthlyData[] {
  const result: MonthlyData[] = [];
  const dataMap = new Map(data.map(d => [d.month, d]));
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIndex = now.getMonth(); // 0-indexed (0=Jan, 2=Mar)

  // January to December of current year
  for (let month = 0; month < 12; month++) {
    const monthKey = `${currentYear}-${String(month + 1).padStart(2, '0')}`;

    // For current month (by index), use live spending total
    if (month === currentMonthIndex) {
      result.push({ month: monthKey, providers: {}, total: currentMonthTotal });
    } else if (dataMap.has(monthKey)) {
      result.push(dataMap.get(monthKey)!);
    } else {
      result.push({ month: monthKey, providers: {}, total: 0 });
    }
  }

  return result;
}

// Yearly bar chart component
function YearlyBarChart({ data, currentMonthTotal }: { data: MonthlyData[]; currentMonthTotal: number }) {
  const yearData = generateYearData(data, currentMonthTotal);
  const maxValue = Math.max(...yearData.map(d => d.total), 1);
  const currentMonth = new Date().toISOString().slice(0, 7);

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
          // Calculate pixel height based on container height (64px = h-16)
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

// Compact provider card - small and elegant
function CompactCard({
  provider,
  state,
  type,
  onOpenDashboard,
}: {
  provider: DashboardProvider;
  state: ProviderState;
  type: 'balance' | 'spent';
  onOpenDashboard: () => void;
}) {
  const config = PROVIDERS[provider];
  const IconComponent = ProviderIcons[provider];
  const { loading, spent, apiSpent, balance, characterCount, characterLimit, status } = state;

  const isElevenLabs = provider === 'elevenlabs';
  const displaySpent = apiSpent !== undefined ? apiSpent : spent;

  // Calculate ElevenLabs remaining characters
  let remaining = 0;
  if (isElevenLabs && characterLimit && characterLimit > 0) {
    remaining = characterLimit - (characterCount || 0);
  }

  // Determine what to display
  let displayValue: string;
  let subtitle: string = '';

  if (loading) {
    displayValue = '...';
  } else if (type === 'balance') {
    if (isElevenLabs && characterLimit) {
      displayValue = formatNumber(remaining);
      subtitle = 'chars';
    } else if (balance !== undefined) {
      displayValue = formatCurrency(balance);
    } else {
      displayValue = '—';
    }
  } else {
    displayValue = formatCurrency(displaySpent);
  }

  const statusColor = loading ? 'bg-blue-500 animate-pulse' :
                      status === 'connected' ? 'bg-emerald-500' :
                      status === 'error' ? 'bg-red-500' : 'bg-slate-500';

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
  const [providerStates, setProviderStates] = useState<Record<DashboardProvider, ProviderState>>(() => {
    const initial: Record<string, ProviderState> = {};
    PROVIDER_ORDER.forEach(p => {
      initial[p] = {
        loading: true,
        spent: 0,
        budget: 0,
        status: 'loading',
        hasBalanceApi: false,
      };
    });
    return initial as Record<DashboardProvider, ProviderState>;
  });

  const [monthlyHistory, setMonthlyHistory] = useState<MonthlyData[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch budget allocations
  const fetchBudgets = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/credits');
      if (res.ok) {
        const data = await res.json();
        const spending: ProviderSpending[] = data.spending || [];

        setProviderStates(prev => {
          const next = { ...prev };
          PROVIDER_ORDER.forEach(p => {
            const allocation = spending.find(s => s.provider === p);
            next[p] = {
              ...next[p],
              budget: allocation?.budget || 0,
            };
          });
          return next;
        });
      }
    } catch (e) {
      console.error('Error fetching budgets:', e);
    }
  }, []);

  // Fetch current month spending from usage logs
  const fetchCurrentSpending = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/settings/usage-logs?summary=current', { signal });
      if (!res.ok) return;
      const data = await res.json();
      const spending: Record<string, number> = data.spending || {};

      setProviderStates(prev => {
        const next = { ...prev };
        PROVIDER_ORDER.forEach(p => {
          next[p] = {
            ...next[p],
            spent: spending[p] || 0,
          };
        });
        return next;
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      console.error('Error fetching current spending:', e);
    }
  }, []);

  // Fetch provider status (connected, not_configured, error) and API spending
  const fetchProviderStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/settings/usage', { signal });
      if (!res.ok) return;
      const data = await res.json();

      setProviderStates(prev => {
        const next = { ...prev };

        // Claude - has usage API with totalCost
        if (data.claude) {
          next.claude = {
            ...next.claude,
            loading: false,
            apiSpent: data.claude.usage?.totalCost,
            status: data.claude.status as ProviderState['status'],
            message: data.claude.error,
            hasBalanceApi: !!data.claude.usage?.totalCost,
          };
        }

        // fal.ai - has usage API with totalCost and balance
        if (data.fal) {
          next.fal = {
            ...next.fal,
            loading: false,
            apiSpent: data.fal.usage?.totalCost,
            balance: data.fal.usage?.currentBalance,
            status: data.fal.status as ProviderState['status'],
            message: data.fal.error,
            hasBalanceApi: data.fal.usage?.currentBalance !== undefined,
          };
        }

        // WaveSpeed - has balance API
        if (data.wavespeed) {
          next.wavespeed = {
            ...next.wavespeed,
            loading: false,
            balance: data.wavespeed.usage?.currentBalance,
            status: data.wavespeed.status as ProviderState['status'],
            message: data.wavespeed.error,
            hasBalanceApi: data.wavespeed.usage?.currentBalance !== undefined,
          };
        }

        // Runway - has balance API via organization endpoint
        if (data.runway) {
          next.runway = {
            ...next.runway,
            loading: false,
            balance: data.runway.usage?.currentBalance,
            status: data.runway.status as ProviderState['status'],
            message: data.runway.error,
            hasBalanceApi: data.runway.usage?.currentBalance !== undefined,
          };
        }

        // ModelsLab - has wallet balance API
        if (data.modelslab) {
          next.modelslab = {
            ...next.modelslab,
            loading: false,
            balance: data.modelslab.usage?.currentBalance,
            status: data.modelslab.status as ProviderState['status'],
            message: data.modelslab.error,
            hasBalanceApi: data.modelslab.usage?.currentBalance !== undefined,
          };
        }

        // ElevenLabs - special handling for characters
        if (data.elevenlabs) {
          next.elevenlabs = {
            ...next.elevenlabs,
            loading: false,
            apiSpent: data.elevenlabs.usage?.estimatedCost,
            characterCount: data.elevenlabs.usage?.characterCount,
            characterLimit: data.elevenlabs.usage?.characterLimit,
            status: data.elevenlabs.status as ProviderState['status'],
            message: data.elevenlabs.error,
            hasBalanceApi: true,
          };
        }

        // Creatomate - no usage API, will use logs
        if (data.creatomate) {
          next.creatomate = {
            ...next.creatomate,
            loading: false,
            status: data.creatomate.status as ProviderState['status'],
            message: data.creatomate.error,
            hasBalanceApi: false,
          };
        }

        return next;
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;

      console.error('Error fetching provider status:', e);
      setProviderStates(prev => {
        const next = { ...prev };
        PROVIDER_ORDER.forEach(p => {
          next[p] = { ...next[p], loading: false, status: 'error', message: 'Erreur de chargement' };
        });
        return next;
      });
    }
  }, []);

  // Fetch monthly history (12 months)
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/usage-logs?summary=monthly&months=12');
      if (res.ok) {
        const data = await res.json();
        setMonthlyHistory(data.monthly || []);
      }
    } catch (e) {
      console.error('Error fetching history:', e);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Initial load - only when active and not yet fetched
  useEffect(() => {
    if (!isActive) {
      // Cancel any in-flight requests when becoming inactive
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      return;
    }

    if (hasFetched) return;

    // Create new abort controller
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    // Fetch all data
    const loadData = async () => {
      try {
        await Promise.all([
          fetchBudgets(),
          fetchCurrentSpending(signal),
          fetchProviderStatus(signal),
          fetchHistory(),
        ]);
        if (!signal.aborted) {
          setHasFetched(true);
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          console.error('Error loading data:', e);
        }
      }
    };

    loadData();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [isActive, hasFetched, fetchBudgets, fetchCurrentSpending, fetchProviderStatus, fetchHistory]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setProviderStates(prev => {
      const next = { ...prev };
      PROVIDER_ORDER.forEach(p => {
        next[p] = { ...next[p], loading: true };
      });
      return next;
    });

    // Create new abort controller for refresh
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    await Promise.all([
      fetchBudgets(),
      fetchCurrentSpending(signal),
      fetchProviderStatus(signal),
      fetchHistory(),
    ]);
    setRefreshing(false);
  };

  const handleOpenDashboard = (provider: DashboardProvider) => {
    const config = PROVIDERS[provider];
    window.open(config.dashboardUrl, '_blank');
  };

  // Calculate totals
  const spendingByProvider: Record<string, number> = {};
  let totalSpent = 0;
  const allLoading = PROVIDER_ORDER.every(p => providerStates[p].loading);

  PROVIDER_ORDER.forEach(p => {
    spendingByProvider[p] = providerStates[p].spent;
    totalSpent += providerStates[p].spent;
  });

  // Month comparison
  let change = 0;
  let isUp = false;
  if (monthlyHistory.length >= 2) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const currentData = monthlyHistory.find(m => m.month === currentMonth);
    const prevMonth = new Date();
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    const prevMonthStr = prevMonth.toISOString().slice(0, 7);
    const prevData = monthlyHistory.find(m => m.month === prevMonthStr);

    const current = currentData?.total || 0;
    const prev = prevData?.total || 0;

    if (prev > 0) {
      const changePercent = ((current - prev) / prev) * 100;
      change = Math.abs(changePercent);
      isUp = changePercent > 0;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Consommation API</h2>
          <p className="text-sm text-slate-400">Suivi en temps réel de vos dépenses et soldes</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="bg-transparent border-white/10"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {/* Total Spending Card */}
      <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-white/10">
        <CardContent className="p-8">
          <div className="grid md:grid-cols-3 gap-8 items-center">
            {/* Donut Chart */}
            <div className="flex flex-col items-center justify-center py-4">
              <DonutChart data={spendingByProvider} total={totalSpent} loading={allLoading} />
            </div>

            {/* Stats */}
            <div className="space-y-4">
              <div className="mb-6">
                <div className="text-3xl font-bold text-white">
                  {allLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </span>
                  ) : (
                    formatCurrency(totalSpent)
                  )}
                </div>
                <div className="text-sm text-slate-400 flex items-center gap-2 mt-1">
                  <Calendar className="w-4 h-4" />
                  Dépensé ce mois
                  {change > 0 && (
                    <span className={`flex items-center text-xs ${isUp ? 'text-red-400' : 'text-green-400'}`}>
                      {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {change.toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>

              {/* Provider breakdown */}
              <div className="space-y-2">
                {PROVIDER_ORDER.map(provider => {
                  const config = PROVIDERS[provider];
                  const state = providerStates[provider];
                  const percent = totalSpent > 0 ? (state.spent / totalSpent) * 100 : 0;

                  return (
                    <div key={provider} className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: config.color }}
                      />
                      <span className="text-xs text-slate-400 flex-1">{config.displayName}</span>
                      {state.loading ? (
                        <Loader2 className="w-3 h-3 animate-spin text-slate-500" />
                      ) : (
                        <>
                          <span className="text-xs font-medium text-white">
                            {formatCurrency(state.spent)}
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
            </div>

            {/* Yearly History */}
            <div>
              <div className="text-sm font-medium text-slate-300 mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Historique {new Date().getFullYear()}
              </div>
              {(historyLoading || allLoading) ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              ) : (
                <YearlyBarChart data={monthlyHistory} currentMonthTotal={totalSpent} />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Crédits disponibles - fal.ai, WaveSpeed, Runway ML, ElevenLabs */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide">
          Crédits disponibles
        </h3>
        <div className="flex gap-3">
          {(['fal', 'wavespeed', 'runway', 'elevenlabs'] as DashboardProvider[]).map(provider => (
            <CompactCard
              key={provider}
              provider={provider}
              state={providerStates[provider]}
              type="balance"
              onOpenDashboard={() => handleOpenDashboard(provider)}
            />
          ))}
        </div>
      </div>

      {/* Dépensés - Claude, Creatomate, ModelsLab */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide">
          Dépensés
        </h3>
        <div className="flex gap-3">
          {(['claude', 'creatomate', 'modelslab'] as DashboardProvider[]).map(provider => (
            <CompactCard
              key={provider}
              provider={provider}
              state={providerStates[provider]}
              type="spent"
              onOpenDashboard={() => handleOpenDashboard(provider)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
