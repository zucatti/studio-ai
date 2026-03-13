'use client';

import { useState } from 'react';
import { Edit3, RefreshCw, X, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface PromptEditorProps {
  shotId: string;
  projectId: string;
  currentPrompt: string | null;
  onRegenerate: (shotId: string, customPrompt?: string) => Promise<void>;
  isGenerating?: boolean;
}

export function PromptEditor({
  shotId,
  projectId,
  currentPrompt,
  onRegenerate,
  isGenerating = false,
}: PromptEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState(currentPrompt || '');
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleOpen = () => {
    setEditedPrompt(currentPrompt || '');
    setIsOpen(true);
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      await onRegenerate(shotId, editedPrompt || undefined);
      setIsOpen(false);
    } catch (error) {
      console.error('Error regenerating:', error);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleRegenerateDefault = async () => {
    setIsRegenerating(true);
    try {
      await onRegenerate(shotId);
      setIsOpen(false);
    } catch (error) {
      console.error('Error regenerating:', error);
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-white/10 text-slate-300 hover:bg-white/10"
          onClick={handleOpen}
        >
          <Edit3 className="w-4 h-4 mr-2" />
          Modifier le prompt
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-[#1a2433] border-white/10 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">Modifier le prompt</DialogTitle>
          <DialogDescription className="text-slate-400">
            Personnalisez le prompt pour la génération du storyboard. Le style graphique (croquis noir et blanc) sera automatiquement ajouté.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {currentPrompt && (
            <div className="space-y-2">
              <label className="text-sm text-slate-400">Prompt actuel :</label>
              <div className="p-3 bg-white/5 rounded-lg border border-white/10 text-sm text-slate-300">
                {currentPrompt}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm text-slate-400">
              {currentPrompt ? 'Nouveau prompt (optionnel) :' : 'Prompt personnalisé :'}
            </label>
            <Textarea
              value={editedPrompt}
              onChange={(e) => setEditedPrompt(e.target.value)}
              placeholder="Décrivez la scène en anglais ou français..."
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 min-h-[120px] resize-none"
            />
            <p className="text-xs text-slate-500">
              Conseils : Décrivez les personnages, l'action, l'environnement et l'éclairage. Le type de plan et l'angle caméra sont automatiquement inclus.
            </p>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            className="border-white/10 text-slate-300 hover:bg-white/10"
            disabled={isRegenerating}
          >
            <X className="w-4 h-4 mr-2" />
            Annuler
          </Button>

          {currentPrompt && (
            <Button
              variant="outline"
              onClick={handleRegenerateDefault}
              className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
              disabled={isRegenerating || isGenerating}
            >
              {isRegenerating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Régénérer (auto)
            </Button>
          )}

          <Button
            onClick={handleRegenerate}
            className="bg-blue-600 hover:bg-blue-700"
            disabled={isRegenerating || isGenerating || !editedPrompt.trim()}
          >
            {isRegenerating ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            Régénérer avec ce prompt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
