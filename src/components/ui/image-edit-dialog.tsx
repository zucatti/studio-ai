'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Wand2, RotateCcw } from 'lucide-react';

interface ImageEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageId: string;
  currentPrompt: string;
  onRegenerate: (imageId: string, newPrompt: string) => Promise<void>;
  isRegenerating?: boolean;
}

export function ImageEditDialog({
  open,
  onOpenChange,
  imageId,
  currentPrompt,
  onRegenerate,
  isRegenerating = false,
}: ImageEditDialogProps) {
  const [editedPrompt, setEditedPrompt] = useState(currentPrompt);

  // Reset prompt when dialog opens with new image
  useEffect(() => {
    if (open) {
      setEditedPrompt(currentPrompt);
    }
  }, [open, currentPrompt]);

  const handleRegenerate = async (useOriginal: boolean) => {
    const promptToUse = useOriginal ? currentPrompt : editedPrompt;
    await onRegenerate(imageId, promptToUse);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] bg-[#0d1218] border-white/10">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-blue-400" />
            Modifier et régénérer
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Original prompt (read-only) */}
          <div className="space-y-2">
            <label className="text-xs text-slate-500 uppercase tracking-wide">
              Prompt original
            </label>
            <div className="p-3 bg-slate-900/50 rounded-lg border border-white/5 text-sm text-slate-400 max-h-24 overflow-y-auto">
              {currentPrompt || 'Aucun prompt'}
            </div>
          </div>

          {/* Editable prompt */}
          <div className="space-y-2">
            <label className="text-xs text-slate-500 uppercase tracking-wide">
              Nouveau prompt
            </label>
            <Textarea
              value={editedPrompt}
              onChange={(e) => setEditedPrompt(e.target.value)}
              placeholder="Modifiez le prompt ici..."
              className="min-h-[120px] bg-slate-900 border-white/10 text-white placeholder:text-slate-600 focus:border-blue-500"
              disabled={isRegenerating}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => handleRegenerate(true)}
              disabled={isRegenerating || !currentPrompt}
              className="border-white/10 text-slate-300 hover:bg-white/5"
            >
              {isRegenerating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4 mr-2" />
              )}
              Régénérer (original)
            </Button>
            <Button
              onClick={() => handleRegenerate(false)}
              disabled={isRegenerating || !editedPrompt.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isRegenerating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4 mr-2" />
              )}
              Régénérer avec ce prompt
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
