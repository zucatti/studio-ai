'use client';

import { useState } from 'react';
import { MessageSquare, GripVertical, Trash2, MoreVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CharacterPicker } from './CharacterPicker';
import { DIALOGUE_EXTENSIONS, type DialogueExtension, type ScriptElement } from '@/types/script';
import { cn } from '@/lib/utils';

interface DialogueBlockProps {
  element: ScriptElement;
  projectId: string;
  onUpdate: (updates: Partial<ScriptElement>) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}

export function DialogueBlock({
  element,
  projectId,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst = false,
  isLast = false,
}: DialogueBlockProps) {
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [content, setContent] = useState(element.content);

  const handleCharacterChange = (characterId: string, characterName: string) => {
    onUpdate({
      character_name: characterName,
      character_id: characterId,
    });
  };

  const handleExtensionChange = (value: string) => {
    onUpdate({
      extension: value === 'none' ? null : (value as DialogueExtension),
    });
  };

  const handleParentheticalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({ parenthetical: e.target.value || null });
  };

  const handleContentBlur = () => {
    if (content !== element.content) {
      onUpdate({ content });
    }
    setIsEditingContent(false);
  };

  return (
    <div className="group relative rounded-lg border border-blue-500/20 bg-blue-500/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border-b border-blue-500/20">
        <div className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical className="w-4 h-4 text-slate-500" />
        </div>

        <span className="flex items-center gap-1.5 text-xs font-medium text-blue-400">
          <MessageSquare className="w-3.5 h-3.5" />
          Dialogue
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
      <div className="p-3 space-y-3">
        {/* Character row */}
        <div className="flex gap-2">
          <CharacterPicker
            projectId={projectId}
            value={element.character_name ?? null}
            characterId={element.character_id ?? null}
            onChange={handleCharacterChange}
            placeholder="Personnage"
            className="flex-1"
          />
          <Select
            value={element.extension || 'none'}
            onValueChange={handleExtensionChange}
          >
            <SelectTrigger className="w-32 bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="Extension" />
            </SelectTrigger>
            <SelectContent className="bg-[#1a2433] border-white/10">
              <SelectItem value="none" className="text-slate-400">
                Aucune
              </SelectItem>
              {DIALOGUE_EXTENSIONS.map((ext) => (
                <SelectItem
                  key={ext.value}
                  value={ext.value}
                  className="text-white"
                >
                  <span title={ext.description}>{ext.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Parenthetical */}
        <Input
          value={element.parenthetical || ''}
          onChange={handleParentheticalChange}
          placeholder="(indication de jeu)"
          className="bg-white/5 border-white/10 text-white text-sm italic placeholder:text-slate-500"
        />

        {/* Dialogue content */}
        {isEditingContent ? (
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={handleContentBlur}
            onKeyDown={(e) => e.key === 'Escape' && setIsEditingContent(false)}
            autoFocus
            placeholder="Texte du dialogue..."
            className="min-h-[80px] bg-white/5 border-white/10 text-white resize-none"
          />
        ) : (
          <div
            onClick={() => setIsEditingContent(true)}
            className={cn(
              'min-h-[80px] p-3 rounded-md border border-white/10 cursor-text',
              'bg-white/5 text-sm text-white whitespace-pre-wrap',
              !element.content && 'text-slate-500'
            )}
          >
            {element.content || 'Cliquez pour ajouter le dialogue...'}
          </div>
        )}
      </div>
    </div>
  );
}
