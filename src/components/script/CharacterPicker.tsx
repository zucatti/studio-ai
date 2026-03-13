'use client';

import { useState, useEffect } from 'react';
import { User, ChevronDown, Plus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useBibleStore } from '@/store/bible-store';
import { cn } from '@/lib/utils';

interface Character {
  id: string;
  name: string;
  data?: {
    description?: string;
    reference_images?: string[];
  };
}

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
  const { projectAssets, fetchProjectAssets, setOpen: openBible, setActiveTab } = useBibleStore();

  // Get characters from Bible (project assets)
  const characters: Character[] = projectAssets
    .filter((asset) => asset.asset_type === 'character')
    .map((asset) => ({
      id: asset.id,
      name: asset.name,
      data: asset.data as Character['data'],
    }));

  useEffect(() => {
    if (projectId) {
      fetchProjectAssets(projectId);
    }
  }, [projectId, fetchProjectAssets]);

  const selectedCharacter = characters.find((c) => c.id === characterId);

  const handleSelect = (character: Character) => {
    onChange(character.id, character.name);
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
            !selectedCharacter && 'text-slate-500',
            className
          )}
        >
          <div className="flex items-center gap-2 truncate">
            <User className="w-4 h-4 flex-shrink-0 text-slate-400" />
            <span className="truncate uppercase">
              {selectedCharacter?.name || value || placeholder}
            </span>
          </div>
          <ChevronDown className="w-4 h-4 ml-2 flex-shrink-0 text-slate-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-0 bg-[#1a2433] border-white/10"
        align="start"
      >
        {characters.length === 0 ? (
          <div className="p-4 text-center">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-amber-500" />
            <p className="text-sm text-slate-400 mb-3">
              Aucun personnage dans la Bible
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenBible}
              className="gap-2 bg-blue-500/20 border-blue-500/30 text-blue-400 hover:bg-blue-500/30"
            >
              <Plus className="w-4 h-4" />
              Ajouter un personnage
            </Button>
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            {characters.map((character) => (
              <button
                key={character.id}
                onClick={() => handleSelect(character)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                  character.id === characterId
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'text-white hover:bg-white/5'
                )}
              >
                {character.data?.reference_images?.[0] ? (
                  <img
                    src={character.data.reference_images[0]}
                    alt={character.name}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                    <User className="w-4 h-4 text-slate-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium uppercase truncate">
                    {character.name}
                  </p>
                  {character.data?.description && (
                    <p className="text-xs text-slate-500 truncate">
                      {character.data.description}
                    </p>
                  )}
                </div>
              </button>
            ))}

            {/* Add character button */}
            <button
              onClick={handleOpenBible}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left border-t border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </div>
              <span className="text-sm">Ajouter un personnage...</span>
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
