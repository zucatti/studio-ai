'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  GripVertical,
  MoreVertical,
  Pencil,
  Trash2,
  Check,
  X,
  FileText,
} from 'lucide-react';
import type { Chapter } from '@/types/database';
import { cn } from '@/lib/utils';

interface ChaptersListProps {
  chapters: Chapter[];
  currentChapterId: string | null;
  onSelectChapter: (chapterId: string) => void;
  onCreateChapter: (title?: string) => Promise<void>;
  onUpdateChapter: (chapterId: string, updates: { title: string }) => Promise<void>;
  onDeleteChapter: (chapterId: string) => Promise<void>;
  onReorderChapters: (orderedIds: string[]) => Promise<void>;
}

interface SortableChapterProps {
  chapter: Chapter;
  isSelected: boolean;
  isEditing: boolean;
  editTitle: string;
  onSelect: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditTitleChange: (value: string) => void;
  onDelete: () => void;
}

function SortableChapter({
  chapter,
  isSelected,
  isEditing,
  editTitle,
  onSelect,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditTitleChange,
  onDelete,
}: SortableChapterProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: chapter.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const formatWordCount = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return count.toString();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-center gap-2 px-2 py-2 rounded-lg transition-colors',
        isSelected
          ? 'bg-amber-500/20 border border-amber-500/30'
          : 'hover:bg-white/5 border border-transparent',
        isDragging && 'opacity-50 z-50'
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="p-1 text-slate-500 hover:text-slate-300 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {/* Chapter content */}
      {isEditing ? (
        <div className="flex-1 flex items-center gap-2">
          <Input
            value={editTitle}
            onChange={(e) => onEditTitleChange(e.target.value)}
            className="h-7 text-sm bg-white/10 border-white/20"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit();
              if (e.key === 'Escape') onCancelEdit();
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={onSaveEdit}
            className="h-7 w-7 p-0 text-green-400 hover:text-green-300"
          >
            <Check className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancelEdit}
            className="h-7 w-7 p-0 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <>
          <button
            onClick={onSelect}
            className="flex-1 flex items-center gap-2 text-left min-w-0"
          >
            <FileText
              className={cn(
                'w-4 h-4 flex-shrink-0',
                isSelected ? 'text-amber-400' : 'text-slate-500'
              )}
            />
            <span
              className={cn(
                'text-sm truncate',
                isSelected ? 'text-white font-medium' : 'text-slate-300'
              )}
            >
              {chapter.title}
            </span>
            <span
              className={cn(
                'text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ml-auto',
                isSelected
                  ? 'bg-amber-500/30 text-amber-300'
                  : 'bg-slate-700/50 text-slate-400'
              )}
            >
              {formatWordCount(chapter.word_count)}
            </span>
          </button>

          {/* Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[#1a2433] border-white/10">
              <DropdownMenuItem
                onClick={onStartEdit}
                className="text-slate-300 focus:text-white focus:bg-white/10"
              >
                <Pencil className="w-4 h-4 mr-2" />
                Renommer
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onDelete}
                className="text-red-400 focus:text-red-300 focus:bg-red-500/10"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  );
}

export function ChaptersList({
  chapters,
  currentChapterId,
  onSelectChapter,
  onCreateChapter,
  onUpdateChapter,
  onDeleteChapter,
  onReorderChapters,
}: ChaptersListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = chapters.findIndex((c) => c.id === active.id);
      const newIndex = chapters.findIndex((c) => c.id === over.id);

      const newOrder = [...chapters];
      const [removed] = newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, removed);

      onReorderChapters(newOrder.map((c) => c.id));
    }
  };

  const startEdit = (chapter: Chapter) => {
    setEditingId(chapter.id);
    setEditTitle(chapter.title);
  };

  const saveEdit = async () => {
    if (editingId && editTitle.trim()) {
      await onUpdateChapter(editingId, { title: editTitle.trim() });
    }
    setEditingId(null);
    setEditTitle('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <h2 className="text-sm font-semibold text-white">Chapitres</h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onCreateChapter()}
          className="h-7 px-2 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Chapters list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {chapters.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileText className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-sm text-slate-400">Aucun chapitre</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onCreateChapter('Chapitre 1')}
              className="mt-2 text-amber-400 hover:text-amber-300"
            >
              <Plus className="w-4 h-4 mr-1" />
              Ajouter un chapitre
            </Button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={chapters.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              {chapters.map((chapter) => (
                <SortableChapter
                  key={chapter.id}
                  chapter={chapter}
                  isSelected={chapter.id === currentChapterId}
                  isEditing={editingId === chapter.id}
                  editTitle={editTitle}
                  onSelect={() => onSelectChapter(chapter.id)}
                  onStartEdit={() => startEdit(chapter)}
                  onSaveEdit={saveEdit}
                  onCancelEdit={cancelEdit}
                  onEditTitleChange={setEditTitle}
                  onDelete={() => onDeleteChapter(chapter.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
