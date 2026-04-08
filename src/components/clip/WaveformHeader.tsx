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

interface WaveformHeaderProps {
  audioUrl: string;
  sequences: Sequence[];
  onCreateSequence: (startTime: number, endTime: number) => Promise<void>;
  onSequenceSelect?: (sequence: Sequence | null) => void;
  selectedSequenceId?: string | null;
  className?: string;
}

export function WaveformHeader({
  audioUrl,
  sequences,
  onCreateSequence,
  onSequenceSelect,
  selectedSequenceId,
  className,
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

  // Update regions when sequences change
  useEffect(() => {
    if (!regionsRef.current || isLoading) return;

    // Clear existing regions
    regionsRef.current.clearRegions();

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
      const selectionRegion = regionsRef.current.addRegion({
        id: 'selection',
        start: selectionRange.start,
        end: selectionRange.end,
        color: 'rgba(34, 197, 94, 0.3)',
        drag: true,
        resize: true,
        minLength: 3,
      });

      selectionRegion.on('update-end', () => {
        setSelectionRange({
          start: Math.max(0, selectionRegion.start),
          end: Math.min(duration, selectionRegion.end),
        });
      });
    }
  }, [sequences, isLoading, selectedSequenceId, selectionRange, isSelecting, duration, formatTime, onSequenceSelect]);

  // Playback controls
  const togglePlayPause = useCallback(() => {
    const ws = wavesurferRef.current;
    if (!ws) return;

    if (ws.isPlaying()) {
      ws.pause();
    } else {
      ws.play().catch((err: Error) => {
        if (err.name !== 'AbortError') {
          console.error('Playback error:', err);
        }
      });
    }
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

  // Start selecting a region
  const startSelection = useCallback(() => {
    if (isSelecting) {
      // Cancel selection
      setIsSelecting(false);
      setSelectionRange(null);
    } else {
      // Find first gap or use end of last sequence
      const sortedSequences = [...sequences]
        .filter(s => s.start_time !== null && s.end_time !== null)
        .sort((a, b) => (a.start_time || 0) - (b.start_time || 0));

      let startTime = 0;
      if (sortedSequences.length > 0) {
        const lastSeq = sortedSequences[sortedSequences.length - 1];
        startTime = lastSeq.end_time || 0;
      }

      // Suggest 10 seconds or until end
      const endTime = Math.min(startTime + 10, duration);

      if (endTime <= startTime) {
        toast.error('Plus de place disponible');
        return;
      }

      setSelectionRange({ start: startTime, end: endTime });
      setIsSelecting(true);
    }
  }, [isSelecting, sequences, duration]);

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
      <div className="relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
            <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
          </div>
        )}
        <div ref={containerRef} className="w-full" />
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

        {/* Right: Selection controls */}
        <div className="flex items-center gap-2">
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
