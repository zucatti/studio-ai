'use client';

import { useState, useCallback } from 'react';
import { StorageImg } from '@/components/ui/storage-image';
import { Button } from '@/components/ui/button';
import {
  ImageIcon,
  Images,
  Book,
  Link,
  Download,
  Wand2,
  Loader2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface FrameEditorProps {
  type: 'in' | 'out';
  imageUrl?: string | null;
  width: number;
  height: number;

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

  const hasImage = !!imageUrl;
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

      {/* Bouton clear si image */}
      {hasImage && onClear && (
        <button
          onClick={onClear}
          className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-500/80 transition-all"
          title="Supprimer"
        >
          <X className="w-3 h-3 text-white" />
        </button>
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
              onClick={onGenerate}
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
    </div>
  );
}
