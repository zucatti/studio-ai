'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin, { Region } from 'wavesurfer.js/dist/plugins/regions.js';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Play, Pause, Volume2, Music, X, GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSignedUrl } from '@/hooks/use-signed-url';

interface AudioAsset {
  id: string;
  name: string;
  file_url: string;
  duration?: number;
}

interface AudioTrackEditorProps {
  // Video info
  videoUrl?: string;
  videoDuration: number; // seconds

  // Current audio settings
  audioAssetId: string | null;
  audioStart: number;      // Region start in audio file
  audioEnd: number | null; // Region end in audio file
  audioOffset: number;     // Where audio starts in video timeline
  audioVolume: number;

  // Available audio assets from Bible
  audioAssets: AudioAsset[];

  // Callbacks
  onAudioChange: (settings: {
    audio_asset_id: string | null;
    audio_start: number;
    audio_end: number | null;
    audio_offset: number;
    audio_volume: number;
  }) => void;

  // Optional
  className?: string;
  compact?: boolean;
}

export function AudioTrackEditor({
  videoUrl,
  videoDuration,
  audioAssetId,
  audioStart,
  audioEnd,
  audioOffset,
  audioVolume,
  audioAssets,
  onAudioChange,
  className,
  compact = false,
}: AudioTrackEditorProps) {
  // Refs
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const regionRef = useRef<Region | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isDraggingOffset, setIsDraggingOffset] = useState(false);
  const [localOffset, setLocalOffset] = useState(audioOffset);

  // Get selected audio asset
  const selectedAsset = audioAssets.find(a => a.id === audioAssetId);
  const { signedUrl: signedAudioUrl } = useSignedUrl(selectedAsset?.file_url || null);
  const { signedUrl: signedVideoUrl } = useSignedUrl(videoUrl || null);

  // Calculate region duration
  const regionDuration = audioEnd ? audioEnd - audioStart : 0;

  // Max allowed region duration (can't exceed video duration minus offset)
  const maxRegionDuration = videoDuration - localOffset;

  // Initialize WaveSurfer
  useEffect(() => {
    if (!waveformRef.current || !signedAudioUrl) return;

    setIsLoading(true);

    // Destroy existing instance
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
    }

    // Create regions plugin
    const regions = RegionsPlugin.create();
    regionsRef.current = regions;

    // Create WaveSurfer
    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: '#4f46e5',
      progressColor: '#818cf8',
      cursorColor: '#c7d2fe',
      height: compact ? 48 : 64,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      plugins: [regions],
    });

    wavesurferRef.current = ws;

    // Load audio
    ws.load(signedAudioUrl);

    // Events
    ws.on('ready', () => {
      setIsLoading(false);
      setAudioDuration(ws.getDuration());

      // Create initial region if we have settings
      if (audioStart !== undefined && audioEnd) {
        const region = regions.addRegion({
          start: audioStart,
          end: Math.min(audioEnd, audioStart + maxRegionDuration),
          color: 'rgba(139, 92, 246, 0.3)',
          drag: true,
          resize: true,
        });
        regionRef.current = region;
      }
    });

    ws.on('timeupdate', (time) => {
      setCurrentTime(time);
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));

    // Region events
    regions.on('region-updated', (region) => {
      // Constrain region duration to max allowed
      let newEnd = region.end;
      const newDuration = region.end - region.start;

      if (newDuration > maxRegionDuration) {
        newEnd = region.start + maxRegionDuration;
        region.setOptions({ end: newEnd });
      }

      onAudioChange({
        audio_asset_id: audioAssetId,
        audio_start: region.start,
        audio_end: newEnd,
        audio_offset: localOffset,
        audio_volume: audioVolume,
      });
    });

    return () => {
      ws.destroy();
    };
  }, [signedAudioUrl, compact]);

  // Update region when audioStart/audioEnd changes externally
  useEffect(() => {
    if (!regionsRef.current || !audioDuration) return;

    // Clear existing regions
    regionsRef.current.clearRegions();

    if (audioStart !== undefined && audioEnd) {
      const region = regionsRef.current.addRegion({
        start: audioStart,
        end: Math.min(audioEnd, audioStart + maxRegionDuration),
        color: 'rgba(139, 92, 246, 0.3)',
        drag: true,
        resize: true,
      });
      regionRef.current = region;
    }
  }, [audioStart, audioEnd, audioDuration, maxRegionDuration]);

  // Sync localOffset with prop
  useEffect(() => {
    setLocalOffset(audioOffset);
  }, [audioOffset]);

  // Handle play/pause
  const togglePlayback = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  };

  // Handle audio asset selection
  const handleAssetSelect = (assetId: string) => {
    if (assetId === 'none') {
      onAudioChange({
        audio_asset_id: null,
        audio_start: 0,
        audio_end: null,
        audio_offset: 0,
        audio_volume: 1.0,
      });
    } else {
      // Reset to defaults when changing audio
      onAudioChange({
        audio_asset_id: assetId,
        audio_start: 0,
        audio_end: Math.min(5, videoDuration), // Default 5s or video duration
        audio_offset: 0,
        audio_volume: audioVolume,
      });
    }
  };

  // Handle volume change
  const handleVolumeChange = (value: number[]) => {
    onAudioChange({
      audio_asset_id: audioAssetId,
      audio_start: audioStart,
      audio_end: audioEnd,
      audio_offset: localOffset,
      audio_volume: value[0],
    });
  };

  // Handle offset drag
  const handleOffsetDrag = useCallback((e: React.MouseEvent) => {
    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const newOffset = percentage * videoDuration;

    // Ensure audio doesn't exceed video duration
    const maxOffset = videoDuration - regionDuration;
    const constrainedOffset = Math.max(0, Math.min(newOffset, maxOffset));

    setLocalOffset(constrainedOffset);
  }, [videoDuration, regionDuration]);

  const handleOffsetDragEnd = useCallback(() => {
    setIsDraggingOffset(false);
    onAudioChange({
      audio_asset_id: audioAssetId,
      audio_start: audioStart,
      audio_end: audioEnd,
      audio_offset: localOffset,
      audio_volume: audioVolume,
    });
  }, [audioAssetId, audioStart, audioEnd, localOffset, audioVolume, onAudioChange]);

  // Mouse move handler for dragging
  useEffect(() => {
    if (!isDraggingOffset) return;

    const handleMouseMove = (e: MouseEvent) => {
      handleOffsetDrag(e as unknown as React.MouseEvent);
    };

    const handleMouseUp = () => {
      handleOffsetDragEnd();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingOffset, handleOffsetDrag, handleOffsetDragEnd]);

  // Format time as mm:ss.ms
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  // Generate video thumbnails (filmstrip)
  const thumbnailCount = compact ? 6 : 10;
  const thumbnails = useMemo(() => {
    if (!signedVideoUrl) return [];
    // We'll generate placeholder thumbnails - actual implementation would use video frames
    return Array.from({ length: thumbnailCount }, (_, i) => ({
      time: (i / thumbnailCount) * videoDuration,
      index: i,
    }));
  }, [signedVideoUrl, videoDuration, thumbnailCount]);

  // Calculate audio block position and width on timeline
  const audioBlockStyle = useMemo(() => {
    if (!audioEnd) return { display: 'none' };

    const offsetPercent = (localOffset / videoDuration) * 100;
    const widthPercent = (regionDuration / videoDuration) * 100;

    return {
      left: `${offsetPercent}%`,
      width: `${Math.min(widthPercent, 100 - offsetPercent)}%`,
    };
  }, [localOffset, regionDuration, videoDuration, audioEnd]);

  return (
    <div className={cn('space-y-3 p-3 bg-[#0d1218] rounded-lg border border-white/5', className)}>
      {/* Header: Asset selector + Volume */}
      <div className="flex items-center gap-3">
        <Music className="w-4 h-4 text-purple-400 flex-shrink-0" />

        <Select
          value={audioAssetId || 'none'}
          onValueChange={handleAssetSelect}
        >
          <SelectTrigger className="flex-1 h-8 text-xs bg-[#1a2433] border-white/10">
            <SelectValue placeholder="Sélectionner audio..." />
          </SelectTrigger>
          <SelectContent className="bg-[#1a2433] border-white/10">
            <SelectItem value="none" className="text-slate-400">
              Aucun audio
            </SelectItem>
            {audioAssets.map((asset) => (
              <SelectItem key={asset.id} value={asset.id}>
                {asset.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {audioAssetId && (
          <>
            <div className="flex items-center gap-2 min-w-[120px]">
              <Volume2 className="w-3.5 h-3.5 text-slate-400" />
              <Slider
                value={[audioVolume]}
                onValueChange={handleVolumeChange}
                min={0}
                max={1}
                step={0.05}
                className="w-20"
              />
              <span className="text-[10px] text-slate-500 w-8">
                {Math.round(audioVolume * 100)}%
              </span>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-slate-500 hover:text-white"
              onClick={() => handleAssetSelect('none')}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </>
        )}
      </div>

      {audioAssetId && signedAudioUrl && (
        <>
          {/* Video Timeline (filmstrip placeholder) */}
          <div className="space-y-1">
            <Label className="text-[10px] text-slate-500 uppercase tracking-wider">
              Vidéo ({formatTime(videoDuration)})
            </Label>
            <div
              ref={timelineRef}
              className="relative h-10 bg-[#1a2433] rounded border border-white/10 overflow-hidden"
            >
              {/* Filmstrip thumbnails */}
              <div className="absolute inset-0 flex">
                {thumbnails.map((thumb) => (
                  <div
                    key={thumb.index}
                    className="flex-1 border-r border-white/5 bg-gradient-to-b from-slate-700/30 to-slate-800/30"
                  />
                ))}
              </div>

              {/* Time markers */}
              <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1 text-[8px] text-slate-500">
                <span>0s</span>
                <span>{formatTime(videoDuration / 2)}</span>
                <span>{formatTime(videoDuration)}</span>
              </div>

              {/* Audio block (draggable) */}
              {audioEnd && (
                <div
                  className={cn(
                    'absolute top-1 bottom-1 rounded cursor-grab active:cursor-grabbing',
                    'bg-purple-500/40 border border-purple-400/50',
                    'flex items-center justify-center',
                    isDraggingOffset && 'ring-2 ring-purple-400'
                  )}
                  style={audioBlockStyle}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setIsDraggingOffset(true);
                  }}
                >
                  <GripHorizontal className="w-3 h-3 text-purple-300/70" />
                </div>
              )}
            </div>

            {/* Offset indicator */}
            {audioEnd && (
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>Début audio: {formatTime(localOffset)}</span>
                <span>Durée: {formatTime(regionDuration)}</span>
              </div>
            )}
          </div>

          {/* Audio Waveform with Region Selector */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] text-slate-500 uppercase tracking-wider">
                Source audio ({formatTime(audioDuration)})
              </Label>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={togglePlayback}
                disabled={isLoading}
              >
                {isPlaying ? (
                  <Pause className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>

            <div
              ref={waveformRef}
              className={cn(
                'rounded border border-white/10 bg-[#1a2433]',
                isLoading && 'animate-pulse'
              )}
            />

            {/* Region info */}
            {audioEnd && (
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>Région: {formatTime(audioStart)} → {formatTime(audioEnd)}</span>
                <span className="text-purple-400">
                  Sélection: {formatTime(regionDuration)}
                </span>
              </div>
            )}
          </div>

          {/* Instructions */}
          <p className="text-[10px] text-slate-600 italic">
            Glissez sur la waveform pour sélectionner la région audio.
            Déplacez le bloc violet pour positionner l'audio dans la vidéo.
          </p>
        </>
      )}
    </div>
  );
}
