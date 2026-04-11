'use client';

import { useEffect, useState } from 'react';
import { ChaptersList } from './ChaptersList';
import { ChapterEditor } from './ChapterEditor';
import { BookStats } from './BookStats';
import { AiAssistDialog } from './AiAssistDialog';
import { EpubPreviewDialog } from './EpubPreviewDialog';
import { PdfPreviewDialog } from './PdfPreviewDialog';
import { useBooksStore } from '@/store/books-store';
import { List, Edit3, BarChart3 } from 'lucide-react';
import type { Book } from '@/types/database';

type MobileTab = 'chapters' | 'editor' | 'stats';

interface BookEditorProps {
  book: Book;
  projectId: string;
}

export function BookEditor({ book, projectId }: BookEditorProps) {
  const [showAiAssist, setShowAiAssist] = useState(false);
  const [showEpubPreview, setShowEpubPreview] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('editor');

  const {
    chapters,
    currentChapterId,
    setCurrentChapter,
    fetchChapters,
    createChapter,
    updateChapter,
    deleteChapter,
    reorderChapters,
  } = useBooksStore();

  // Fetch chapters on mount
  useEffect(() => {
    fetchChapters(projectId, book.id);
  }, [projectId, book.id, fetchChapters]);

  // Auto-select first chapter if none selected
  useEffect(() => {
    if (chapters.length > 0 && !currentChapterId) {
      setCurrentChapter(chapters[0].id);
    }
  }, [chapters, currentChapterId, setCurrentChapter]);

  const currentChapter = chapters.find((c) => c.id === currentChapterId) || null;

  const handleCreateChapter = async (title?: string) => {
    const newChapter = await createChapter(projectId, book.id, title);
    if (newChapter) {
      setCurrentChapter(newChapter.id);
    }
  };

  const handleUpdateChapter = async (
    chapterId: string,
    updates: { title?: string; content?: string }
  ) => {
    await updateChapter(projectId, book.id, chapterId, updates);
  };

  const handleDeleteChapter = async (chapterId: string) => {
    await deleteChapter(projectId, book.id, chapterId);
    // Select another chapter if the deleted one was selected
    if (currentChapterId === chapterId) {
      const remaining = chapters.filter((c) => c.id !== chapterId);
      if (remaining.length > 0) {
        setCurrentChapter(remaining[0].id);
      } else {
        setCurrentChapter(null);
      }
    }
  };

  const handleReorderChapters = async (orderedIds: string[]) => {
    await reorderChapters(projectId, book.id, orderedIds);
  };

  const handleAiAssist = (text: string) => {
    // Insert AI-generated text at the end of current chapter
    if (currentChapter) {
      const newContent = currentChapter.content
        ? `${currentChapter.content}\n\n${text}`
        : text;
      handleUpdateChapter(currentChapter.id, { content: newContent });
    }
  };

  // Switch to editor after selecting a chapter on mobile
  const handleSelectChapterMobile = (chapterId: string) => {
    setCurrentChapter(chapterId);
    setMobileTab('editor');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] md:h-[calc(100vh-180px)] bg-[#0d1520] rounded-xl border border-white/5 overflow-hidden">
      {/* Main content area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left panel - Chapters list */}
        <div className={`
          ${mobileTab === 'chapters' ? 'flex' : 'hidden'} md:flex
          w-full md:w-64 border-r border-white/5 bg-[#0d1520] flex-shrink-0
        `}>
          <ChaptersList
            chapters={chapters}
            currentChapterId={currentChapterId}
            onSelectChapter={handleSelectChapterMobile}
            onCreateChapter={handleCreateChapter}
            onUpdateChapter={(id, updates) => handleUpdateChapter(id, updates)}
            onDeleteChapter={handleDeleteChapter}
            onReorderChapters={handleReorderChapters}
          />
        </div>

        {/* Center panel - Editor */}
        <div className={`
          ${mobileTab === 'editor' ? 'flex' : 'hidden'} md:flex
          flex-1 flex-col min-w-0
        `}>
          <ChapterEditor
            chapter={currentChapter}
            book={book}
            chapters={chapters}
            onUpdateChapter={handleUpdateChapter}
            onPreviewEpub={() => setShowEpubPreview(true)}
            onPreviewPdf={() => setShowPdfPreview(true)}
          />
        </div>

        {/* Right panel - Stats */}
        <div className={`
          ${mobileTab === 'stats' ? 'flex' : 'hidden'} md:flex
          w-full md:w-64 border-l border-white/5 bg-[#0d1520] flex-shrink-0
        `}>
          <BookStats
            book={book}
            chapters={chapters}
            onAiAssist={() => setShowAiAssist(true)}
          />
        </div>
      </div>

      {/* Mobile tab bar */}
      <div className="flex md:hidden border-t border-white/10 bg-[#0a0f18]">
        <button
          onClick={() => setMobileTab('chapters')}
          className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
            mobileTab === 'chapters'
              ? 'text-amber-400 bg-amber-500/10'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <List className="w-5 h-5" />
          Chapitres
        </button>
        <button
          onClick={() => setMobileTab('editor')}
          className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
            mobileTab === 'editor'
              ? 'text-amber-400 bg-amber-500/10'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Edit3 className="w-5 h-5" />
          Éditeur
        </button>
        <button
          onClick={() => setMobileTab('stats')}
          className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
            mobileTab === 'stats'
              ? 'text-amber-400 bg-amber-500/10'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <BarChart3 className="w-5 h-5" />
          Stats
        </button>
      </div>

      {/* AI Assist Dialog */}
      <AiAssistDialog
        open={showAiAssist}
        onOpenChange={setShowAiAssist}
        projectId={projectId}
        bookId={book.id}
        currentContent={currentChapter?.content || ''}
        onInsert={handleAiAssist}
      />

      {/* EPUB Preview Dialog */}
      <EpubPreviewDialog
        open={showEpubPreview}
        onOpenChange={setShowEpubPreview}
        projectId={projectId}
        book={book}
        chapters={chapters}
      />

      {/* PDF Preview Dialog */}
      <PdfPreviewDialog
        open={showPdfPreview}
        onOpenChange={setShowPdfPreview}
        book={book}
        chapters={chapters}
        projectId={projectId}
      />
    </div>
  );
}
