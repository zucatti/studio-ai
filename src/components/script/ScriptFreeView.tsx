'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Save, Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ScriptElement } from '@/types/script';
import { cn } from '@/lib/utils';

interface Scene {
  id: string;
  scene_number: number;
  int_ext: string;
  location: string;
  time_of_day: string;
  description?: string | null;
}

interface ScriptFreeViewProps {
  scenes: Scene[];
  elementsByScene: Record<string, ScriptElement[]>;
  sceneFilter: string;
  onSaveFreeText: (sceneId: string, content: string) => void;
  freeTextByScene: Record<string, string>;
  onFreeTextChange: (sceneId: string, content: string) => void;
  isSaving?: boolean;
}

// Convert structured elements to free text format
function elementsToFreeText(elements: ScriptElement[]): string {
  if (!elements || elements.length === 0) return '';

  const lines: string[] = [];

  for (const element of elements.sort((a, b) => a.sort_order - b.sort_order)) {
    switch (element.type) {
      case 'action':
        lines.push(element.content);
        lines.push('');
        break;

      case 'dialogue':
        let characterLine = (element.character_name || 'PERSONNAGE').toUpperCase();
        if (element.extension) {
          characterLine += ` (${element.extension})`;
        }
        lines.push(characterLine);
        if (element.parenthetical) {
          lines.push(`(${element.parenthetical})`);
        }
        lines.push(element.content);
        lines.push('');
        break;

      case 'transition':
        lines.push(element.content.toUpperCase());
        lines.push('');
        break;

      case 'note':
        lines.push(`[NOTE: ${element.content}]`);
        lines.push('');
        break;
    }
  }

  return lines.join('\n').trim();
}

export function ScriptFreeView({
  scenes,
  elementsByScene,
  sceneFilter,
  onSaveFreeText,
  freeTextByScene,
  onFreeTextChange,
  isSaving = false,
}: ScriptFreeViewProps) {
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(
    new Set(scenes.map((s) => s.id))
  );
  const [modifiedScenes, setModifiedScenes] = useState<Set<string>>(new Set());

  // Initialize free text from elements if not set
  useEffect(() => {
    for (const scene of scenes) {
      if (!freeTextByScene[scene.id] && elementsByScene[scene.id]?.length > 0) {
        const text = elementsToFreeText(elementsByScene[scene.id]);
        onFreeTextChange(scene.id, text);
      }
    }
  }, [scenes, elementsByScene, freeTextByScene, onFreeTextChange]);

  const toggleScene = (sceneId: string) => {
    setExpandedScenes((prev) => {
      const next = new Set(prev);
      if (next.has(sceneId)) {
        next.delete(sceneId);
      } else {
        next.add(sceneId);
      }
      return next;
    });
  };

  const handleTextChange = (sceneId: string, content: string) => {
    onFreeTextChange(sceneId, content);
    setModifiedScenes((prev) => new Set(prev).add(sceneId));
  };

  const handleSave = (sceneId: string) => {
    onSaveFreeText(sceneId, freeTextByScene[sceneId] || '');
    setModifiedScenes((prev) => {
      const next = new Set(prev);
      next.delete(sceneId);
      return next;
    });
  };

  const filteredScenes =
    sceneFilter === 'all' ? scenes : scenes.filter((s) => s.id === sceneFilter);

  return (
    <div className="space-y-4">
      {filteredScenes
        .sort((a, b) => a.scene_number - b.scene_number)
        .map((scene) => {
          const isExpanded = expandedScenes.has(scene.id);
          const isModified = modifiedScenes.has(scene.id);
          const text = freeTextByScene[scene.id] || '';

          return (
            <Card
              key={scene.id}
              className="bg-gradient-to-br from-[#1e3a52] to-[#1a3048] border-white/10"
            >
              <CardHeader
                className="cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => toggleScene(scene.id)}
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  )}
                  <CardTitle className="text-white font-mono text-sm">
                    SCENE {scene.scene_number} - {scene.int_ext}. {scene.location} -{' '}
                    {scene.time_of_day}
                  </CardTitle>
                  {isModified && (
                    <span className="ml-auto text-xs text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded">
                      Modifie
                    </span>
                  )}
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="pt-0 space-y-3">
                  {/* Scene description */}
                  {scene.description && (
                    <p className="text-sm text-slate-400 italic border-l-2 border-slate-600 pl-3">
                      {scene.description}
                    </p>
                  )}

                  {/* Free text area */}
                  <Textarea
                    value={text}
                    onChange={(e) => handleTextChange(scene.id, e.target.value)}
                    placeholder="Ecrivez votre scene librement...

Format suggere:
- Actions en texte normal
- PERSONNAGE (pour les dialogues)
- (indication de jeu)
- Texte du dialogue
- TRANSITION:"
                    className={cn(
                      'min-h-[300px] bg-white/5 border-white/10 text-white font-mono text-sm',
                      'resize-y placeholder:text-slate-500'
                    )}
                  />

                  {/* Save button */}
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => handleSave(scene.id)}
                      disabled={!isModified || isSaving}
                      className={cn(
                        isModified
                          ? 'bg-blue-600 hover:bg-blue-700'
                          : 'bg-slate-600'
                      )}
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Enregistrement...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Sauvegarder
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Help text */}
                  <p className="text-xs text-slate-500">
                    Utilisez le bouton &quot;Organiser&quot; dans la barre d&apos;outils pour
                    convertir automatiquement ce texte en elements structures.
                  </p>
                </CardContent>
              )}
            </Card>
          );
        })}

      {filteredScenes.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-400">Aucune scene a afficher.</p>
        </div>
      )}
    </div>
  );
}
