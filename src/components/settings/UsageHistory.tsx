'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Filter,
  Check,
  X,
  Ban,
} from 'lucide-react';
import { ApiProvider, ApiCallStatus, ApiUsageLog } from '@/types/database';

interface UsageHistoryData {
  logs: ApiUsageLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: Record<string, {
    totalCost: number;
    successCount: number;
    failedCount: number;
    blockedCount: number;
  }>;
}

const PROVIDER_LABELS: Record<ApiProvider, string> = {
  claude: 'Claude',
  fal: 'fal.ai',
  runway: 'Runway',
  elevenlabs: 'ElevenLabs',
  global: 'Global',
};

const STATUS_CONFIG: Record<ApiCallStatus, { label: string; icon: typeof Check; color: string }> = {
  success: { label: 'Succès', icon: Check, color: 'text-green-400 bg-green-400/10' },
  failed: { label: 'Échec', icon: X, color: 'text-red-400 bg-red-400/10' },
  blocked: { label: 'Bloqué', icon: Ban, color: 'text-orange-400 bg-orange-400/10' },
};

export function UsageHistory() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<UsageHistoryData | null>(null);
  const [page, setPage] = useState(1);
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
      });
      if (providerFilter !== 'all') params.set('provider', providerFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/settings/usage-logs?${params}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (error) {
      console.error('Error fetching usage logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, providerFilter, statusFilter]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <Card className="bg-slate-800/50 border-white/10">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <CardTitle className="text-white">Historique d'utilisation</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={providerFilter} onValueChange={(v) => { setProviderFilter(v); setPage(1); }}>
              <SelectTrigger className="w-32 bg-slate-900 border-white/10 h-8 text-xs">
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-white/10">
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="claude">Claude</SelectItem>
                <SelectItem value="fal">fal.ai</SelectItem>
                <SelectItem value="runway">Runway</SelectItem>
                <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-28 bg-slate-900 border-white/10 h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-white/10">
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="success">Succès</SelectItem>
                <SelectItem value="failed">Échec</SelectItem>
                <SelectItem value="blocked">Bloqué</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchData}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : data && data.logs.length > 0 ? (
          <>
            {/* Summary */}
            {data.summary && Object.keys(data.summary).length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {Object.entries(data.summary).map(([provider, stats]) => (
                  <div
                    key={provider}
                    className="bg-slate-900/50 rounded px-3 py-1.5 text-xs"
                  >
                    <span className="text-slate-400">{PROVIDER_LABELS[provider as ApiProvider] || provider}:</span>{' '}
                    <span className="text-green-400">${stats.totalCost.toFixed(2)}</span>
                    <span className="text-slate-500 ml-2">
                      ({stats.successCount} ok, {stats.failedCount} err, {stats.blockedCount} blk)
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 text-left border-b border-white/10">
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Provider</th>
                    <th className="pb-2 font-medium">Opération</th>
                    <th className="pb-2 font-medium">Coût</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.logs.map((log) => {
                    const statusConfig = STATUS_CONFIG[log.status];
                    const StatusIcon = statusConfig.icon;
                    return (
                      <tr
                        key={log.id}
                        className="border-b border-white/5 hover:bg-slate-800/50"
                      >
                        <td className="py-2 text-slate-300">
                          {formatDate(log.created_at)}
                        </td>
                        <td className="py-2">
                          <Badge variant="outline" className="text-xs border-white/10">
                            {PROVIDER_LABELS[log.provider] || log.provider}
                          </Badge>
                        </td>
                        <td className="py-2">
                          <div className="text-slate-300">{log.operation}</div>
                          {log.model && (
                            <div className="text-xs text-slate-500">{log.model}</div>
                          )}
                        </td>
                        <td className="py-2 text-slate-300">
                          ${log.estimated_cost.toFixed(4)}
                        </td>
                        <td className="py-2">
                          <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${statusConfig.color}`}>
                            <StatusIcon className="w-3 h-3" />
                            {statusConfig.label}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data.pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
                <div className="text-xs text-slate-400">
                  Page {data.pagination.page} sur {data.pagination.totalPages} ({data.pagination.total} entrées)
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1 || loading}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(data.pagination.totalPages, p + 1))}
                    disabled={page >= data.pagination.totalPages || loading}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center text-slate-400 py-8">
            Aucun historique d'utilisation
          </div>
        )}
      </CardContent>
    </Card>
  );
}
