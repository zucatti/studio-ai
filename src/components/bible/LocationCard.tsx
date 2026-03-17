'use client';

import { useState } from 'react';
import { MapPin, Plus, Trash2, Edit, Check, ImageIcon } from 'lucide-react';
import { StorageImg } from '@/components/ui/storage-image';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { GlobalAsset } from '@/types/database';
import { cn } from '@/lib/utils';

interface LocationData {
  description?: string;
  visual_description?: string;
  int_ext?: 'INT' | 'EXT' | 'INT/EXT';
}

interface LocationCardProps {
  location: GlobalAsset & { isInProject?: boolean; projectAssetId?: string };
  isInProject?: boolean;
  onImport?: () => void;
  onRemove?: () => void;
  onEdit?: () => void;
}

export function LocationCard({
  location,
  isInProject,
  onImport,
  onRemove,
  onEdit,
}: LocationCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const data = location.data as LocationData | undefined;
  const description = data?.visual_description || data?.description || '';
  const intExt = data?.int_ext;
  const referenceImage = location.reference_images?.[0];

  return (
    <div
      className={cn(
        'relative rounded-xl border border-white/10 bg-white/5 overflow-hidden transition-all group',
        'hover:bg-white/10 hover:border-white/20',
        isHovered && 'ring-1 ring-white/20',
        onEdit && 'cursor-pointer'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onEdit?.()}
    >
      {/* Image header */}
      <div className="relative aspect-[16/10] bg-slate-900">
        {referenceImage ? (
          <StorageImg
            src={referenceImage}
            alt={location.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
            <ImageIcon className="w-8 h-8 text-slate-700" />
          </div>
        )}

        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* INT/EXT badge */}
        {intExt && (
          <div className="absolute top-1.5 left-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white font-medium">
              {intExt}
            </span>
          </div>
        )}

        {/* Project status badge */}
        {isInProject && (
          <div className="absolute top-1.5 right-1.5">
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/80 text-white font-medium flex items-center gap-0.5">
              <Check className="w-2.5 h-2.5" />
              Projet
            </span>
          </div>
        )}

        {/* Action buttons on hover */}
        <div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onEdit && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); onEdit(); }}
                    className="h-6 w-6 bg-black/50 text-white hover:bg-black/70"
                  >
                    <Edit className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-[#1a2433] border-white/10">
                  <p className="text-xs">Modifier</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {!isInProject && onImport && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); onImport(); }}
                    className="h-6 w-6 bg-green-500/80 text-white hover:bg-green-600"
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-[#1a2433] border-white/10">
                  <p className="text-xs">Ajouter au projet</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {isInProject && onRemove && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    className="h-6 w-6 bg-red-500/80 text-white hover:bg-red-600"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-[#1a2433] border-white/10">
                  <p className="text-xs">Retirer du projet</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        <div className="flex items-start gap-2">
          <div className="p-1 rounded bg-green-500/20">
            <MapPin className="w-3.5 h-3.5 text-green-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-white truncate">{location.name}</h3>
            {description && (
              <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{description}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
