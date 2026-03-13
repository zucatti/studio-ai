'use client';

import { useState } from 'react';
import {
  GripVertical,
  Trash2,
  MoreVertical,
  ChevronUp,
  ChevronDown,
  MessageSquare,
  Type,
  ArrowRight,
  StickyNote,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ScriptElement, ScriptElementType } from '@/types/script';
import { getElementTypeLabel, getElementTypeColor } from '@/types/script';
import { cn } from '@/lib/utils';

interface ScriptElementBlockProps {
  element: ScriptElement;
  onUpdate: (updates: Partial<ScriptElement>) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  isDragging?: boolean;
}

const TYPE_ICONS: Record<ScriptElementType, React.ComponentType<{ className?: string }>> = {
  action: Type,
  dialogue: MessageSquare,
  transition: ArrowRight,
  note: StickyNote,
};

export function ScriptElementBlock({
  element,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst = false,
  isLast = false,
  isDragging = false,
}: ScriptElementBlockProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(element.content);

  const Icon = TYPE_ICONS[element.type];
  const colorClass = getElementTypeColor(element.type);

  const handleContentBlur = () => {
    if (content !== element.content) {
      onUpdate({ content });
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setContent(element.content);
      setIsEditing(false);
    }
  };

  return (
    <div
      className={cn(
        'group relative flex gap-2 p-3 rounded-lg border bg-white/5 transition-all',
        isDragging ? 'opacity-50 border-blue-500/50' : 'border-white/5',
        'hover:border-white/10'
      )}
    >
      {/* Drag handle */}
      <div className="flex items-start pt-1 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="w-4 h-4 text-slate-500" />
      </div>

      {/* Type indicator */}
      <div className={cn('flex items-start pt-0.5')}>
        <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium', colorClass)}>
          <Icon className="w-3 h-3" />
          {getElementTypeLabel(element.type)}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {element.type === 'dialogue' && element.character_name && (
          <div className="text-xs font-semibold text-blue-400 uppercase mb-1">
            {element.character_name}
            {element.extension && (
              <span className="font-normal text-slate-500 ml-1">({element.extension})</span>
            )}
            {element.parenthetical && (
              <span className="font-normal text-slate-400 ml-2">({element.parenthetical})</span>
            )}
          </div>
        )}

        {isEditing ? (
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={handleContentBlur}
            onKeyDown={handleKeyDown}
            autoFocus
            className="min-h-[60px] bg-transparent border-0 p-0 text-sm text-white resize-none focus:ring-0"
          />
        ) : (
          <p
            onClick={() => setIsEditing(true)}
            className={cn(
              'text-sm text-slate-300 cursor-text whitespace-pre-wrap',
              element.type === 'transition' && 'text-right text-purple-400 font-medium uppercase',
              element.type === 'note' && 'italic text-yellow-400/80'
            )}
          >
            {element.content || (
              <span className="text-slate-500">Cliquez pour ajouter du contenu...</span>
            )}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-start gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex flex-col gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={onMoveUp}
            disabled={isFirst}
            className="h-6 w-6 text-slate-400 hover:text-white disabled:opacity-30"
          >
            <ChevronUp className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onMoveDown}
            disabled={isLast}
            className="h-6 w-6 text-slate-400 hover:text-white disabled:opacity-30"
          >
            <ChevronDown className="w-3 h-3" />
          </Button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-slate-400 hover:text-white"
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-[#1a2433] border-white/10">
            <DropdownMenuItem
              onClick={onDelete}
              className="text-red-400 focus:text-red-300 focus:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
