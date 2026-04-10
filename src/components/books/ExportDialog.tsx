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
import { FileText, BookOpen, Loader2, Download, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

type ExportFormat = 'pdf' | 'epub';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  bookId: string;
  bookTitle: string;
}

const EXPORT_FORMATS: {
  value: ExportFormat;
  label: string;
  description: string;
  icon: typeof FileText;
}[] = [
  {
    value: 'pdf',
    label: 'PDF',
    description: 'Format imprimable',
    icon: FileText,
  },
  {
    value: 'epub',
    label: 'EPUB',
    description: 'Pour liseuses',
    icon: BookOpen,
  },
];

export function ExportDialog({
  open,
  onOpenChange,
  projectId,
  bookId,
  bookTitle,
}: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [isExporting, setIsExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);
    setExported(false);

    try {
      if (format === 'pdf') {
        const res = await fetch(
          `/api/projects/${projectId}/books/${bookId}/export/pdf`,
          { method: 'POST' }
        );

        if (!res.ok) throw new Error('Export failed');

        const data = await res.json();

        // Open HTML in new window for printing
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(data.html);
          printWindow.document.close();
          printWindow.onload = () => {
            printWindow.print();
          };
        }
      } else if (format === 'epub') {
        const res = await fetch(
          `/api/projects/${projectId}/books/${bookId}/export/epub`,
          { method: 'POST' }
        );

        if (!res.ok) throw new Error('Export failed');

        const data = await res.json();

        // Download as JSON (client can use a library like epub-gen-memory)
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${bookTitle.replace(/[^a-z0-9]/gi, '_')}_epub_data.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      setExported(true);
    } catch (err) {
      console.error('Export error:', err);
      setError('Une erreur est survenue lors de l\'export.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleClose = () => {
    setExported(false);
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[400px] bg-gradient-to-br from-[#1a2e44] to-[#152238] border-white/10">
        <DialogHeader>
          <DialogTitle className="text-xl text-white flex items-center gap-2">
            <Download className="w-5 h-5 text-amber-400" />
            Exporter le livre
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Téléchargez votre livre au format de votre choix.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Format selector */}
          <div className="grid grid-cols-2 gap-3">
            {EXPORT_FORMATS.map((f) => {
              const Icon = f.icon;
              return (
                <button
                  key={f.value}
                  onClick={() => setFormat(f.value)}
                  className={cn(
                    'flex flex-col items-center gap-2 p-4 rounded-lg border transition-all',
                    format === f.value
                      ? 'border-amber-500 bg-amber-500/10 text-white'
                      : 'border-white/10 hover:border-white/20 text-slate-400 hover:text-white'
                  )}
                >
                  <Icon
                    className={cn('w-8 h-8', format === f.value && 'text-amber-400')}
                  />
                  <span className="text-sm font-medium">{f.label}</span>
                  <span className="text-xs text-slate-500">{f.description}</span>
                </button>
              );
            })}
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Success */}
          {exported && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center gap-2">
              <Check className="w-4 h-4" />
              Export réussi !
            </div>
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
          <Button
            onClick={handleExport}
            disabled={isExporting}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Export...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Exporter
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
