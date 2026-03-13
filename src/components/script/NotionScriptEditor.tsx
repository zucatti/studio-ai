'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, GripVertical, X, User, Type, MessageSquare, ArrowRight, StickyNote, MoreHorizontal, Trash2 } from 'lucide-react';
import { useBibleStore } from '@/store/bible-store';
import type { ScriptElement, ScriptElementType } from '@/types/script';
import type { ProjectAssetFlat } from '@/types/database';
import { cn } from '@/lib/utils';

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
  isLoading,
  onRemove,
  onSelect,
}: {
  characterId: string | null;
  characterName: string | null;
  characters: ProjectAssetFlat[];
  isLoading?: boolean;
  onRemove: () => void;
  onSelect: (id: string, name: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (characterName) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-300 text-sm font-medium">
        <User className="w-3.5 h-3.5" />
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
        onClick={() => setShowPicker(!showPicker)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-dashed border-slate-600 text-slate-500 text-sm hover:border-blue-500/50 hover:text-blue-400 transition-colors"
      >
        <User className="w-3.5 h-3.5" />
        <span>Personnage</span>
      </button>

      {showPicker && (
        <div className="absolute top-full left-0 mt-2 w-56 rounded-lg bg-[#1e293b] border border-white/10 shadow-xl z-50 overflow-hidden">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-slate-500">
              Chargement...
            </div>
          ) : characters.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">
              Aucun personnage dans la Bible
            </div>
          ) : (
            <div className="py-1 max-h-64 overflow-y-auto">
              {characters.map((char) => (
                <button
                  key={char.id}
                  onClick={() => {
                    onSelect(char.id, char.name);
                    setShowPicker(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-white hover:bg-white/5 transition-colors"
                >
                  <User className="w-4 h-4 text-blue-400" />
                  <span className="uppercase">{char.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Single element block
function ElementBlock({
  element,
  characters,
  isLoading,
  onUpdate,
  onDelete,
}: {
  element: ScriptElement;
  characters: ProjectAssetFlat[];
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
            {/* Character tag */}
            <CharacterTag
              characterId={element.character_id ?? null}
              characterName={element.character_name ?? null}
              characters={characters}
              isLoading={isLoading}
              onRemove={() => onUpdate({ character_id: null, character_name: null })}
              onSelect={(id, name) => onUpdate({ character_id: id, character_name: name })}
            />

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

            {/* Dialogue text */}
            <InlineEdit
              value={element.content}
              onChange={(v) => onUpdate({ content: v })}
              placeholder={config.placeholder}
              multiline
              className="text-white leading-relaxed"
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
          <InlineEdit
            value={element.content}
            onChange={(v) => onUpdate({ content: v })}
            placeholder={config.placeholder}
            multiline
            className="text-slate-300 leading-relaxed"
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
  const { projectAssets, fetchProjectAssets, isLoading } = useBibleStore();

  // Fetch project assets once when component mounts or projectId changes
  useEffect(() => {
    console.log('[NotionScriptEditor] Mount - fetching assets for project:', projectId);
    fetchProjectAssets(projectId);
  }, [projectId, fetchProjectAssets]);

  const characters = projectAssets.filter(a => a.asset_type === 'character');

  // Debug log
  useEffect(() => {
    console.log('[NotionScriptEditor] projectAssets:', projectAssets.length, 'characters:', characters.length, 'isLoading:', isLoading);
  }, [projectAssets, characters.length, isLoading]);

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
                characters={characters}
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
