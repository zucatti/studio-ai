'use client';

import { useState, useEffect } from 'react';
import { X, BookOpen, Grid3X3, Archive, User, MapPin, Package, Loader2, Check, Users, Book, ImagePlus, ChevronDown, ChevronRight, Shirt } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRushCreatorStore } from '@/store/rush-creator-store';
import { useBibleStore } from '@/store/bible-store';
import { StorageImg, StorageThumbnail } from '@/components/ui/storage-image';
import { generateReferenceName, generateLookReferenceName, generateCharacterLookReference } from '@/lib/reference-name';
import { getGenericCharacter } from '@/lib/generic-characters';
import type { GlobalAsset, ProjectAssetFlat } from '@/types/database';

export type SidePanelType = 'bible' | 'gallery' | 'rush' | null;

interface RushSidePanelProps {
  panelType: SidePanelType;
  onClose: () => void;
}

interface GalleryImage {
  id: string;
  url: string;
  prompt?: string;
  media_type?: string;
}

export function RushSidePanel({ panelType, onClose }: RushSidePanelProps) {
  const { currentProjectId } = useRushCreatorStore();

  if (!panelType) return null;

  const titles: Record<SidePanelType & string, { icon: typeof BookOpen; label: string }> = {
    bible: { icon: BookOpen, label: 'Bible' },
    gallery: { icon: Grid3X3, label: 'Gallery' },
    rush: { icon: Archive, label: 'Rush' },
  };

  const { icon: Icon, label } = titles[panelType];

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 z-10"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute top-0 right-0 bottom-0 w-full max-w-2xl bg-[#0d1520] border-l border-white/10 z-20 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between h-12 px-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-semibold text-white">{label}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {panelType === 'bible' && currentProjectId && (
            <BibleContent projectId={currentProjectId} />
          )}
          {panelType === 'gallery' && currentProjectId && (
            <GalleryContent projectId={currentProjectId} />
          )}
          {panelType === 'rush' && currentProjectId && (
            <RushContent projectId={currentProjectId} />
          )}
        </div>
      </div>
    </>
  );
}

// Bible Content - uses bible-store
function BibleContent({ projectId }: { projectId: string }) {
  const {
    globalAssets,
    projectAssets,
    projectGenericAssets,
    isLoading,
    fetchGlobalAssets,
    fetchProjectAssets,
    fetchProjectGenericAssets,
  } = useBibleStore();

  const { prompt, setPrompt, setSourceImageUrl, sourceImageUrl } = useRushCreatorStore();
  const [activeTab, setActiveTab] = useState<'project' | 'global'>('project');
  const [activeType, setActiveType] = useState<'characters' | 'locations' | 'props'>('characters');
  const [expandedCharacters, setExpandedCharacters] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchProjectAssets(projectId);
    fetchProjectGenericAssets(projectId);
    fetchGlobalAssets(''); // userId not needed, API uses session
  }, [projectId, fetchProjectAssets, fetchProjectGenericAssets, fetchGlobalAssets]);

  // Filter assets by type
  const projectCharacters = projectAssets.filter(a => a.asset_type === 'character');
  const projectLocations = projectAssets.filter(a => a.asset_type === 'location');
  const projectProps = projectAssets.filter(a => a.asset_type === 'prop');
  const figurants = projectGenericAssets.filter(g => g.name_override);

  const globalCharacters = globalAssets.filter(a => a.asset_type === 'character');
  const globalLocations = globalAssets.filter(a => a.asset_type === 'location');
  const globalProps = globalAssets.filter(a => a.asset_type === 'prop');

  const insertMention = (name: string, prefix: '@' | '#' = '@', lookName?: string) => {
    const mention = lookName
      ? generateCharacterLookReference(name, lookName)
      : generateReferenceName(name, prefix);
    setPrompt(prompt + mention + ' ');
  };

  const toggleCharacterExpanded = (characterId: string) => {
    setExpandedCharacters(prev => {
      const next = new Set(prev);
      if (next.has(characterId)) {
        next.delete(characterId);
      } else {
        next.add(characterId);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
      </div>
    );
  }

  const currentAssets = activeTab === 'project'
    ? (activeType === 'characters' ? [...projectCharacters] : activeType === 'locations' ? projectLocations : projectProps)
    : (activeType === 'characters' ? globalCharacters : activeType === 'locations' ? globalLocations : globalProps);

  const currentFigurants = activeTab === 'project' && activeType === 'characters' ? figurants : [];

  return (
    <div className="p-4">
      {/* Bible Type Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('project')}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            activeTab === 'project'
              ? 'bg-green-500/20 text-green-400'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          )}
        >
          <Book className="w-4 h-4" />
          Bible Projet
        </button>
        <button
          onClick={() => setActiveTab('global')}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            activeTab === 'global'
              ? 'bg-blue-500/20 text-blue-400'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          )}
        >
          <BookOpen className="w-4 h-4" />
          Bible Générale
        </button>
      </div>

      {/* Asset Type Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveType('characters')}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            activeType === 'characters'
              ? 'bg-blue-500/20 text-blue-400'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          )}
        >
          <User className="w-4 h-4" />
          Personnages
        </button>
        <button
          onClick={() => setActiveType('locations')}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            activeType === 'locations'
              ? 'bg-green-500/20 text-green-400'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          )}
        >
          <MapPin className="w-4 h-4" />
          Lieux
        </button>
        <button
          onClick={() => setActiveType('props')}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            activeType === 'props'
              ? 'bg-orange-500/20 text-orange-400'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          )}
        >
          <Package className="w-4 h-4" />
          Props
        </button>
      </div>

      {/* Content */}
      <p className="text-amber-400 text-xs mb-3 flex items-center gap-1.5">
        <ImagePlus className="w-3.5 h-3.5" />
        Survolez une image pour l'utiliser comme référence
      </p>

      {currentAssets.length === 0 && currentFigurants.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-8">
          {activeTab === 'project' ? 'Aucun élément dans la Bible du projet' : 'Aucun élément dans la Bible générale'}
        </p>
      ) : activeType === 'characters' ? (
        // Character list with expandable looks
        <div className="space-y-2">
          {currentAssets.map((asset) => {
            const refImage = asset.reference_images?.[0];
            const looks = (asset.data as { looks?: Array<{ id?: string; name: string; description?: string; imageUrl: string }> })?.looks || [];
            const isExpanded = expandedCharacters.has(asset.id);
            const hasLooks = looks.length > 0;

            return (
              <div key={asset.id} className="rounded-xl bg-white/5 border border-blue-500/30 overflow-hidden">
                {/* Character header */}
                <div className="flex items-center gap-3 p-3">
                  {/* Image with reference button overlay */}
                  <div className="relative group flex-shrink-0">
                    {refImage ? (
                      <>
                        <StorageThumbnail src={refImage} alt={asset.name} size={48} className="rounded-lg" />
                        <button
                          onClick={(e) => { e.stopPropagation(); setSourceImageUrl(refImage); }}
                          className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center"
                          title="Utiliser comme référence"
                        >
                          <ImagePlus className="w-5 h-5 text-amber-400" />
                        </button>
                        {sourceImageUrl === refImage && (
                          <div className="absolute -top-1 -right-1">
                            <div className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                              <Check className="w-2.5 h-2.5 text-white" />
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="w-12 h-12 rounded-lg flex items-center justify-center text-blue-400 bg-blue-500/20">
                        <User className="w-6 h-6" />
                      </div>
                    )}
                  </div>

                  {/* Name - clickable to insert mention */}
                  <button
                    onClick={() => insertMention(asset.name, '@')}
                    className="flex-1 text-left hover:opacity-80 transition-opacity min-w-0"
                  >
                    <p className="text-white font-medium text-sm truncate">{asset.name}</p>
                    <p className="text-xs text-blue-400 font-mono">
                      @{generateReferenceName(asset.name, '@').slice(1)}
                    </p>
                  </button>

                  {/* Expand button for looks */}
                  {hasLooks && (
                    <button
                      onClick={() => toggleCharacterExpanded(asset.id)}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
                    >
                      <Shirt className="w-4 h-4" />
                      <span className="text-xs">{looks.length}</span>
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  )}
                </div>

                {/* Looks grid (expanded) */}
                {hasLooks && isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-white/10">
                    <p className="text-xs text-slate-500 mb-2">Cliquez sur un look pour l'ajouter au prompt</p>
                    <div className="grid grid-cols-3 gap-2">
                      {looks.map((look, idx) => {
                        const isLookRef = look.imageUrl && sourceImageUrl === look.imageUrl;
                        return (
                          <div
                            key={look.id || idx}
                            className={cn(
                              'relative group rounded-lg overflow-hidden border transition-all cursor-pointer',
                              isLookRef ? 'ring-2 ring-amber-500 border-amber-500/50' : 'border-white/10 hover:border-purple-500/50'
                            )}
                          >
                            {look.imageUrl ? (
                              <StorageThumbnail src={look.imageUrl} alt={look.name} size={80} className="w-full aspect-square object-cover" />
                            ) : (
                              <div className="w-full aspect-square bg-purple-500/20 flex items-center justify-center">
                                <Shirt className="w-6 h-6 text-purple-400" />
                              </div>
                            )}
                            {/* Click to insert look mention */}
                            <button
                              onClick={() => insertMention(asset.name, '@', look.name)}
                              className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-end p-1.5"
                            >
                              <p className="text-white text-xs font-medium truncate">{look.name}</p>
                              <p className="text-purple-400 text-[10px] font-mono truncate">{generateLookReferenceName(look.name)}</p>
                            </button>
                            {/* Reference button on hover */}
                            {look.imageUrl && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setSourceImageUrl(look.imageUrl); }}
                                className="absolute top-1 right-1 w-6 h-6 rounded bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                title="Utiliser comme référence"
                              >
                                <ImagePlus className="w-3.5 h-3.5 text-amber-400" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Figurants (generic characters) */}
          {currentFigurants.map((figurant) => {
            const images = figurant.local_overrides?.reference_images_metadata;
            const image = images?.[0]?.url;
            return (
              <AssetButton
                key={figurant.project_generic_asset_id}
                name={figurant.name_override || figurant.name}
                image={image}
                type="characters"
                isGeneric
                onClick={() => insertMention(figurant.name_override || figurant.name, '@')}
                onSetAsReference={image ? () => setSourceImageUrl(image) : undefined}
                isReferenceSelected={image ? sourceImageUrl === image : false}
              />
            );
          })}
        </div>
      ) : (
        // Grid for locations and props (no looks)
        <div className="grid grid-cols-2 gap-3">
          {currentAssets.map((asset) => {
            const refImage = asset.reference_images?.[0];
            return (
              <AssetButton
                key={asset.id}
                name={asset.name}
                image={refImage}
                type={activeType}
                onClick={() => insertMention(asset.name, '#')}
                onSetAsReference={refImage ? () => setSourceImageUrl(refImage) : undefined}
                isReferenceSelected={refImage ? sourceImageUrl === refImage : false}
              />
            );
          })}
        </div>
      )}

      <p className="text-slate-500 text-xs mt-4 text-center">
        {activeType === 'characters'
          ? 'Cliquez sur le nom ou un look pour ajouter au prompt'
          : 'Cliquez sur le nom pour ajouter au prompt'
        }
      </p>
    </div>
  );
}

// Asset button component
function AssetButton({
  name,
  image,
  type,
  isGeneric,
  onClick,
  onSetAsReference,
  isReferenceSelected,
}: {
  name: string;
  image?: string;
  type: 'characters' | 'locations' | 'props';
  isGeneric?: boolean;
  onClick: () => void;
  onSetAsReference?: () => void;
  isReferenceSelected?: boolean;
}) {
  const prefix = type === 'characters' ? '@' : '#';
  const colorClasses = {
    characters: isGeneric ? 'border-purple-500/30 hover:bg-purple-500/10' : 'border-blue-500/30 hover:bg-blue-500/10',
    locations: 'border-green-500/30 hover:bg-green-500/10',
    props: 'border-orange-500/30 hover:bg-orange-500/10',
  };
  const iconColors = {
    characters: isGeneric ? 'text-purple-400 bg-purple-500/20' : 'text-blue-400 bg-blue-500/20',
    locations: 'text-green-400 bg-green-500/20',
    props: 'text-orange-400 bg-orange-500/20',
  };
  const IconComponent = type === 'characters' ? (isGeneric ? Users : User) : type === 'locations' ? MapPin : Package;

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-xl bg-white/5 border text-left transition-colors',
        colorClasses[type],
        isReferenceSelected && 'ring-2 ring-amber-500'
      )}
    >
      {/* Image with reference button overlay */}
      <div className="relative group flex-shrink-0">
        {image ? (
          <>
            <StorageThumbnail
              src={image}
              alt={name}
              size={48}
              className="rounded-lg"
            />
            {onSetAsReference && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSetAsReference();
                }}
                className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center"
                title="Utiliser comme référence"
              >
                <ImagePlus className="w-5 h-5 text-amber-400" />
              </button>
            )}
            {isReferenceSelected && (
              <div className="absolute -top-1 -right-1">
                <div className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              </div>
            )}
          </>
        ) : (
          <div className={cn('w-12 h-12 rounded-lg flex items-center justify-center', iconColors[type])}>
            <IconComponent className="w-6 h-6" />
          </div>
        )}
      </div>
      {/* Name and mention - clickable to insert mention */}
      <button
        onClick={onClick}
        className="min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
      >
        <p className="text-white font-medium text-sm truncate">{name}</p>
        <p className={cn(
          'text-xs mt-0.5 font-mono',
          type === 'characters' ? (isGeneric ? 'text-purple-400' : 'text-blue-400') : type === 'locations' ? 'text-green-400' : 'text-orange-400'
        )}>
          {prefix}{generateReferenceName(name, prefix).slice(1)}
        </p>
      </button>
    </div>
  );
}

// Gallery Content
function GalleryContent({ projectId }: { projectId: string }) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { setSourceImageUrl, sourceImageUrl } = useRushCreatorStore();

  useEffect(() => {
    const fetchGallery = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/rush-creator/media?projectId=${projectId}&status=selected`);
        if (res.ok) {
          const data = await res.json();
          setImages(data.media || []);
        }
      } catch (error) {
        console.error('Failed to fetch gallery:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGallery();
  }, [projectId]);

  const handleSetAsReference = (url: string) => {
    setSourceImageUrl(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4">
      <p className="text-amber-400 text-xs mb-3 flex items-center gap-1.5">
        <ImagePlus className="w-3.5 h-3.5" />
        Cliquez sur une image pour l'utiliser comme référence
      </p>
      {images.length === 0 ? (
        <div className="text-center py-12">
          <Grid3X3 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">Aucune image dans la Gallery</p>
          <p className="text-slate-500 text-sm mt-1">
            Les images sélectionnées apparaîtront ici
          </p>
        </div>
      ) : (
        <>
          <p className="text-slate-400 text-sm mb-3">{images.length} élément{images.length > 1 ? 's' : ''} dans la Gallery</p>
          <div className="grid grid-cols-3 gap-2">
            {images.map((img) => {
              const isSelected = sourceImageUrl === img.url;
              return (
                <button
                  key={img.id}
                  onClick={() => handleSetAsReference(img.url)}
                  className={cn(
                    'relative group rounded-lg overflow-hidden transition-all',
                    isSelected ? 'ring-2 ring-amber-500 ring-offset-2 ring-offset-[#0d1520]' : 'hover:ring-2 hover:ring-white/30'
                  )}
                >
                  <StorageImg
                    src={img.url}
                    alt={img.prompt || 'Gallery image'}
                    className="w-full aspect-square object-cover"
                  />
                  <div className="absolute top-1 right-1">
                    {isSelected ? (
                      <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                        <ImagePlus className="w-3 h-3 text-white" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>
                  {/* Hover overlay with prompt and action */}
                  <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2">
                    <ImagePlus className="w-5 h-5 text-amber-400 mb-1" />
                    <p className="text-amber-400 text-xs font-medium">Référence</p>
                    {img.prompt && (
                      <p className="text-white text-xs line-clamp-2 mt-1 text-center">{img.prompt}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Rush Content
function RushContent({ projectId }: { projectId: string }) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { setSourceImageUrl, sourceImageUrl } = useRushCreatorStore();

  useEffect(() => {
    const fetchRush = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/rush-creator/media?projectId=${projectId}&status=rejected`);
        if (res.ok) {
          const data = await res.json();
          setImages(data.media || []);
        }
      } catch (error) {
        console.error('Failed to fetch rush:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRush();
  }, [projectId]);

  const handleSetAsReference = (url: string) => {
    setSourceImageUrl(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4">
      <p className="text-amber-400 text-xs mb-3 flex items-center gap-1.5">
        <ImagePlus className="w-3.5 h-3.5" />
        Cliquez sur une image pour l'utiliser comme référence
      </p>
      {images.length === 0 ? (
        <div className="text-center py-12">
          <Archive className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">Aucune image dans les Rush</p>
          <p className="text-slate-500 text-sm mt-1">
            Les images stockées apparaîtront ici
          </p>
        </div>
      ) : (
        <>
          <p className="text-slate-400 text-sm mb-3">{images.length} élément{images.length > 1 ? 's' : ''} dans les Rush</p>
          <div className="grid grid-cols-3 gap-2">
            {images.map((img) => {
              const isSelected = sourceImageUrl === img.url;
              return (
                <button
                  key={img.id}
                  onClick={() => handleSetAsReference(img.url)}
                  className={cn(
                    'relative group rounded-lg overflow-hidden transition-all',
                    isSelected ? 'ring-2 ring-amber-500 ring-offset-2 ring-offset-[#0d1520]' : 'hover:ring-2 hover:ring-white/30'
                  )}
                >
                  <StorageImg
                    src={img.url}
                    alt={img.prompt || 'Rush image'}
                    className="w-full aspect-square object-cover"
                  />
                  {isSelected && (
                    <div className="absolute top-1 right-1">
                      <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                        <ImagePlus className="w-3 h-3 text-white" />
                      </div>
                    </div>
                  )}
                  {/* Hover overlay with prompt and action */}
                  <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2">
                    <ImagePlus className="w-5 h-5 text-amber-400 mb-1" />
                    <p className="text-amber-400 text-xs font-medium">Référence</p>
                    {img.prompt && (
                      <p className="text-white text-xs line-clamp-2 mt-1 text-center">{img.prompt}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
