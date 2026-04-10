'use client';

import { useState, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X, FileText, Printer } from 'lucide-react';
import type { Book, Chapter } from '@/types/database';

interface PdfPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: Book;
  chapters: Chapter[];
  author?: string;
}

export function PdfPreviewDialog({
  open,
  onOpenChange,
  book,
  chapters,
  author = 'Steven Creeks',
}: PdfPreviewDialogProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [zoom, setZoom] = useState(100);
  const contentRef = useRef<HTMLDivElement>(null);

  const sortedChapters = useMemo(
    () => [...chapters].sort((a, b) => a.sort_order - b.sort_order),
    [chapters]
  );

  // Convert HTML content to plain text paragraphs
  const htmlToTextParagraphs = (html: string): string[] => {
    if (!html) return [];

    // If it's HTML, extract text from <p> tags
    if (html.trim().startsWith('<')) {
      // Replace </p><p> with double newline, <br> with single newline
      const text = html
        .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '') // Strip remaining tags
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim();

      return text.split(/\n\n+/).filter(Boolean);
    }

    // Plain text
    return html.split(/\n\n+/).filter(Boolean);
  };

  // Build all pages with proper A4 formatting
  const pages = useMemo(() => {
    const allPages: { type: 'title' | 'chapter' | 'content'; chapterIndex?: number; content?: string[]; chapterTitle?: string }[] = [];

    // Title page
    allPages.push({ type: 'title' });

    // Chapter pages
    sortedChapters.forEach((chapter, chapterIndex) => {
      const paragraphs = htmlToTextParagraphs(chapter.content || '');

      // Chapter title page
      allPages.push({
        type: 'chapter',
        chapterIndex,
        chapterTitle: chapter.title,
      });

      // Content pages
      let currentPageContent: string[] = [];
      let currentLength = 0;
      const maxCharsPerPage = 2000;

      paragraphs.forEach((p) => {
        if (currentLength + p.length > maxCharsPerPage && currentPageContent.length > 0) {
          allPages.push({
            type: 'content',
            chapterIndex,
            content: currentPageContent,
            chapterTitle: chapter.title,
          });
          currentPageContent = [p];
          currentLength = p.length;
        } else {
          currentPageContent.push(p);
          currentLength += p.length;
        }
      });

      if (currentPageContent.length > 0) {
        allPages.push({
          type: 'content',
          chapterIndex,
          content: currentPageContent,
          chapterTitle: chapter.title,
        });
      }
    });

    return allPages;
  }, [sortedChapters, book]);

  const totalPages = pages.length;
  const currentPageData = pages[currentPage];

  const goToNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goToPrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handlePrint = () => {
    // Open print dialog with all content
    const printContent = generatePrintHtml();
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  const generatePrintHtml = () => {
    const displayYear = book.year || new Date().getFullYear();
    const isbnHtml = book.isbn ? `<p class="isbn">ISBN: ${book.isbn}</p>` : '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${book.title}</title>
        <style>
          @page { size: A4; margin: 2.5cm; }
          body { font-family: "Times New Roman", Times, Georgia, serif; font-size: 12pt; line-height: 1.8; color: #1a1a1a; }
          .title-page { text-align: center; page-break-after: always; height: 100vh; position: relative; }
          .title-page h1 { font-size: 24pt; margin-top: 40%; }
          .title-page .legal { position: absolute; bottom: 10%; left: 0; right: 0; text-align: center; }
          .title-page .copyright, .title-page .isbn { font-size: 10pt; color: #666; margin: 0.5em 0; }
          h2 { font-size: 18pt; margin: 60px 0 30px; text-align: center; page-break-before: always; }
          p { text-align: justify; text-indent: 2em; margin: 0 0 1em; }
          .chapter-title { page-break-before: always; }
        </style>
      </head>
      <body>
        <div class="title-page">
          <h1>${book.title}</h1>
          <div class="legal">
            <p class="copyright">© ${displayYear} ${author}</p>
            ${isbnHtml}
          </div>
        </div>
        ${sortedChapters.map(chapter => `
          <h2 class="chapter-title">${chapter.title}</h2>
          ${(chapter.content || '').split(/\n\n+/).filter(Boolean).map(p => `<p>${p}</p>`).join('')}
        `).join('')}
      </body>
      </html>
    `;
  };

  const renderPage = () => {
    if (!currentPageData) return null;

    const displayYear = book.year || new Date().getFullYear();

    if (currentPageData.type === 'title') {
      return (
        <div className="h-full flex flex-col items-center justify-center text-center px-16 relative">
          <h1
            className="text-4xl font-bold text-stone-800 mb-4"
            style={{ fontFamily: '"Times New Roman", Times, Georgia, serif' }}
          >
            {book.title}
          </h1>
          {book.summary && (
            <p
              className="text-lg text-stone-600 mt-8 italic max-w-md"
              style={{ fontFamily: '"Times New Roman", Times, Georgia, serif' }}
            >
              {book.summary}
            </p>
          )}
          <div className="absolute bottom-16 left-0 right-0 text-center">
            <p
              className="text-sm text-stone-500"
              style={{ fontFamily: '"Times New Roman", Times, Georgia, serif' }}
            >
              © {displayYear} {author}
            </p>
            {book.isbn && (
              <p
                className="text-sm text-stone-500 mt-1"
                style={{ fontFamily: '"Times New Roman", Times, Georgia, serif' }}
              >
                ISBN: {book.isbn}
              </p>
            )}
          </div>
        </div>
      );
    }

    if (currentPageData.type === 'chapter') {
      return (
        <div className="h-full flex flex-col items-center justify-center text-center px-16">
          <p className="text-sm text-stone-400 mb-4 uppercase tracking-widest">
            Chapitre {(currentPageData.chapterIndex || 0) + 1}
          </p>
          <h2
            className="text-3xl font-bold text-stone-800"
            style={{ fontFamily: '"Times New Roman", Times, Georgia, serif' }}
          >
            {currentPageData.chapterTitle}
          </h2>
        </div>
      );
    }

    return (
      <div className="h-full px-16 py-12 overflow-y-auto">
        <div
          className="text-stone-800 leading-[1.9] space-y-4"
          style={{ fontFamily: '"Times New Roman", Times, Georgia, serif', fontSize: '12pt' }}
        >
          {currentPageData.content?.map((paragraph, idx) => (
            <p key={idx} className="text-justify indent-8">
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] p-0 bg-[#2a2a2a] border-white/10 overflow-hidden [&>button]:hidden">
        <VisuallyHidden>
          <DialogTitle>Aperçu PDF - {book.title}</DialogTitle>
        </VisuallyHidden>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-[#1a1a1a]">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-red-400" />
              <div>
                <h2 className="text-lg font-semibold text-white">{book.title}</h2>
                <p className="text-sm text-slate-500">Aperçu PDF</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrint}
                className="text-slate-400 hover:text-white gap-1"
              >
                <Printer className="w-4 h-4" />
                Imprimer
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center justify-center gap-2 py-2 bg-[#222] border-b border-white/10">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoom(Math.max(50, zoom - 10))}
              className="h-7 w-7 p-0 text-slate-400 hover:text-white"
            >
              -
            </Button>
            <span className="text-sm text-slate-400 w-16 text-center">{zoom}%</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoom(Math.min(150, zoom + 10))}
              className="h-7 w-7 p-0 text-slate-400 hover:text-white"
            >
              +
            </Button>
          </div>

          {/* Page content - A4 styled */}
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto bg-[#2a2a2a]">
            <div
              ref={contentRef}
              className="bg-white shadow-2xl rounded-sm"
              style={{
                width: '595px', // A4 at 72 DPI
                height: '842px',
                transform: `scale(${zoom / 100})`,
                transformOrigin: 'center center',
                flexShrink: 0,
              }}
            >
              {renderPage()}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between px-6 py-3 border-t border-white/10 bg-[#1a1a1a]">
            <Button
              variant="ghost"
              size="sm"
              onClick={goToPrevPage}
              disabled={currentPage === 0}
              className="text-slate-400 hover:text-white disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Précédent
            </Button>

            <span className="text-sm text-slate-500">
              Page {currentPage + 1} / {totalPages}
            </span>

            <Button
              variant="ghost"
              size="sm"
              onClick={goToNextPage}
              disabled={currentPage === totalPages - 1}
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
