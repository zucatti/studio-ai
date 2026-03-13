'use client';

import { useState, useCallback, useEffect } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { ScriptToolbar, type ScriptViewMode } from './ScriptToolbar';
import { ScriptStructuredView } from './ScriptStructuredView';
import { ScriptFreeView } from './ScriptFreeView';
import { ScriptExporter } from './ScriptExporter';
import { SceneManager } from './SceneManager';
import { GenerationModal, type GenerationLog } from './GenerationModal';
import type { ScriptElement, ScriptElementType } from '@/types/script';
import { toast } from 'sonner';

interface Scene {
  id: string;
  scene_number: number;
  int_ext: string;
  location: string;
  time_of_day: string;
  description?: string | null;
}

interface Character {
  id: string;
  name: string;
}

interface ScriptEditorProps {
  projectId: string;
  projectName: string;
  scenes: Scene[];
  isLoading?: boolean;
  onRefresh: () => void;
}

export function ScriptEditor({
  projectId,
  projectName,
  scenes,
  isLoading = false,
  onRefresh,
}: ScriptEditorProps) {
  // View state
  const [viewMode, setViewMode] = useState<ScriptViewMode>('structured');
  const [sceneFilter, setSceneFilter] = useState('all');
  const [showExporter, setShowExporter] = useState(false);

  // Data state
  const [elementsByScene, setElementsByScene] = useState<Record<string, ScriptElement[]>>({});
  const [characters, setCharacters] = useState<Character[]>([]);
  const [freeTextByScene, setFreeTextByScene] = useState<Record<string, string>>({});

  // Loading states
  const [isLoadingElements, setIsLoadingElements] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Generation modal state
  const [showGenerationModal, setShowGenerationModal] = useState(false);
  const [generationLogs, setGenerationLogs] = useState<GenerationLog[]>([]);
  const [generationComplete, setGenerationComplete] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Fetch script elements for all scenes
  const fetchElements = useCallback(async () => {
    if (scenes.length === 0) return;

    setIsLoadingElements(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/script-elements`);
      if (res.ok) {
        const data = await res.json();
        // Group elements by scene
        const grouped: Record<string, ScriptElement[]> = {};
        for (const element of data.elements || []) {
          if (!grouped[element.scene_id]) {
            grouped[element.scene_id] = [];
          }
          grouped[element.scene_id].push(element);
        }
        setElementsByScene(grouped);
      }
    } catch (error) {
      console.error('Error fetching script elements:', error);
    } finally {
      setIsLoadingElements(false);
    }
  }, [projectId, scenes.length]);

  // Fetch characters
  const fetchCharacters = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/characters`);
      if (res.ok) {
        const data = await res.json();
        setCharacters(data.characters || []);
      }
    } catch (error) {
      console.error('Error fetching characters:', error);
    }
  }, [projectId]);

  useEffect(() => {
    fetchElements();
    fetchCharacters();
  }, [fetchElements, fetchCharacters]);

  // Add element
  const handleAddElement = async (sceneId: string, type: ScriptElementType, content?: string) => {
    try {
      const sceneElements = elementsByScene[sceneId] || [];
      const maxSortOrder = Math.max(0, ...sceneElements.map((e) => e.sort_order));

      console.log('Adding element:', { sceneId, type, content });

      const res = await fetch(`/api/projects/${projectId}/script-elements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene_id: sceneId,
          type,
          content: content || '',
          sort_order: maxSortOrder + 1,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setElementsByScene((prev) => ({
          ...prev,
          [sceneId]: [...(prev[sceneId] || []), data.element],
        }));
        toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} ajoute`);
      } else {
        console.error('API error:', data);
        toast.error(data.error || 'Erreur lors de l\'ajout');
      }
    } catch (error) {
      console.error('Error adding element:', error);
      toast.error('Erreur de connexion');
    }
  };

  // Update element
  const handleUpdateElement = async (elementId: string, updates: Partial<ScriptElement>) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/script-elements/${elementId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (res.ok) {
        const data = await res.json();
        setElementsByScene((prev) => {
          const newState = { ...prev };
          for (const sceneId of Object.keys(newState)) {
            newState[sceneId] = newState[sceneId].map((e) =>
              e.id === elementId ? { ...e, ...data.element } : e
            );
          }
          return newState;
        });
      }
    } catch (error) {
      console.error('Error updating element:', error);
      toast.error('Erreur lors de la mise a jour');
    }
  };

  // Delete element
  const handleDeleteElement = async (elementId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/script-elements/${elementId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setElementsByScene((prev) => {
          const newState = { ...prev };
          for (const sceneId of Object.keys(newState)) {
            newState[sceneId] = newState[sceneId].filter((e) => e.id !== elementId);
          }
          return newState;
        });
      }
    } catch (error) {
      console.error('Error deleting element:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  // Reorder element
  const handleReorderElement = async (elementId: string, direction: 'up' | 'down') => {
    try {
      const res = await fetch(`/api/projects/${projectId}/script-elements/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elementId, direction }),
      });

      if (res.ok) {
        fetchElements();
      }
    } catch (error) {
      console.error('Error reordering element:', error);
    }
  };

  // Save free text
  const handleSaveFreeText = async (sceneId: string, content: string) => {
    setIsSaving(true);
    try {
      // For now, just store it - the "Organize" feature will parse it
      setFreeTextByScene((prev) => ({ ...prev, [sceneId]: content }));
      toast.success('Texte sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  // Organize free text (parse with AI)
  const handleOrganize = async () => {
    const sceneId = sceneFilter === 'all' ? scenes[0]?.id : sceneFilter;
    if (!sceneId || !freeTextByScene[sceneId]) return;

    setIsOrganizing(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/parse-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneId,
          content: freeTextByScene[sceneId],
        }),
      });

      if (res.ok) {
        toast.success('Script organise avec succes');
        fetchElements();
        setViewMode('structured');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Erreur lors de l\'organisation');
      }
    } catch (error) {
      console.error('Error organizing script:', error);
      toast.error('Erreur de connexion');
    } finally {
      setIsOrganizing(false);
    }
  };

  // Generate script from brainstorming/synopsis with streaming
  const handleGenerate = async () => {
    setIsGenerating(true);
    setShowGenerationModal(true);
    setGenerationLogs([]);
    setGenerationComplete(false);
    setGenerationError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/generate-script-from-synopsis`, {
        method: 'POST',
      });

      if (!res.ok || !res.body) {
        throw new Error('Erreur de connexion');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              const log: GenerationLog = {
                type: data.type as GenerationLog['type'],
                message: data.message,
                timestamp: new Date(data.timestamp),
              };

              if (data.type === 'done') {
                setGenerationComplete(true);
                toast.success(data.message);
                onRefresh();
                fetchElements();
              } else if (data.type === 'error') {
                setGenerationError(data.message);
              } else {
                setGenerationLogs((prev) => [...prev, log]);
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } catch (error) {
      console.error('Error generating script:', error);
      setGenerationError(error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFreeTextChange = (sceneId: string, content: string) => {
    setFreeTextByScene((prev) => ({ ...prev, [sceneId]: content }));
  };

  // Check if we can organize (free text exists)
  const canOrganize = sceneFilter !== 'all'
    ? Boolean(freeTextByScene[sceneFilter]?.trim())
    : Object.values(freeTextByScene).some((t) => t?.trim());

  if (isLoading || isLoadingElements) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <FileText className="w-5 h-5 text-blue-400" />
          <h2 className="text-xl font-semibold">Script</h2>
          <span className="text-sm text-slate-400 ml-2">
            {scenes.length} scene{scenes.length > 1 ? 's' : ''}
          </span>
        </div>
        <SceneManager
          projectId={projectId}
          scenes={scenes}
          onRefresh={onRefresh}
        />
      </div>

      {/* Toolbar */}
      <ScriptToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onExport={() => setShowExporter(true)}
        onGenerate={handleGenerate}
        onOrganize={handleOrganize}
        isGenerating={isGenerating}
        isOrganizing={isOrganizing}
        canOrganize={canOrganize}
        sceneFilter={sceneFilter}
        onSceneFilterChange={setSceneFilter}
        scenes={scenes.map((s) => ({
          id: s.id,
          scene_number: s.scene_number,
          location: s.location,
        }))}
      />

      {/* Content */}
      {scenes.length === 0 ? (
        <div className="rounded-xl bg-[#151d28] border border-white/5 py-12 text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 text-slate-500" />
          <p className="text-slate-400">Aucune scene dans ce projet.</p>
          <p className="text-sm mt-1 text-slate-500">
            Cliquez sur "Nouvelle scene" pour commencer.
          </p>
        </div>
      ) : viewMode === 'structured' ? (
        <ScriptStructuredView
          projectId={projectId}
          scenes={scenes}
          elementsByScene={elementsByScene}
          sceneFilter={sceneFilter}
          onAddElement={handleAddElement}
          onUpdateElement={handleUpdateElement}
          onDeleteElement={handleDeleteElement}
          onReorderElement={handleReorderElement}
          onRefresh={onRefresh}
        />
      ) : (
        <ScriptFreeView
          scenes={scenes}
          elementsByScene={elementsByScene}
          sceneFilter={sceneFilter}
          onSaveFreeText={handleSaveFreeText}
          freeTextByScene={freeTextByScene}
          onFreeTextChange={handleFreeTextChange}
          isSaving={isSaving}
        />
      )}

      {/* Exporter modal */}
      <ScriptExporter
        open={showExporter}
        onOpenChange={setShowExporter}
        scenes={scenes}
        elementsByScene={elementsByScene}
        projectName={projectName}
      />

      {/* Generation modal */}
      <GenerationModal
        open={showGenerationModal}
        onOpenChange={(open) => {
          if (!isGenerating) {
            setShowGenerationModal(open);
          }
        }}
        logs={generationLogs}
        isComplete={generationComplete}
        error={generationError}
      />
    </div>
  );
}
