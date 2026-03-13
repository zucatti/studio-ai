'use client';

import { useEffect, useRef } from 'react';
import { Loader2, CheckCircle2, XCircle, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface GenerationLog {
  type: 'info' | 'success' | 'error' | 'claude';
  message: string;
  timestamp: Date;
}

interface GenerationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logs: GenerationLog[];
  isComplete: boolean;
  error?: string | null;
}

export function GenerationModal({
  open,
  onOpenChange,
  logs,
  isComplete,
  error,
}: GenerationModalProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getIcon = (type: GenerationLog['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
      case 'claude':
        return <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />;
      default:
        return <div className="w-4 h-4 rounded-full bg-blue-400/20 shrink-0" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a2433] border-white/10 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {!isComplete && !error && (
              <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
            )}
            {isComplete && !error && (
              <CheckCircle2 className="w-5 h-5 text-green-400" />
            )}
            {error && <XCircle className="w-5 h-5 text-red-400" />}
            Generation du script
          </DialogTitle>
        </DialogHeader>

        <div className="bg-black/30 rounded-lg p-4 max-h-[400px] overflow-y-auto font-mono text-sm">
          {logs.length === 0 && (
            <div className="text-slate-500 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Initialisation...
            </div>
          )}

          {logs.map((log, index) => (
            <div
              key={index}
              className={cn(
                'flex items-start gap-2 py-1',
                log.type === 'error' && 'text-red-400',
                log.type === 'success' && 'text-green-400',
                log.type === 'claude' && 'text-purple-300',
                log.type === 'info' && 'text-slate-300'
              )}
            >
              {getIcon(log.type)}
              <span className="text-slate-500 text-xs">
                {log.timestamp.toLocaleTimeString('fr-FR')}
              </span>
              <span className="flex-1">{log.message}</span>
            </div>
          ))}

          {!isComplete && !error && (
            <div className="flex items-center gap-2 py-1 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>En cours...</span>
            </div>
          )}

          <div ref={logsEndRef} />
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {isComplete && !error && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-green-400 text-sm">
            Generation terminee avec succes !
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
