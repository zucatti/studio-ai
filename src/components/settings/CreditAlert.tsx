'use client';

import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreditAlert as CreditAlertType, ApiProvider } from '@/types/database';

interface CreditAlertProps {
  alert: CreditAlertType;
  onAcknowledge: () => void;
}

const PROVIDER_LABELS: Record<ApiProvider, string> = {
  claude: 'Claude',
  replicate: 'Replicate',
  fal: 'fal.ai',
  piapi: 'PiAPI',
  elevenlabs: 'ElevenLabs',
  creatomate: 'Creatomate',
  global: 'Budget Global',
};

function getAlertColor(threshold: number): string {
  if (threshold >= 100) return 'border-red-500/50 bg-red-500/10 text-red-400';
  if (threshold >= 80) return 'border-orange-500/50 bg-orange-500/10 text-orange-400';
  return 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400';
}

function getAlertIcon(threshold: number): string {
  if (threshold >= 100) return 'text-red-400';
  if (threshold >= 80) return 'text-orange-400';
  return 'text-yellow-400';
}

export function CreditAlert({ alert, onAcknowledge }: CreditAlertProps) {
  const colorClass = getAlertColor(alert.threshold_percent);
  const iconClass = getAlertIcon(alert.threshold_percent);

  return (
    <div
      className={`flex items-center justify-between px-4 py-3 rounded-lg border ${colorClass}`}
    >
      <div className="flex items-center gap-3">
        <AlertTriangle className={`w-5 h-5 ${iconClass}`} />
        <div>
          <div className="font-medium">
            {PROVIDER_LABELS[alert.provider]} - {alert.threshold_percent}% du budget atteint
          </div>
          <div className="text-sm opacity-80">
            ${alert.spent_amount.toFixed(2)} / ${alert.budget_amount.toFixed(2)}
          </div>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onAcknowledge}
        className="hover:bg-white/10"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}

/**
 * Toast-style credit alert for showing in-context warnings
 */
export function CreditAlertToast({
  provider,
  threshold,
  spent,
  budget,
  onDismiss,
}: {
  provider: ApiProvider;
  threshold: number;
  spent: number;
  budget: number;
  onDismiss?: () => void;
}) {
  const colorClass = getAlertColor(threshold);

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 max-w-md px-4 py-3 rounded-lg border shadow-lg ${colorClass}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-medium">
              Budget {PROVIDER_LABELS[provider]} à {threshold}%
            </div>
            <div className="text-sm opacity-80 mt-1">
              Vous avez utilisé ${spent.toFixed(2)} sur ${budget.toFixed(2)}.
              {threshold >= 100 && ' Les appels API sont bloqués.'}
            </div>
          </div>
        </div>
        {onDismiss && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="hover:bg-white/10 -mr-2 -mt-1"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Banner-style credit alert for showing at the top of pages
 */
export function CreditAlertBanner({
  alerts,
  onDismiss,
}: {
  alerts: CreditAlertType[];
  onDismiss?: (id: string) => void;
}) {
  if (!alerts || alerts.length === 0) return null;

  // Get the most severe alert
  const severeAlert = alerts.reduce((prev, curr) =>
    curr.threshold_percent > prev.threshold_percent ? curr : prev
  );

  const colorClass = getAlertColor(severeAlert.threshold_percent);
  const iconClass = getAlertIcon(severeAlert.threshold_percent);

  return (
    <div className={`px-4 py-2 border-b ${colorClass}`}>
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className={`w-4 h-4 ${iconClass}`} />
          <span className="text-sm">
            {alerts.length === 1 ? (
              <>
                {PROVIDER_LABELS[severeAlert.provider]}: {severeAlert.threshold_percent}% du budget utilisé
                (${severeAlert.spent_amount.toFixed(2)} / ${severeAlert.budget_amount.toFixed(2)})
              </>
            ) : (
              <>
                {alerts.length} alertes de budget actives
              </>
            )}
          </span>
        </div>
        {onDismiss && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDismiss(severeAlert.id)}
            className="hover:bg-white/10 text-xs"
          >
            Ignorer
          </Button>
        )}
      </div>
    </div>
  );
}
