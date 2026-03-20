'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Clock, MoreVertical, Pencil, Trash2, Film } from 'lucide-react';
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
import type { Short } from '@/store/shorts-store';

interface ShortCardProps {
  short: Short;
  projectId: string;
  onDelete: (shortId: string) => void;
  onEdit: (short: Short) => void;
}

export function ShortCard({ short, projectId, onDelete, onEdit }: ShortCardProps) {
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Get thumbnail from first plan's storyboard
  const thumbnailUrl = short.plans[0]?.storyboard_image_url;

  const handleClick = () => {
    router.push(`/project/${projectId}/shorts/${short.id}`);
  };

  return (
    <>
      <div
        className="group relative rounded-xl bg-[#151d28] border border-white/5 overflow-hidden cursor-pointer hover:border-blue-500/30 transition-all"
        onClick={handleClick}
      >
        {/* Thumbnail */}
        <div className="aspect-[9/16] bg-slate-800/50 relative">
          {thumbnailUrl ? (
            <StorageImg
              src={thumbnailUrl}
              alt={short.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Film className="w-12 h-12 text-slate-600" />
            </div>
          )}

          {/* Overlay with play button on hover */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <Play className="w-7 h-7 text-white ml-1" />
            </div>
          </div>

          {/* Duration badge */}
          <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded bg-black/60 text-white text-xs">
            <Clock className="w-3 h-3" />
            {formatDuration(short.totalDuration)}
          </div>

          {/* Plans count */}
          <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/60 text-white text-xs">
            {short.plans.length} plan{short.plans.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Info */}
        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-white truncate">{short.title}</h3>
              {short.description && (
                <p className="text-sm text-slate-400 truncate mt-0.5">
                  {short.description}
                </p>
              )}
            </div>

            {/* Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
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
                  onClick={() => onEdit(short)}
                  className="text-slate-300 focus:text-white focus:bg-white/10"
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  Renommer
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
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-[#1a2433] border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Supprimer ce short ?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Le short &quot;{short.title}&quot; et ses {short.plans.length} plan{short.plans.length !== 1 ? 's' : ''} seront définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={() => onDelete(short.id)}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
