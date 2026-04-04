'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
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
import { Play, Pause, Volume2, Music, X, Film } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSignedUrl } from '@/hooks/use-signed-url';
import type { AspectRatio } from '@/types/database';

// Video aspect ratio values
const ASPECT_RATIO_VALUES: Record<AspectRatio, number> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '1:1': 1,
  '4:5': 4 / 5,
  '21:9': 21 / 9,
  '2:3': 2 / 3,
};

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
  aspectRatio?: AspectRatio;

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
  aspectRatio = '16:9',
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
  const videoRef = useRef<HTMLVideoElement>(null);

  // Get signed URL for video preview
  const { signedUrl: signedVideoUrl, isLoading: isLoadingVideoUrl } = useSignedUrl(videoUrl || null);

  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // Get selected audio asset
  const selectedAsset = audioAssets.find(a => a.id === audioAssetId);
  const audioFileUrl = selectedAsset?.file_url && selectedAsset.file_url.length > 0 ? selectedAsset.file_url : null;
  const { signedUrl: signedAudioUrl, isLoading: isLoadingAudioUrl, error: audioUrlError } = useSignedUrl(audioFileUrl);

  // Proxy the audio URL to bypass CORS (WaveSurfer needs to fetch audio data)
  const proxiedAudioUrl = signedAudioUrl
    ? `/api/storage/proxy?url=${encodeURIComponent(signedAudioUrl)}`
    : null;

  // Calculate region duration
  const regionDuration = audioEnd ? audioEnd - audioStart : 0;

  // Max allowed region duration (can't exceed video duration minus offset)
  const maxRegionDuration = videoDuration - audioOffset;

  // Initialize WaveSurfer
  useEffect(() => {
    // Wait until we have a valid proxied URL (not loading, no error)
    if (!waveformRef.current || !proxiedAudioUrl || isLoadingAudioUrl) return;

    console.log('[AudioTrackEditor] Initializing with proxied URL');
    setIsLoading(true);
    setLoadError(null);

    // Destroy existing instance
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
      wavesurferRef.current = null;
    }

    // Create regions plugin
    const regions = RegionsPlugin.create();
    regionsRef.current = regions;

    // Create WaveSurfer with MediaElement backend for better CORS handling
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
      // Use media element backend - more forgiving with CORS
      backend: 'MediaElement',
      // Fetch with credentials for signed URLs
      fetchParams: {
        mode: 'cors',
      },
      plugins: [regions],
    });

    wavesurferRef.current = ws;

    // Handle load errors
    ws.on('error', (err) => {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[AudioTrackEditor] WaveSurfer error:', errorMsg);
      setLoadError(errorMsg);
      setIsLoading(false);
    });

    // Load audio via proxy to bypass CORS
    console.log('[AudioTrackEditor] Loading audio via proxy...');
    ws.load(proxiedAudioUrl);

    // Events
    ws.on('ready', () => {
      console.log('[AudioTrackEditor] Audio ready, duration:', ws.getDuration());
      setIsLoading(false);
      setLoadError(null);
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
        audio_offset: audioOffset,
        audio_volume: audioVolume,
      });
    });

    return () => {
      ws.destroy();
    };
  }, [proxiedAudioUrl, isLoadingAudioUrl, compact]);

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
      audio_offset: audioOffset,
      audio_volume: value[0],
    });
  };

  // Format time as mm:ss.ms
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  // Generate video filmstrip via server-side FFmpeg
  const [filmstripUrl, setFilmstripUrl] = useState<string | null>(null);
  const [isLoadingFilmstrip, setIsLoadingFilmstrip] = useState(false);
  const [filmstripLoaded, setFilmstripLoaded] = useState(false);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  // Extract projectId from the current URL
  const projectId = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const match = window.location.pathname.match(/\/project\/([^/]+)/);
    return match ? match[1] : null;
  }, []);

  // Measure container width once (with threshold to prevent flickering)
  useEffect(() => {
    if (!timelineRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      setContainerWidth(prev => {
        // Only update if significantly different (>20px) to prevent flickering
        if (prev === null || Math.abs(prev - width) > 20) {
          return Math.round(width);
        }
        return prev;
      });
    });

    observer.observe(timelineRef.current);
    return () => observer.disconnect();
  }, []);

  // Fixed height for filmstrip, width fills container
  const filmstripHeight = compact ? 60 : 80;

  // Fetch filmstrip from server (with hash-based caching)
  useEffect(() => {
    if (!videoUrl || videoDuration <= 0 || !projectId || !containerWidth) {
      setFilmstripUrl(null);
      setFilmstripLoaded(false);
      return;
    }

    let cancelled = false;
    setIsLoadingFilmstrip(true);
    setFilmstripLoaded(false);

    const fetchFilmstrip = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/video-thumbnails`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoUrl,
            timelineWidth: containerWidth,
            height: filmstripHeight,
          }),
        });

        if (cancelled) return;

        if (!response.ok) {
          const error = await response.json();
          console.error('[AudioTrackEditor] Filmstrip API error:', error);
          setFilmstripUrl(null);
          return;
        }

        const data = await response.json();

        if (!cancelled) {
          setFilmstripUrl(data.filmstripUrl || null);
        }
      } catch (error) {
        console.error('[AudioTrackEditor] Failed to fetch filmstrip:', error);
        if (!cancelled) {
          setFilmstripUrl(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingFilmstrip(false);
        }
      }
    };

    fetchFilmstrip();

    return () => {
      cancelled = true;
    };
  }, [videoUrl, videoDuration, projectId, containerWidth, filmstripHeight]);

  // Sync video with audio playback
  useEffect(() => {
    if (!videoRef.current || !wavesurferRef.current) return;

    // Sync video time with audio time (accounting for audio offset)
    const syncTime = currentTime - audioOffset;
    if (syncTime >= 0 && syncTime <= videoDuration) {
      videoRef.current.currentTime = syncTime;
    }
  }, [currentTime, audioOffset, videoDuration]);

  // Play/pause video in sync with audio
  useEffect(() => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  // Calculate preview dimensions
  const previewHeight = compact ? 120 : 180;
  const videoAspectRatio = ASPECT_RATIO_VALUES[aspectRatio];
  const previewWidth = Math.round(previewHeight * videoAspectRatio);

  return (
    <div className={cn('space-y-3 p-3 bg-[#0d1218] rounded-lg border border-white/5', className)}>
      {/* Video Preview - Centered */}
      <div className="flex justify-center">
        <div
          className="relative bg-black rounded-lg border border-white/10 overflow-hidden"
          style={{ width: previewWidth, height: previewHeight }}
        >
          {signedVideoUrl ? (
            <video
              ref={videoRef}
              src={signedVideoUrl}
              className="w-full h-full object-contain"
              muted
              playsInline
              preload="metadata"
            />
          ) : isLoadingVideoUrl ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
              <Film className="w-8 h-8 mb-2 opacity-50" />
              <span className="text-xs">Aucune vidéo</span>
            </div>
          )}

          {/* Time overlay */}
          {signedVideoUrl && (
            <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/70 rounded text-[10px] text-white/80 font-mono">
              {formatTime(currentTime > 0 ? Math.max(0, currentTime - audioOffset) : 0)}
            </div>
          )}
        </div>
      </div>

      {/* Video Timeline (filmstrip) - Always visible */}
      <div className="space-y-1">
        <Label className="text-[10px] text-slate-500 uppercase tracking-wider">
          Vidéo ({formatTime(videoDuration)})
        </Label>
        <div
          ref={timelineRef}
          className={cn(
            "relative bg-[#1a2433] rounded border border-white/10",
            compact ? "h-[60px]" : "h-20"
          )}
        >
          {/* Filmstrip */}
          {filmstripUrl ? (
            <div className="relative w-full h-full">
              <img
                src={filmstripUrl}
                alt=""
                className="w-full h-full object-cover"
                onLoad={() => setFilmstripLoaded(true)}
                style={{ display: filmstripLoaded ? 'block' : 'none' }}
              />
              {/* Loading placeholder while image loads */}
              {!filmstripLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-800/50">
                  <div className="animate-spin w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full" />
                </div>
              )}
              {/* Time markers overlay */}
              {filmstripLoaded && (
                <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 py-0.5 text-[9px] text-white/70 bg-gradient-to-t from-black/50 to-transparent pointer-events-none">
                  <span>0s</span>
                  <span>{formatTime(videoDuration / 2)}</span>
                  <span>{formatTime(videoDuration)}</span>
                </div>
              )}
            </div>
          ) : isLoadingFilmstrip || !containerWidth ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-800/50">
              <div className="animate-spin w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full" />
            </div>
          ) : !videoUrl ? (
            <div className="h-full w-full flex items-center justify-center text-slate-500 text-xs">
              Aucune vidéo
            </div>
          ) : (
            <div className="h-full w-full bg-slate-800/30" />
          )}
        </div>
      </div>

      {/* Audio selector */}
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

      {/* Audio waveform section - Only when audio is selected */}
      {audioAssetId && (
        <>
          {isLoadingAudioUrl && (
            <div className="flex items-center justify-center py-4 text-slate-500 text-sm">
              <div className="animate-spin w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full mr-2" />
              Chargement de l'audio...
            </div>
          )}

          {audioUrlError && (
            <div className="py-2 px-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-xs">
              Erreur URL: {audioUrlError.message}
            </div>
          )}

          {loadError && (
            <div className="py-2 px-3 bg-orange-500/10 border border-orange-500/30 rounded text-orange-400 text-xs">
              Erreur audio: {loadError}
            </div>
          )}

          {signedAudioUrl && !isLoadingAudioUrl && (
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

              {/* Instructions */}
              <p className="text-[10px] text-slate-600 italic">
                Glissez sur la waveform pour sélectionner la région audio.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
