'use client';

import Link from 'next/link';
import { StorageImg } from '@/components/ui/storage-image';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Pencil, Trash2, BookOpen, Target } from 'lucide-react';
import type { Book } from '@/types/database';
import { cn } from '@/lib/utils';

interface BookCardProps {
  book: Book;
  projectId: string;
  totalWordCount: number;
  onEdit: (book: Book) => void;
  onDelete: (book: Book) => void;
}

export function BookCard({
  book,
  projectId,
  totalWordCount,
  onEdit,
  onDelete,
}: BookCardProps) {
  const progress = book.word_count_goal
    ? Math.min(100, Math.round((totalWordCount / book.word_count_goal) * 100))
    : 0;

  const formatWordCount = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return count.toString();
  };

  const statusColors = {
    draft: 'bg-slate-500/20 text-slate-400',
    in_progress: 'bg-blue-500/20 text-blue-400',
    completed: 'bg-green-500/20 text-green-400',
  };

  const statusLabels = {
    draft: 'Brouillon',
    in_progress: 'En cours',
    completed: 'Terminé',
  };

  return (
    <div className="group relative bg-[#1a2433] rounded-xl border border-white/5 overflow-hidden hover:border-white/10 transition-all">
      {/* Cover Image */}
      <Link href={`/project/${projectId}/books/${book.id}`}>
        <div className="aspect-[2/3] relative bg-gradient-to-br from-slate-800 to-slate-900">
          {book.cover_image_url ? (
            <StorageImg
              src={book.cover_image_url}
              alt={book.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <BookOpen className="w-16 h-16 text-slate-600" />
            </div>
          )}
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        </div>
      </Link>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Title and menu */}
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/project/${projectId}/books/${book.id}`}
            className="flex-1 min-w-0"
          >
            <h3 className="font-semibold text-white truncate hover:text-blue-400 transition-colors">
              {book.title}
            </h3>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[#1a2433] border-white/10">
              <DropdownMenuItem
                onClick={() => onEdit(book)}
                className="text-slate-300 focus:text-white focus:bg-white/10"
              >
                <Pencil className="w-4 h-4 mr-2" />
                Modifier
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem
                onClick={() => onDelete(book)}
                className="text-red-400 focus:text-red-300 focus:bg-red-500/10"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Status badge */}
        <span
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
            statusColors[book.status]
          )}
        >
          {statusLabels[book.status]}
        </span>

        {/* Summary */}
        {book.summary && (
          <p className="text-sm text-slate-400 line-clamp-2">{book.summary}</p>
        )}

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">
              {formatWordCount(totalWordCount)} mots
            </span>
            <span className="text-slate-500 flex items-center gap-1">
              <Target className="w-3 h-3" />
              {formatWordCount(book.word_count_goal)}
            </span>
          </div>
          <Progress value={progress} className="h-1.5" />
          <p className="text-xs text-slate-500 text-right">{progress}%</p>
        </div>
      </div>
    </div>
  );
}
