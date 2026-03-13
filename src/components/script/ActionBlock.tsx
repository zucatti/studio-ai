'use client';

import { useState } from 'react';
import { Type, GripVertical, Trash2, MoreVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ScriptElement } from '@/types/script';
import { cn } from '@/lib/utils';

interface ActionBlockProps {
  element: ScriptElement;
  onUpdate: (updates: Partial<ScriptElement>) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}

export function ActionBlock({
  element,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst = false,
  isLast = false,
}: ActionBlockProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(element.content);

  const handleContentBlur = () => {
    if (content !== element.content) {
      onUpdate({ content });
    }
    setIsEditing(false);
  };

  return (
    <div className="group relative rounded-lg border border-green-500/20 bg-green-500/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border-b border-green-500/20">
        <div className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical className="w-4 h-4 text-slate-500" />
        </div>

        <span className="flex items-center gap-1.5 text-xs font-medium text-green-400">
          <Type className="w-3.5 h-3.5" />
          Action
        </span>

        <div className="flex-1" />

        {/* Move buttons */}
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
              className="h-6 w-6 text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
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

      {/* Content */}
      <div className="p-3">
        {isEditing ? (
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={handleContentBlur}
            onKeyDown={(e) => e.key === 'Escape' && setIsEditing(false)}
            autoFocus
            placeholder="Decrivez l'action..."
            className="min-h-[80px] bg-white/5 border-white/10 text-white resize-none"
          />
        ) : (
          <div
            onClick={() => setIsEditing(true)}
            className={cn(
              'min-h-[60px] p-3 rounded-md border border-white/10 cursor-text',
              'bg-white/5 text-sm text-slate-300 whitespace-pre-wrap',
              !element.content && 'text-slate-500'
            )}
          >
            {element.content || 'Cliquez pour decrire l\'action...'}
          </div>
        )}
      </div>
    </div>
  );
}
