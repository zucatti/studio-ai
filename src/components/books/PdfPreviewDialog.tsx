'use client';

import { useState, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X, FileText, Download, Loader2, ZoomIn, ZoomOut, BookOpen, File } from 'lucide-react';
import type { Book, Chapter } from '@/types/database';

// Configure pdf.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: Book;
  chapters: Chapter[];
  author?: string;
  projectId: string;
}

export function PdfPreviewDialog({
  open,
  onOpenChange,
  book,
  chapters,
  author = 'Steven Creeks',
  projectId,
}: PdfPreviewDialogProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(0.8);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [twoPageView, setTwoPageView] = useState(false);

  // Generate PDF when dialog opens
  useEffect(() => {
    if (open && !pdfUrl) {
      generatePdf();
    }
  }, [open]);

  // Clean up blob URL when dialog closes
  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  const generatePdf = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/books/${book.id}/export/pdf`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate PDF');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (err) {
      console.error('PDF generation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate PDF');
    } finally {
      setIsLoading(false);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setCurrentPage(1);
  };

  // In two-page view, we show even page on left, odd on right
  // Navigation moves by 2 pages
  const getDisplayPages = useCallback(() => {
    if (!twoPageView) {
      return [currentPage];
    }

    // In two-page view:
    // - Page 1 is shown alone (it's the cover/title)
    // - Then pairs: 2-3, 4-5, 6-7, etc.
    if (currentPage === 1) {
      return [1];
    }

    // Make sure we start on even page for left side
    const leftPage = currentPage % 2 === 0 ? currentPage : currentPage - 1;
    const rightPage = leftPage + 1;

    if (rightPage <= numPages) {
      return [leftPage, rightPage];
    }
    return [leftPage];
  }, [currentPage, twoPageView, numPages]);

  const goToPage = useCallback((page: number) => {
    if (page >= 1 && page <= numPages) {
      setCurrentPage(page);
    }
  }, [numPages]);

  const goToPrevious = useCallback(() => {
    if (twoPageView) {
      // In two-page view, go back 2 pages (or to 1 if near start)
      const newPage = currentPage <= 2 ? 1 : currentPage - 2;
      goToPage(newPage);
    } else {
      goToPage(currentPage - 1);
    }
  }, [currentPage, twoPageView, goToPage]);

  const goToNext = useCallback(() => {
    if (twoPageView) {
      // In two-page view, go forward 2 pages
      const displayPages = getDisplayPages();
      const lastDisplayed = displayPages[displayPages.length - 1];
      if (lastDisplayed < numPages) {
        goToPage(lastDisplayed + 1);
      }
    } else {
      goToPage(currentPage + 1);
    }
  }, [currentPage, twoPageView, numPages, goToPage, getDisplayPages]);

  const handleDownload = () => {
    if (pdfUrl) {
      const a = document.createElement('a');
      a.href = pdfUrl;
      a.download = `${book.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleRegenerate = () => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
    generatePdf();
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
        setPdfUrl(null);
      }
      setCurrentPage(1);
      setError(null);
    }, 300);
  };

  const displayPages = getDisplayPages();
  const canGoPrevious = currentPage > 1;
  const canGoNext = displayPages[displayPages.length - 1] < numPages;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-7xl h-[95vh] p-0 bg-[#2a2a2a] border-white/10 overflow-hidden [&>button]:hidden">
        <VisuallyHidden>
          <DialogTitle>Aperçu PDF - {book.title}</DialogTitle>
        </VisuallyHidden>
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-white/10 bg-[#1a1a1a]">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-red-400" />
              <div>
                <h2 className="text-lg font-semibold text-white">{book.title}</h2>
                <p className="text-sm text-slate-500">
                  {numPages > 0 ? `${numPages} pages` : 'Aperçu PDF'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownload}
                disabled={!pdfUrl || isLoading}
                className="text-slate-400 hover:text-white gap-1"
              >
                <Download className="w-4 h-4" />
                Télécharger
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex-shrink-0 flex items-center justify-center gap-6 py-2 bg-[#222] border-b border-white/10">
            {/* View mode toggle */}
            <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTwoPageView(false)}
                className={`h-7 px-2 ${!twoPageView ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                <File className="w-4 h-4 mr-1" />
                1 page
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTwoPageView(true)}
                className={`h-7 px-2 ${twoPageView ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                <BookOpen className="w-4 h-4 mr-1" />
                2 pages
              </Button>
            </div>

            {/* Zoom controls */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setScale(Math.max(0.3, scale - 0.1))}
                className="h-7 w-7 p-0 text-slate-400 hover:text-white"
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="text-sm text-slate-400 w-14 text-center">{Math.round(scale * 100)}%</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setScale(Math.min(2, scale + 0.1))}
                className="h-7 w-7 p-0 text-slate-400 hover:text-white"
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* PDF Content */}
          <div className="flex-1 min-h-0 flex items-center justify-center overflow-auto bg-[#2a2a2a] p-4">
            {isLoading && (
              <div className="flex flex-col items-center gap-4 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p>Génération du PDF en cours...</p>
                <p className="text-sm text-slate-500">Cela peut prendre quelques secondes</p>
              </div>
            )}

            {error && (
              <div className="flex flex-col items-center gap-4 text-red-400">
                <p>Erreur: {error}</p>
                <Button onClick={handleRegenerate} variant="outline" size="sm">
                  Réessayer
                </Button>
              </div>
            )}

            {pdfUrl && !isLoading && !error && (
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                loading={
                  <div className="flex items-center gap-2 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Chargement...
                  </div>
                }
                error={
                  <div className="text-red-400">Erreur de chargement du PDF</div>
                }
              >
                <div className={`flex ${twoPageView ? 'gap-4' : ''} justify-center items-start`}>
                  {displayPages.map((pageNum) => (
                    <Page
                      key={pageNum}
                      pageNumber={pageNum}
                      scale={scale}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      className="shadow-2xl bg-white"
                    />
                  ))}
                </div>
              </Document>
            )}
          </div>

          {/* Navigation */}
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-t border-white/10 bg-[#1a1a1a]">
            <Button
              variant="ghost"
              size="sm"
              onClick={goToPrevious}
              disabled={!canGoPrevious || !pdfUrl}
              className="text-slate-400 hover:text-white disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Précédent
            </Button>

            <div className="flex items-center gap-2">
              {twoPageView && displayPages.length === 2 ? (
                <span className="text-sm text-slate-400">
                  Pages {displayPages[0]}-{displayPages[1]} / {numPages}
                </span>
              ) : (
                <>
                  <input
                    type="number"
                    value={currentPage}
                    onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
                    min={1}
                    max={numPages}
                    className="w-12 px-2 py-1 text-center text-sm bg-white/10 border border-white/20 rounded text-white"
                  />
                  <span className="text-sm text-slate-500">/ {numPages}</span>
                </>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={goToNext}
              disabled={!canGoNext || !pdfUrl}
              className="text-slate-400 hover:text-white disabled:opacity-30"
            >
              Suivant
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
