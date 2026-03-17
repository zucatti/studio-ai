'use client';

import { useEffect, useRef, useState } from 'react';
import {
  EditorRoot,
  EditorContent,
  EditorCommand,
  EditorCommandItem,
  EditorCommandEmpty,
  EditorCommandList,
  EditorBubble,
  EditorBubbleItem,
  useEditor,
  StarterKit,
  Placeholder,
  handleCommandNavigation,
  createSuggestionItems,
} from 'novel';
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Minus,
  Bold,
  Italic,
  Strikethrough,
  Code2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import TurndownService from 'turndown';

// Turndown for HTML to Markdown conversion
const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});

// Slash command items
const suggestionItems = createSuggestionItems([
  {
    title: 'Titre 1',
    description: 'Titre principal',
    searchTerms: ['h1', 'heading', 'titre'],
    icon: <Heading1 className="w-4 h-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run();
    },
  },
  {
    title: 'Titre 2',
    description: 'Sous-titre',
    searchTerms: ['h2', 'heading', 'titre'],
    icon: <Heading2 className="w-4 h-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run();
    },
  },
  {
    title: 'Titre 3',
    description: 'Petit titre',
    searchTerms: ['h3', 'heading', 'titre'],
    icon: <Heading3 className="w-4 h-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run();
    },
  },
  {
    title: 'Liste',
    description: 'Liste à puces',
    searchTerms: ['bullet', 'list', 'liste'],
    icon: <List className="w-4 h-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: 'Liste numérotée',
    description: 'Liste ordonnée',
    searchTerms: ['number', 'list', 'liste'],
    icon: <ListOrdered className="w-4 h-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: 'Citation',
    description: 'Bloc de citation',
    searchTerms: ['quote', 'citation'],
    icon: <Quote className="w-4 h-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: 'Code',
    description: 'Bloc de code',
    searchTerms: ['code', 'codeblock'],
    icon: <Code className="w-4 h-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: 'Séparateur',
    description: 'Ligne horizontale',
    searchTerms: ['hr', 'separator', 'ligne'],
    icon: <Minus className="w-4 h-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
]);

// Tiptap extensions
const extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    bulletList: { keepMarks: true },
    orderedList: { keepMarks: true },
  }),
  Placeholder.configure({
    placeholder: ({ node }) => {
      if (node.type.name === 'heading') {
        return 'Titre...';
      }
      return 'Écrivez ici... Tapez "/" pour les commandes';
    },
  }),
];

// Convert markdown to HTML
function markdownToHTML(md: string): string {
  if (!md) return '<p></p>';

  let html = md
    // Code blocks first (before other processing)
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Headers
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Strikethrough
    .replace(/~~(.*?)~~/g, '<s>$1</s>')
    // Blockquotes
    .replace(/^> (.*$)/gm, '<blockquote><p>$1</p></blockquote>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr>')
    // Unordered lists
    .replace(/^- (.*$)/gm, '<ul><li>$1</li></ul>')
    // Ordered lists
    .replace(/^\d+\. (.*$)/gm, '<ol><li>$1</li></ol>')
    // Merge consecutive lists
    .replace(/<\/ul>\s*<ul>/g, '')
    .replace(/<\/ol>\s*<ol>/g, '')
    // Paragraphs (lines that aren't already wrapped)
    .split('\n\n')
    .map(block => {
      if (block.startsWith('<')) return block;
      if (block.trim() === '') return '';
      return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    })
    .join('');

  return html || '<p></p>';
}

interface MarkdownEditorProps {
  content: string;
  onChange: (content: string) => void;
  className?: string;
}

// Sync component that updates editor when external content changes
function EditorSync({ content, onChange }: { content: string; onChange: (md: string) => void }) {
  const { editor } = useEditor();
  const lastContentRef = useRef(content);
  const isTypingRef = useRef(false);

  // Handle external content changes
  useEffect(() => {
    if (!editor) return;

    // If content changed externally (not from typing)
    if (content !== lastContentRef.current && !isTypingRef.current) {
      const html = markdownToHTML(content);
      // Preserve cursor at end after update
      editor.commands.setContent(html);
      editor.commands.focus('end');
      lastContentRef.current = content;
    }
  }, [content, editor]);

  // Listen to editor updates
  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => {
      isTypingRef.current = true;
      const html = editor.getHTML();
      const markdown = turndown.turndown(html);
      lastContentRef.current = markdown;
      onChange(markdown);
      // Reset typing flag after a tick
      setTimeout(() => {
        isTypingRef.current = false;
      }, 100);
    };

    editor.on('update', handleUpdate);
    return () => {
      editor.off('update', handleUpdate);
    };
  }, [editor, onChange]);

  return null;
}

export function MarkdownEditor({
  content,
  onChange,
  className,
}: MarkdownEditorProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const initialContentRef = useRef(content);

  return (
    <EditorRoot>
      <EditorContent
        extensions={extensions}
        className={cn(
          'prose prose-invert prose-sm max-w-none h-full overflow-y-auto',
          'prose-headings:font-semibold prose-headings:text-white prose-headings:mt-4 prose-headings:mb-2',
          'prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg',
          'prose-p:text-slate-300 prose-p:leading-relaxed prose-p:my-2',
          'prose-strong:text-white prose-em:text-slate-200',
          'prose-ul:text-slate-300 prose-ol:text-slate-300 prose-ul:my-2 prose-ol:my-2',
          'prose-li:marker:text-slate-500 prose-li:my-0.5',
          'prose-blockquote:border-l-purple-500 prose-blockquote:border-l-2 prose-blockquote:pl-4 prose-blockquote:text-slate-400 prose-blockquote:italic prose-blockquote:my-2',
          'prose-code:text-purple-400 prose-code:bg-purple-500/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-none prose-code:after:content-none',
          'prose-pre:bg-[#0d1520] prose-pre:border prose-pre:border-white/10 prose-pre:rounded-lg prose-pre:my-2',
          'prose-hr:border-white/10 prose-hr:my-4',
          '[&_.is-editor-empty:first-child::before]:text-slate-500 [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:pointer-events-none',
          className
        )}
        editorProps={{
          handleDOMEvents: {
            keydown: (_view, event) => handleCommandNavigation(event),
          },
          attributes: {
            class: 'outline-none min-h-full p-4',
          },
        }}
        onCreate={({ editor }) => {
          // Set initial content only once
          if (initialContentRef.current && !isInitialized) {
            const html = markdownToHTML(initialContentRef.current);
            editor.commands.setContent(html);
            setIsInitialized(true);
          }
        }}
        slotAfter={
          <>
            {/* Sync component for external updates */}
            <EditorSync content={content} onChange={onChange} />

            {/* Slash Commands */}
            <EditorCommand className="z-50 h-auto max-h-[330px] overflow-y-auto rounded-lg border border-white/10 bg-[#1a2433] px-1 py-2 shadow-xl">
              <EditorCommandEmpty className="px-2 text-slate-400 text-sm">
                Aucune commande trouvée
              </EditorCommandEmpty>
              <EditorCommandList>
                {suggestionItems.map((item) => (
                  <EditorCommandItem
                    value={item.title}
                    onCommand={(val) => item.command?.(val)}
                    key={item.title}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-300 hover:bg-white/10 cursor-pointer aria-selected:bg-white/10"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5">
                      {item.icon}
                    </div>
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-xs text-slate-500">{item.description}</p>
                    </div>
                  </EditorCommandItem>
                ))}
              </EditorCommandList>
            </EditorCommand>

            {/* Bubble Menu (selection toolbar) */}
            <EditorBubble
              tippyOptions={{ placement: 'top' }}
              className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-[#1a2433] p-1 shadow-xl"
            >
              <BubbleButton
                action="bold"
                icon={<Bold className="w-4 h-4" />}
              />
              <BubbleButton
                action="italic"
                icon={<Italic className="w-4 h-4" />}
              />
              <BubbleButton
                action="strike"
                icon={<Strikethrough className="w-4 h-4" />}
              />
              <BubbleButton
                action="code"
                icon={<Code2 className="w-4 h-4" />}
              />
            </EditorBubble>
          </>
        }
      />
    </EditorRoot>
  );
}

// Helper component for bubble menu buttons
function BubbleButton({
  action,
  icon,
}: {
  action: 'bold' | 'italic' | 'strike' | 'code';
  icon: React.ReactNode;
}) {
  const { editor } = useEditor();

  if (!editor) return null;

  const isActive = editor.isActive(action);

  const handleClick = () => {
    switch (action) {
      case 'bold':
        editor.chain().focus().toggleBold().run();
        break;
      case 'italic':
        editor.chain().focus().toggleItalic().run();
        break;
      case 'strike':
        editor.chain().focus().toggleStrike().run();
        break;
      case 'code':
        editor.chain().focus().toggleCode().run();
        break;
    }
  };

  return (
    <EditorBubbleItem
      onSelect={handleClick}
      className={cn(
        'p-1.5 rounded cursor-pointer transition-colors',
        isActive
          ? 'bg-purple-500/30 text-purple-300'
          : 'text-slate-400 hover:text-white hover:bg-white/10'
      )}
    >
      {icon}
    </EditorBubbleItem>
  );
}
