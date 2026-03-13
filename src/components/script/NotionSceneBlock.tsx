'use client';

import { useState, useEffect } from 'react';
import { ChevronRight, MapPin, Sun, Moon, Edit2, Trash2, Plus } from 'lucide-react';
import { NotionScriptEditor } from './NotionScriptEditor';
import { useBibleStore } from '@/store/bible-store';
import type { ScriptElement, ScriptElementType } from '@/types/script';
import { cn } from '@/lib/utils';

interface Scene {
  id: string;
  scene_number: number;
  int_ext: string;
  location: string;
  location_id?: string | null;
  time_of_day: string;
  description?: string | null;
}

interface NotionSceneBlockProps {
  projectId: string;
  scene: Scene;
  elements: ScriptElement[];
  isExpanded: boolean;
  onToggle: () => void;
  onAddElement: (sceneId: string, type: ScriptElementType, content?: string) => void;
  onUpdateElement: (elementId: string, updates: Partial<ScriptElement>) => void;
  onDeleteElement: (elementId: string) => void;
  onEditScene: () => void;
  onDeleteScene: () => void;
}

const TIME_ICONS: Record<string, typeof Sun> = {
  'JOUR': Sun,
  'NUIT': Moon,
};

export function NotionSceneBlock({
  projectId,
  scene,
  elements,
  isExpanded,
  onToggle,
  onAddElement,
  onUpdateElement,
  onDeleteElement,
  onEditScene,
  onDeleteScene,
}: NotionSceneBlockProps) {
  const [isHovered, setIsHovered] = useState(false);
  const TimeIcon = TIME_ICONS[scene.time_of_day] || Sun;

  return (
    <div
      className="group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Scene Header */}
      <div
        onClick={onToggle}
        className={cn(
          'flex items-center gap-3 py-3 px-2 -mx-2 rounded-lg cursor-pointer',
          'hover:bg-white/[0.03] transition-colors'
        )}
      >
        {/* Expand arrow */}
        <ChevronRight
          className={cn(
            'w-4 h-4 text-slate-500 transition-transform',
            isExpanded && 'rotate-90'
          )}
        />

        {/* Scene number badge */}
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800 text-white text-sm font-mono font-bold">
          {scene.scene_number}
        </span>

        {/* Scene info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-white">
            <span className="text-slate-500 text-sm">{scene.int_ext}.</span>
            <span className="font-medium uppercase truncate">{scene.location}</span>
            <span className="text-slate-600">—</span>
            <span className="flex items-center gap-1 text-slate-400 text-sm">
              <TimeIcon className="w-3.5 h-3.5" />
              {scene.time_of_day}
            </span>
          </div>

          {scene.description && (
            <p className="text-sm text-slate-500 mt-0.5 truncate">
              {scene.description}
            </p>
          )}
        </div>

        {/* Element count */}
        <span className="text-xs text-slate-600 tabular-nums">
          {elements.length} element{elements.length !== 1 ? 's' : ''}
        </span>

        {/* Actions */}
        <div className={cn(
          'flex items-center gap-1 transition-opacity',
          isHovered ? 'opacity-100' : 'opacity-0'
        )}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEditScene();
            }}
            className="p-1.5 rounded text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteScene();
            }}
            className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scene Content */}
      {isExpanded && (
        <div className="ml-12 pl-4 pt-3 border-l border-slate-800/50">
          <NotionScriptEditor
            projectId={projectId}
            sceneId={scene.id}
            elements={elements}
            onAddElement={(type, content) => onAddElement(scene.id, type, content)}
            onUpdateElement={onUpdateElement}
            onDeleteElement={onDeleteElement}
          />
        </div>
      )}
    </div>
  );
}
