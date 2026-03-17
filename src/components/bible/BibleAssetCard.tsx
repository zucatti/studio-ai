'use client';

import { useState } from 'react';
import { User, MapPin, Package, Music, MoreVertical, Trash2, Edit, Plus, Check, AtSign, Copy, Wand2, Upload, Loader2 } from 'lucide-react';
import { StorageImg } from '@/components/ui/storage-image';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { GlobalAssetType } from '@/types/database';
import { cn } from '@/lib/utils';
import { generateReferenceName } from '@/lib/reference-name';
import type { CharacterImageType } from '@/store/bible-store';

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
  showProjectBadge?: boolean;
  onImport?: () => void;
  onRemove?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onInsertReference?: (reference: string) => void;
  onGenerate?: (viewType: CharacterImageType) => Promise<void>;
  isGenerating?: boolean;
  generatingView?: CharacterImageType | null;
  compact?: boolean;
}

const GENERATE_VIEW_OPTIONS: { value: CharacterImageType; label: string }[] = [
  { value: 'profile', label: 'Profil' },
  { value: 'three_quarter', label: '3/4' },
  { value: 'back', label: 'Dos' },
];

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
  showProjectBadge = true,
  onImport,
  onRemove,
  onEdit,
  onDelete,
  onInsertReference,
  onGenerate,
  isGenerating,
  generatingView,
  compact = false,
}: BibleAssetCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  // Check if character has a face image (required for generation)
  const data = asset.data as Record<string, unknown>;
  const referenceImagesMetadata = data.reference_images_metadata as Array<{ type: string; url: string }> | undefined;
  const hasFaceImage = referenceImagesMetadata?.some(img => img.type === 'front');
  const hasVisualDescription = !!(data.visual_description as string)?.trim();
  const canGenerate = asset.asset_type === 'character' && hasFaceImage && hasVisualDescription && onGenerate;

  const Icon = ASSET_ICONS[asset.asset_type];
  const colorClass = ASSET_COLORS[asset.asset_type];

  const description = (data.description as string) || (data.visual_description as string) || '';

  // Generate the @reference name
  const referenceName = generateReferenceName(asset.name);

  const handleInsertReference = () => {
    if (onInsertReference) {
      onInsertReference(referenceName);
    }
  };

  const handleCopyReference = async () => {
    await navigator.clipboard.writeText(referenceName);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium truncate block">{asset.name}</span>
          <span className="text-[10px] text-blue-400/70 font-mono">{referenceName}</span>
        </div>
        {isInProject && <Check className="w-3 h-3 text-green-400" />}
      </button>
    );
  }

  const handleCardClick = () => {
    if (onEdit) {
      onEdit();
    }
  };

  return (
    <div
      className={cn(
        'relative rounded-lg border bg-white/5 overflow-hidden transition-all',
        'hover:bg-white/10',
        isHovered && 'ring-1 ring-white/20',
        onEdit && 'cursor-pointer'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleCardClick}
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-3">
        <div className={cn('p-2 rounded-lg border', colorClass)}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-white truncate">{asset.name}</h4>
          {/* Reference name with copy button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => { e.stopPropagation(); handleCopyReference(); }}
                  className="flex items-center gap-1 mt-0.5 text-xs text-blue-400 hover:text-blue-300 transition-colors group"
                >
                  <AtSign className="w-3 h-3" />
                  <span className="font-mono">{referenceName.slice(1)}</span>
                  {copied ? (
                    <Check className="w-3 h-3 text-green-400" />
                  ) : (
                    <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-[#1a2433] border-white/10">
                <p className="text-xs">
                  {copied ? 'Copie !' : 'Cliquez pour copier la reference'}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {description && (
            <p className="text-xs text-slate-400 mt-1 line-clamp-2">{description}</p>
          )}
        </div>
        {/* Remove button (trash icon) for project items */}
        {isInProject && onRemove && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => { e.stopPropagation(); onRemove(); }}
                  className="h-7 w-7 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-[#1a2433] border-white/10">
                <p className="text-xs">Retirer du projet</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {/* Import button (check icon) for library items when project is selected */}
        {!isInProject && onImport && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => { e.stopPropagation(); onImport(); }}
                  className="h-7 w-7 text-slate-400 hover:text-green-400 hover:bg-green-500/10"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-[#1a2433] border-white/10">
                <p className="text-xs">Ajouter au projet</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {/* Menu for edit/delete/generate */}
        {(onEdit || onDelete || canGenerate) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => e.stopPropagation()}
                className="h-7 w-7 text-slate-400 hover:text-white"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <MoreVertical className="w-4 h-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[#1a2433] border-white/10">
              {onEdit && (
                <DropdownMenuItem
                  onClick={onEdit}
                  className="text-slate-300 focus:text-white focus:bg-white/5"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Modifier
                </DropdownMenuItem>
              )}
              {canGenerate && (
                <>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="text-purple-400 focus:text-purple-300 focus:bg-purple-500/10">
                      <Wand2 className="w-4 h-4 mr-2" />
                      Générer IA
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="bg-[#1a2433] border-white/10">
                      {GENERATE_VIEW_OPTIONS.map((option) => {
                        const isGeneratingThis = generatingView === option.value;
                        return (
                          <DropdownMenuItem
                            key={option.value}
                            onClick={() => onGenerate(option.value)}
                            disabled={isGenerating}
                            className="text-slate-300 focus:text-white focus:bg-white/5"
                          >
                            {isGeneratingThis ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Wand2 className="w-4 h-4 mr-2" />
                            )}
                            {option.label}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="text-red-400 focus:text-red-300 focus:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Supprimer
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Reference images */}
      {asset.reference_images && asset.reference_images.length > 0 && (
        <div className="px-3 pb-3">
          <div className="flex gap-1 overflow-x-auto">
            {asset.reference_images.slice(0, 3).map((img, idx) => (
              <StorageImg
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
      {isInProject && showProjectBadge && (
        <div className="absolute top-2 right-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30">
            Dans le projet
          </span>
        </div>
      )}
    </div>
  );
}
