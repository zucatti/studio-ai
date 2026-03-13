'use client';

import { Layers, FileText, Download, Wand2, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type ScriptViewMode = 'structured' | 'free';

interface ScriptToolbarProps {
  viewMode: ScriptViewMode;
  onViewModeChange: (mode: ScriptViewMode) => void;
  onExport: () => void;
  onGenerate?: () => void;
  onOrganize?: () => void;
  isGenerating?: boolean;
  isOrganizing?: boolean;
  canOrganize?: boolean;
  sceneFilter: string;
  onSceneFilterChange: (value: string) => void;
  scenes: { id: string; scene_number: number; location: string }[];
}

export function ScriptToolbar({
  viewMode,
  onViewModeChange,
  onExport,
  onGenerate,
  onOrganize,
  isGenerating = false,
  isOrganizing = false,
  canOrganize = false,
  sceneFilter,
  onSceneFilterChange,
  scenes,
}: ScriptToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      {/* Left side - View mode toggle */}
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg bg-white/5 p-1">
          <button
            onClick={() => onViewModeChange('structured')}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
              viewMode === 'structured'
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-slate-400 hover:text-white'
            )}
          >
            <Layers className="w-4 h-4" />
            Structure
          </button>
          <button
            onClick={() => onViewModeChange('free')}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
              viewMode === 'free'
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-slate-400 hover:text-white'
            )}
          >
            <FileText className="w-4 h-4" />
            Libre
          </button>
        </div>

        {/* Scene filter */}
        <Select value={sceneFilter} onValueChange={onSceneFilterChange}>
          <SelectTrigger className="w-[200px] bg-white/5 border-white/10 text-white">
            <SelectValue placeholder="Toutes les scenes" />
          </SelectTrigger>
          <SelectContent className="bg-[#1a2433] border-white/10">
            <SelectItem value="all">Toutes les scenes</SelectItem>
            {scenes.map((scene) => (
              <SelectItem key={scene.id} value={scene.id}>
                Scene {scene.scene_number}: {scene.location}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Right side - Actions */}
      <div className="flex items-center gap-2">
        {/* Organize button (free mode only) */}
        {viewMode === 'free' && canOrganize && onOrganize && (
          <Button
            variant="outline"
            size="sm"
            onClick={onOrganize}
            disabled={isOrganizing}
            className="border-white/10 text-slate-300 hover:bg-white/5"
          >
            <RotateCcw className={cn('w-4 h-4 mr-2', isOrganizing && 'animate-spin')} />
            {isOrganizing ? 'Organisation...' : 'Organiser'}
          </Button>
        )}

        {/* Generate button */}
        {onGenerate && (
          <Button
            variant="outline"
            size="sm"
            onClick={onGenerate}
            disabled={isGenerating}
            className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
          >
            <Wand2 className={cn('w-4 h-4 mr-2', isGenerating && 'animate-pulse')} />
            {isGenerating ? 'Generation...' : 'Generer'}
          </Button>
        )}

        {/* Export button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onExport}
          className="border-white/10 text-slate-300 hover:bg-white/5"
        >
          <Download className="w-4 h-4 mr-2" />
          Exporter
        </Button>
      </div>
    </div>
  );
}
