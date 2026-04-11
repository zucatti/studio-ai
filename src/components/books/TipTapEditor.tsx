'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { DOMParser as ProseDOMParser } from '@tiptap/pm/model';
import { useEffect, useMemo, useRef } from 'react';
import { SlashCommands } from './SlashCommands';
import type { Editor } from '@tiptap/react';

interface TipTapEditorProps {
  content: string;
  onChange: (content: string) => void;
  onEditorReady?: (editor: Editor) => void;
  placeholder?: string;
  className?: string;
}

// Convert plain text with line breaks to HTML
// - \n\n (blank line) = new paragraph
// - \n (single) = <br> within paragraph
function textToHtml(text: string): string {
  if (!text) return '';

  // If already HTML, return as-is
  if (text.trim().startsWith('<')) {
    return text;
  }

  // Normalize line endings and collapse excessive blank lines
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n'); // Collapse 3+ newlines to double

  // Split by double newlines (paragraph breaks)
  const paragraphs = normalized.split(/\n\n/);

  return paragraphs
    .map(p => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      // Convert single newlines to <br> within paragraph
      const withBreaks = trimmed.replace(/\n/g, '<br>');
      return `<p>${withBreaks}</p>`;
    })
    .filter(Boolean)
    .join('');
}

export function TipTapEditor({
  content,
  onChange,
  onEditorReady,
  placeholder = 'Commencez à écrire...',
  className,
}: TipTapEditorProps) {
  // Track if we initiated the last change (to skip external sync)
  const isLocalChange = useRef(false);
  const lastContentRef = useRef(content);

  // Convert plain text to HTML on initial load
  const initialContent = useMemo(() => textToHtml(content), []);

  const editor = useEditor({
    immediatelyRender: false, // Required for React 19 / SSR
    extensions: [
      StarterKit.configure({
        // Disable some features for a cleaner writing experience
        codeBlock: false,
        code: false,
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      SlashCommands,
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-lg max-w-none focus:outline-none min-h-full book-editor',
        style: 'font-family: "Times New Roman", Times, Georgia, serif; font-size: 20px; line-height: 1.8;',
      },
      handlePaste: (view, event) => {
        // If HTML content is available (from Pages, Word, etc.), let TipTap handle it natively
        const htmlContent = event.clipboardData?.getData('text/html');
        if (htmlContent && htmlContent.includes('<p')) {
          return false; // Let TipTap handle it
        }

        // Plain text processing (from plain text editors, terminal, etc.)
        const text = event.clipboardData?.getData('text/plain');
        if (!text) return false;

        // Normalize line breaks
        const normalized = text
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .replace(/\n{3,}/g, '\n\n'); // Collapse 3+ newlines to 2

        // Split by double newlines (paragraph breaks)
        const paragraphs = normalized.split(/\n\n/);

        // Build HTML: each paragraph is a <p>, single newlines become <br>
        const html = paragraphs
          .map(para => {
            const trimmed = para.trim();
            if (!trimmed) return '';
            const withBreaks = trimmed.replace(/\n/g, '<br>');
            return `<p>${withBreaks}</p>`;
          })
          .filter(Boolean)
          .join('');

        // Parse HTML and insert
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        const { state, dispatch } = view;
        const slice = ProseDOMParser.fromSchema(state.schema).parseSlice(tempDiv);

        const tr = state.tr.replaceSelection(slice);
        dispatch(tr);
        event.preventDefault();
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      // Get HTML content to preserve formatting
      const html = editor.getHTML();
      // Mark as local change to skip sync in useEffect
      isLocalChange.current = true;
      onChange(html);
    },
  });

  // Notify parent when editor is ready
  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  // Sync external content changes (e.g., switching chapters)
  // Skip if we just made a local change to avoid cursor jumping
  useEffect(() => {
    if (!editor) return;

    // Skip sync if this is our own change coming back from the parent
    if (isLocalChange.current) {
      isLocalChange.current = false;
      lastContentRef.current = content;
      return;
    }

    const htmlContent = textToHtml(content);
    const currentHtml = editor.getHTML();

    // Only update if content actually differs (to avoid cursor jumping)
    if (htmlContent !== currentHtml) {
      // Save cursor position
      const { from, to } = editor.state.selection;
      editor.commands.setContent(htmlContent);
      // Restore cursor if possible
      try {
        const maxPos = editor.state.doc.content.size;
        const safeFrom = Math.min(from, maxPos);
        const safeTo = Math.min(to, maxPos);
        editor.commands.setTextSelection({ from: safeFrom, to: safeTo });
      } catch {
        // Ignore cursor restoration errors
      }
    }
    lastContentRef.current = content;
  }, [editor, content]);

  // Cleanup
  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  return (
    <div className={className}>
      <EditorContent
        editor={editor}
        className="h-full [&_.ProseMirror]:h-full [&_.ProseMirror]:outline-none [&_.ProseMirror_p]:text-slate-200 [&_.ProseMirror_p]:mb-0 [&_.ProseMirror_p]:indent-6 [&_.ProseMirror_p:empty]:min-h-[1.5em] [&_.is-editor-empty]:before:content-[attr(data-placeholder)] [&_.is-editor-empty]:before:text-slate-600 [&_.is-editor-empty]:before:float-left [&_.is-editor-empty]:before:pointer-events-none [&_.is-editor-empty]:before:h-0"
      />
    </div>
  );
}
