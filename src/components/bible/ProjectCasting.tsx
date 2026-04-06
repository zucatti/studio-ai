'use client';

import { useState, useEffect, useMemo } from 'react';
import { User, Users, Star, Plus, Edit2, Copy, Trash2, Image as ImageIcon, Loader2, AtSign, Check, Mic, Baby, Radio, BookOpen, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StorageThumbnail } from '@/components/ui/storage-image';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBibleStore, type ImportedGenericCharacter } from '@/store/bible-store';
import { generateReferenceName } from '@/lib/reference-name';
import { CharacterEditor } from './CharacterEditor';
import { cn } from '@/lib/utils';
import { GENERIC_CHARACTERS, type GenericCharacter } from '@/lib/generic-characters';
import { toast } from 'sonner';
import type { ProjectAssetFlat } from '@/types/database';

// Icons for generic characters
const GENERIC_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  crowd: Users,
  voice: Mic,
  person: User,
  child: Baby,
  announcer: Radio,
  narrator: BookOpen,
};

interface ProjectCastingProps {
  projectId: string;
  searchQuery: string;
  onOpenGlobalBible: () => void;
}

export function ProjectCasting({ projectId, searchQuery, onOpenGlobalBible }: ProjectCastingProps) {
  const {
    projectAssets,
    projectGenericAssets,
    removeProjectAsset,
    removeGenericAsset,
    duplicateGenericAsset,
    generateGenericCharacterImages,
    importGenericAsset,
  } = useBibleStore();

  const [editingCharacter, setEditingCharacter] = useState<{
    type: 'custom' | 'generic';
    id: string;
    projectAssetId: string;
  } | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [usedCharacterIds, setUsedCharacterIds] = useState<Set<string>>(new Set());

  // State for adding a new figurant
  const [selectedType, setSelectedType] = useState<string>('');
  const [figurantName, setFigurantName] = useState<string>('');
  const [figurantDescription, setFigurantDescription] = useState<string>('');
  const [isAddingFigurant, setIsAddingFigurant] = useState(false);

  // Fetch used characters
  useEffect(() => {
    fetchUsedCharacters(projectId).then(setUsedCharacterIds);
  }, [projectId]);

  // Generate auto-incremented name based on type (format: Femme#1, Femme#2, etc.)
  const getNextFigurantName = (genericId: string): string => {
    const genericChar = GENERIC_CHARACTERS.find(g => g.id === genericId);
    if (!genericChar) return '';

    // Use proper capitalization: FEMME -> Femme
    const baseName = genericChar.name.charAt(0).toUpperCase() + genericChar.name.slice(1).toLowerCase();

    // Get all existing names for this type (both name_override and original name)
    const existingNames = new Set(
      projectGenericAssets
        .filter(a => a.id === genericId)
        .map(a => (a.name_override || a.name).toLowerCase())
    );

    // Find next available number
    let num = 1;
    while (existingNames.has(`${baseName.toLowerCase()}#${num}`)) {
      num++;
    }

    return `${baseName}#${num}`;
  };

  // Update name when type changes
  useEffect(() => {
    if (selectedType) {
      setFigurantName(getNextFigurantName(selectedType));
    } else {
      setFigurantName('');
    }
  }, [selectedType, projectGenericAssets]);

  // Handle adding a figurant
  const handleAddFigurant = async () => {
    if (!selectedType || !figurantName.trim()) return;

    setIsAddingFigurant(true);
    try {
      const result = await importGenericAsset(
        projectId,
        selectedType,
        figurantName.trim(),
        figurantDescription.trim() ? { visual_description: figurantDescription.trim() } : undefined
      );

      if (result) {
        toast.success(`Figurant "${figurantName}" ajoute`);
        setSelectedType('');
        setFigurantName('');
        setFigurantDescription('');
      } else {
        toast.error('Erreur lors de l\'ajout du figurant');
      }
    } finally {
      setIsAddingFigurant(false);
    }
  };

  const characters = projectAssets.filter(a => a.asset_type === 'character');

  // Filter by search query
  const filterBySearch = <T extends { name: string }>(items: T[]): T[] => {
    if (!searchQuery) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(item => item.name.toLowerCase().includes(query));
  };

  // Helper to check if a character has reference images
  // Characters store images in data.reference_images_metadata, not in reference_images
  const hasImages = (character: ProjectAssetFlat): boolean => {
    // Check data.reference_images_metadata first (where characters actually store images)
    const data = character.data as Record<string, unknown>;
    const refImagesMetadata = data?.reference_images_metadata as Array<{ type: string; url: string }> | undefined;
    if (Array.isArray(refImagesMetadata) && refImagesMetadata.length > 0) {
      return true;
    }
    // Fallback to top-level reference_images (for other asset types)
    return Array.isArray(character.reference_images) && character.reference_images.length > 0;
  };

  // Starring = characters with reference images
  const starringCustom = useMemo(() =>
    filterBySearch(characters.filter(c => hasImages(c)))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [characters, searchQuery]
  );

  // Only show generic characters with name_override (real figurants, not base types)
  const starringGeneric = useMemo(() =>
    filterBySearch(projectGenericAssets.filter(g => g.name_override && g.hasReferenceImages))
      .sort((a, b) => (a.name_override || a.name).localeCompare(b.name_override || b.name, 'fr')),
    [projectGenericAssets, searchQuery]
  );

  // People = characters without reference images
  const peopleCustom = useMemo(() =>
    filterBySearch(characters.filter(c => !hasImages(c)))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [characters, searchQuery]
  );

  // Only show generic characters with name_override (real figurants, not base types)
  const peopleGeneric = useMemo(() =>
    filterBySearch(projectGenericAssets.filter(g => g.name_override && !g.hasReferenceImages))
      .sort((a, b) => (a.name_override || a.name).localeCompare(b.name_override || b.name, 'fr')),
    [projectGenericAssets, searchQuery]
  );

  const hasStarring = starringCustom.length > 0 || starringGeneric.length > 0;
  const hasPeople = peopleCustom.length > 0 || peopleGeneric.length > 0;

  const handleRemoveCustom = async (projectAssetId: string) => {
    await removeProjectAsset(projectId, projectAssetId);
  };

  const handleRemoveGeneric = async (projectGenericAssetId: string) => {
    await removeGenericAsset(projectId, projectGenericAssetId);
  };

  const handleDuplicateGeneric = async (projectGenericAssetId: string, currentName: string) => {
    const newName = prompt(`Dupliquer "${currentName}"\n\nNouveau nom (ex: ${currentName} #2, ${currentName} AGE):`, `${currentName} #2`);
    if (!newName || newName.trim().length === 0) return;

    setDuplicatingId(projectGenericAssetId);
    try {
      await duplicateGenericAsset(projectId, projectGenericAssetId, newName.trim());
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleGenerateImages = async (projectGenericAssetId: string) => {
    setGeneratingId(projectGenericAssetId);
    try {
      await generateGenericCharacterImages(projectId, projectGenericAssetId, {
        mode: 'generate_single',
        viewType: 'front',
        style: 'photorealistic',
      });
    } finally {
      setGeneratingId(null);
    }
  };

  const isCharacterUsed = (id: string) => usedCharacterIds.has(id);

  if (!hasStarring && !hasPeople) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Users className="w-12 h-12 text-slate-500 mb-3" />
        <p className="text-slate-400 text-sm">Aucun personnage dans ce projet</p>
        <p className="text-slate-500 text-xs mt-1">
          Importez des personnages depuis la Bible generale
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenGlobalBible}
          className="mt-4 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
        >
          <Plus className="w-4 h-4 mr-2" />
          Importer depuis la Bible
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Starring Section */}
      {hasStarring && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 rounded-md bg-amber-500/20">
              <Star className="w-4 h-4 text-amber-400" />
            </div>
            <h3 className="text-sm font-semibold text-white">Starring</h3>
            <span className="text-xs text-slate-500">
              ({starringCustom.length + starringGeneric.length})
            </span>
            <span className="text-xs text-slate-600 ml-2">
              Personnages avec portraits de reference
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {starringCustom.map((char) => (
              <CustomCharacterCard
                key={char.id}
                character={char}
                isUsed={isCharacterUsed(char.id)}
                onRemove={!isCharacterUsed(char.id) ? () => handleRemoveCustom(char.project_asset_id) : undefined}
              />
            ))}
            {starringGeneric.map((char) => (
              <GenericCharacterCard
                key={char.project_generic_asset_id}
                character={char}
                isUsed={isCharacterUsed(char.id)}
                isStarring={true}
                onEdit={() => setEditingCharacter({ type: 'generic', id: char.id, projectAssetId: char.project_generic_asset_id })}
                onDuplicate={() => handleDuplicateGeneric(char.project_generic_asset_id, char.name_override || char.name)}
                onRemove={!isCharacterUsed(char.id) ? () => handleRemoveGeneric(char.project_generic_asset_id) : undefined}
                isDuplicating={duplicatingId === char.project_generic_asset_id}
              />
            ))}
          </div>
        </div>
      )}

      {/* People Section */}
      {hasPeople && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 rounded-md bg-slate-500/20">
              <Users className="w-4 h-4 text-slate-400" />
            </div>
            <h3 className="text-sm font-semibold text-white">Figurants</h3>
            <span className="text-xs text-slate-500">
              ({peopleCustom.length + peopleGeneric.length})
            </span>
            <span className="text-xs text-slate-600 ml-2">
              Sans portraits - generez-en pour les passer en Starring
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-2">
            {peopleCustom.map((char) => (
              <CustomCharacterCard
                key={char.id}
                character={char}
                isUsed={isCharacterUsed(char.id)}
                compact={true}
                onRemove={!isCharacterUsed(char.id) ? () => handleRemoveCustom(char.project_asset_id) : undefined}
              />
            ))}
            {peopleGeneric.map((char) => (
              <GenericCharacterCard
                key={char.project_generic_asset_id}
                character={char}
                isUsed={isCharacterUsed(char.id)}
                isStarring={false}
                compact={true}
                onEdit={() => setEditingCharacter({ type: 'generic', id: char.id, projectAssetId: char.project_generic_asset_id })}
                onRemove={!isCharacterUsed(char.id) ? () => handleRemoveGeneric(char.project_generic_asset_id) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Add Figurant Section */}
      <div className="pt-4 border-t border-white/10">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-md bg-purple-500/20">
            <UserPlus className="w-4 h-4 text-purple-400" />
          </div>
          <h3 className="text-sm font-semibold text-white">Ajouter un figurant</h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Type selector */}
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-[140px] bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="Type..." />
            </SelectTrigger>
            <SelectContent className="bg-[#1a2433] border-white/10">
              {GENERIC_CHARACTERS.map((gc) => {
                const Icon = GENERIC_ICONS[gc.icon] || User;
                return (
                  <SelectItem key={gc.id} value={gc.id} className="text-white focus:bg-white/10">
                    <div className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5 text-purple-400" />
                      <span>{gc.name}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {/* Name input */}
          <Input
            value={figurantName}
            onChange={(e) => setFigurantName(e.target.value)}
            placeholder="Nom..."
            className="w-[140px] bg-white/5 border-white/10 text-white placeholder:text-slate-500"
            disabled={!selectedType}
          />

          {/* Description input */}
          <Input
            value={figurantDescription}
            onChange={(e) => setFigurantDescription(e.target.value)}
            placeholder="Description (40 ans, blonde...)"
            className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-slate-500"
            disabled={!selectedType}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && selectedType && figurantName.trim()) {
                handleAddFigurant();
              }
            }}
          />

          {/* Add button */}
          <Button
            onClick={handleAddFigurant}
            disabled={!selectedType || !figurantName.trim() || isAddingFigurant}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {isAddingFigurant ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Character Editor Dialog */}
      {editingCharacter && (
        <CharacterEditor
          projectId={projectId}
          characterType={editingCharacter.type}
          characterId={editingCharacter.id}
          projectAssetId={editingCharacter.projectAssetId}
          open={true}
          onOpenChange={(open) => !open && setEditingCharacter(null)}
        />
      )}
    </div>
  );
}

// Custom character card (from global assets)
function CustomCharacterCard({
  character,
  isUsed,
  compact = false,
  onEdit,
  onRemove,
}: {
  character: ProjectAssetFlat;
  isUsed: boolean;
  compact?: boolean;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const reference = generateReferenceName(character.name);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(reference);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Get character data
  const data = character.data as Record<string, unknown>;

  // Get character image from data.reference_images_metadata (where characters store images)
  const refImagesMetadata = data?.reference_images_metadata as Array<{ type: string; url: string }> | undefined;
  const frontImage = refImagesMetadata?.find(img => img.type === 'front')?.url;
  const firstImage = frontImage || refImagesMetadata?.[0]?.url || character.reference_images?.[0];

  // Gender-based color coding
  const gender = (data?.gender as string)?.toLowerCase();
  const isFemale = gender === 'female' || gender === 'femme' || gender === 'f';
  const colorClass = isFemale
    ? 'bg-pink-500/20 text-pink-400'
    : 'bg-blue-500/20 text-blue-400';

  if (compact) {
    return (
      <div className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
        <div className="flex items-center gap-2">
          {firstImage ? (
            <StorageThumbnail
              src={firstImage}
              alt={character.name}
              size={32}
              className="w-8 h-8 rounded flex-shrink-0 object-cover"
              objectPosition="center top"
            />
          ) : (
            <div className={cn('w-8 h-8 rounded flex items-center justify-center flex-shrink-0', colorClass)}>
              <User className="w-4 h-4" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">{character.name}</p>
            <button onClick={handleCopy} className={cn('flex items-center gap-1 text-[10px] hover:opacity-80', isFemale ? 'text-pink-400' : 'text-blue-400')}>
              <AtSign className="w-2.5 h-2.5" />
              <span className="font-mono truncate">{reference.slice(1)}</span>
              {copied && <Check className="w-2.5 h-2.5 text-green-400" />}
            </button>
          </div>
          {!isUsed && onRemove && (
            <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-1 text-slate-400 hover:text-red-400">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
      <div className="flex items-start gap-3">
        {firstImage ? (
          <StorageThumbnail
            src={firstImage}
            alt={character.name}
            size={56}
            className="w-14 h-14 rounded-lg flex-shrink-0 object-cover"
            objectPosition="center top"
          />
        ) : (
          <div className={cn('w-14 h-14 rounded-lg flex items-center justify-center flex-shrink-0', colorClass)}>
            <User className="w-6 h-6" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{character.name}</p>
          <button onClick={handleCopy} className={cn('flex items-center gap-1 mt-0.5 text-xs hover:opacity-80', isFemale ? 'text-pink-400' : 'text-blue-400')}>
            <AtSign className="w-3 h-3" />
            <span className="font-mono">{reference.slice(1)}</span>
            {copied && <Check className="w-3 h-3 text-green-400" />}
          </button>
        </div>
        <div className="flex items-center gap-1">
          {!isUsed && onRemove && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={onRemove} className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-[#1a2433] border-white/10">
                  <p className="text-xs">Retirer</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    </div>
  );
}

// Generic character card
function GenericCharacterCard({
  character,
  isUsed,
  isStarring,
  compact = false,
  onEdit,
  onDuplicate,
  onGenerateImages,
  onRemove,
  isDuplicating,
  isGenerating,
}: {
  character: ImportedGenericCharacter;
  isUsed: boolean;
  isStarring: boolean;
  compact?: boolean;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onGenerateImages?: () => void;
  onRemove?: () => void;
  isDuplicating?: boolean;
  isGenerating?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const displayName = character.name_override || character.name;
  const reference = generateReferenceName(displayName);
  const Icon = GENERIC_ICONS[character.icon] || User;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(reference);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Get visual description for display
  const visualDesc = character.local_overrides?.visual_description || character.description || '';

  if (compact) {
    return (
      <div className={cn(
        'p-2 rounded-lg border transition-colors',
        character.name_override
          ? 'bg-purple-500/5 border-purple-500/20 hover:bg-purple-500/10'
          : 'bg-white/5 border-white/10 hover:bg-white/10'
      )}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-purple-500/20 flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">{displayName}</p>
            {visualDesc && (
              <p className="text-[10px] text-slate-400 truncate" title={visualDesc}>{visualDesc}</p>
            )}
            <button onClick={handleCopy} className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300">
              <AtSign className="w-2.5 h-2.5" />
              <span className="font-mono truncate">{reference.slice(1)}</span>
              {copied && <Check className="w-2.5 h-2.5 text-green-400" />}
            </button>
          </div>
          <div className="flex items-center gap-0.5">
            {/* Edit button */}
            {onEdit && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(e) => { e.stopPropagation(); onEdit(); }}
                      className="p-1 text-slate-400 hover:text-white"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-[#1a2433] border-white/10">
                    <p className="text-xs">Modifier</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {/* Generate images button (only for People) */}
            {!isStarring && onGenerateImages && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(e) => { e.stopPropagation(); onGenerateImages(); }}
                      disabled={isGenerating}
                      className="p-1 text-amber-400 hover:text-amber-300 disabled:opacity-50"
                    >
                      {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-[#1a2433] border-white/10">
                    <p className="text-xs">Generer portrait</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {onDuplicate && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                      disabled={isDuplicating}
                      className="p-1 text-slate-400 hover:text-white disabled:opacity-50"
                    >
                      {isDuplicating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-[#1a2433] border-white/10">
                    <p className="text-xs">Dupliquer</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {!isUsed && onRemove && (
              <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-1 text-slate-400 hover:text-red-400">
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Full card for Starring
  return (
    <div className={cn(
      'p-3 rounded-lg border transition-colors',
      character.name_override
        ? 'bg-purple-500/5 border-purple-500/20 hover:bg-purple-500/10'
        : 'bg-white/5 border-white/10 hover:bg-white/10'
    )}>
      <div className="flex items-start gap-3">
        {character.reference_images?.[0] ? (
          <StorageThumbnail
            src={character.reference_images[0]}
            alt={displayName}
            size={56}
            className="rounded-lg flex-shrink-0"
            objectPosition="center top"
          />
        ) : (
          <div className="w-14 h-14 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
            <Icon className="w-6 h-6 text-purple-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{displayName}</p>
          {character.name_override && (
            <p className="text-[10px] text-slate-500 truncate">base: {character.originalName || character.name}</p>
          )}
          {visualDesc && (
            <p className="text-xs text-slate-400 truncate mt-0.5" title={visualDesc}>{visualDesc}</p>
          )}
          <button onClick={handleCopy} className="flex items-center gap-1 mt-0.5 text-xs text-purple-400 hover:text-purple-300">
            <AtSign className="w-3 h-3" />
            <span className="font-mono">{reference.slice(1)}</span>
            {copied && <Check className="w-3 h-3 text-green-400" />}
          </button>
        </div>
        <div className="flex items-center gap-1">
          {onEdit && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={onEdit} className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/10">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-[#1a2433] border-white/10">
                  <p className="text-xs">Modifier</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {onDuplicate && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onDuplicate}
                    disabled={isDuplicating}
                    className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-50"
                  >
                    {isDuplicating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-[#1a2433] border-white/10">
                  <p className="text-xs">Dupliquer</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {!isUsed && onRemove && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={onRemove} className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-[#1a2433] border-white/10">
                  <p className="text-xs">Retirer</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper function to fetch used character IDs
async function fetchUsedCharacters(projectId: string): Promise<Set<string>> {
  try {
    const res = await fetch(`/api/projects/${projectId}/used-characters`);
    if (res.ok) {
      const data = await res.json();
      return new Set(data.characterIds || []);
    }
  } catch (error) {
    console.error('Error fetching used characters:', error);
  }
  return new Set();
}
