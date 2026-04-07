'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, Download, Loader2, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StorageImg } from '@/components/ui/storage-image';
import { useSignedUrl, isB2Url } from '@/hooks/use-signed-url';

interface VideoCardProps {
  videoUrl: string;
  thumbnailUrl?: string;
  title?: string;
  subtitle?: string;
  aspectRatio?: string;
  onExpand?: () => void;
  onDownload?: () => void;
  autoPlay?: boolean;
  className?: string;
}

export function VideoCard({
  videoUrl,
  thumbnailUrl,
  title,
  subtitle,
  aspectRatio = '9:16',
  onExpand,
  onDownload,
  autoPlay = false,
  className,
}: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  // Sign B2 URLs
  const { signedUrl, isLoading: isSigningUrl, error: signError } = useSignedUrl(videoUrl);
  const finalVideoUrl = signedUrl || (isB2Url(videoUrl) ? null : videoUrl);

  // Aspect ratio classes
  const aspectStyles: Record<string, string> = {
    '9:16': 'aspect-[9/16]',
    '16:9': 'aspect-video',
    '1:1': 'aspect-square',
    '4:5': 'aspect-[4/5]',
    '2:3': 'aspect-[2/3]',
    '21:9': 'aspect-[21/9]',
  };
  const aspectClass = aspectStyles[aspectRatio] || 'aspect-video';

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  }, [isPlaying]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  // Handle slider change
  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const time = parseFloat(e.target.value);
    video.currentTime = time;
    setCurrentTime(time);
  }, []);

  // Track video events - re-attach when video element becomes available
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !finalVideoUrl) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleLoadedMetadata = () => {
      setVideoDuration(video.duration);
    };
    const handleDurationChange = () => {
      if (video.duration && !isNaN(video.duration)) {
        setVideoDuration(video.duration);
      }
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    // If video is already loaded, get duration now
    if (video.duration && !isNaN(video.duration)) {
      setVideoDuration(video.duration);
    }

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [finalVideoUrl]);

  // Auto-play when URL is ready
  useEffect(() => {
    if (autoPlay && videoRef.current && finalVideoUrl) {
      videoRef.current.play().catch(() => {});
    }
  }, [autoPlay, finalVideoUrl]);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Show error state
  if (signError) {
    return (
      <div
        className={cn(
          "relative rounded-xl overflow-hidden border-2 border-red-500/50 flex flex-col items-center justify-center bg-black text-red-400",
          aspectClass,
          className
        )}
      >
        <span className="text-sm">Erreur de chargement</span>
        <span className="text-xs text-red-400/70 mt-1">{signError.message}</span>
      </div>
    );
  }

  // Show loading state while signing B2 URL
  if (isSigningUrl || (isB2Url(videoUrl) && !finalVideoUrl)) {
    return (
      <div
        className={cn(
          "relative rounded-xl overflow-hidden border-2 border-white/10 flex items-center justify-center bg-black",
          aspectClass,
          className
        )}
      >
        <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative rounded-xl overflow-hidden border-2 border-blue-500/30 bg-black group",
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        src={finalVideoUrl || undefined}
        loop
        muted={isMuted}
        playsInline
        preload="metadata"
        className={cn("w-full h-full object-contain cursor-pointer", aspectClass)}
        onClick={togglePlayPause}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onLoadedMetadata={(e) => {
          const video = e.currentTarget;
          if (video.duration && !isNaN(video.duration)) {
            setVideoDuration(video.duration);
          }
        }}
      />

      {/* Thumbnail overlay when not playing and not hovered */}
      {!isPlaying && !isHovered && thumbnailUrl && (
        <div className="absolute inset-0 pointer-events-none">
          <StorageImg
            src={thumbnailUrl}
            alt={title || 'Video thumbnail'}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Play/Pause overlay - same as PlanEditor */}
      {isHovered && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(0,0,0,0.3) 0%, transparent 70%)' }}
        >
          <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            {isPlaying ? (
              <Pause className="w-10 h-10 text-white" />
            ) : (
              <Play className="w-10 h-10 text-white fill-white ml-1" />
            )}
          </div>
        </div>
      )}

      {/* Label - same style as PlanEditor "Vidéo générée" */}
      {title && (
        <div className="absolute top-2 left-2 flex items-center gap-2">
          <div className="px-2 py-0.5 rounded bg-blue-500/80 text-xs font-medium text-white flex items-center gap-1">
            <Video className="w-3 h-3" />
            {title}
          </div>
        </div>
      )}

      {/* Top right controls - same as PlanEditor */}
      <div className={cn(
        'absolute top-2 right-2 flex items-center gap-2 transition-opacity duration-200',
        isHovered ? 'opacity-100' : 'opacity-0'
      )}>
        {onDownload && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            className="w-8 h-8 rounded-full bg-black/50 backdrop-blur flex items-center justify-center hover:bg-black/70 transition-colors"
          >
            <Download className="w-4 h-4 text-white" />
          </button>
        )}
        {onExpand && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExpand();
            }}
            className="w-8 h-8 rounded-full bg-black/50 backdrop-blur flex items-center justify-center hover:bg-black/70 transition-colors"
          >
            <Maximize2 className="w-4 h-4 text-white" />
          </button>
        )}
      </div>

      {/* Progress bar - EXACT same as PlanEditor */}
      <div className={cn(
        'absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-200',
        isHovered ? 'opacity-100' : 'opacity-0'
      )}>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/70 w-10 text-right font-mono">
            {formatTime(currentTime)}
          </span>
          <div className="flex-1 relative h-1 group/slider">
            <input
              type="range"
              min={0}
              max={videoDuration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleSliderChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className="absolute inset-0 bg-white/20 rounded-full" />
            <div
              className="absolute left-0 top-0 h-full bg-blue-500 rounded-full transition-all"
              style={{ width: videoDuration ? `${(currentTime / videoDuration) * 100}%` : '0%' }}
            />
          </div>
          <span className="text-xs text-white/70 w-10 font-mono">
            {formatTime(videoDuration)}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-white/70" />
            ) : (
              <Volume2 className="w-4 h-4 text-white/70" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
