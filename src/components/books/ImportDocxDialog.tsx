'use client';

import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FileText, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface ImportDocxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  bookId: string;
  onImportComplete: () => void;
}

interface ImportResult {
  success: boolean;
  chapters: number;
  created: string[];
  updated: string[];
  warnings?: string[];
}

export function ImportDocxDialog({
  open,
  onOpenChange,
  projectId,
  bookId,
  onImportComplete,
}: ImportDocxDialogProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Determine endpoint based on file type
    const isEpub = file.name.toLowerCase().endsWith('.epub');
    const isDocx = file.name.toLowerCase().endsWith('.docx');

    if (!isEpub && !isDocx) {
      setError('Format non supporté. Utilisez .epub ou .docx');
      return;
    }

    setIsUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const endpoint = isEpub ? 'import-epub' : 'import-docx';
      const response = await fetch(
        `/api/projects/${projectId}/books/${bookId}/${endpoint}`,
        {
          method: 'POST',
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Import failed');
        return;
      }

      setResult(data);

      // Refresh chapters immediately after successful import
      if (data.success) {
        onImportComplete();
      }
    } catch (err) {
      setError('Failed to upload file');
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClose = () => {
    setResult(null);
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md bg-[#1a2433] border-white/10">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-400" />
            Importer un livre
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Importez un fichier EPUB ou DOCX exporté depuis Pages.
            Les chapitres seront détectés automatiquement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Info box */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-sm text-amber-200">
            <p className="font-medium mb-1">Formats de chapitres reconnus :</p>
            <ul className="list-disc list-inside text-amber-300/80 space-y-0.5">
              <li>Prologue, Épilogue</li>
              <li>Chapitre 1, Chapitre 2, ...</li>
              <li>Introduction, Conclusion</li>
              <li>Avant-propos, Préface</li>
            </ul>
            <p className="mt-2 text-amber-300/60">
              Tout le contenu avant le premier chapitre sera ignoré.
            </p>
          </div>

          {/* Upload area */}
          {!result && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                ${isUploading
                  ? 'border-amber-500/50 bg-amber-500/10'
                  : 'border-white/20 hover:border-amber-500/50 hover:bg-white/5'
                }
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".epub,.docx"
                onChange={handleFileSelect}
                className="hidden"
                disabled={isUploading}
              />

              {isUploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                  <p className="text-slate-300">Import en cours...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-slate-500" />
                  <p className="text-slate-300">Cliquez pour sélectionner un fichier</p>
                  <p className="text-sm text-slate-500">.epub (recommandé) ou .docx</p>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Success result */}
          {result?.success && (
            <div className="space-y-3">
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-green-300 font-medium">
                    Import réussi ! {result.chapters} chapitre{result.chapters > 1 ? 's' : ''} traité{result.chapters > 1 ? 's' : ''}.
                  </p>
                </div>
              </div>

              {result.created.length > 0 && (
                <div className="text-sm">
                  <p className="text-slate-400 mb-1">Chapitres créés :</p>
                  <ul className="list-disc list-inside text-green-400 space-y-0.5">
                    {result.created.map((title, i) => (
                      <li key={i}>{title}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.updated.length > 0 && (
                <div className="text-sm">
                  <p className="text-slate-400 mb-1">Chapitres mis à jour :</p>
                  <ul className="list-disc list-inside text-blue-400 space-y-0.5">
                    {result.updated.map((title, i) => (
                      <li key={i}>{title}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.warnings && result.warnings.length > 0 && (
                <div className="text-sm">
                  <p className="text-slate-400 mb-1">Avertissements :</p>
                  <ul className="list-disc list-inside text-yellow-400 space-y-0.5">
                    {result.warnings.slice(0, 5).map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={handleClose}
            className="text-slate-400 hover:text-white"
          >
            {result?.success ? 'Fermer' : 'Annuler'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
