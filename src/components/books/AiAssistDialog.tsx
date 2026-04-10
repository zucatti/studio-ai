'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Wand2, Lightbulb, PenLine, Loader2, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

type AiAction = 'continue' | 'improve' | 'ideas';

interface AiAssistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  bookId: string;
  currentContent: string;
  onInsert: (text: string) => void;
}

const AI_ACTIONS: { value: AiAction; label: string; description: string; icon: typeof Wand2 }[] = [
  {
    value: 'continue',
    label: 'Continuer',
    description: 'Générer la suite du texte',
    icon: PenLine,
  },
  {
    value: 'improve',
    label: 'Améliorer',
    description: 'Réécrire le dernier paragraphe',
    icon: Wand2,
  },
  {
    value: 'ideas',
    label: 'Idées',
    description: 'Suggestions pour débloquer',
    icon: Lightbulb,
  },
];

export function AiAssistDialog({
  open,
  onOpenChange,
  projectId,
  bookId,
  currentContent,
  onInsert,
}: AiAssistDialogProps) {
  const [action, setAction] = useState<AiAction>('continue');
  const [result, setResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    setResult('');

    try {
      const res = await fetch(`/api/projects/${projectId}/books/${bookId}/ai-assist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          context: currentContent.slice(-2000), // Last 2000 chars for context
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to generate');
      }

      const data = await res.json();
      setResult(data.text || '');
    } catch (err) {
      setError('Une erreur est survenue. Veuillez réessayer.');
      console.error('AI assist error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInsert = () => {
    onInsert(result);
    setResult('');
    onOpenChange(false);
  };

  const handleClose = () => {
    setResult('');
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] bg-gradient-to-br from-[#1a2e44] to-[#152238] border-white/10">
        <DialogHeader>
          <DialogTitle className="text-xl text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            Assistance IA
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Utilisez l&apos;IA pour vous aider dans votre écriture.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Action selector */}
          <div className="flex gap-2">
            {AI_ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.value}
                  onClick={() => setAction(a.value)}
                  className={cn(
                    'flex-1 flex flex-col items-center gap-2 p-3 rounded-lg border transition-all',
                    action === a.value
                      ? 'border-purple-500 bg-purple-500/10 text-white'
                      : 'border-white/10 hover:border-white/20 text-slate-400 hover:text-white'
                  )}
                >
                  <Icon className={cn('w-5 h-5', action === a.value && 'text-purple-400')} />
                  <span className="text-sm font-medium">{a.label}</span>
                  <span className="text-xs text-slate-500">{a.description}</span>
                </button>
              );
            })}
          </div>

          {/* Generate button */}
          {!result && (
            <Button
              onClick={handleGenerate}
              disabled={isLoading || !currentContent.trim()}
              className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Génération en cours...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Générer
                </>
              )}
            </Button>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">Résultat</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCopy}
                  className="text-slate-400 hover:text-white"
                >
                  {copied ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <Textarea
                value={result}
                onChange={(e) => setResult(e.target.value)}
                rows={8}
                className="bg-white/5 border-white/10 text-slate-200 resize-none"
              />
            </div>
          )}

          {/* No content warning */}
          {!currentContent.trim() && (
            <p className="text-sm text-amber-400">
              Commencez à écrire du contenu pour utiliser l&apos;assistance IA.
            </p>
          )}
        </div>

        <DialogFooter className="gap-3">
          <Button
            variant="ghost"
            onClick={handleClose}
            className="text-slate-400 hover:text-white hover:bg-white/5"
          >
            Fermer
          </Button>
          {result && (
            <>
              <Button
                variant="ghost"
                onClick={handleGenerate}
                disabled={isLoading}
                className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
              >
                Régénérer
              </Button>
              <Button
                onClick={handleInsert}
                className="bg-purple-500 hover:bg-purple-600 text-white"
              >
                Insérer dans le chapitre
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
