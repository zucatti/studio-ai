'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Trash2 } from 'lucide-react';
import { ApiProvider, BudgetPeriod, CreditAllocation } from '@/types/database';

interface BudgetEditorProps {
  provider: ApiProvider;
  allocation?: CreditAllocation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}

const PROVIDER_LABELS: Record<ApiProvider, string> = {
  claude: 'Claude (interne)',
  replicate: 'Replicate',
  fal: 'fal.ai',
  piapi: 'PiAPI',
  elevenlabs: 'ElevenLabs',
  creatomate: 'Creatomate',
  global: 'Budget Global',
};

const PERIOD_OPTIONS: { value: BudgetPeriod; label: string }[] = [
  { value: 'daily', label: 'Quotidien' },
  { value: 'weekly', label: 'Hebdomadaire' },
  { value: 'monthly', label: 'Mensuel' },
];

export function BudgetEditor({
  provider,
  allocation,
  open,
  onOpenChange,
  onSave,
}: BudgetEditorProps) {
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [budgetAmount, setBudgetAmount] = useState(
    allocation?.budget_amount?.toString() || ''
  );
  const [budgetPeriod, setBudgetPeriod] = useState<BudgetPeriod>(
    allocation?.budget_period || 'monthly'
  );
  const [alertThreshold50, setAlertThreshold50] = useState(
    allocation?.alert_threshold_50 ?? true
  );
  const [alertThreshold80, setAlertThreshold80] = useState(
    allocation?.alert_threshold_80 ?? true
  );
  const [alertThreshold100, setAlertThreshold100] = useState(
    allocation?.alert_threshold_100 ?? true
  );
  const [blockOnLimit, setBlockOnLimit] = useState(
    allocation?.block_on_limit ?? true
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          budget_amount: parseFloat(budgetAmount) || 0,
          budget_period: budgetPeriod,
          alert_threshold_50: alertThreshold50,
          alert_threshold_80: alertThreshold80,
          alert_threshold_100: alertThreshold100,
          block_on_limit: blockOnLimit,
        }),
      });

      if (res.ok) {
        onSave();
      } else {
        const error = await res.json();
        console.error('Failed to save allocation:', error);
      }
    } catch (error) {
      console.error('Error saving allocation:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/settings/credits?provider=${provider}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        onSave();
      } else {
        const error = await res.json();
        console.error('Failed to delete allocation:', error);
      }
    } catch (error) {
      console.error('Error deleting allocation:', error);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-white/10 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configurer {PROVIDER_LABELS[provider]}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Budget Amount */}
          <div className="space-y-2">
            <Label htmlFor="budget">Budget (USD)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                $
              </span>
              <Input
                id="budget"
                type="number"
                min="0"
                step="0.01"
                value={budgetAmount}
                onChange={(e) => setBudgetAmount(e.target.value)}
                className="pl-7 bg-slate-800 border-white/10"
                placeholder="0.00"
              />
            </div>
            <p className="text-xs text-slate-400">
              Laissez vide ou à 0 pour aucune limite
            </p>
          </div>

          {/* Budget Period */}
          <div className="space-y-2">
            <Label htmlFor="period">Période</Label>
            <Select value={budgetPeriod} onValueChange={(v) => setBudgetPeriod(v as BudgetPeriod)}>
              <SelectTrigger className="bg-slate-800 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-white/10">
                {PERIOD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-400">
              Les dépenses sont réinitialisées au début de chaque période
            </p>
          </div>

          {/* Alert Thresholds */}
          <div className="space-y-3">
            <Label>Alertes</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="alert50"
                  checked={alertThreshold50}
                  onCheckedChange={(c) => setAlertThreshold50(c === true)}
                />
                <label htmlFor="alert50" className="text-sm text-slate-300">
                  Alerte à 50%
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="alert80"
                  checked={alertThreshold80}
                  onCheckedChange={(c) => setAlertThreshold80(c === true)}
                />
                <label htmlFor="alert80" className="text-sm text-slate-300">
                  Alerte à 80%
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="alert100"
                  checked={alertThreshold100}
                  onCheckedChange={(c) => setAlertThreshold100(c === true)}
                />
                <label htmlFor="alert100" className="text-sm text-slate-300">
                  Alerte à 100%
                </label>
              </div>
            </div>
          </div>

          {/* Block on Limit */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="block"
                checked={blockOnLimit}
                onCheckedChange={(c) => setBlockOnLimit(c === true)}
              />
              <label htmlFor="block" className="text-sm text-slate-300">
                Bloquer les appels quand le budget est dépassé
              </label>
            </div>
            <p className="text-xs text-slate-400 ml-6">
              Si désactivé, les appels continueront mais avec des alertes
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {allocation && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || saving}
              className="sm:mr-auto"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              <span className="ml-2">Supprimer</span>
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving || deleting}
          >
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving || deleting}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Enregistrement...
              </>
            ) : (
              'Enregistrer'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
