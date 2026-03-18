'use client';

import { useRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { AtSign, Hash, Image as ImageIcon } from 'lucide-react';

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

// Parse text and extract mentions
function parseMentions(text: string): Array<{ type: 'text' | 'mention'; content: string; prefix?: '@' | '#' | '!' }> {
  const parts: Array<{ type: 'text' | 'mention'; content: string; prefix?: '@' | '#' | '!' }> = [];
  const mentionRegex = /([@#!][a-zA-Z][a-zA-Z0-9]*)/g;
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    parts.push({
      type: 'mention',
      content: match[0],
      prefix: match[0][0] as '@' | '#' | '!',
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return parts;
}

// Render styled mentions
function StyledMentions({ text }: { text: string }) {
  const parts = parseMentions(text);

  return (
    <span className="whitespace-pre-wrap">
      {parts.map((part, idx) => {
        if (part.type === 'mention') {
          const isCharacter = part.prefix === '@';
          const isReference = part.prefix === '!';
          const Icon = isCharacter ? AtSign : isReference ? ImageIcon : Hash;
          return (
            <span
              key={idx}
              className={cn(
                'inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded text-sm font-medium',
                isCharacter
                  ? 'bg-blue-500/20 text-blue-400'
                  : isReference
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'bg-green-500/20 text-green-400'
              )}
            >
              <Icon className="w-3 h-3" />
              {part.content.slice(1)}
            </span>
          );
        }
        return <span key={idx}>{part.content}</span>;
      })}
    </span>
  );
}

export function MentionTextarea({
  value,
  onChange,
  placeholder,
  className,
  minHeight = '100px',
}: MentionTextareaProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Auto-resize and focus when editing
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.max(
        parseInt(minHeight),
        textareaRef.current.scrollHeight
      )}px`;
    }
  }, [isEditing, localValue, minHeight]);

  const handleBlur = () => {
    setIsEditing(false);
    if (localValue !== value) {
      onChange(localValue);
    }
  };

  if (isEditing) {
    return (
      <textarea
        ref={textareaRef}
        value={localValue}
        onChange={(e) => {
          setLocalValue(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = `${Math.max(
            parseInt(minHeight),
            e.target.scrollHeight
          )}px`;
        }}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setLocalValue(value);
            setIsEditing(false);
          }
        }}
        placeholder={placeholder}
        className={cn(
          'w-full resize-none',
          'px-3 py-2 text-sm',
          'rounded-md',
          'bg-white/5',
          'border border-blue-500/50',
          'text-white caret-white',
          'placeholder:text-slate-500',
          'focus:outline-none',
          className
        )}
        style={{ minHeight }}
      />
    );
  }

  // View mode - show styled mentions
  return (
    <div
      onClick={() => setIsEditing(true)}
      className={cn(
        'cursor-text',
        'px-3 py-2 text-sm',
        'rounded-md',
        'bg-white/5',
        'border border-white/10',
        'hover:border-white/20',
        'transition-colors',
        !value && 'text-slate-500',
        className
      )}
      style={{ minHeight }}
    >
      {value ? (
        <StyledMentions text={value} />
      ) : (
        <span className="text-slate-500">{placeholder}</span>
      )}
    </div>
  );
}
