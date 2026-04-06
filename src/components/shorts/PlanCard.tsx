'use client';

import { useState, useMemo } from 'react';
import { Play, Clock, MoreVertical, Pencil, Trash2, ImageIcon, GripVertical, Video, CheckCircle2, Clapperboard } from 'lucide-react';
import { StorageImg, StorageMedia } from '@/components/ui/storage-image';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatDuration } from './DurationPicker';
import { cn } from '@/lib/utils';
import type { Plan } from '@/store/shorts-store';
import type { Segment, ShotFraming } from '@/types/cinematic';
import { getPlanDisplayTitle } from '@/types/cinematic';

// Color for shot framing in mini timeline
function getMiniSegmentColor(framing?: ShotFraming): string {
  if (!framing) return 'bg-slate-500';
  const colors: Record<ShotFraming, string> = {
    extreme_wide: 'bg-purple-500',
    wide: 'bg-indigo-500',
    medium_wide: 'bg-blue-500',
    medium: 'bg-cyan-500',
    medium_close_up: 'bg-teal-500',
    close_up: 'bg-green-500',
    extreme_close_up: 'bg-lime-500',
  };
  return colors[framing] || 'bg-slate-500';
}

// Mini timeline component for plan card
function MiniSegmentTimeline({ segments, duration }: { segments: Segment[]; duration: number }) {
  if (!segments || segments.length === 0) {
    return (
      <div className="w-full h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
        <div className="w-full h-full bg-slate-600/30" />
      </div>
    );
  }

  const sortedSegments = [...segments].sort((a, b) => a.start_time - b.start_time);

  return (
    <div className="w-full h-1.5 bg-slate-700/50 rounded-full overflow-hidden flex">
      {sortedSegments.map((seg, i) => {
        const widthPercent = ((seg.end_time - seg.start_time) / duration) * 100;
        const leftGapPercent = i === 0 ? (seg.start_time / duration) * 100 : 0;

        return (
          <div
            key={seg.id}
            className={cn('h-full flex-shrink-0', getMiniSegmentColor(seg.shot_framing))}
            style={{
              width: `${Math.max(widthPercent, 3)}%`,
              marginLeft: leftGapPercent > 0 ? `${leftGapPercent}%` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

interface PlanCardProps {
  plan: Plan;
  isSelected?: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  compact?: boolean;
}

export function PlanCard({
  plan,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  dragHandleProps,
  compact,
}: PlanCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Compact mode for sidebar
  if (compact) {
    return (
      <>
        <div
          className={cn(
            'group flex items-center gap-2 p-2 rounded-lg bg-[#0d1218] border transition-all cursor-pointer',
            isSelected
              ? 'border-blue-500 ring-1 ring-blue-500/30'
              : 'border-white/5 hover:border-white/20'
          )}
          onClick={onSelect}
        >
          {/* Drag handle */}
          <div
            {...dragHandleProps}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-4 h-4" />
          </div>

          {/* Small thumbnail */}
          <div className="flex-shrink-0 w-10 h-10 rounded bg-slate-800/50 overflow-hidden relative">
            {plan.storyboard_image_url ? (
              <StorageImg
                src={plan.storyboard_image_url}
                alt={`Plan ${plan.shot_number}`}
                className="w-full h-full object-cover"
              />
            ) : plan.generated_video_url ? (
              <StorageMedia
                src={plan.generated_video_url}
                alt={`Plan ${plan.shot_number}`}
                className="w-full h-full object-cover"
                autoPlay={false}
                muted={true}
                loop={false}
                controls={false}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="w-4 h-4 text-slate-600" />
              </div>
            )}
          </div>

          {/* Info - simplified for compact mode */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center justify-between">
              {/* Left: Plan title */}
              <span className="text-[10px] font-medium text-slate-300 truncate max-w-[100px]">
                {getPlanDisplayTitle(plan)}
              </span>

              {/* Right: Duration + indicators */}
              <div className="flex items-center gap-1.5">
                {(plan.segments?.length || 0) > 0 && (
                  <span className="text-[9px] text-slate-500">
                    {plan.segments?.length}
                    <Clapperboard className="w-2.5 h-2.5 inline ml-0.5" />
                  </span>
                )}
                {plan.generated_video_url && (
                  <CheckCircle2 className="w-3 h-3 text-green-400" />
                )}
                <span className="text-[10px] text-slate-500 tabular-nums">
                  {formatDuration(plan.duration)}
                </span>
              </div>
            </div>

            {/* Mini segment timeline */}
            <MiniSegmentTimeline segments={plan.segments || []} duration={plan.duration} />
          </div>

          {/* Compact menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-slate-500 hover:text-white flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="bg-[#1a2433] border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem
                onClick={onEdit}
                className="text-slate-300 focus:text-white focus:bg-white/10 text-xs"
              >
                <Pencil className="w-3 h-3 mr-2" />
                Modifier
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="text-red-400 focus:text-red-300 focus:bg-red-500/10 text-xs"
              >
                <Trash2 className="w-3 h-3 mr-2" />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Delete confirmation */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent className="bg-[#1a2433] border-white/10">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Supprimer ce plan ?</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                Le plan {plan.shot_number} sera définitivement supprimé.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
                Annuler
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-500 hover:bg-red-600"
                onClick={onDelete}
              >
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // Full mode (default)
  return (
    <>
      <div
        className={cn(
          'group flex items-center gap-3 p-3 rounded-xl bg-[#151d28] border transition-all cursor-pointer',
          isSelected
            ? 'border-blue-500 ring-2 ring-blue-500/30'
            : 'border-white/5 hover:border-white/20'
        )}
        onClick={onSelect}
      >
        {/* Drag handle */}
        <div
          {...dragHandleProps}
          className="flex-shrink-0 cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-5 h-5" />
        </div>

        {/* Thumbnail */}
        <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-slate-800/50 overflow-hidden relative">
          {plan.storyboard_image_url ? (
            <StorageImg
              src={plan.storyboard_image_url}
              alt={`Plan ${plan.shot_number}`}
              className="w-full h-full object-cover"
            />
          ) : plan.generated_video_url ? (
            <StorageMedia
              src={plan.generated_video_url}
              alt={`Plan ${plan.shot_number}`}
              className="w-full h-full object-cover"
              autoPlay={false}
              muted={true}
              loop={false}
              controls={false}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="w-6 h-6 text-slate-600" />
            </div>
          )}

          {/* Play button overlay */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <Play className="w-4 h-4 text-white ml-0.5" />
            </div>
          </div>

          {/* Video indicator */}
          {plan.generated_video_url && (
            <div className="absolute bottom-1 right-1">
              <Video className="w-3 h-3 text-green-400" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-blue-400 bg-blue-500/20 px-1.5 py-0.5 rounded">
              P{plan.shot_number}
            </span>
            <span className="text-sm font-medium text-slate-200 truncate">
              {getPlanDisplayTitle(plan)}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Clock className="w-3 h-3" />
              {formatDuration(plan.duration)}
            </span>
            {(plan.segments?.length || 0) > 0 && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Clapperboard className="w-3 h-3" />
                {plan.segments?.length} segments
              </span>
            )}
            {plan.generated_video_url && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <CheckCircle2 className="w-3 h-3" />
              </span>
            )}
          </div>
          {/* Mini segment timeline */}
          <div className="mt-2">
            <MiniSegmentTimeline segments={plan.segments || []} duration={plan.duration} />
          </div>
        </div>

        {/* Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400 hover:text-white flex-shrink-0"
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="bg-[#1a2433] border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuItem
              onClick={onEdit}
              className="text-slate-300 focus:text-white focus:bg-white/10"
            >
              <Pencil className="w-4 h-4 mr-2" />
              Modifier
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setShowDeleteDialog(true)}
              className="text-red-400 focus:text-red-300 focus:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-[#1a2433] border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Supprimer ce plan ?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Le plan {plan.shot_number} sera définitivement supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={onDelete}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
