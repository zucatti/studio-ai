'use client';

import { useCallback } from 'react';
import { useMontageStore } from '@/store/montage-store';
import { cn } from '@/lib/utils';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Scissors,
  Copy,
  Trash2,
  Undo2,
  Redo2,
  Download,
  Save,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Film,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MontageToolbarProps {
  className?: string;
  onSave?: () => void;
  onRender?: () => void;
  isRendering?: boolean;
  renderProgress?: number;
}

export function MontageToolbar({ className, onSave, onRender, isRendering, renderProgress }: MontageToolbarProps) {
  const {
    isPlaying,
    currentTime,
    duration,
    selectedClipIds,
    scale,
    play,
    pause,
    togglePlayback,
    setCurrentTime,
    removeClip,
    duplicateClip,
    zoomIn,
    zoomOut,
    fitToView,
    exportToJSON,
  } = useMontageStore();

  // Skip backward
  const skipBackward = useCallback(() => {
    setCurrentTime(Math.max(0, currentTime - 5));
  }, [currentTime, setCurrentTime]);

  // Skip forward
  const skipForward = useCallback(() => {
    setCurrentTime(Math.min(duration, currentTime + 5));
  }, [currentTime, duration, setCurrentTime]);

  // Go to start
  const goToStart = useCallback(() => {
    setCurrentTime(0);
  }, [setCurrentTime]);

  // Go to end
  const goToEnd = useCallback(() => {
    setCurrentTime(duration);
  }, [duration, setCurrentTime]);

  // Delete selected clips
  const deleteSelected = useCallback(() => {
    selectedClipIds.forEach((id) => removeClip(id));
  }, [selectedClipIds, removeClip]);

  // Duplicate selected clips
  const duplicateSelected = useCallback(() => {
    selectedClipIds.forEach((id) => duplicateClip(id));
  }, [selectedClipIds, duplicateClip]);

  // Format time display
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  }, []);

  // Handle save
  const handleSave = useCallback(() => {
    if (onSave) {
      onSave();
    } else {
      const data = exportToJSON();
      console.log('Montage data:', data);
      // TODO: Save to API
    }
  }, [onSave, exportToJSON]);

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1 border-b border-white/10',
          className
        )}
      >
        {/* Undo/Redo */}
        <div className="flex items-center gap-1">
          <ToolbarButton icon={Undo2} label="Annuler (Cmd+Z)" disabled />
          <ToolbarButton icon={Redo2} label="Rétablir (Cmd+Shift+Z)" disabled />
        </div>

        <Separator orientation="vertical" className="h-6 mx-2" />

        {/* Playback controls */}
        <div className="flex items-center gap-1">
          <ToolbarButton
            icon={SkipBack}
            label="Retour au début"
            onClick={goToStart}
          />
          <ToolbarButton
            icon={SkipBack}
            label="Reculer 5s"
            onClick={skipBackward}
            className="[&_svg]:rotate-0"
          />

          <Button
            variant="ghost"
            size="sm"
            onClick={togglePlayback}
            className="h-8 w-8 p-0"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5" fill="currentColor" />
            )}
          </Button>

          <ToolbarButton
            icon={SkipForward}
            label="Avancer 5s"
            onClick={skipForward}
          />
          <ToolbarButton
            icon={SkipForward}
            label="Aller à la fin"
            onClick={goToEnd}
            className="[&_svg]:rotate-0"
          />
        </div>

        {/* Timecode display */}
        <div className="px-3 py-1 bg-white/5 rounded text-xs font-mono text-slate-300 min-w-[140px] text-center">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>

        <Separator orientation="vertical" className="h-6 mx-2" />

        {/* Edit tools */}
        <div className="flex items-center gap-1">
          <ToolbarButton
            icon={Scissors}
            label="Couper au playhead (S)"
            disabled
          />
          <ToolbarButton
            icon={Copy}
            label="Dupliquer (Cmd+D)"
            onClick={duplicateSelected}
            disabled={selectedClipIds.length === 0}
          />
          <ToolbarButton
            icon={Trash2}
            label="Supprimer (Delete)"
            onClick={deleteSelected}
            disabled={selectedClipIds.length === 0}
          />
        </div>

        <Separator orientation="vertical" className="h-6 mx-2" />

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <ToolbarButton
            icon={ZoomOut}
            label="Dézoomer (Cmd+-)"
            onClick={zoomOut}
          />
          <span className="text-xs text-slate-400 w-14 text-center">
            {Math.round(scale)}px/s
          </span>
          <ToolbarButton
            icon={ZoomIn}
            label="Zoomer (Cmd++)"
            onClick={zoomIn}
          />
          <ToolbarButton
            icon={Maximize2}
            label="Ajuster à la vue"
            onClick={() => fitToView(800)} // TODO: Get actual container width
          />
        </div>

        <div className="flex-1" />

        {/* Save/Render */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            className="h-8"
          >
            <Save className="w-4 h-4 mr-1.5" />
            Sauvegarder
          </Button>

          {onRender && (
            <Button
              variant="default"
              size="sm"
              onClick={onRender}
              disabled={isRendering}
              className="h-8 bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
            >
              {isRendering ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  {renderProgress !== undefined ? `${renderProgress}%` : 'Rendu...'}
                </>
              ) : (
                <>
                  <Film className="w-4 h-4 mr-1.5" />
                  Render
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

// Toolbar button component
function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  className,
}: {
  icon: typeof Play;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClick}
          disabled={disabled}
          className={cn('h-8 w-8 p-0', className)}
        >
          <Icon className="w-4 h-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-xs">{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}
