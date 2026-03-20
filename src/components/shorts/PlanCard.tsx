'use client';

import { useState } from 'react';
import { Play, Clock, MoreVertical, Pencil, Trash2, ImageIcon, GripVertical } from 'lucide-react';
import { StorageImg } from '@/components/ui/storage-image';
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

interface PlanCardProps {
  plan: Plan;
  isSelected?: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

export function PlanCard({
  plan,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  dragHandleProps,
}: PlanCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

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
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-blue-400 bg-blue-500/20 px-1.5 py-0.5 rounded">
              P{plan.shot_number}
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Clock className="w-3 h-3" />
              {formatDuration(plan.duration)}
            </span>
          </div>
          <p className="text-sm text-slate-300 mt-1 line-clamp-2">
            {plan.description || 'Pas de description'}
          </p>
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
