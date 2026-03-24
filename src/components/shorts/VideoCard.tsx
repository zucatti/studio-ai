'use client';

import { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, Download, Loader2 } from 'lucide-react';
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
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showControls, setShowControls] = useState(false);

  // Sign B2 URLs
  const { signedUrl, isLoading: isSigningUrl, error: signError } = useSignedUrl(videoUrl);
  const finalVideoUrl = signedUrl || (isB2Url(videoUrl) ? null : videoUrl);

  // Debug logging
  useEffect(() => {
    if (isB2Url(videoUrl)) {
      console.log('[VideoCard] B2 URL:', videoUrl);
      console.log('[VideoCard] Signed URL:', signedUrl);
      console.log('[VideoCard] Error:', signError);
      console.log('[VideoCard] Loading:', isSigningUrl);
    }
  }, [videoUrl, signedUrl, signError, isSigningUrl]);

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

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleLoadedMetadata = () => setDuration(video.duration);
    const handleEnded = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('ended', handleEnded);
    };
  }, []);

  useEffect(() => {
    if (autoPlay && videoRef.current) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [autoPlay]);

  const togglePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().catch(() => {});
      setIsPlaying(true);
    }
    setShowControls(true);
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleSliderClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Show error state
  if (signError) {
    return (
      <div
        className={cn(
          "relative rounded-lg overflow-hidden border-2 border-red-500/50 flex flex-col items-center justify-center bg-black text-red-400",
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
          "relative rounded-lg overflow-hidden border-2 border-white/10 flex items-center justify-center bg-black",
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
        "relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer group",
        isPlaying ? "border-blue-500" : "border-white/10 hover:border-white/20",
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={togglePlayPause}
    >
      {/* Video element - hidden controls */}
      <video
        ref={videoRef}
        src={finalVideoUrl || ''}
        loop
        muted={isMuted}
        playsInline
        className={cn("w-full object-contain bg-black", aspectClass)}
      />

      {/* Thumbnail overlay when not playing and not hovered */}
      {!isPlaying && !isHovered && thumbnailUrl && (
        <div className="absolute inset-0">
          <StorageImg
            src={thumbnailUrl}
            alt={title || 'Video thumbnail'}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Play/Pause overlay */}
      {(isHovered || !isPlaying) && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center transition-opacity">
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center hover:bg-white/30 transition-colors">
            {isPlaying ? (
              <Pause className="w-5 h-5 text-white fill-white" />
            ) : (
              <Play className="w-6 h-6 text-white fill-white ml-0.5" />
            )}
          </div>
        </div>
      )}

      {/* Top controls - Expand & Download */}
      {isHovered && (
        <div className="absolute top-2 right-2 flex items-center gap-1.5">
          {onDownload && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownload();
              }}
              className="w-8 h-8 rounded-full bg-black/50 backdrop-blur flex items-center justify-center hover:bg-black/70 transition-colors"
              title="Télécharger"
            >
              <Download className="w-4 h-4 text-white" />
            </button>
          )}
          {onExpand && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                // Pause before expanding
                if (videoRef.current && isPlaying) {
                  videoRef.current.pause();
                  setIsPlaying(false);
                }
                onExpand();
              }}
              className="w-8 h-8 rounded-full bg-black/50 backdrop-blur flex items-center justify-center hover:bg-black/70 transition-colors"
              title="Agrandir"
            >
              <Maximize2 className="w-4 h-4 text-white" />
            </button>
          )}
        </div>
      )}

      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 pt-8">
        {/* Progress slider */}
        {(isHovered || isPlaying) && (
          <div className="mb-2" onClick={handleSliderClick}>
            <div className="relative h-1 bg-white/20 rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-blue-500 rounded-full"
                style={{ width: `${progress}%` }}
              />
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                onClick={handleSliderClick}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* Info row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {title && (
              <span className="text-xs font-medium text-white">{title}</span>
            )}
            {isPlaying && (
              <span className="text-[10px] text-slate-400">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Mute button */}
            {isHovered && (
              <button
                onClick={toggleMute}
                className="p-1 rounded hover:bg-white/10 transition-colors"
                title={isMuted ? 'Activer le son' : 'Couper le son'}
              >
                {isMuted ? (
                  <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-white" />
                )}
              </button>
            )}
            {subtitle && (
              <span className="text-xs text-slate-300">{subtitle}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
