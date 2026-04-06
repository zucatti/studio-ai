'use client';

import { useMemo } from 'react';
import { ChevronDown, ChevronRight, User, Users, Mic, Baby, Radio, BookOpen } from 'lucide-react';
import { useBibleStore } from '@/store/bible-store';
import { getGenericCharacter, isGenericCharacter } from '@/lib/generic-characters';
import { DIALOGUE_EXTENSIONS } from '@/types/script';
import { cn } from '@/lib/utils';

// Icons for generic characters
const GENERIC_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  crowd: Users,
  voice: Mic,
  person: User,
  child: Baby,
  announcer: Radio,
  narrator: BookOpen,
};

interface Scene {
  id: string;
  scene_number: number;
  int_ext: string;
  location: string;
  time_of_day: string;
  description: string | null;
}

interface ScriptElement {
  id: string;
  scene_id: string;
  type: 'action' | 'dialogue' | 'transition' | 'note';
  content: string;
  character_id?: string | null;
  character_name?: string | null;
  parenthetical?: string | null;
  extension?: string | null;
  sort_order: number;
}

interface ScriptPreviewProps {
  projectId: string;
  scenes: Scene[];
  elementsByScene: Record<string, ScriptElement[]>;
  expandedScenes: Set<string>;
  onToggleScene: (sceneId: string) => void;
}

export function ScriptPreview({
  projectId,
  scenes,
  elementsByScene,
  expandedScenes,
  onToggleScene,
}: ScriptPreviewProps) {
  const { projectAssets, projectGenericAssets, fetchProjectAssets, fetchProjectGenericAssets } = useBibleStore();

  // Load assets on mount
  useMemo(() => {
    if (projectId) {
      fetchProjectAssets(projectId);
      fetchProjectGenericAssets(projectId);
    }
  }, [projectId, fetchProjectAssets, fetchProjectGenericAssets]);

  const characters = projectAssets.filter(a => a.asset_type === 'character');

  if (scenes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <div className="w-12 h-12 rounded-full bg-slate-700/50 flex items-center justify-center mb-4">
          <BookOpen className="w-6 h-6 text-slate-500" />
        </div>
        <p className="text-slate-400">Le script apparaîtra ici</p>
        <p className="text-sm text-slate-600 mt-1">
          Commence à discuter avec l'assistant pour construire ton histoire
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {scenes
        .sort((a, b) => a.scene_number - b.scene_number)
        .map(scene => {
          const isExpanded = expandedScenes.has(scene.id);
          const elements = (elementsByScene[scene.id] || []).sort(
            (a, b) => a.sort_order - b.sort_order
          );

          return (
            <div
              key={scene.id}
              className="bg-white/5 rounded-lg border border-white/10 overflow-hidden"
            >
              {/* Scene header */}
              <button
                onClick={() => onToggleScene(scene.id)}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/5 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                )}
                <span className="text-xs font-medium text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded">
                  {scene.scene_number}
                </span>
                <span className="text-sm font-medium text-white">
                  {scene.int_ext}. {scene.location}
                </span>
                <span className="text-sm text-slate-400">— {scene.time_of_day}</span>
              </button>

              {/* Scene content */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-3">
                  {scene.description && (
                    <p className="text-sm text-slate-400 italic border-l-2 border-slate-600 pl-3">
                      {scene.description}
                    </p>
                  )}

                  {elements.length > 0 ? (
                    <div className="space-y-3">
                      {elements.map(element => (
                        <ElementPreview
                          key={element.id}
                          element={element}
                          characters={characters}
                          projectGenericAssets={projectGenericAssets}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600 italic">
                      Aucun élément dans cette scène
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

// Element preview component
function ElementPreview({
  element,
  characters,
  projectGenericAssets,
}: {
  element: ScriptElement;
  characters: Array<{ id: string; name: string; reference_images?: string[] }>;
  projectGenericAssets: Array<{ project_generic_asset_id: string; id: string; name_override?: string | null }>;
}) {
  // Get character display info
  const getCharacterInfo = () => {
    if (!element.character_id) {
      return { name: element.character_name || 'PERSONNAGE', icon: User, color: 'blue' };
    }

    // Check if it's a generic character
    if (isGenericCharacter(element.character_id)) {
      // Check if it's a figurant with name_override
      const figurant = projectGenericAssets.find(
        pga => pga.project_generic_asset_id === element.character_id
      );
      if (figurant?.name_override) {
        const generic = getGenericCharacter(figurant.id);
        const icon = generic ? (GENERIC_ICONS[generic.icon] || User) : User;
        return { name: figurant.name_override, icon, color: 'purple' };
      }

      // Base generic character
      const generic = getGenericCharacter(element.character_id);
      if (generic) {
        const icon = GENERIC_ICONS[generic.icon] || User;
        return { name: generic.name, icon, color: 'purple' };
      }
    }

    // Check custom characters
    const character = characters.find(c => c.id === element.character_id);
    if (character) {
      return { name: character.name, icon: User, color: 'blue' };
    }

    return { name: element.character_name || 'PERSONNAGE', icon: User, color: 'blue' };
  };

  // Get extension label
  const getExtensionInfo = () => {
    if (!element.extension) return null;
    const ext = DIALOGUE_EXTENSIONS.find(e => e.value === element.extension);
    return ext || { value: element.extension, label: element.extension, description: '' };
  };

  if (element.type === 'action') {
    return (
      <div className="text-sm text-white leading-relaxed">
        {element.content}
      </div>
    );
  }

  if (element.type === 'dialogue') {
    const charInfo = getCharacterInfo();
    const extInfo = getExtensionInfo();
    const Icon = charInfo.icon;

    return (
      <div className="pl-4 border-l-2 border-blue-500/30">
        {/* Character name + extension */}
        <div className="flex items-center gap-2 mb-1">
          <div className={cn(
            'flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold',
            charInfo.color === 'purple'
              ? 'bg-purple-500/20 text-purple-300'
              : 'bg-blue-500/20 text-blue-300'
          )}>
            <Icon className="w-3 h-3" />
            <span>{charInfo.name}</span>
          </div>
          {extInfo && (
            <span className={cn(
              'px-1.5 py-0.5 text-[10px] font-medium rounded',
              element.extension === 'Hors champ'
                ? 'bg-amber-600/30 text-amber-300'
                : element.extension === 'Voix off'
                ? 'bg-purple-600/30 text-purple-300'
                : 'bg-blue-600/30 text-blue-300'
            )}>
              ({extInfo.label})
            </span>
          )}
        </div>

        {/* Parenthetical */}
        {element.parenthetical && (
          <p className="text-xs text-slate-500 italic mb-1">
            ({element.parenthetical})
          </p>
        )}

        {/* Dialogue content */}
        <p className="text-sm text-white leading-relaxed pl-2">
          {element.content}
        </p>
      </div>
    );
  }

  if (element.type === 'transition') {
    return (
      <div className="text-right">
        <span className="text-sm font-medium text-purple-400 uppercase">
          {element.content}
        </span>
      </div>
    );
  }

  if (element.type === 'note') {
    return (
      <div className="bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2">
        <p className="text-sm text-amber-300 italic">
          [[{element.content}]]
        </p>
      </div>
    );
  }

  return null;
}
