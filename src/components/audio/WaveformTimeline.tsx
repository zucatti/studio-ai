'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.js';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimelineMarker {
  id: string;
  start: number;
  end: number;
  color?: string;
  label?: string;
  type?: 'scene' | 'shot' | 'vocal' | 'selection';
}

interface WaveformTimelineProps {
  audioUrl: string;
  duration?: number;
  markers?: TimelineMarker[];
  selection?: { start: number; end: number };
  onSelectionChange?: (start: number, end: number) => void;
  onTimeUpdate?: (time: number) => void;
  onReady?: (duration: number) => void;
  onWaveformData?: (peaks: number[]) => void;
  height?: number;
  waveColor?: string;
  progressColor?: string;
  showTimeline?: boolean;
  showControls?: boolean;
  readOnly?: boolean;
  className?: string;
}

export function WaveformTimeline({
  audioUrl,
  duration,
  markers = [],
  selection,
  onSelectionChange,
  onTimeUpdate,
  onReady,
  onWaveformData,
  height = 80,
  waveColor = '#4f46e5',
  progressColor = '#818cf8',
  showTimeline = true,
  showControls = true,
  readOnly = false,
  className,
}: WaveformTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<any>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current || !audioUrl) return;

    const regions = RegionsPlugin.create();
    regionsRef.current = regions;

    const plugins: any[] = [regions];

    if (showTimeline) {
      plugins.push(
        TimelinePlugin.create({
          height: 20,
          timeInterval: 1,
          primaryLabelInterval: 5,
          style: {
            fontSize: '10px',
            color: '#9ca3af',
          },
        })
      );
    }

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      height,
      waveColor,
      progressColor,
      cursorColor: '#ef4444',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      plugins,
    });

    wavesurferRef.current = wavesurfer;

    wavesurfer.load(audioUrl);

    wavesurfer.on('ready', () => {
      const dur = wavesurfer.getDuration();
      setTotalDuration(dur);
      setIsLoading(false);
      onReady?.(dur);

      // Export waveform peaks
      const peaks = wavesurfer.exportPeaks();
      if (peaks && peaks[0] && onWaveformData) {
        onWaveformData(Array.from(peaks[0]));
      }
    });

    wavesurfer.on('play', () => setIsPlaying(true));
    wavesurfer.on('pause', () => setIsPlaying(false));
    wavesurfer.on('finish', () => setIsPlaying(false));

    wavesurfer.on('timeupdate', (time) => {
      setCurrentTime(time);
      onTimeUpdate?.(time);
    });

    return () => {
      wavesurfer.destroy();
    };
  }, [audioUrl, height, waveColor, progressColor, showTimeline]);

  // Update regions when markers change
  useEffect(() => {
    if (!regionsRef.current || isLoading) return;

    // Clear existing regions
    regionsRef.current.clearRegions();

    // Add marker regions
    markers.forEach((marker) => {
      regionsRef.current.addRegion({
        id: marker.id,
        start: marker.start,
        end: marker.end,
        color: marker.color || 'rgba(79, 70, 229, 0.2)',
        drag: false,
        resize: false,
      });
    });

    // Add selection region if exists
    if (selection && !readOnly) {
      const selectionRegion = regionsRef.current.addRegion({
        id: 'selection',
        start: selection.start,
        end: selection.end,
        color: 'rgba(34, 197, 94, 0.3)',
        drag: true,
        resize: true,
      });

      selectionRegion.on('update-end', () => {
        onSelectionChange?.(selectionRegion.start, selectionRegion.end);
      });
    }
  }, [markers, selection, isLoading, readOnly, onSelectionChange]);

  // Playback controls
  const togglePlayPause = useCallback(() => {
    wavesurferRef.current?.playPause();
  }, []);

  const skipBackward = useCallback(() => {
    const ws = wavesurferRef.current;
    if (ws) {
      const newTime = Math.max(0, ws.getCurrentTime() - 5);
      ws.seekTo(newTime / ws.getDuration());
    }
  }, []);

  const skipForward = useCallback(() => {
    const ws = wavesurferRef.current;
    if (ws) {
      const newTime = Math.min(ws.getDuration(), ws.getCurrentTime() + 5);
      ws.seekTo(newTime / ws.getDuration());
    }
  }, []);

  const toggleMute = useCallback(() => {
    const ws = wavesurferRef.current;
    if (ws) {
      if (isMuted) {
        ws.setVolume(volume);
        setIsMuted(false);
      } else {
        ws.setVolume(0);
        setIsMuted(true);
      }
    }
  }, [isMuted, volume]);

  const handleVolumeChange = useCallback((value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
    wavesurferRef.current?.setVolume(newVolume);
  }, []);

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn('space-y-2', className)}>
      {/* Waveform container */}
      <div
        ref={containerRef}
        className={cn(
          'w-full rounded-lg bg-slate-900/50 border border-white/10',
          isLoading && 'animate-pulse'
        )}
      />

      {/* Controls */}
      {showControls && (
        <div className="flex items-center justify-between gap-4">
          {/* Playback controls */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={skipBackward}
              disabled={isLoading}
            >
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10"
              onClick={togglePlayPause}
              disabled={isLoading}
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 ml-0.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={skipForward}
              disabled={isLoading}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>

          {/* Time display */}
          <div className="flex-1 text-center">
            <span className="font-mono text-sm text-slate-300">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </span>
          </div>

          {/* Volume control */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={toggleMute}
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
            <Slider
              value={[isMuted ? 0 : volume]}
              onValueChange={handleVolumeChange}
              max={1}
              step={0.1}
              className="w-20"
            />
          </div>
        </div>
      )}

      {/* Selection info */}
      {selection && (
        <div className="flex items-center justify-center gap-4 text-xs text-slate-400">
          <span>
            Sélection: {formatTime(selection.start)} → {formatTime(selection.end)}
          </span>
          <span className="text-slate-500">
            ({formatTime(selection.end - selection.start)})
          </span>
        </div>
      )}
    </div>
  );
}

export default WaveformTimeline;
