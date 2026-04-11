'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  BookOpen,
  FileText,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
} from 'lucide-react';
import { TipTapEditor } from './TipTapEditor';
import type { Editor } from '@tiptap/react';
import type { Chapter, Book } from '@/types/database';

interface ChapterEditorProps {
  chapter: Chapter | null;
  book?: Book | null;
  chapters?: Chapter[];
  onUpdateChapter: (chapterId: string, updates: { title?: string; content?: string }) => Promise<void>;
  onPreviewEpub?: () => void;
  onPreviewPdf?: () => void;
}

export function ChapterEditor({
  chapter,
  book,
  chapters,
  onUpdateChapter,
  onPreviewEpub,
  onPreviewPdf,
}: ChapterEditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [, forceUpdate] = useState(0);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Listen to editor selection changes to update toolbar state
  useEffect(() => {
    if (!editor) return;

    const updateToolbar = () => forceUpdate(n => n + 1);

    editor.on('selectionUpdate', updateToolbar);
    editor.on('transaction', updateToolbar);

    return () => {
      editor.off('selectionUpdate', updateToolbar);
      editor.off('transaction', updateToolbar);
    };
  }, [editor]);

  // Sync state with chapter prop - only when switching chapters
  // DO NOT include chapter.content in deps to avoid cursor jumping during auto-save
  useEffect(() => {
    if (chapter) {
      setTitle(chapter.title);
      setContent(chapter.content || '');
    } else {
      setTitle('');
      setContent('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter?.id]);

  // Auto-save with debounce
  const saveChanges = useCallback(
    async (newTitle: string, newContent: string) => {
      if (!chapter) return;

      // Only save if there are actual changes
      if (newTitle === chapter.title && newContent === (chapter.content || '')) {
        return;
      }

      setIsSaving(true);
      try {
        const updates: { title?: string; content?: string } = {};
        if (newTitle !== chapter.title) updates.title = newTitle;
        if (newContent !== (chapter.content || '')) updates.content = newContent;

        if (Object.keys(updates).length > 0) {
          await onUpdateChapter(chapter.id, updates);
        }
      } finally {
        setIsSaving(false);
      }
    },
    [chapter, onUpdateChapter]
  );

  // Debounced save
  const debouncedSave = useCallback(
    (newTitle: string, newContent: string) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        saveChanges(newTitle, newContent);
      }, 1000);
    },
    [saveChanges]
  );

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    debouncedSave(title, newContent);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Count words (strip HTML tags first)
  const plainText = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;

  if (!chapter) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0d1520]">
        <p className="text-slate-500">Sélectionnez un chapitre pour commencer</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0d1520]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        {/* Formatting buttons */}
        <div className="flex items-center gap-1">
          {/* Text formatting */}
          <div className="flex items-center gap-0.5 mr-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => editor?.chain().focus().toggleBold().run()}
              className={`h-8 w-8 p-0 ${editor?.isActive('bold') ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
              title="Gras (Cmd+B)"
            >
              <Bold className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              className={`h-8 w-8 p-0 ${editor?.isActive('italic') ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
              title="Italique (Cmd+I)"
            >
              <Italic className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
              className={`h-8 w-8 p-0 ${editor?.isActive('underline') ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
              title="Souligné (Cmd+U)"
            >
              <Underline className="w-4 h-4" />
            </Button>
          </div>

          {/* Separator */}
          <div className="w-px h-5 bg-white/10 mx-1" />

          {/* Alignment */}
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => editor?.chain().focus().setTextAlign('left').run()}
              className={`h-8 w-8 p-0 ${editor?.isActive({ textAlign: 'left' }) ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
              title="Aligner à gauche"
            >
              <AlignLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => editor?.chain().focus().setTextAlign('center').run()}
              className={`h-8 w-8 p-0 ${editor?.isActive({ textAlign: 'center' }) ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
              title="Centrer"
            >
              <AlignCenter className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => editor?.chain().focus().setTextAlign('right').run()}
              className={`h-8 w-8 p-0 ${editor?.isActive({ textAlign: 'right' }) ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
              title="Aligner à droite"
            >
              <AlignRight className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => editor?.chain().focus().setTextAlign('justify').run()}
              className={`h-8 w-8 p-0 ${editor?.isActive({ textAlign: 'justify' }) ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
              title="Justifier"
            >
              <AlignJustify className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Right side: status & preview */}
        <div className="flex items-center gap-3 text-sm text-slate-500">
          {isSaving && (
            <span className="flex items-center gap-1 text-blue-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Sauvegarde...
            </span>
          )}
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-500/20 text-amber-400">
            {wordCount.toLocaleString()} mots
          </span>

          {/* Preview buttons */}
          <div className="flex items-center gap-1 ml-2">
            {onPreviewEpub && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onPreviewEpub}
                className="h-7 px-2 text-xs text-slate-400 hover:text-white hover:bg-white/10 gap-1"
                title="Prévisualiser en EPUB"
              >
                <BookOpen className="w-3.5 h-3.5" />
                EPUB
              </Button>
            )}
            {onPreviewPdf && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onPreviewPdf}
                className="h-7 px-2 text-xs text-slate-400 hover:text-white hover:bg-white/10 gap-1"
                title="Prévisualiser en PDF"
              >
                <FileText className="w-3.5 h-3.5" />
                PDF
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0 overflow-auto p-6">
        <TipTapEditor
          content={content}
          onChange={handleContentChange}
          onEditorReady={setEditor}
          placeholder="Commencez à écrire..."
          className="h-full"
        />
      </div>
    </div>
  );
}
