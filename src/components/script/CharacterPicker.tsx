'use client';

import { useState, useEffect } from 'react';
import { User, ChevronDown, Plus, Users, Mic, Baby, Radio, BookOpen } from 'lucide-react';
import { StorageThumbnail } from '@/components/ui/storage-image';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useBibleStore, type ImportedGenericCharacter } from '@/store/bible-store';
import { cn } from '@/lib/utils';
import {
  GENERIC_CHARACTERS,
  isGenericCharacter,
  getGenericCharacter,
  type GenericCharacter,
} from '@/lib/generic-characters';

interface Character {
  id: string;
  name: string;
  data?: {
    description?: string;
    reference_images?: string[];
  };
}

// Icons for generic characters
const GENERIC_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  crowd: Users,
  voice: Mic,
  person: User,
  child: Baby,
  announcer: Radio,
  narrator: BookOpen,
};

interface CharacterPickerProps {
  projectId: string;
  value: string | null;
  characterId: string | null;
  onChange: (characterId: string, characterName: string) => void;
  placeholder?: string;
  className?: string;
}

export function CharacterPicker({
  projectId,
  value,
  characterId,
  onChange,
  placeholder = 'Selectionner un personnage',
  className,
}: CharacterPickerProps) {
  const [open, setOpen] = useState(false);
  const {
    projectAssets,
    projectGenericAssets,
    fetchProjectAssets,
    fetchProjectGenericAssets,
    setOpen: openBible,
    setActiveTab,
  } = useBibleStore();

  // Get characters from Bible (project assets)
  const characters: Character[] = projectAssets
    .filter((asset) => asset.asset_type === 'character')
    .map((asset) => ({
      id: asset.id,
      name: asset.name,
      data: asset.data as Character['data'],
    }));

  // Get imported generic characters IDs
  const importedGenericIds = new Set(projectGenericAssets.map((pa) => pa.id));

  useEffect(() => {
    if (projectId) {
      fetchProjectAssets(projectId);
      fetchProjectGenericAssets(projectId);
    }
  }, [projectId, fetchProjectAssets, fetchProjectGenericAssets]);

  const selectedCharacter = characters.find((c) => c.id === characterId);
  const selectedGeneric = characterId ? getGenericCharacter(characterId) : undefined;

  const handleSelect = (character: Character) => {
    onChange(character.id, character.name);
    setOpen(false);
  };

  const handleSelectGeneric = (generic: GenericCharacter) => {
    onChange(generic.id, generic.name);
    setOpen(false);
  };

  const handleOpenBible = () => {
    setOpen(false);
    setActiveTab('characters');
    openBible(true);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'justify-between bg-white/5 border-white/10 text-white hover:bg-white/10',
            !selectedCharacter && !selectedGeneric && 'text-slate-500',
            className
          )}
        >
          <div className="flex items-center gap-2 truncate">
            {selectedGeneric ? (
              (() => {
                const GenericIcon = GENERIC_ICONS[selectedGeneric.icon] || User;
                return <GenericIcon className="w-4 h-4 flex-shrink-0 text-purple-400" />;
              })()
            ) : (
              <User className="w-4 h-4 flex-shrink-0 text-slate-400" />
            )}
            <span className={cn(
              'truncate uppercase',
              selectedGeneric && 'text-purple-300'
            )}>
              {selectedCharacter?.name || selectedGeneric?.name || value || placeholder}
            </span>
          </div>
          <ChevronDown className="w-4 h-4 ml-2 flex-shrink-0 text-slate-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0 bg-[#1a2433] border-white/10 z-50"
        align="start"
        sideOffset={4}
      >
        <div className="max-h-80 overflow-y-auto">
          {/* Bible characters section */}
          {characters.length > 0 && (
            <>
              <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-white/5">
                Personnages du projet
              </div>
              {characters.map((character) => (
                <div
                  key={character.id}
                  role="button"
                  tabIndex={0}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(character);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelect(character);
                    }
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer select-none',
                    character.id === characterId
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'text-white hover:bg-white/5'
                  )}
                >
                  {character.data?.reference_images?.[0] ? (
                    <StorageThumbnail
                      src={character.data.reference_images[0]}
                      alt={character.name}
                      size={32}
                      className="rounded-full pointer-events-none"
                      objectPosition="center top"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center pointer-events-none">
                      <User className="w-4 h-4 text-slate-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 pointer-events-none">
                    <p className="text-sm font-medium uppercase truncate">
                      {character.name}
                    </p>
                    {character.data?.description && (
                      <p className="text-xs text-slate-500 truncate">
                        {character.data.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Generic characters section - only imported ones */}
          {importedGenericIds.size > 0 && (
            <>
              <div className="px-3 py-2 text-xs font-semibold text-purple-400 uppercase tracking-wider bg-purple-500/10 border-t border-white/10">
                Personnages generiques
              </div>
              {GENERIC_CHARACTERS.filter(g => importedGenericIds.has(g.id)).map((generic) => {
                const GenericIcon = GENERIC_ICONS[generic.icon] || User;
                return (
                  <div
                    key={generic.id}
                    role="button"
                    tabIndex={0}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectGeneric(generic);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectGeneric(generic);
                      }
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer select-none',
                      generic.id === characterId
                        ? 'bg-purple-500/20 text-purple-300'
                        : 'text-slate-300 hover:bg-white/5'
                    )}
                  >
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center pointer-events-none',
                      generic.id === characterId ? 'bg-purple-500/30' : 'bg-purple-500/15'
                    )}>
                      <GenericIcon className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0 pointer-events-none">
                      <p className="text-sm font-medium uppercase truncate">
                        {generic.name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {generic.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* Empty state */}
          {characters.length === 0 && importedGenericIds.size === 0 && (
            <div className="px-3 py-6 text-center text-sm text-slate-500">
              Aucun personnage dans le projet.
              <br />
              Importez-en depuis la Bible.
            </div>
          )}

          {/* Add character button */}
          <div
            role="button"
            tabIndex={0}
            onMouseDown={(e) => {
              e.preventDefault();
              handleOpenBible();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleOpenBible();
              }
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left border-t border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer select-none"
          >
            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center pointer-events-none">
              <Plus className="w-4 h-4" />
            </div>
            <span className="text-sm pointer-events-none">Créer un personnage dans la Bible...</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
