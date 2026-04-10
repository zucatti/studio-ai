'use client';

/**
 * Timeline Toolbar
 *
 * Playback controls, zoom, and action buttons.
 */

import { Play, Pause, Save, Film, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

interface TimelineToolbarProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  currentTime: number;
  duration: number;
  scale: number;
  onScaleChange: (scale: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSave?: () => void;
  onRender?: () => void;
  isDirty?: boolean;
  isSaving?: boolean;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * 30);
  return `${mins}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

export function TimelineToolbar({
  isPlaying,
  onPlayPause,
  currentTime,
  duration,
  scale,
  onScaleChange,
  onZoomIn,
  onZoomOut,
  onSave,
  onRender,
  isDirty,
  isSaving,
}: TimelineToolbarProps) {
  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-zinc-900 border-b border-zinc-800">
      {/* Playback controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPlayPause}
          className="h-8 w-8"
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>

        {/* Time display */}
        <div className="font-mono text-sm text-zinc-400 min-w-[120px]">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>

      {/* Separator */}
      <div className="h-6 w-px bg-zinc-700" />

      {/* Zoom controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onZoomOut}
          className="h-8 w-8"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>

        <div className="w-32">
          <Slider
            value={[scale]}
            min={10}
            max={200}
            step={5}
            onValueChange={([value]) => onScaleChange(value)}
            className="cursor-pointer"
          />
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={onZoomIn}
          className="h-8 w-8"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>

        <span className="text-xs text-zinc-500 min-w-[50px]">
          {scale}px/s
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-2">
        {onSave && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSave}
            disabled={isSaving}
            className="gap-2"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving ? 'Saving...' : 'Save'}
            {isDirty && !isSaving && <span className="w-2 h-2 rounded-full bg-orange-500" />}
          </Button>
        )}

        {onRender && (
          <Button
            variant="default"
            size="sm"
            onClick={onRender}
            className="gap-2"
          >
            <Film className="h-4 w-4" />
            Render
          </Button>
        )}
      </div>
    </div>
  );
}
