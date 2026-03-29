'use client';

import { useState, useCallback } from 'react';
import { StorageImg } from '@/components/ui/storage-image';
import {
  ImageIcon,
  Images,
  Book,
  Link,
  Download,
  Wand2,
  Loader2,
  X,
  FileText,
  Copy,
  Check,
  Maximize2,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

export interface FrameEditorProps {
  type: 'in' | 'out';
  imageUrl?: string | null;
  width: number;
  height: number;

  // Prompt for traceability
  prompt?: string | null;

  // Actions
  onOpenGallery: () => void;
  onOpenBible: () => void;
  onGenerate?: () => void;
  onDownload?: () => void;
  onClear?: () => void;

  // Lien avec plan précédent (Frame In uniquement)
  canLinkPrevious?: boolean;
  onLinkPrevious?: () => Promise<void>;
  willExtractFromVideo?: boolean;

  // États
  isGenerating?: boolean;
  isLinking?: boolean;
  disabled?: boolean;
}

export function FrameEditor({
  type,
  imageUrl,
  width,
  height,
  prompt,
  onOpenGallery,
  onOpenBible,
  onGenerate,
  onDownload,
  onClear,
  canLinkPrevious,
  onLinkPrevious,
  willExtractFromVideo,
  isGenerating,
  isLinking,
  disabled,
}: FrameEditorProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const hasImage = !!imageUrl;
  const hasPrompt = !!prompt;
  const label = type === 'in' ? 'Frame In' : 'Frame Out';
  const borderColor = type === 'in' ? 'border-green-500/30' : 'border-red-500/30';
  const labelBg = type === 'in' ? 'bg-green-500/80' : 'bg-red-500/80';

  const handleLinkPrevious = useCallback(async () => {
    if (!onLinkPrevious) return;
    try {
      await onLinkPrevious();
    } catch (error) {
      console.error('Link previous failed:', error);
    }
  }, [onLinkPrevious]);

  const handleCopyPrompt = useCallback(async () => {
    if (prompt) {
      await navigator.clipboard.writeText(prompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  }, [prompt]);

  return (
    <div
      className={cn(
        'relative rounded-xl overflow-hidden transition-all duration-200',
        borderColor,
        'border-2',
        disabled && 'opacity-50 pointer-events-none'
      )}
      style={{ width, height }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Image ou placeholder */}
      {hasImage ? (
        <StorageImg
          src={imageUrl}
          alt={label}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-slate-800/50 flex flex-col items-center justify-center gap-4">
          <ImageIcon className="w-16 h-16 text-slate-600" />

          {/* Bouton "lier frame précédent" quand pas d'image */}
          {type === 'in' && canLinkPrevious && onLinkPrevious && (
            <button
              onClick={handleLinkPrevious}
              disabled={isLinking}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm',
                isLinking
                  ? 'bg-blue-500/10 text-blue-300 cursor-wait'
                  : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
              )}
            >
              {isLinking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Link className="w-4 h-4" />
              )}
              {isLinking
                ? 'Extraction...'
                : willExtractFromVideo
                  ? 'Extraire dernière frame'
                  : 'Lier frame'}
            </button>
          )}
        </div>
      )}

      {/* Label - top left */}
      <div
        className={cn(
          'absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-medium text-white',
          labelBg
        )}
      >
        {label}
      </div>

      {/* Prompt indicator - next to label */}
      {hasPrompt && hasImage && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowPrompt(!showPrompt);
          }}
          className={cn(
            'absolute top-2 px-2 py-0.5 rounded text-xs font-medium transition-all',
            showPrompt
              ? 'bg-purple-500 text-white'
              : 'bg-black/60 text-slate-300 opacity-0 hover:opacity-100',
            isHovered && 'opacity-100'
          )}
          style={{ left: type === 'in' ? '76px' : '84px' }}
          title="Voir le prompt"
        >
          <FileText className="w-3 h-3 inline-block mr-1" />
          Prompt
        </button>
      )}

      {/* Small overlay buttons - top right */}
      {hasImage && isHovered && (
        <div className="absolute top-2 right-2 flex gap-1.5 z-20">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsFullscreen(true);
            }}
            className="p-1.5 bg-black/60 rounded-full hover:bg-slate-500/80 transition-colors backdrop-blur-sm"
            title="Agrandir"
          >
            <Maximize2 className="w-3.5 h-3.5 text-white" />
          </button>
          {onClear && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="p-1.5 bg-black/60 rounded-full hover:bg-red-500/80 transition-colors backdrop-blur-sm"
              title="Supprimer"
            >
              <Trash2 className="w-3.5 h-3.5 text-white" />
            </button>
          )}
        </div>
      )}

      {/* Prompt display panel */}
      {showPrompt && hasPrompt && (
        <div
          className="absolute bottom-0 left-0 right-0 bg-black/90 backdrop-blur-sm p-3 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-slate-300 leading-relaxed flex-1 max-h-20 overflow-y-auto">
              {prompt}
            </p>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={handleCopyPrompt}
                className="p-1.5 rounded bg-white/10 hover:bg-white/20 transition-colors"
                title="Copier le prompt"
              >
                {copiedPrompt ? (
                  <Check className="w-3 h-3 text-green-400" />
                ) : (
                  <Copy className="w-3 h-3 text-white" />
                )}
              </button>
              <button
                onClick={() => setShowPrompt(false)}
                className="p-1.5 rounded bg-white/10 hover:bg-white/20 transition-colors"
                title="Fermer"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay hover avec actions */}
      {isHovered && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center gap-3">
          {/* Lier frame précédent (Frame In uniquement) */}
          {type === 'in' && canLinkPrevious && onLinkPrevious && (
            <button
              className={cn(
                'w-12 h-12 rounded-full backdrop-blur flex items-center justify-center transition-colors',
                isLinking
                  ? 'bg-blue-500/60 cursor-wait'
                  : 'bg-blue-500/40 hover:bg-blue-500/60'
              )}
              onClick={handleLinkPrevious}
              disabled={isLinking}
              title={
                willExtractFromVideo
                  ? 'Extraire dernière frame de la vidéo'
                  : 'Lier dernière frame'
              }
            >
              {isLinking ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : (
                <Link className="w-5 h-5 text-white" />
              )}
            </button>
          )}

          {/* Bible picker */}
          <button
            className="w-12 h-12 rounded-full bg-amber-500/40 backdrop-blur flex items-center justify-center hover:bg-amber-500/60 transition-colors"
            onClick={onOpenBible}
            title="Bible du projet"
          >
            <Book className="w-5 h-5 text-white" />
          </button>

          {/* Gallery picker */}
          <button
            className="w-12 h-12 rounded-full bg-purple-500/40 backdrop-blur flex items-center justify-center hover:bg-purple-500/60 transition-colors"
            onClick={onOpenGallery}
            title="Galerie d'images"
          >
            <Images className="w-5 h-5 text-white" />
          </button>

          {/* Generate button */}
          {onGenerate && (
            <button
              className={cn(
                'w-12 h-12 rounded-full backdrop-blur flex items-center justify-center transition-colors',
                isGenerating
                  ? 'bg-blue-500/60 cursor-wait'
                  : 'bg-blue-500/40 hover:bg-blue-500/60'
              )}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onGenerate();
              }}
              disabled={isGenerating}
              title="Générer avec IA"
            >
              {isGenerating ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : (
                <Wand2 className="w-5 h-5 text-white" />
              )}
            </button>
          )}

          {/* Download button */}
          {hasImage && onDownload && (
            <button
              className="w-12 h-12 rounded-full bg-green-500/40 backdrop-blur flex items-center justify-center hover:bg-green-500/60 transition-colors"
              onClick={onDownload}
              title="Télécharger"
            >
              <Download className="w-5 h-5 text-white" />
            </button>
          )}
        </div>
      )}

      {/* Fullscreen modal */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 bg-black/95 border-slate-700">
          <DialogTitle className="sr-only">{label}</DialogTitle>
          <div className="relative w-full h-full flex items-center justify-center p-4">
            {imageUrl && (
              <StorageImg
                src={imageUrl}
                alt={label}
                className="max-w-full max-h-[85vh] object-contain rounded-lg"
              />
            )}
            {/* Label overlay */}
            <div
              className={cn(
                'absolute top-6 left-6 px-3 py-1 rounded text-sm font-medium text-white',
                labelBg
              )}
            >
              {label}
            </div>
            {/* Actions in fullscreen */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3">
              {onDownload && (
                <button
                  className="px-4 py-2 rounded-lg bg-green-500/80 hover:bg-green-500 text-white text-sm font-medium flex items-center gap-2 transition-colors"
                  onClick={onDownload}
                >
                  <Download className="w-4 h-4" />
                  Télécharger
                </button>
              )}
              {onClear && (
                <button
                  className="px-4 py-2 rounded-lg bg-red-500/80 hover:bg-red-500 text-white text-sm font-medium flex items-center gap-2 transition-colors"
                  onClick={() => {
                    onClear();
                    setIsFullscreen(false);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                  Supprimer
                </button>
              )}
            </div>
            {/* Prompt display in fullscreen */}
            {hasPrompt && (
              <div className="absolute bottom-20 left-6 right-6 bg-black/80 backdrop-blur-sm rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-300 flex-1">{prompt}</p>
                  <button
                    onClick={handleCopyPrompt}
                    className="p-1.5 rounded bg-white/10 hover:bg-white/20 transition-colors flex-shrink-0"
                    title="Copier le prompt"
                  >
                    {copiedPrompt ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-white" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
