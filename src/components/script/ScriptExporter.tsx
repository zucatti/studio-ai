'use client';

import { useState } from 'react';
import { Download, FileText, File, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  exportToFountain,
  exportToMarkdown,
  generateFilename,
  downloadScript,
} from '@/lib/fountain-exporter';
import type { ScriptElement } from '@/types/script';
import { cn } from '@/lib/utils';

interface Scene {
  id: string;
  scene_number: number;
  int_ext: string;
  location: string;
  time_of_day: string;
  description?: string | null;
}

interface ScriptExporterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenes: Scene[];
  elementsByScene: Record<string, ScriptElement[]>;
  projectName?: string;
}

type ExportFormat = 'fountain' | 'markdown';

export function ScriptExporter({
  open,
  onOpenChange,
  scenes,
  elementsByScene,
  projectName = 'Script',
}: ScriptExporterProps) {
  const [format, setFormat] = useState<ExportFormat>('fountain');
  const [title, setTitle] = useState(projectName);
  const [author, setAuthor] = useState('');
  const [includeNotes, setIncludeNotes] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const options = {
        title,
        author,
        includeNotes,
        draftDate: new Date().toLocaleDateString('fr-FR'),
      };

      const content =
        format === 'fountain'
          ? exportToFountain(scenes, elementsByScene, options)
          : exportToMarkdown(scenes, elementsByScene, options);

      const extension = format === 'fountain' ? 'fountain' : 'md';
      const filename = generateFilename(title, extension);

      downloadScript(content, filename);
      onOpenChange(false);
    } finally {
      setIsExporting(false);
    }
  };

  const elementCount = Object.values(elementsByScene).flat().length;
  const noteCount = Object.values(elementsByScene)
    .flat()
    .filter((e) => e.type === 'note').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-[#0d1520] border-white/10">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Download className="w-5 h-5 text-blue-400" />
            Exporter le script
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {scenes.length} scene{scenes.length > 1 ? 's' : ''}, {elementCount} element
            {elementCount > 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Format selection */}
          <div className="space-y-2">
            <Label className="text-slate-300">Format</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setFormat('fountain')}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors',
                  format === 'fountain'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
                )}
              >
                <File className="w-8 h-8" />
                <span className="text-sm font-medium">Fountain</span>
                <span className="text-xs text-slate-500">.fountain</span>
              </button>
              <button
                onClick={() => setFormat('markdown')}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors',
                  format === 'markdown'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
                )}
              >
                <FileText className="w-8 h-8" />
                <span className="text-sm font-medium">Markdown</span>
                <span className="text-xs text-slate-500">.md</span>
              </button>
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-slate-300">
              Titre
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre du script"
              className="bg-white/5 border-white/10 text-white"
            />
          </div>

          {/* Author */}
          <div className="space-y-2">
            <Label htmlFor="author" className="text-slate-300">
              Auteur (optionnel)
            </Label>
            <Input
              id="author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Votre nom"
              className="bg-white/5 border-white/10 text-white"
            />
          </div>

          {/* Include notes */}
          {noteCount > 0 && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="notes"
                checked={includeNotes}
                onCheckedChange={(checked) => setIncludeNotes(checked as boolean)}
              />
              <Label htmlFor="notes" className="text-slate-300 cursor-pointer">
                Inclure les notes ({noteCount})
              </Label>
            </div>
          )}

          {/* Format info */}
          <div className="rounded-lg bg-white/5 p-3 text-xs text-slate-400">
            {format === 'fountain' ? (
              <>
                <p className="font-medium text-slate-300 mb-1">Format Fountain</p>
                <p>
                  Compatible avec Final Draft, Highland, WriterSolo et autres logiciels de
                  scenario professionnel.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-slate-300 mb-1">Format Markdown</p>
                <p>
                  Lisible partout, ideal pour partager ou importer dans d&apos;autres
                  outils.
                </p>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-white/10 text-slate-300 hover:bg-white/5"
          >
            Annuler
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting || !title.trim()}
            className="bg-blue-600 hover:bg-blue-700"
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
