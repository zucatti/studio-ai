'use client';

import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  Target,
  Clock,
  FileText,
  TrendingUp,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import type { Book, Chapter } from '@/types/database';
import { cn } from '@/lib/utils';

interface BookStatsProps {
  book: Book;
  chapters: Chapter[];
  onAiAssist?: () => void;
}

export function BookStats({ book, chapters, onAiAssist }: BookStatsProps) {
  // Calculate stats
  const totalWordCount = chapters.reduce((sum, c) => sum + (c.word_count || 0), 0);
  const progress = book.word_count_goal
    ? Math.min(100, Math.round((totalWordCount / book.word_count_goal) * 100))
    : 0;

  // Estimate reading time (average 200 words per minute)
  const readingMinutes = Math.ceil(totalWordCount / 200);
  const readingHours = Math.floor(readingMinutes / 60);
  const remainingMinutes = readingMinutes % 60;

  // Estimate pages (average 250 words per page)
  const estimatedPages = Math.ceil(totalWordCount / 250);

  // Words remaining to goal
  const wordsRemaining = Math.max(0, book.word_count_goal - totalWordCount);

  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
  };

  const statusColors = {
    draft: 'text-slate-400',
    in_progress: 'text-blue-400',
    completed: 'text-green-400',
  };

  const statusLabels = {
    draft: 'Brouillon',
    in_progress: 'En cours',
    completed: 'Terminé',
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5">
        <h2 className="text-sm font-semibold text-white">Statistiques</h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Progress */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Progression</span>
            <span className={cn('text-sm font-medium', statusColors[book.status])}>
              {statusLabels[book.status]}
            </span>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-xs">
            <span className="text-white font-medium">
              {formatNumber(totalWordCount)} mots
            </span>
            <span className="text-slate-500">
              {progress}% de {formatNumber(book.word_count_goal)}
            </span>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Word count */}
          <div className="p-3 rounded-lg bg-white/5 space-y-1">
            <div className="flex items-center gap-2 text-slate-400">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs">Total mots</span>
            </div>
            <p className="text-lg font-semibold text-white">
              {totalWordCount.toLocaleString()}
            </p>
          </div>

          {/* Goal */}
          <div className="p-3 rounded-lg bg-white/5 space-y-1">
            <div className="flex items-center gap-2 text-slate-400">
              <Target className="w-4 h-4" />
              <span className="text-xs">Objectif</span>
            </div>
            <p className="text-lg font-semibold text-white">
              {formatNumber(book.word_count_goal)}
            </p>
          </div>

          {/* Chapters */}
          <div className="p-3 rounded-lg bg-white/5 space-y-1">
            <div className="flex items-center gap-2 text-slate-400">
              <FileText className="w-4 h-4" />
              <span className="text-xs">Chapitres</span>
            </div>
            <p className="text-lg font-semibold text-white">{chapters.length}</p>
          </div>

          {/* Reading time */}
          <div className="p-3 rounded-lg bg-white/5 space-y-1">
            <div className="flex items-center gap-2 text-slate-400">
              <Clock className="w-4 h-4" />
              <span className="text-xs">Lecture</span>
            </div>
            <p className="text-lg font-semibold text-white">
              {readingHours > 0 ? `${readingHours}h ${remainingMinutes}m` : `${readingMinutes}m`}
            </p>
          </div>
        </div>

        {/* Additional info */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-slate-400">
            <span>Pages estimées</span>
            <span className="text-white">{estimatedPages}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Mots restants</span>
            <span className="text-white">{formatNumber(wordsRemaining)}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Mots par chapitre</span>
            <span className="text-white">
              {chapters.length > 0
                ? formatNumber(Math.round(totalWordCount / chapters.length))
                : '0'}
            </span>
          </div>
        </div>

        {/* AI Assist button */}
        {onAiAssist && (
          <div className="pt-4 border-t border-white/5">
            <Button
              onClick={onAiAssist}
              className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Assistance IA
            </Button>
          </div>
        )}

        {/* Book info */}
        {book.summary && (
          <div className="pt-4 border-t border-white/5 space-y-2">
            <div className="flex items-center gap-2 text-slate-400">
              <BookOpen className="w-4 h-4" />
              <span className="text-xs font-medium">Synopsis</span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{book.summary}</p>
          </div>
        )}
      </div>
    </div>
  );
}
