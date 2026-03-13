'use client';

import { useState } from 'react';
import { User, MapPin, Package, Music, MoreVertical, Trash2, Edit, Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { GlobalAssetType } from '@/types/database';
import { cn } from '@/lib/utils';

// Minimal asset interface - works with both GlobalAsset and ProjectAssetFlat
interface AssetLike {
  id: string;
  name: string;
  asset_type: GlobalAssetType;
  data: Record<string, unknown> | unknown;
  reference_images?: string[];
  tags?: string[];
}

interface BibleAssetCardProps {
  asset: AssetLike;
  isInProject?: boolean;
  onImport?: () => void;
  onRemove?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onInsertReference?: (reference: string) => void;
  compact?: boolean;
}

const ASSET_ICONS: Record<GlobalAssetType, React.ComponentType<{ className?: string }>> = {
  character: User,
  location: MapPin,
  prop: Package,
  audio: Music,
};

const ASSET_COLORS: Record<GlobalAssetType, string> = {
  character: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  location: 'bg-green-500/20 text-green-400 border-green-500/30',
  prop: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  audio: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

export function BibleAssetCard({
  asset,
  isInProject,
  onImport,
  onRemove,
  onEdit,
  onDelete,
  onInsertReference,
  compact = false,
}: BibleAssetCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const Icon = ASSET_ICONS[asset.asset_type];
  const colorClass = ASSET_COLORS[asset.asset_type];

  const data = asset.data as Record<string, unknown>;
  const description = data.description as string || data.visual_description as string || '';

  const handleInsertReference = () => {
    if (onInsertReference) {
      const refName = asset.name.replace(/\s+/g, '');
      onInsertReference(`@${refName}`);
    }
  };

  if (compact) {
    return (
      <button
        onClick={handleInsertReference}
        className={cn(
          'w-full flex items-center gap-2 p-2 rounded-lg border transition-colors text-left',
          colorClass,
          'hover:bg-white/5'
        )}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="text-sm font-medium truncate flex-1">{asset.name}</span>
        {isInProject && <Check className="w-3 h-3 text-green-400" />}
      </button>
    );
  }

  return (
    <div
      className={cn(
        'relative rounded-lg border bg-white/5 overflow-hidden transition-all',
        'hover:bg-white/10',
        isHovered && 'ring-1 ring-white/20'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-3">
        <div className={cn('p-2 rounded-lg border', colorClass)}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-white truncate">{asset.name}</h4>
          {description && (
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{description}</p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-400 hover:text-white"
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-[#1a2433] border-white/10">
            {onInsertReference && (
              <DropdownMenuItem
                onClick={handleInsertReference}
                className="text-slate-300 focus:text-white focus:bg-white/5"
              >
                <Plus className="w-4 h-4 mr-2" />
                Inserer @{asset.name.replace(/\s+/g, '')}
              </DropdownMenuItem>
            )}
            {!isInProject && onImport && (
              <DropdownMenuItem
                onClick={onImport}
                className="text-slate-300 focus:text-white focus:bg-white/5"
              >
                <Plus className="w-4 h-4 mr-2" />
                Ajouter au projet
              </DropdownMenuItem>
            )}
            {isInProject && onRemove && (
              <DropdownMenuItem
                onClick={onRemove}
                className="text-slate-300 focus:text-white focus:bg-white/5"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Retirer du projet
              </DropdownMenuItem>
            )}
            {onEdit && (
              <DropdownMenuItem
                onClick={onEdit}
                className="text-slate-300 focus:text-white focus:bg-white/5"
              >
                <Edit className="w-4 h-4 mr-2" />
                Modifier
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem
                onClick={onDelete}
                className="text-red-400 focus:text-red-300 focus:bg-red-500/10"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Supprimer
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Reference images */}
      {asset.reference_images && asset.reference_images.length > 0 && (
        <div className="px-3 pb-3">
          <div className="flex gap-1 overflow-x-auto">
            {asset.reference_images.slice(0, 3).map((img, idx) => (
              <img
                key={idx}
                src={img}
                alt={`${asset.name} reference ${idx + 1}`}
                className="w-12 h-12 rounded object-cover flex-shrink-0"
              />
            ))}
            {asset.reference_images.length > 3 && (
              <div className="w-12 h-12 rounded bg-white/10 flex items-center justify-center text-xs text-slate-400 flex-shrink-0">
                +{asset.reference_images.length - 3}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tags */}
      {asset.tags && asset.tags.length > 0 && (
        <div className="px-3 pb-3">
          <div className="flex flex-wrap gap-1">
            {asset.tags.slice(0, 4).map((tag, idx) => (
              <span
                key={idx}
                className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-slate-400"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Project status badge */}
      {isInProject && (
        <div className="absolute top-2 right-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30">
            Dans le projet
          </span>
        </div>
      )}
    </div>
  );
}
