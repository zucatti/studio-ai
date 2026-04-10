'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X, Download, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import type { Book } from '@/types/database';

interface EpubPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  book: Book;
  chapters: unknown[];
}

export function EpubPreviewDialog({
  open,
  onOpenChange,
  projectId,
  book,
}: EpubPreviewDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rendition, setRendition] = useState<any>(null);
  const [bookInstance, setBookInstance] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [fontSize, setFontSize] = useState(100);
  const viewerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load EPUB when dialog opens
  useEffect(() => {
    if (!open) return;

    let isMounted = true;
    let currentBook: any = null;
    let currentRendition: any = null;

    const loadEpub = async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));

      if (!isMounted || !viewerRef.current || !containerRef.current) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const ePub = (await import('epubjs')).default;

        const response = await fetch(
          `/api/projects/${projectId}/books/${book.id}/export/epub`,
          { method: 'POST' }
        );

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Failed to load EPUB');
        }

        const arrayBuffer = await response.arrayBuffer();

        if (!isMounted) return;

        currentBook = ePub(arrayBuffer);
        setBookInstance(currentBook);

        if (viewerRef.current && isMounted) {
          // Get container dimensions and use fixed pixel values
          const containerRect = containerRef.current!.getBoundingClientRect();
          const width = Math.floor(containerRect.width);
          const height = Math.floor(containerRect.height);

          currentRendition = currentBook.renderTo(viewerRef.current, {
            width: width,
            height: height,
            spread: 'none',
            flow: 'paginated',
          });

          // Dark theme
          currentRendition.themes.default({
            'body': {
              'font-family': 'Georgia, "Times New Roman", serif',
              'font-size': '18px',
              'line-height': '1.8',
              'color': '#e8e6e3',
              'background': '#1e1e1e',
              'margin': '0',
              'padding': '40px 50px',
            },
            'p, p.p-body': {
              'text-align': 'justify',
              'text-indent': '1.5em',
              'margin': '0 0 1em 0',
              'color': '#e8e6e3',
            },
            'h1, h2, h3, h1.chapter-title': {
              'font-family': 'Georgia, serif',
              'text-align': 'center',
              'color': '#ffffff',
              'margin-bottom': '1.5em',
            },
            '.title-page': {
              'text-align': 'center',
              'padding-top': '30%',
            },
            '.book-title, .book-author': {
              'color': '#ffffff',
            },
          });

          currentRendition.on('relocated', (location: any) => {
            if (isMounted && location.start) {
              const displayed = location.start.displayed;
              if (displayed) {
                setCurrentPage(displayed.page || 1);
                setTotalPages(displayed.total || 0);
              }
            }
          });

          await currentRendition.display();
          setRendition(currentRendition);
        }
      } catch (err) {
        console.error('EPUB load error:', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load EPUB');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadEpub();

    return () => {
      isMounted = false;
      if (currentRendition) {
        currentRendition.destroy();
      }
      if (currentBook) {
        currentBook.destroy();
      }
    };
  }, [open, projectId, book.id]);

  // Apply font size
  useEffect(() => {
    if (rendition) {
      rendition.themes.fontSize(`${fontSize}%`);
    }
  }, [fontSize, rendition]);

  const goToPrev = useCallback(() => {
    rendition?.prev();
  }, [rendition]);

  const goToNext = useCallback(() => {
    rendition?.next();
  }, [rendition]);

  const zoomIn = () => setFontSize((prev) => Math.min(prev + 10, 150));
  const zoomOut = () => setFontSize((prev) => Math.max(prev - 10, 70));

  const handleDownload = async () => {
    try {
      const response = await fetch(
        `/api/projects/${projectId}/books/${book.id}/export/epub`,
        { method: 'POST' }
      );

      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${book.title}.epub`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToPrev();
      else if (e.key === 'ArrowRight') goToNext();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, goToPrev, goToNext]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[800px] h-[85vh] p-0 bg-[#0d0d0d] border-white/10 overflow-hidden [&>button]:hidden">
        <VisuallyHidden>
          <DialogTitle>Prévisualisation EPUB - {book.title}</DialogTitle>
        </VisuallyHidden>

        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 flex-shrink-0">
            <span className="text-sm text-slate-400 truncate max-w-[250px]">{book.title}</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 mr-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={zoomOut}
                  disabled={fontSize <= 70}
                  className="h-7 w-7 p-0 text-slate-400 hover:text-white disabled:opacity-30"
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <span className="text-xs text-slate-500 w-10 text-center">{fontSize}%</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={zoomIn}
                  disabled={fontSize >= 150}
                  className="h-7 w-7 p-0 text-slate-400 hover:text-white disabled:opacity-30"
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownload}
                className="h-8 w-8 p-0 text-slate-400 hover:text-white"
              >
                <Download className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden min-h-0">
            {isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0d0d0d] z-10">
                <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                <p className="text-slate-400 mt-3">Génération de l'EPUB...</p>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#0d0d0d] z-10">
                <div className="text-center p-8">
                  <p className="text-red-400 mb-2">{error}</p>
                  <p className="text-slate-500 text-sm">
                    Assurez-vous d'avoir au moins un chapitre avec du contenu.
                  </p>
                </div>
              </div>
            )}

            {/* Navigation left */}
            <button
              onClick={goToPrev}
              disabled={isLoading}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-20 p-2 text-slate-600 hover:text-white transition-colors disabled:opacity-30"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            {/* EPUB container with fixed dimensions */}
            <div
              ref={containerRef}
              className="w-[600px] h-full rounded-lg overflow-hidden shadow-2xl"
              style={{ background: '#1e1e1e' }}
            >
              <div ref={viewerRef} className="w-full h-full" />
            </div>

            {/* Navigation right */}
            <button
              onClick={goToNext}
              disabled={isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-2 text-slate-600 hover:text-white transition-colors disabled:opacity-30"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-center px-4 py-2 border-t border-white/10 flex-shrink-0">
            <span className="text-sm text-slate-500">
              {totalPages > 0 ? `${currentPage} sur ${totalPages}` : ''}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
