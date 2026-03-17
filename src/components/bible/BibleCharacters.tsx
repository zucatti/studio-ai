'use client';

import { useState, useEffect } from 'react';
import { useBibleStore, type CharacterImageType } from '@/store/bible-store';
import { BibleAssetCard } from './BibleAssetCard';
import { CharacterFormDialog } from './CharacterFormDialog';
import { User, Plus, Users, Mic, Baby, Radio, BookOpen, Check, AtSign, AlertCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { GlobalAsset } from '@/types/database';
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
import { GENERIC_CHARACTERS, type GenericCharacter } from '@/lib/generic-characters';
import { generateReferenceName } from '@/lib/reference-name';
import { cn } from '@/lib/utils';
import { useSignedUrlContext } from '@/contexts/signed-url-context';

// Icons for generic characters
const GENERIC_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  crowd: Users,
  voice: Mic,
  person: User,
  child: Baby,
  announcer: Radio,
  narrator: BookOpen,
};

interface BibleCharactersProps {
  projectId?: string;
  onInsertReference?: (reference: string) => void;
  showGlobalOnly?: boolean;
}

// Generic character card - compact design
function GenericCharacterCard({
  character,
  isInProject,
  isUsed,
  onImport,
  onRemove,
}: {
  character: GenericCharacter;
  isInProject?: boolean;
  isUsed?: boolean;
  onImport?: () => void;
  onRemove?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const Icon = GENERIC_ICONS[character.icon] || User;
  const referenceName = generateReferenceName(character.name);

  const handleCopyReference = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(referenceName);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        'relative p-3 rounded-lg border transition-all hover:bg-white/5',
        isInProject
          ? 'bg-purple-500/5 border-purple-500/30'
          : 'bg-white/5 border-white/10'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded-md bg-purple-500/20">
          <Icon className="w-3.5 h-3.5 text-purple-400" />
        </div>
        <span className="text-sm font-medium text-white flex-1">{character.name}</span>
        {/* Trash icon for remove */}
        {isInProject && !isUsed && onRemove && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(); }}
                  className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-[#1a2433] border-white/10">
                <p className="text-xs">Retirer du projet</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {/* Plus icon for import */}
        {!isInProject && onImport && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => { e.stopPropagation(); onImport(); }}
                  className="p-1 rounded text-slate-400 hover:text-green-400 hover:bg-green-500/10 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-[#1a2433] border-white/10">
                <p className="text-xs">Ajouter au projet</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Description */}
      <p className="text-[11px] text-slate-400 mb-3 line-clamp-2">{character.description}</p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleCopyReference}
                className="flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300"
              >
                <AtSign className="w-3 h-3" />
                <span className="font-mono">{referenceName.slice(1)}</span>
                {copied && <Check className="w-3 h-3 text-green-400" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-[#1a2433] border-white/10">
              <p className="text-xs">{copied ? 'Copié !' : 'Copier la référence'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Status badge for used characters */}
        {isInProject && isUsed && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-[10px] text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Utilisé
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-[#1a2433] border-white/10">
                <p className="text-xs">Ce personnage est utilisé dans le script</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}

export function BibleCharacters({ projectId, onInsertReference, showGlobalOnly = false }: BibleCharactersProps) {
  const {
    getAssetsByType,
    getProjectAssetsByType,
    isAssetInProject,
    importGlobalAsset,
    removeProjectAsset,
    deleteCharacter,
    projectGenericAssets,
    importGenericAsset,
    removeGenericAsset,
    isGenericAssetInProject,
    generateCharacterImages,
    isGenerating,
  } = useBibleStore();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<GlobalAsset | null>(null);
  const [deletingCharacter, setDeletingCharacter] = useState<GlobalAsset | null>(null);
  const [usedCharacterIds, setUsedCharacterIds] = useState<Set<string>>(new Set());
  const [generatingAssetId, setGeneratingAssetId] = useState<string | null>(null);
  const [generatingView, setGeneratingView] = useState<CharacterImageType | null>(null);

  // Fetch used characters
  useEffect(() => {
    if (projectId) {
      fetchUsedCharacters(projectId).then(setUsedCharacterIds);
    }
  }, [projectId]);

  const globalCharacters = getAssetsByType('character');
  const projectCharacters = projectId ? getProjectAssetsByType('character') : [];

  // Preload image URLs for all characters
  const { preloadUrls } = useSignedUrlContext();
  useEffect(() => {
    const allUrls: string[] = [];
    for (const character of [...globalCharacters, ...projectCharacters]) {
      if (character.reference_images) {
        allUrls.push(...character.reference_images.slice(0, 3)); // Only preload first 3 thumbnails
      }
    }
    if (allUrls.length > 0) {
      preloadUrls(allUrls);
    }
  }, [globalCharacters, projectCharacters, preloadUrls]);

  // Characters in project (custom)
  const inProjectCharacters = projectCharacters.map((pa) => ({
    ...pa,
    isInProject: true,
    projectAssetId: pa.project_asset_id,
  }));

  // Characters not in project (from library)
  // When no project is open, show ALL characters without filtering
  const libraryCharacters = projectId
    ? globalCharacters.filter((ga) => !isAssetInProject(ga.id))
    : globalCharacters;

  // Generic characters in project
  const genericInProject = projectId
    ? GENERIC_CHARACTERS.filter((g) => isGenericAssetInProject(g.id))
    : [];
  // Generic characters not in project
  // When no project is open, show ALL generic characters
  const genericNotInProject = projectId
    ? GENERIC_CHARACTERS.filter((g) => !isGenericAssetInProject(g.id))
    : GENERIC_CHARACTERS;

  const handleImport = async (globalAssetId: string) => {
    if (projectId) {
      await importGlobalAsset(projectId, globalAssetId);
    }
  };

  const handleRemove = async (projectAssetId: string) => {
    if (projectId) {
      await removeProjectAsset(projectId, projectAssetId);
    }
  };

  const handleImportGeneric = async (genericAssetId: string) => {
    if (projectId) {
      await importGenericAsset(projectId, genericAssetId);
    }
  };

  const handleRemoveGeneric = async (projectGenericAssetId: string) => {
    if (projectId) {
      await removeGenericAsset(projectId, projectGenericAssetId);
    }
  };

  const handleCreate = () => {
    setEditingCharacter(null);
    setIsFormOpen(true);
  };

  const handleEdit = (character: GlobalAsset) => {
    setEditingCharacter(character);
    setIsFormOpen(true);
  };

  const handleDelete = async () => {
    if (deletingCharacter) {
      await deleteCharacter(deletingCharacter.id);
      setDeletingCharacter(null);
    }
  };

  const handleFormClose = (open: boolean) => {
    setIsFormOpen(open);
    if (!open) {
      setEditingCharacter(null);
    }
  };

  const handleGenerateView = async (assetId: string, viewType: CharacterImageType) => {
    setGeneratingAssetId(assetId);
    setGeneratingView(viewType);
    try {
      await generateCharacterImages(assetId, {
        mode: 'generate_single',
        viewType,
        style: 'photorealistic',
      });
    } finally {
      setGeneratingAssetId(null);
      setGeneratingView(null);
    }
  };

  const isCharacterUsed = (characterId: string) => usedCharacterIds.has(characterId);

  const hasProjectCharacters = inProjectCharacters.length > 0 || genericInProject.length > 0;

  return (
    <div className="space-y-6">
      {/* Section: Dans le projet */}
      {projectId && hasProjectCharacters && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <h3 className="text-sm font-semibold text-white">
              Dans le projet
            </h3>
            <span className="text-xs text-slate-500">
              ({inProjectCharacters.length + genericInProject.length})
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {/* Custom characters in project */}
            {inProjectCharacters.map((character) => {
              const globalAsset = globalCharacters.find(ga => ga.id === character.id) || character as unknown as GlobalAsset;
              const isUsed = isCharacterUsed(character.id);
              const isGeneratingThis = generatingAssetId === character.id;
              return (
                <BibleAssetCard
                  key={character.id}
                  asset={character}
                  isInProject={true}
                  showProjectBadge={false}
                  onRemove={!isUsed && character.projectAssetId ? () => handleRemove(character.projectAssetId!) : undefined}
                  onEdit={() => handleEdit(globalAsset)}
                  onDelete={() => setDeletingCharacter(globalAsset)}
                  onInsertReference={onInsertReference}
                  onGenerate={(viewType) => handleGenerateView(character.id, viewType)}
                  isGenerating={isGeneratingThis}
                  generatingView={isGeneratingThis ? generatingView : null}
                />
              );
            })}
            {/* Generic characters in project */}
            {genericInProject.map((character) => {
              const projectAsset = projectGenericAssets.find((pa) => pa.id === character.id);
              const isUsed = isCharacterUsed(character.id);
              return (
                <GenericCharacterCard
                  key={character.id}
                  character={character}
                  isInProject={true}
                  isUsed={isUsed}
                  onRemove={!isUsed && projectAsset ? () => handleRemoveGeneric(projectAsset.project_generic_asset_id) : undefined}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Section: Bibliothèque */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            <h3 className="text-sm font-semibold text-white">
              Bibliothèque
            </h3>
            <span className="text-xs text-slate-500">
              ({libraryCharacters.length + genericNotInProject.length})
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCreate}
            className="h-7 border-white/10 text-slate-300 hover:bg-white/5"
          >
            <Plus className="w-3 h-3 mr-1" />
            Créer
          </Button>
        </div>

        {libraryCharacters.length === 0 && genericNotInProject.length === 0 ? (
          <div className="text-center py-8 bg-white/5 rounded-lg border border-white/10">
            <User className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <p className="text-sm text-slate-400">Bibliothèque vide</p>
            <p className="text-xs text-slate-500 mt-1">Tous les personnages sont dans le projet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Custom characters in library */}
            {libraryCharacters.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                  <User className="w-3 h-3" />
                  Mes personnages
                </p>
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {libraryCharacters.map((character) => {
                    const isGeneratingThis = generatingAssetId === character.id;
                    return (
                      <BibleAssetCard
                        key={character.id}
                        asset={character}
                        isInProject={false}
                        onImport={projectId ? () => handleImport(character.id) : undefined}
                        onEdit={() => handleEdit(character)}
                        onDelete={() => setDeletingCharacter(character)}
                        onInsertReference={onInsertReference}
                        onGenerate={(viewType) => handleGenerateView(character.id, viewType)}
                        isGenerating={isGeneratingThis}
                        generatingView={isGeneratingThis ? generatingView : null}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Generic characters in library */}
            {genericNotInProject.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                  <Users className="w-3 h-3 text-purple-400" />
                  <span className="text-purple-400">Personnages génériques</span>
                  <span className="text-slate-600">— pour dialogues de groupe, voix off, etc.</span>
                </p>
                <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                  {genericNotInProject.map((character) => (
                    <GenericCharacterCard
                      key={character.id}
                      character={character}
                      isInProject={false}
                      onImport={projectId ? () => handleImportGeneric(character.id) : undefined}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Character Form Dialog */}
      <CharacterFormDialog
        open={isFormOpen}
        onOpenChange={handleFormClose}
        character={editingCharacter}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingCharacter} onOpenChange={(open) => !open && setDeletingCharacter(null)}>
        <AlertDialogContent className="bg-[#0f1419] border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Supprimer le personnage</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Êtes-vous sûr de vouloir supprimer &quot;{deletingCharacter?.name}&quot; ? Cette action est
              irréversible et supprimera également toutes les images de référence associées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 text-slate-300 hover:bg-white/5">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Helper function to fetch used character IDs from the project
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
