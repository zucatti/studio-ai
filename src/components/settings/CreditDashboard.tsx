'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Settings,
} from 'lucide-react';
import { BudgetEditor } from './BudgetEditor';
import { ApiProvider, ProviderSpending } from '@/types/database';
import { PROVIDERS, type DashboardProvider } from '@/lib/credits';

// Warning triangle icon for API issues
const WarningIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L1 21h22L12 2z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 9v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="12" cy="16" r="1" fill="currentColor"/>
  </svg>
);

// SVG Icons for each provider
const ProviderIcons: Record<DashboardProvider, React.FC<{ className?: string; style?: React.CSSProperties }>> = {
  claude: ({ className, style }) => (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="currentColor"/>
    </svg>
  ),
  replicate: ({ className, style }) => (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" fill="currentColor"/>
    </svg>
  ),
  fal: ({ className, style }) => (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 2v11h3v9l7-12h-4l4-8H7z" fill="currentColor"/>
    </svg>
  ),
  piapi: ({ className, style }) => (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29a.996.996 0 00-1.41 0L1.29 18.96a.996.996 0 000 1.41l2.34 2.34c.39.39 1.02.39 1.41 0L16.7 11.05a.996.996 0 000-1.41l-2.33-2.35zm-1.03 5.49l-2.12-2.12 2.44-2.44 2.12 2.12-2.44 2.44z" fill="currentColor"/>
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
const PROVIDER_ORDER: DashboardProvider[] = ['claude', 'replicate', 'fal', 'piapi', 'elevenlabs', 'creatomate'];

// Per-provider state
interface ProviderState {
  loading: boolean;
  spent: number;
  budget: number; // Manual budget set by user
  balance?: number; // Credit balance from API (PiAPI)
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

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
}

// Mini bar chart component
function MiniBarChart({ data, maxHeight = 60 }: { data: MonthlyData[]; maxHeight?: number }) {
  const maxValue = Math.max(...data.map(d => d.total), 1);

  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((item) => {
        const height = Math.max(4, (item.total / maxValue) * maxHeight);
        return (
          <div key={item.month} className="flex flex-col items-center flex-1">
            <div
              className="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t transition-all hover:from-blue-500 hover:to-blue-300"
              style={{ height: `${height}px` }}
              title={`${formatMonth(item.month)}: ${formatCurrency(item.total)}`}
            />
            <span className="text-[10px] text-slate-500 mt-1">
              {formatMonth(item.month)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Provider card component with loading state
function ProviderCard({
  provider,
  state,
  onOpenDashboard,
  onEditBudget,
}: {
  provider: DashboardProvider;
  state: ProviderState;
  onOpenDashboard: () => void;
  onEditBudget: () => void;
}) {
  const config = PROVIDERS[provider];
  const IconComponent = ProviderIcons[provider];
  const { loading, spent, budget, balance, characterCount, characterLimit, status, message, hasBalanceApi } = state;

  const hasWarning = status === 'connected' && message;

  const statusColor = loading ? 'bg-blue-500 animate-pulse' :
                      hasWarning ? 'bg-orange-500' :
                      status === 'connected' ? 'bg-green-500' :
                      status === 'error' ? 'bg-red-500' : 'bg-slate-500';

  // Calculate progress
  let progressPercent = 0;
  let remaining = 0;
  let showProgress = false;
  let isOverBudget = false;

  if (provider === 'elevenlabs' && characterLimit && characterLimit > 0) {
    // ElevenLabs: character-based
    progressPercent = ((characterCount || 0) / characterLimit) * 100;
    remaining = characterLimit - (characterCount || 0);
    showProgress = true;
  } else if (hasBalanceApi && balance !== undefined) {
    // PiAPI: has balance from API
    remaining = balance;
    // If user set a budget (initial deposit), we can show progress
    if (budget > 0) {
      const spentAmount = Math.max(0, budget - balance); // Can't be negative (bonus credits case)
      progressPercent = (spentAmount / budget) * 100;
      isOverBudget = balance < 0;
      showProgress = true;
    }
  } else if (budget > 0) {
    // Manual budget set by user
    progressPercent = (spent / budget) * 100;
    remaining = budget - spent;
    isOverBudget = spent > budget;
    showProgress = true;
  }

  const getProgressColor = () => {
    if (isOverBudget) return 'bg-red-500';
    if (progressPercent > 80) return 'bg-orange-500';
    return 'bg-green-500';
  };

  return (
    <Card className="bg-slate-800/50 border-white/10 hover:border-white/20 transition-colors h-full">
      <CardContent className="p-4 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className="relative flex-shrink-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${config.color}20` }}
            >
              <IconComponent className="w-5 h-5" style={{ color: config.color }} />
            </div>
            <div
              className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${statusColor} border-2 border-slate-800`}
              title={loading ? 'Chargement...' : status === 'connected' ? 'Connecté' : status === 'error' ? 'Erreur' : 'Non configuré'}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="font-semibold text-white text-sm">{config.displayName}</h3>
              {!loading && hasWarning && (
                <WarningIcon className="w-3.5 h-3.5 text-amber-400" />
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">{config.description}</p>
          </div>
        </div>

        {/* Main content - grows to fill space */}
        <div className="flex-1">
          {/* Amount display */}
          <div className="mb-3">
            {loading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                <span className="text-sm text-slate-400">Chargement...</span>
              </div>
            ) : hasWarning ? (
              /* API error/warning - don't show budget */
              <div className="text-sm text-slate-400">
                Données indisponibles
              </div>
            ) : (
              <>
                {/* ElevenLabs - show characters */}
                {provider === 'elevenlabs' && characterLimit ? (
                  <>
                    <div className="text-2xl font-bold text-white">
                      {formatNumber(remaining)}
                    </div>
                    <div className="text-xs text-slate-400">
                      caractères restants sur {formatNumber(characterLimit)}
                    </div>
                  </>
                ) : hasBalanceApi && balance !== undefined ? (
                  /* PiAPI - has balance from API */
                  <>
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-green-400" />
                      <span className="text-2xl font-bold text-white">{formatCurrency(balance)}</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      {budget > 0 ? `restant sur ${formatCurrency(budget)} déposé` : 'solde disponible'}
                    </div>
                  </>
                ) : budget > 0 ? (
                  /* Manual budget set - show remaining */
                  <>
                    <div className={`text-2xl font-bold ${isOverBudget ? 'text-red-400' : 'text-white'}`}>
                      {formatCurrency(remaining)}
                    </div>
                    <div className="text-xs text-slate-400">
                      restant sur {formatCurrency(budget)} alloués
                    </div>
                  </>
                ) : (
                  /* No budget set - show spending */
                  <>
                    <div className="text-2xl font-bold text-white">
                      {formatCurrency(spent)}
                    </div>
                    <div className="text-xs text-slate-400">dépensé (30j)</div>
                  </>
                )}
              </>
            )}
          </div>

          {/* Progress bar */}
          {!loading && showProgress && !hasWarning && (
            <div className="mb-3">
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${getProgressColor()}`}
                  style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                {provider === 'elevenlabs' ? (
                  <>
                    <span className="text-[10px] text-slate-500">{formatNumber(characterCount || 0)} utilisés</span>
                    <span className="text-[10px] text-slate-500">{formatNumber(characterLimit || 0)}</span>
                  </>
                ) : hasBalanceApi && balance !== undefined ? (
                  <>
                    <span className="text-[10px] text-slate-500">{formatCurrency(Math.max(0, budget - balance))} dépensé</span>
                    <span className={`text-[10px] ${isOverBudget ? 'text-red-400' : 'text-slate-500'}`}>
                      {formatCurrency(budget)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[10px] text-slate-500">{formatCurrency(spent)} dépensé</span>
                    <span className={`text-[10px] ${isOverBudget ? 'text-red-400' : 'text-slate-500'}`}>
                      {formatCurrency(budget)}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Warning/Error messages */}
          {!loading && hasWarning && (
            <div className="mb-3 p-2 bg-orange-500/10 border border-orange-500/20 rounded-lg text-[11px] text-orange-400">
              {message}
            </div>
          )}

          {!loading && status === 'not_configured' && (
            <div className="mb-3 p-2 bg-slate-700/50 rounded-lg text-[11px] text-slate-400">
              Clé API non configurée
            </div>
          )}

          {/* No budget hint */}
          {!loading && status === 'connected' && budget === 0 && provider !== 'elevenlabs' && (
            <div className="mb-3 p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-[11px] text-blue-400">
              {hasBalanceApi
                ? 'Définir le montant déposé pour voir la progression'
                : 'Définir le budget alloué pour voir la progression'
              }
            </div>
          )}
        </div>

        {/* Footer - always at bottom */}
        <div className="flex gap-2 mt-auto pt-3 border-t border-white/5">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 text-xs text-slate-300 hover:text-white hover:bg-white/5 h-8"
            onClick={onOpenDashboard}
          >
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
            Dashboard
          </Button>
          {/* Show budget button for providers that need manual budget (excludes ElevenLabs which has built-in quota) */}
          {provider !== 'elevenlabs' && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-slate-400 hover:text-white hover:bg-white/5 h-8 px-2"
              onClick={onEditBudget}
              title="Définir le budget"
            >
              <Settings className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
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
        hasBalanceApi: p === 'piapi',
      };
    });
    return initial as Record<DashboardProvider, ProviderState>;
  });

  const [monthlyHistory, setMonthlyHistory] = useState<MonthlyData[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ApiProvider | null>(null);
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

  // Fetch provider usage data
  const fetchProviderUsage = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/settings/usage', { signal });
      if (!res.ok) return;
      const data = await res.json();

      setProviderStates(prev => {
        const next = { ...prev };

        // Claude
        if (data.claude) {
          next.claude = {
            ...next.claude,
            loading: false,
            spent: data.claude.usage?.totalCost || 0,
            status: data.claude.status as ProviderState['status'],
            message: data.claude.error,
            hasBalanceApi: false,
          };
        }

        // Replicate
        if (data.replicate) {
          next.replicate = {
            ...next.replicate,
            loading: false,
            spent: data.replicate.stats?.estimatedCost || 0,
            status: data.replicate.status as ProviderState['status'],
            message: data.replicate.error,
            hasBalanceApi: false,
          };
        }

        // fal.ai
        if (data.fal) {
          next.fal = {
            ...next.fal,
            loading: false,
            spent: data.fal.usage?.totalCost || 0,
            status: data.fal.status as ProviderState['status'],
            message: data.fal.error,
            hasBalanceApi: false,
          };
        }

        // ElevenLabs - special handling for characters
        if (data.elevenlabs) {
          next.elevenlabs = {
            ...next.elevenlabs,
            loading: false,
            spent: data.elevenlabs.usage?.estimatedCost || 0,
            characterCount: data.elevenlabs.usage?.characterCount,
            characterLimit: data.elevenlabs.usage?.characterLimit,
            status: data.elevenlabs.status as ProviderState['status'],
            message: data.elevenlabs.error,
            hasBalanceApi: false,
          };
        }

        // PiAPI - has balance API
        if (data.piapi) {
          next.piapi = {
            ...next.piapi,
            loading: false,
            balance: data.piapi.balance,
            status: data.piapi.status as ProviderState['status'],
            message: data.piapi.error,
            hasBalanceApi: true,
          };
        }

        // Creatomate
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
      // Don't log or update state if request was aborted
      if ((e as Error).name === 'AbortError') return;

      console.error('Error fetching usage:', e);
      setProviderStates(prev => {
        const next = { ...prev };
        PROVIDER_ORDER.forEach(p => {
          next[p] = { ...next[p], loading: false, status: 'error', message: 'Erreur de chargement' };
        });
        return next;
      });
    }
  }, []);

  // Fetch monthly history
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/usage-logs?summary=monthly&months=6');
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
          fetchProviderUsage(signal),
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
  }, [isActive, hasFetched, fetchBudgets, fetchProviderUsage, fetchHistory]);

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
    await Promise.all([fetchBudgets(), fetchProviderUsage(abortControllerRef.current.signal), fetchHistory()]);
    setRefreshing(false);
  };

  const handleOpenDashboard = (provider: DashboardProvider) => {
    const config = PROVIDERS[provider];
    window.open(config.dashboardUrl, '_blank');
  };

  const handleBudgetSave = async () => {
    setEditingProvider(null);
    await fetchBudgets();
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
              <div>
                <div className="text-3xl font-bold text-white">
                  {allLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </span>
                  ) : (
                    formatCurrency(totalSpent)
                  )}
                </div>
                <div className="text-sm text-slate-400 flex items-center gap-2">
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

            {/* Monthly History */}
            <div>
              <div className="text-sm font-medium text-slate-300 mb-3">
                <TrendingUp className="w-4 h-4 inline mr-1" />
                Historique 6 mois
              </div>
              {historyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              ) : monthlyHistory.length > 0 ? (
                <MiniBarChart data={monthlyHistory} />
              ) : (
                <div className="text-sm text-slate-500 text-center py-8">
                  Pas encore de données
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Provider Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {PROVIDER_ORDER.map(provider => (
          <ProviderCard
            key={provider}
            provider={provider}
            state={providerStates[provider]}
            onOpenDashboard={() => handleOpenDashboard(provider)}
            onEditBudget={() => setEditingProvider(provider)}
          />
        ))}
      </div>

      {/* Budget Editor Dialog */}
      {editingProvider && (
        <BudgetEditor
          provider={editingProvider}
          allocation={providerStates[editingProvider as DashboardProvider]?.budget > 0 ? {
            id: '',
            user_id: '',
            provider: editingProvider,
            budget_amount: providerStates[editingProvider as DashboardProvider].budget,
            budget_period: 'monthly',
            alert_threshold_50: true,
            alert_threshold_80: true,
            alert_threshold_100: true,
            block_on_limit: false,
            current_period_spent: 0,
            period_start_date: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } : undefined}
          open={true}
          onOpenChange={(open) => !open && setEditingProvider(null)}
          onSave={handleBudgetSave}
        />
      )}
    </div>
  );
}
