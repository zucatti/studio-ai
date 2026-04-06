'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, GripVertical, X, User, Type, MessageSquare, ArrowRight, StickyNote, MoreHorizontal, Trash2, Users, Mic, Baby, Radio, BookOpen } from 'lucide-react';
import { useBibleStore, type ImportedGenericCharacter } from '@/store/bible-store';
import { DIALOGUE_EXTENSIONS, type ScriptElement, type ScriptElementType, type DialogueExtension } from '@/types/script';
import type { ProjectAssetFlat } from '@/types/database';
import { getGenericCharacter, isGenericCharacter } from '@/lib/generic-characters';
import { cn } from '@/lib/utils';
import { MentionInput } from './MentionInput';

// Icons for generic characters
const GENERIC_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  crowd: Users,
  voice: Mic,
  person: User,
  child: Baby,
  announcer: Radio,
  narrator: BookOpen,
};

interface NotionScriptEditorProps {
  projectId: string;
  sceneId: string;
  elements: ScriptElement[];
  onAddElement: (type: ScriptElementType, content?: string) => void;
  onUpdateElement: (elementId: string, updates: Partial<ScriptElement>) => void;
  onDeleteElement: (elementId: string) => void;
}

const ELEMENT_CONFIG: Record<ScriptElementType, {
  icon: typeof Type;
  label: string;
  color: string;
  placeholder: string;
}> = {
  action: {
    icon: Type,
    label: 'Action',
    color: 'text-emerald-400',
    placeholder: 'Decrivez l\'action...',
  },
  dialogue: {
    icon: MessageSquare,
    label: 'Dialogue',
    color: 'text-blue-400',
    placeholder: 'Ecrivez le dialogue...',
  },
  transition: {
    icon: ArrowRight,
    label: 'Transition',
    color: 'text-purple-400',
    placeholder: 'CUT TO:',
  },
  note: {
    icon: StickyNote,
    label: 'Note',
    color: 'text-amber-400',
    placeholder: 'Ajoutez une note...',
  },
};

// Inline editable text component
function InlineEdit({
  value,
  onChange,
  placeholder,
  multiline = false,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  className?: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if (multiline && inputRef.current instanceof HTMLTextAreaElement) {
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
      }
    }
  }, [isEditing, multiline]);

  const handleBlur = () => {
    setIsEditing(false);
    if (localValue !== value) {
      onChange(localValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setLocalValue(value);
      setIsEditing(false);
    }
    if (e.key === 'Enter' && !multiline) {
      handleBlur();
    }
  };

  if (isEditing) {
    const Component = multiline ? 'textarea' : 'input';
    return (
      <Component
        ref={inputRef as any}
        value={localValue}
        onChange={(e) => {
          setLocalValue(e.target.value);
          if (multiline && e.target instanceof HTMLTextAreaElement) {
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
          }
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn(
          'w-full bg-transparent border-none outline-none resize-none',
          'text-white placeholder:text-slate-600',
          'focus:ring-0',
          className
        )}
        rows={multiline ? 1 : undefined}
      />
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className={cn(
        'cursor-text min-h-[24px]',
        !value && 'text-slate-600',
        className
      )}
    >
      {value || placeholder}
    </div>
  );
}

// Character tag component - receives characters list from parent
function CharacterTag({
  characterId,
  characterName,
  characters,
  projectGenericAssets,
  isLoading,
  onRemove,
  onSelect,
}: {
  characterId: string | null;
  characterName: string | null;
  characters: ProjectAssetFlat[];
  projectGenericAssets: ImportedGenericCharacter[];
  isLoading?: boolean;
  onRemove: () => void;
  onSelect: (id: string, name: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Get figurants with name_override only (not base types like FEMME)
  const figurants = projectGenericAssets.filter((pa) => pa.name_override);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check if selected character is a figurant or generic
  const selectedFigurant = figurants.find((f) => f.project_generic_asset_id === characterId);
  const isGeneric = selectedFigurant ? true : (characterId ? isGenericCharacter(characterId) : false);
  const genericChar = selectedFigurant ? getGenericCharacter(selectedFigurant.id) : (characterId ? getGenericCharacter(characterId) : undefined);
  const GenericIcon = genericChar ? (GENERIC_ICONS[genericChar.icon] || User) : User;

  if (characterName) {
    return (
      <span className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium",
        isGeneric ? "bg-purple-500/20 text-purple-300" : "bg-blue-500/20 text-blue-300"
      )}>
        {isGeneric ? <GenericIcon className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
        <span className="uppercase">{characterName}</span>
        <button
          onClick={onRemove}
          className="ml-0.5 hover:text-white transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </span>
    );
  }

  return (
    <div className="relative" ref={pickerRef}>
      <button
        type="button"
        onClick={() => setShowPicker(!showPicker)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-dashed border-slate-600 text-slate-500 text-sm hover:border-blue-500/50 hover:text-blue-400 transition-colors"
      >
        <User className="w-3.5 h-3.5" />
        <span>Personnage</span>
      </button>

      {showPicker && (
        <div className="absolute top-full left-0 mt-2 w-64 rounded-lg bg-[#1e293b] border border-white/10 shadow-xl z-50 overflow-hidden">
          <div className="max-h-80 overflow-y-auto">
            {/* Custom characters section */}
            {characters.length > 0 && (
              <>
                <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-white/5">
                  Personnages du projet
                </div>
                {characters.map((char) => (
                  <button
                    key={char.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={() => {
                      console.log('[CharacterTag] Selecting character:', char.id, char.name);
                      onSelect(char.id, char.name);
                      setTimeout(() => setShowPicker(false), 10);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-white hover:bg-white/5 transition-colors"
                  >
                    <User className="w-4 h-4 text-blue-400" />
                    <span className="uppercase">{char.name}</span>
                  </button>
                ))}
              </>
            )}

            {/* Figurants section - only those with name_override */}
            {figurants.length > 0 && (
              <>
                <div className="px-3 py-2 text-xs font-semibold text-purple-400 uppercase tracking-wider bg-purple-500/10 border-t border-white/10">
                  Figurants
                </div>
                {figurants.map((figurant) => {
                  const generic = getGenericCharacter(figurant.id);
                  const Icon = generic ? (GENERIC_ICONS[generic.icon] || User) : User;
                  return (
                    <button
                      key={figurant.project_generic_asset_id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={() => {
                        console.log('[CharacterTag] Selecting figurant:', figurant.project_generic_asset_id, figurant.name_override);
                        onSelect(figurant.project_generic_asset_id, figurant.name_override!);
                        setTimeout(() => setShowPicker(false), 10);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/5 transition-colors"
                    >
                      <Icon className="w-4 h-4 text-purple-400" />
                      <span className="uppercase">{figurant.name_override}</span>
                    </button>
                  );
                })}
              </>
            )}

            {/* Empty state */}
            {characters.length === 0 && figurants.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-slate-500">
                Aucun personnage. Importez-en depuis la Bible.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Single element block
function ElementBlock({
  element,
  allAssets,
  characters,
  projectGenericAssets,
  isLoading,
  onUpdate,
  onDelete,
}: {
  element: ScriptElement;
  allAssets: ProjectAssetFlat[];
  characters: ProjectAssetFlat[];
  projectGenericAssets: ImportedGenericCharacter[];
  isLoading?: boolean;
  onUpdate: (updates: Partial<ScriptElement>) => void;
  onDelete: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const config = ELEMENT_CONFIG[element.type];
  const Icon = config.icon;

  return (
    <div
      className="group relative flex gap-2 py-2 -mx-2 px-2 rounded-lg hover:bg-white/[0.02] transition-colors"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowMenu(false);
      }}
    >
      {/* Drag handle + type indicator */}
      <div className={cn(
        'flex items-start gap-1 pt-1 opacity-0 group-hover:opacity-100 transition-opacity',
        isHovered && 'opacity-100'
      )}>
        <button className="p-0.5 text-slate-600 hover:text-slate-400 cursor-grab">
          <GripVertical className="w-4 h-4" />
        </button>
        <div className={cn('p-1 rounded', config.color, 'opacity-60')}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {element.type === 'dialogue' ? (
          <div className="space-y-2">
            {/* Character tag + extensions */}
            <div className="flex items-center gap-3">
              <CharacterTag
                characterId={element.character_id ?? null}
                characterName={element.character_name ?? null}
                characters={characters}
                projectGenericAssets={projectGenericAssets}
                isLoading={isLoading}
                onRemove={() => onUpdate({ character_id: null, character_name: null })}
                onSelect={(id, name) => onUpdate({ character_id: id, character_name: name })}
              />

              {/* Dialogue extensions */}
              {element.character_id && (
                <div className="inline-flex flex-wrap gap-0.5 rounded-md bg-slate-800/50 p-0.5 border border-white/10">
                  {/* On-screen (default) */}
                  <button
                    type="button"
                    onClick={() => onUpdate({ extension: null })}
                    title="Personnage visible à l'écran"
                    className={cn(
                      'px-2 py-0.5 text-[10px] font-medium rounded transition-all',
                      !element.extension
                        ? 'bg-green-600/80 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    )}
                  >
                    À l'écran
                  </button>
                  {/* All dialogue extensions */}
                  {DIALOGUE_EXTENSIONS.map((ext) => (
                    <button
                      key={ext.value}
                      type="button"
                      onClick={() => onUpdate({ extension: ext.value as DialogueExtension })}
                      title={ext.description}
                      className={cn(
                        'px-2 py-0.5 text-[10px] font-medium rounded transition-all',
                        element.extension === ext.value
                          ? ext.value === 'Hors champ'
                            ? 'bg-amber-600/80 text-white'
                            : ext.value === 'Voix off'
                            ? 'bg-purple-600/80 text-white'
                            : 'bg-blue-600/80 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      )}
                    >
                      {ext.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Parenthetical */}
            {(element.parenthetical || isHovered) && (
              <div className="text-slate-500 text-sm italic">
                <InlineEdit
                  value={element.parenthetical || ''}
                  onChange={(v) => onUpdate({ parenthetical: v || null })}
                  placeholder="(indication de jeu)"
                  className="text-sm italic"
                />
              </div>
            )}

            {/* Dialogue text - with @ for characters, # for locations/props */}
            <MentionInput
              value={element.content}
              onChange={(v) => onUpdate({ content: v })}
              placeholder={config.placeholder}
              multiline
              className="text-white leading-relaxed"
              assets={allAssets}
              projectGenericAssets={projectGenericAssets}
            />
          </div>
        ) : element.type === 'transition' ? (
          <div className="text-right">
            <InlineEdit
              value={element.content}
              onChange={(v) => onUpdate({ content: v })}
              placeholder={config.placeholder}
              className="text-purple-300 font-medium uppercase text-right"
            />
          </div>
        ) : element.type === 'note' ? (
          <div className="px-3 py-2 rounded-lg bg-amber-500/10 border-l-2 border-amber-500/50">
            <InlineEdit
              value={element.content}
              onChange={(v) => onUpdate({ content: v })}
              placeholder={config.placeholder}
              multiline
              className="text-amber-200/80 text-sm"
            />
          </div>
        ) : (
          /* Action - with @ for characters, # for locations/props */
          <MentionInput
            value={element.content}
            onChange={(v) => onUpdate({ content: v })}
            placeholder={config.placeholder}
            multiline
            className="text-slate-300 leading-relaxed"
            assets={allAssets}
            projectGenericAssets={projectGenericAssets}
          />
        )}
      </div>

      {/* Actions menu */}
      <div className={cn(
        'flex items-start pt-1 opacity-0 group-hover:opacity-100 transition-opacity',
        isHovered && 'opacity-100'
      )}>
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 text-slate-600 hover:text-slate-400 rounded"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {showMenu && (
            <div className="absolute top-full right-0 mt-1 w-40 rounded-lg bg-[#1e293b] border border-white/10 shadow-xl z-50 overflow-hidden">
              <button
                onClick={() => {
                  onDelete();
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Supprimer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Add element button row
function AddElementRow({ onAdd }: { onAdd: (type: ScriptElementType) => void }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className="relative py-2 group"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      {/* Hover line */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-transparent group-hover:bg-slate-700/50 transition-colors" />

      {/* Add button */}
      <div className={cn(
        'relative flex items-center justify-center gap-2 transition-all',
        isExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      )}>
        {Object.entries(ELEMENT_CONFIG).map(([type, config]) => {
          const Icon = config.icon;
          return (
            <button
              key={type}
              onClick={() => onAdd(type as ScriptElementType)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full',
                'bg-slate-800/80 border border-slate-700/50',
                'text-sm text-slate-400 hover:text-white',
                'hover:border-slate-600 hover:bg-slate-700/80',
                'transition-all'
              )}
            >
              <Icon className={cn('w-3.5 h-3.5', config.color)} />
              <span>{config.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function NotionScriptEditor({
  projectId,
  sceneId,
  elements,
  onAddElement,
  onUpdateElement,
  onDeleteElement,
}: NotionScriptEditorProps) {
  const { projectAssets, projectGenericAssets, fetchProjectAssets, fetchProjectGenericAssets, isLoading } = useBibleStore();

  // Fetch project assets once when component mounts or projectId changes
  useEffect(() => {
    fetchProjectAssets(projectId);
    fetchProjectGenericAssets(projectId);
  }, [projectId, fetchProjectAssets, fetchProjectGenericAssets]);

  // All assets for mentions (characters use @, locations/props use #)
  const allAssets = projectAssets;
  const characters = projectAssets.filter(a => a.asset_type === 'character');

  const sortedElements = [...elements].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-1 py-4">
      {sortedElements.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-slate-600 mb-4">Commencez a ecrire votre scene</p>
          <AddElementRow onAdd={onAddElement} />
        </div>
      ) : (
        <>
          {sortedElements.map((element, index) => (
            <div key={element.id}>
              <ElementBlock
                element={element}
                allAssets={allAssets}
                characters={characters}
                projectGenericAssets={projectGenericAssets}
                isLoading={isLoading}
                onUpdate={(updates) => onUpdateElement(element.id, updates)}
                onDelete={() => onDeleteElement(element.id)}
              />
              {index === sortedElements.length - 1 && (
                <AddElementRow onAdd={onAddElement} />
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
