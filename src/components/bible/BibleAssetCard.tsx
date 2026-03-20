'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { User, MapPin, Package, Music, MoreVertical, Trash2, Edit, Plus, Check, AtSign, Hash, Copy, Wand2, Upload, Loader2, Play, Pause, Volume2 } from 'lucide-react';
import { StorageThumbnail } from '@/components/ui/storage-image';
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
import { generateReferenceName, getReferencePrefix } from '@/lib/reference-name';
import type { CharacterImageType, AudioData, AudioType } from '@/store/bible-store';
import { getSignedUrl, isB2Url } from '@/hooks/use-signed-url';

// Audio type labels
const AUDIO_TYPE_LABELS: Record<AudioType, string> = {
  music: 'Musique',
  sfx: 'SFX',
  dialogue: 'Dialogue',
  ambiance: 'Ambiance',
  foley: 'Foley',
  voiceover: 'Voix-off',
};

// Format duration as mm:ss
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

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
  audio: 'bg-slate-700/50 text-blue-400 border-slate-600/50',
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
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Check if character has a face image (required for generation)
  const data = asset.data as Record<string, unknown>;
  const referenceImagesMetadata = data.reference_images_metadata as Array<{ type: string; url: string }> | undefined;
  const hasFaceImage = referenceImagesMetadata?.some(img => img.type === 'front');
  const hasVisualDescription = !!(data.visual_description as string)?.trim();
  const canGenerate = asset.asset_type === 'character' && hasFaceImage && hasVisualDescription && onGenerate;

  const Icon = ASSET_ICONS[asset.asset_type];
  const colorClass = ASSET_COLORS[asset.asset_type];

  const description = (data.description as string) || (data.visual_description as string) || '';

  // Generate the reference name with correct prefix (@ for characters, # for others)
  const prefix = getReferencePrefix(asset.asset_type);
  const referenceName = generateReferenceName(asset.name, prefix);

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

  // Audio playback for audio assets
  const audioData = asset.asset_type === 'audio' ? (data as AudioData) : null;
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(audioData?.duration || 0);

  const updateProgress = useCallback(() => {
    if (audioRef.current) {
      setAudioProgress(audioRef.current.currentTime);
      if (audioRef.current.duration && !isNaN(audioRef.current.duration)) {
        setAudioDuration(audioRef.current.duration);
      }
    }
  }, []);

  const toggleAudioPlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioData?.fileUrl) return;

    // If already playing, just pause
    if (isAudioPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsAudioPlaying(false);
      return;
    }

    // Get signed URL if needed
    setIsLoadingAudio(true);
    try {
      const playUrl = isB2Url(audioData.fileUrl)
        ? await getSignedUrl(audioData.fileUrl)
        : audioData.fileUrl;

      if (!audioRef.current || audioRef.current.src !== playUrl) {
        audioRef.current = new Audio(playUrl);
        audioRef.current.onended = () => {
          setIsAudioPlaying(false);
          setAudioProgress(0);
        };
        audioRef.current.ontimeupdate = updateProgress;
        audioRef.current.onloadedmetadata = () => {
          if (audioRef.current?.duration) {
            setAudioDuration(audioRef.current.duration);
          }
        };
      }

      await audioRef.current.play();
      setIsAudioPlaying(true);
    } catch (err) {
      console.error('Error playing audio:', err);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const time = parseFloat(e.target.value);
    setAudioProgress(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
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
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium truncate block">{asset.name}</span>
          <span className={cn(
            'text-[10px] font-mono',
            prefix === '@' ? 'text-blue-400/70' : 'text-green-400/70'
          )}>{referenceName}</span>
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

  // Specialized audio card
  if (asset.asset_type === 'audio' && audioData) {
    return (
      <div
        className={cn(
          'relative rounded-lg border border-white/10 bg-slate-800/30 overflow-hidden transition-all',
          'hover:bg-slate-800/50',
          isHovered && 'ring-1 ring-blue-500/30',
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="p-3">
          {/* Top row: play button, name, hashtag & menu */}
          <div className="flex items-center gap-3 mb-2">
            {/* Play/Pause button */}
            <button
              onClick={toggleAudioPlay}
              disabled={isLoadingAudio}
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0',
                'bg-blue-600 hover:bg-blue-500 text-white',
                'hover:scale-105 active:scale-95',
                isLoadingAudio && 'opacity-50 cursor-wait'
              )}
            >
              {isLoadingAudio ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isAudioPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5 ml-0.5" />
              )}
            </button>

            {/* Name */}
            <h4 className="flex-1 font-medium text-white text-sm truncate">{asset.name}</h4>

            {/* Right side: hashtag + menu */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Reference hashtag - green */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCopyReference(); }}
                      className="flex items-center gap-0.5 px-1.5 py-1 rounded text-xs text-green-400 hover:text-green-300 hover:bg-white/5 transition-colors"
                    >
                      <Hash className="w-3 h-3" />
                      <span className="font-mono text-[10px]">{referenceName.slice(1)}</span>
                      {copied && <Check className="w-3 h-3 text-green-400 ml-0.5" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-[#1a2433] border-white/10">
                    <p className="text-xs">{copied ? 'Copié !' : 'Copier la référence'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* 3-dot menu */}
              {(onEdit || onDelete) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => e.stopPropagation()}
                      className="h-7 w-7 text-slate-400 hover:text-white"
                    >
                      <MoreVertical className="w-4 h-4" />
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
          </div>

          {/* Progress slider */}
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 relative h-1.5 group">
              <div className="h-full bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${audioDuration > 0 ? (audioProgress / audioDuration) * 100 : 0}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={audioDuration || 100}
                value={audioProgress}
                onChange={handleSeek}
                onClick={(e) => e.stopPropagation()}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            <span className="text-[10px] text-slate-500 tabular-nums flex-shrink-0">
              {formatDuration(audioProgress)} / {formatDuration(audioDuration)}
            </span>
          </div>

          {/* Description */}
          {audioData.description && (
            <p className="text-xs text-slate-400 line-clamp-2 mb-2">{audioData.description}</p>
          )}

          {/* Tags */}
          {asset.tags && asset.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {asset.tags.slice(0, 4).map((tag, idx) => (
                <span
                  key={idx}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-slate-400"
                >
                  {tag}
                </span>
              ))}
              {asset.tags.length > 4 && (
                <span className="text-[10px] text-slate-500">+{asset.tags.length - 4}</span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

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
        {/* Icon */}
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
                  className={cn(
                    'flex items-center gap-1 mt-0.5 text-xs transition-colors group',
                    prefix === '@' ? 'text-blue-400 hover:text-blue-300' : 'text-green-400 hover:text-green-300'
                  )}
                >
                  {prefix === '@' ? <AtSign className="w-3 h-3" /> : <Hash className="w-3 h-3" />}
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
                  {copied ? 'Copié !' : 'Cliquez pour copier la référence'}
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
              <StorageThumbnail
                key={idx}
                src={img}
                alt={`${asset.name} reference ${idx + 1}`}
                size="xs"
                className="rounded flex-shrink-0"
                objectPosition="center top"
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
