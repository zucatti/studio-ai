'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.js';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Plus,
  Loader2,
  Scissors,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Sequence {
  id: string;
  title: string | null;
  start_time: number | null;
  end_time: number | null;
  color?: string;
}

interface WorkArea {
  start: number;
  end: number;
}

interface WaveformHeaderProps {
  audioUrl: string;
  sequences: Sequence[];
  onCreateSequence: (startTime: number, endTime: number) => Promise<void>;
  onSequenceSelect?: (sequence: Sequence | null) => void;
  selectedSequenceId?: string | null;
  className?: string;
  // Work area bounds
  workArea?: WorkArea | null;
  onWorkAreaChange?: (workArea: WorkArea) => void;
}

export function WaveformHeader({
  audioUrl,
  sequences,
  onCreateSequence,
  onSequenceSelect,
  selectedSequenceId,
  className,
  workArea,
  onWorkAreaChange,
}: WaveformHeaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // Selection state for creating new sequences
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Work area editing state
  const [isEditingWorkArea, setIsEditingWorkArea] = useState(false);
  const [localWorkArea, setLocalWorkArea] = useState<WorkArea | null>(workArea || null);

  // Sync local work area with prop (always sync, not just when truthy)
  useEffect(() => {
    setLocalWorkArea(workArea || null);
  }, [workArea]);

  // Format time helper
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current || !audioUrl) return;

    let isMounted = true;
    const regions = RegionsPlugin.create();
    regionsRef.current = regions;

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      height: 80,
      waveColor: '#4f46e5',
      progressColor: '#818cf8',
      cursorColor: '#ef4444',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      plugins: [
        regions,
        TimelinePlugin.create({
          height: 20,
          timeInterval: 15,
          primaryLabelInterval: 1,
          secondaryLabelInterval: 0,
          style: {
            fontSize: '10px',
            color: '#64748b',
          },
        }),
      ],
    });

    wavesurferRef.current = wavesurfer;

    wavesurfer.load(audioUrl).catch(() => {
      // Ignore load errors (e.g., abort during unmount)
    });

    wavesurfer.on('ready', () => {
      if (!isMounted) return;
      setDuration(wavesurfer.getDuration());
      setIsLoading(false);
    });

    wavesurfer.on('play', () => isMounted && setIsPlaying(true));
    wavesurfer.on('pause', () => isMounted && setIsPlaying(false));
    wavesurfer.on('finish', () => isMounted && setIsPlaying(false));
    wavesurfer.on('timeupdate', (time) => isMounted && setCurrentTime(time));
    wavesurfer.on('error', (error) => {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('[WaveformHeader] WaveSurfer error:', error);
      if (isMounted) {
        setIsLoading(false);
        toast.error('Erreur de chargement audio');
      }
    });

    return () => {
      isMounted = false;
      wavesurfer.destroy();
    };
  }, [audioUrl]);

  // Stop playback when reaching work area end
  useEffect(() => {
    if (!isPlaying || !localWorkArea) return;

    const ws = wavesurferRef.current;
    if (!ws) return;

    if (currentTime >= localWorkArea.end) {
      ws.pause();
      // Optionally seek back to work area start for next play
      ws.seekTo(localWorkArea.start / duration);
    }
  }, [currentTime, isPlaying, localWorkArea, duration]);

  // Update regions when sequences change
  useEffect(() => {
    if (!regionsRef.current || isLoading) return;

    // Clear existing regions
    regionsRef.current.clearRegions();

    // Get effective work area (use full duration if not set)
    const effectiveWorkArea = localWorkArea || { start: 0, end: duration };

    // Add work area boundary regions (visual overlays for excluded areas)
    if (localWorkArea && duration > 0) {
      // LEFT BRACKET [ at localWorkArea.start position
      // We create this as a thin region that sits at the boundary
      if (localWorkArea.start > 0 || isEditingWorkArea) {
        // Dark overlay for excluded area (from 0 to start)
        const leftOverlay = document.createElement('div');
        leftOverlay.style.cssText = `
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
        `;

        regionsRef.current.addRegion({
          id: 'work-area-left-overlay',
          start: 0,
          end: Math.max(0.01, localWorkArea.start - 0.1),
          color: 'transparent',
          content: leftOverlay,
          drag: false,
          resize: false,
        });

        // Bracket handle region [ at the start boundary
        const bracketEl = document.createElement('div');
        bracketEl.style.cssText = `
          position: absolute;
          top: -24px;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: flex-start;
          overflow: visible;
          z-index: 10;
          pointer-events: ${isEditingWorkArea ? 'auto' : 'none'};
          cursor: ${isEditingWorkArea ? 'ew-resize' : 'default'};
        `;

        // Vertical bar
        const verticalBar = document.createElement('div');
        verticalBar.style.cssText = `
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 4px;
          background: #22c55e;
        `;

        // Top arm of [
        const topArm = document.createElement('div');
        topArm.style.cssText = `
          width: 16px;
          height: 4px;
          background: #22c55e;
          flex-shrink: 0;
        `;

        // Bottom arm of [
        const bottomArm = document.createElement('div');
        bottomArm.style.cssText = `
          width: 16px;
          height: 4px;
          background: #22c55e;
          flex-shrink: 0;
        `;

        bracketEl.appendChild(verticalBar);
        bracketEl.appendChild(topArm);
        bracketEl.appendChild(bottomArm);

        const bracketRegion = regionsRef.current.addRegion({
          id: 'work-area-start-bracket',
          start: Math.max(0, localWorkArea.start - 0.5),
          end: localWorkArea.start + 0.5,
          color: 'transparent',
          content: bracketEl,
          drag: isEditingWorkArea,
          resize: false,
        });

        if (isEditingWorkArea) {
          bracketRegion.on('update-end', () => {
            const newStart = Math.max(0, Math.min(bracketRegion.start + 0.5, (localWorkArea?.end || duration) - 1));
            setLocalWorkArea(prev => prev ? { ...prev, start: newStart } : { start: newStart, end: duration });
          });
        }
      }

      // RIGHT BRACKET ] at localWorkArea.end position
      if (localWorkArea.end < duration || isEditingWorkArea) {
        // Dark overlay for excluded area (from end to duration)
        const rightOverlay = document.createElement('div');
        rightOverlay.style.cssText = `
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
        `;

        regionsRef.current.addRegion({
          id: 'work-area-right-overlay',
          start: localWorkArea.end + 0.1,
          end: duration,
          color: 'transparent',
          content: rightOverlay,
          drag: false,
          resize: false,
        });

        // Bracket handle region ] at the end boundary
        const bracketEl = document.createElement('div');
        bracketEl.style.cssText = `
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: flex-end;
          overflow: visible;
          z-index: 10;
          pointer-events: ${isEditingWorkArea ? 'auto' : 'none'};
          cursor: ${isEditingWorkArea ? 'ew-resize' : 'default'};
        `;

        // Vertical bar
        const verticalBar = document.createElement('div');
        verticalBar.style.cssText = `
          position: absolute;
          right: 0;
          top: 0;
          bottom: 0;
          width: 4px;
          background: #ef4444;
        `;

        // Top arm of ]
        const topArm = document.createElement('div');
        topArm.style.cssText = `
          width: 16px;
          height: 4px;
          background: #ef4444;
          flex-shrink: 0;
        `;

        // Bottom arm of ]
        const bottomArm = document.createElement('div');
        bottomArm.style.cssText = `
          width: 16px;
          height: 4px;
          background: #ef4444;
          flex-shrink: 0;
        `;

        bracketEl.appendChild(verticalBar);
        bracketEl.appendChild(topArm);
        bracketEl.appendChild(bottomArm);

        const bracketRegion = regionsRef.current.addRegion({
          id: 'work-area-end-bracket',
          start: localWorkArea.end - 0.5,
          end: Math.min(duration, localWorkArea.end + 0.5),
          color: 'transparent',
          content: bracketEl,
          drag: isEditingWorkArea,
          resize: false,
        });

        if (isEditingWorkArea) {
          bracketRegion.on('update-end', () => {
            const newEnd = Math.min(duration, Math.max(bracketRegion.end - 0.5, (localWorkArea?.start || 0) + 1));
            setLocalWorkArea(prev => prev ? { ...prev, end: newEnd } : { start: 0, end: newEnd });
          });
        }
      }
    }

    // Add sequence regions
    sequences.forEach((seq) => {
      if (seq.start_time === null || seq.end_time === null) return;

      const isSelected = seq.id === selectedSequenceId;
      const color = seq.color || '#8b5cf6';

      // Create label element
      const labelEl = document.createElement('div');
      labelEl.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        background-color: ${color};
        color: white;
        font-size: 11px;
        font-weight: 500;
        padding: 0 6px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        cursor: pointer;
        border-radius: 0;
        opacity: ${isSelected ? 1 : 0.8};
      `;
      labelEl.textContent = seq.title || 'Sequence';
      labelEl.title = `${seq.title || 'Sequence'} (${formatTime(seq.start_time)} - ${formatTime(seq.end_time)})`;

      const region = regionsRef.current!.addRegion({
        id: seq.id,
        start: seq.start_time,
        end: seq.end_time,
        color: `${color}${isSelected ? '60' : '40'}`,
        content: labelEl,
        drag: false,
        resize: false,
      });

      region.on('click', () => {
        onSequenceSelect?.(seq);
      });
    });

    // Add selection region if active
    if (selectionRange && isSelecting) {
      // Clamp selection to work area
      const clampedStart = Math.max(effectiveWorkArea.start, selectionRange.start);
      const clampedEnd = Math.min(effectiveWorkArea.end, selectionRange.end);

      const selectionRegion = regionsRef.current.addRegion({
        id: 'selection',
        start: clampedStart,
        end: clampedEnd,
        color: 'rgba(34, 197, 94, 0.3)',
        drag: true,
        resize: true,
        minLength: 3,
      });

      selectionRegion.on('update-end', () => {
        // Clamp to work area bounds
        const newStart = Math.max(effectiveWorkArea.start, selectionRegion.start);
        const newEnd = Math.min(effectiveWorkArea.end, selectionRegion.end);
        setSelectionRange({ start: newStart, end: newEnd });
      });
    }
  }, [sequences, isLoading, selectedSequenceId, selectionRange, isSelecting, duration, formatTime, onSequenceSelect, localWorkArea, isEditingWorkArea]);

  // Playback controls
  const togglePlayPause = useCallback(() => {
    const ws = wavesurferRef.current;
    if (!ws) return;

    if (ws.isPlaying()) {
      ws.pause();
    } else {
      // If current position is before work area start, seek to work area start
      const currentTime = ws.getCurrentTime();
      const workAreaStart = localWorkArea?.start ?? 0;
      const workAreaEnd = localWorkArea?.end ?? ws.getDuration();

      if (currentTime < workAreaStart || currentTime >= workAreaEnd) {
        ws.seekTo(workAreaStart / ws.getDuration());
      }

      ws.play().catch((err: Error) => {
        if (err.name !== 'AbortError') {
          console.error('Playback error:', err);
        }
      });
    }
  }, [localWorkArea]);

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

  // Start selecting a region
  const startSelection = useCallback(() => {
    if (isSelecting) {
      // Cancel selection
      setIsSelecting(false);
      setSelectionRange(null);
    } else {
      // Get effective work area (use prop directly to ensure we have the latest)
      const effectiveWorkArea = localWorkArea || workArea || { start: 0, end: duration };

      // Filter sequences that are within the work area
      const sequencesInWorkArea = sequences
        .filter(s => {
          if (s.start_time === null || s.end_time === null) return false;
          // Sequence is in work area if it overlaps with it
          return s.end_time > effectiveWorkArea.start && s.start_time < effectiveWorkArea.end;
        })
        .sort((a, b) => (a.end_time || 0) - (b.end_time || 0));

      // Start from work area start, or after last sequence in work area
      let startTime = effectiveWorkArea.start;

      if (sequencesInWorkArea.length > 0) {
        // Use the end of the last sequence that's within work area
        const lastSeq = sequencesInWorkArea[sequencesInWorkArea.length - 1];
        const lastEnd = lastSeq.end_time || 0;
        // Make sure we don't go before the work area start
        startTime = Math.max(effectiveWorkArea.start, lastEnd);
      }

      // Suggest 10 seconds or until work area end
      const endTime = Math.min(startTime + 10, effectiveWorkArea.end);

      if (endTime <= startTime) {
        toast.error('Plus de place disponible dans la zone de travail');
        return;
      }

      console.log('[WaveformHeader] Creating selection:', {
        workArea: effectiveWorkArea,
        startTime,
        endTime,
        sequencesInWorkArea: sequencesInWorkArea.length,
      });

      setSelectionRange({ start: startTime, end: endTime });
      setIsSelecting(true);
    }
  }, [isSelecting, sequences, duration, localWorkArea, workArea]);

  // Toggle work area editing mode
  const toggleWorkAreaEdit = useCallback(() => {
    if (isEditingWorkArea) {
      // Save changes
      if (localWorkArea && onWorkAreaChange) {
        onWorkAreaChange(localWorkArea);
        toast.success('Zone de travail sauvegardée');
      }
      setIsEditingWorkArea(false);
    } else {
      // Start editing - initialize work area if not set
      if (!localWorkArea && duration > 0) {
        setLocalWorkArea({ start: 0, end: duration });
      }
      setIsEditingWorkArea(true);
      // Cancel any selection
      setIsSelecting(false);
      setSelectionRange(null);
    }
  }, [isEditingWorkArea, localWorkArea, duration, onWorkAreaChange]);

  // Reset work area to full duration
  const resetWorkArea = useCallback(() => {
    setLocalWorkArea({ start: 0, end: duration });
  }, [duration]);

  // Create sequence from selection
  const createSequenceFromSelection = useCallback(async () => {
    if (!selectionRange) return;

    setIsCreating(true);
    try {
      await onCreateSequence(selectionRange.start, selectionRange.end);
      setIsSelecting(false);
      setSelectionRange(null);
      toast.success('Sequence created');
    } catch (error) {
      console.error('Error creating sequence:', error);
      toast.error('Failed to create sequence');
    } finally {
      setIsCreating(false);
    }
  }, [selectionRange, onCreateSequence]);

  return (
    <div className={cn('bg-[#0a0c0f] border-b border-white/10', className)}>
      {/* Waveform container */}
      <div className="relative overflow-visible">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
            <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
          </div>
        )}
        <div ref={containerRef} className="w-full [&_.wavesurfer-region]:overflow-visible" />
      </div>

      {/* Controls bar */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-white/5">
        {/* Left: Playback controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={skipBackward}
            className="h-8 w-8"
          >
            <SkipBack className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePlayPause}
            className="h-8 w-8"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={skipForward}
            className="h-8 w-8"
          >
            <SkipForward className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            className="h-8 w-8"
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </Button>
          <span className="text-sm text-slate-400 ml-2">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        {/* Center: Work area info */}
        <div className="flex items-center gap-2">
          {localWorkArea && !isEditingWorkArea && (
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">
              Zone: {formatTime(localWorkArea.start)} → {formatTime(localWorkArea.end)}
            </span>
          )}
          {isEditingWorkArea && localWorkArea && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-400">
                Début: {formatTime(localWorkArea.start)}
              </span>
              <span className="text-xs text-slate-500">→</span>
              <span className="text-xs text-red-400">
                Fin: {formatTime(localWorkArea.end)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetWorkArea}
                className="h-6 text-xs text-slate-400 hover:text-white"
              >
                Reset
              </Button>
            </div>
          )}
        </div>

        {/* Right: Selection and work area controls */}
        <div className="flex items-center gap-2">
          {/* Work area edit button */}
          <Button
            variant={isEditingWorkArea ? 'default' : 'outline'}
            size="sm"
            onClick={toggleWorkAreaEdit}
            className={cn(
              'gap-1',
              isEditingWorkArea
                ? 'bg-green-600 hover:bg-green-700'
                : 'border-slate-600 text-slate-300 hover:bg-slate-800'
            )}
            disabled={isSelecting}
          >
            <Scissors className="w-4 h-4" />
            {isEditingWorkArea ? 'Valider' : 'Zone'}
          </Button>

          {/* Selection controls */}
          {isSelecting && selectionRange && (
            <>
              <span className="text-sm text-slate-400">
                {formatTime(selectionRange.start)} - {formatTime(selectionRange.end)}
              </span>
              <Button
                size="sm"
                onClick={createSequenceFromSelection}
                disabled={isCreating}
                className="bg-green-600 hover:bg-green-700"
              >
                {isCreating ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : null}
                Confirmer
              </Button>
            </>
          )}
          <Button
            variant={isSelecting ? 'outline' : 'default'}
            size="sm"
            onClick={startSelection}
            disabled={isEditingWorkArea}
            className={isSelecting ? 'border-red-500 text-red-500' : 'bg-purple-600 hover:bg-purple-700'}
          >
            <Plus className="w-4 h-4 mr-1" />
            {isSelecting ? 'Annuler' : 'Nouvelle sequence'}
          </Button>
        </div>
      </div>
    </div>
  );
}
