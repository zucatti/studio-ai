'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Layers, Play, Pause, Loader2, Volume2, VolumeX, Maximize2, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSignedUrl, isB2Url } from '@/hooks/use-signed-url';
import type { Sequence } from '@/types/cinematic';
import type { Plan } from '@/store/shorts-store';

interface SequenceClipProps {
  sequence: Sequence;
  plans: Plan[];
  aspectRatio?: string; // '9:16', '1:1', '16:9'
  assembledVideoUrl?: string | null;
  assemblyProgress?: number; // 0-100, undefined = not assembling
  isSelected?: boolean;
  onSelect?: () => void;
  onExpand?: () => void; // Open in gallery/expanded view
  isDragging?: boolean;
}

export function SequenceClip({
  sequence,
  plans,
  aspectRatio = '9:16',
  assembledVideoUrl,
  assemblyProgress,
  isSelected,
  onSelect,
  onExpand,
  isDragging,
}: SequenceClipProps) {
  // Calculate dimensions based on aspect ratio (match Edition storyboard size)
  const getClipDimensions = () => {
    switch (aspectRatio) {
      case '16:9':
        return { width: 280, height: 158 }; // 16:9
      case '1:1':
        return { width: 200, height: 200 }; // 1:1
      case '9:16':
      default:
        return { width: 160, height: 284 }; // 9:16 exact ratio (like Edition)
    }
  };
  const clipDimensions = getClipDimensions();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [videoProgress, setVideoProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  // Sign B2 URL if needed
  const { signedUrl } = useSignedUrl(assembledVideoUrl || null);
  const finalVideoUrl = signedUrl || (assembledVideoUrl && !isB2Url(assembledVideoUrl) ? assembledVideoUrl : null);

  const totalDuration = plans.reduce((sum, p) => sum + p.duration, 0);
  const isAssembling = assemblyProgress !== undefined && assemblyProgress < 100;
  const hasAssembledVideo = !!finalVideoUrl;

  // Toggle play/pause
  const togglePlayPause = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    const video = videoRef.current;
    if (!video || !finalVideoUrl) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [isPlaying, finalVideoUrl]);

  // Toggle mute
  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  // Ref for progress bar seek
  const progressTrackRef = useRef<HTMLDivElement>(null);

  // Track video progress and duration
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (video.duration) {
        setCurrentTime(video.currentTime);
        setVideoProgress((video.currentTime / video.duration) * 100);
      }
    };

    const handleLoadedMetadata = () => {
      setVideoDuration(video.duration);
    };

    const handleEnded = () => {
      if (!video.loop) {
        setIsPlaying(false);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('ended', handleEnded);

    // If video already has metadata (e.g., from cache), set duration
    if (video.duration && isFinite(video.duration)) {
      setVideoDuration(video.duration);
    }

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('ended', handleEnded);
    };
  }, [finalVideoUrl]); // Re-run when video URL changes

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  };

  return (
    <div
      className={cn(
        "relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer flex flex-col group",
        "bg-[#0d1218] flex-shrink-0",
        isSelected
          ? "border-blue-500 ring-2 ring-blue-500/30"
          : isPlaying
            ? "border-purple-500"
            : "border-white/10 hover:border-white/20",
        isDragging && "opacity-50 scale-95"
      )}
      style={{
        width: `${clipDimensions.width}px`,
        height: `${clipDimensions.height}px`,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Video/Thumbnail area */}
      <div className="relative bg-black flex-1 min-h-0">
        {hasAssembledVideo ? (
          <>
            <video
              ref={videoRef}
              src={finalVideoUrl}
              className="w-full h-full object-cover"
              muted={isMuted}
              loop
              playsInline
              onClick={togglePlayPause}
            />
            {/* Play/Pause overlay - pointer-events-none so progress bar works */}
            {(isHovered || !isPlaying) && !isAssembling && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity pointer-events-none">
                <button
                  onClick={togglePlayPause}
                  className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center hover:bg-white/30 transition-colors pointer-events-auto cursor-pointer"
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 text-white fill-white" />
                  ) : (
                    <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                  )}
                </button>
              </div>
            )}

            {/* Top controls - Download, Mute, Gallery */}
            {isHovered && (
              <div className="absolute top-2 right-2 flex items-center gap-1.5 z-30">
                {/* Download button */}
                {finalVideoUrl && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const a = document.createElement('a');
                      a.href = finalVideoUrl;
                      a.download = `${sequence.title || 'sequence'}.mp4`;
                      a.click();
                    }}
                    className="w-7 h-7 rounded-full bg-black/50 backdrop-blur flex items-center justify-center hover:bg-black/70 transition-colors"
                    title="Télécharger"
                  >
                    <Download className="w-3.5 h-3.5 text-white" />
                  </button>
                )}
                {/* Mute button */}
                <button
                  onClick={toggleMute}
                  className="w-7 h-7 rounded-full bg-black/50 backdrop-blur flex items-center justify-center hover:bg-black/70 transition-colors"
                  title={isMuted ? 'Activer le son' : 'Couper le son'}
                >
                  {isMuted ? (
                    <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-white" />
                  )}
                </button>
                {/* Open in sequences gallery */}
                {onExpand && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onExpand();
                    }}
                    className="w-7 h-7 rounded-full bg-black/50 backdrop-blur flex items-center justify-center hover:bg-black/70 transition-colors"
                    title="Ouvrir dans la galerie"
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-white" />
                  </button>
                )}
              </div>
            )}

            {/* Bottom controls with progress bar */}
            <div className={cn(
              "absolute bottom-0 left-0 right-0 p-1.5 pt-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent transition-opacity z-30",
              (isHovered || isPlaying) ? "opacity-100" : "opacity-0"
            )}>
              {/* Clickable progress bar */}
              <div
                ref={progressTrackRef}
                className="relative h-3 mb-0.5 cursor-pointer group/progress rounded-full"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const video = videoRef.current;
                  const track = progressTrackRef.current;
                  if (!video || !track) return;

                  const duration = video.duration;
                  if (!duration || !isFinite(duration)) return;

                  const rect = track.getBoundingClientRect();
                  const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                  const percentage = x / rect.width;
                  const newTime = percentage * duration;

                  video.currentTime = newTime;
                  setCurrentTime(newTime);
                  setVideoProgress(percentage * 100);
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Track background */}
                <div className="absolute inset-0 bg-white/20 rounded-full" />
                {/* Progress fill */}
                <div
                  className="absolute inset-y-0 left-0 bg-purple-500 rounded-full"
                  style={{ width: `${videoProgress}%` }}
                />
                {/* Scrubber handle */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-lg opacity-0 group-hover/progress:opacity-100 transition-opacity pointer-events-none"
                  style={{ left: `calc(${videoProgress}% - 6px)` }}
                />
              </div>

              {/* Time display */}
              {(isHovered || isPlaying) && videoDuration > 0 && (
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-white/80 tabular-nums">
                    {formatTime(currentTime)}
                  </span>
                  <span className="text-white/50 tabular-nums">
                    {formatTime(videoDuration)}
                  </span>
                </div>
              )}
            </div>
          </>
        ) : isAssembling ? (
          /* Assembling state */
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
            <Loader2 className="w-6 h-6 text-blue-400 animate-spin mb-2" />
            <span className="text-xs text-slate-400">Assemblage...</span>
            <span className="text-lg font-bold text-white">{Math.round(assemblyProgress)}%</span>
            {/* Assembly progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${assemblyProgress}%` }} />
            </div>
          </div>
        ) : (
          /* Thumbnails grid fallback */
          <div className="absolute inset-0 grid grid-cols-2 gap-0.5 p-0.5">
            {plans.slice(0, 4).map((plan, i) => (
              <ThumbnailCell key={plan.id} plan={plan} index={i} total={Math.min(plans.length, 4)} />
            ))}
            {plans.length === 0 && (
              <div className="col-span-2 flex items-center justify-center text-slate-600 text-xs">
                Aucun plan
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info bar */}
      <div
        className={cn(
          "px-2 py-1.5 bg-[#151d28] border-t border-white/5",
          onSelect && "cursor-pointer hover:bg-[#1a2433]"
        )}
        onClick={onSelect}
      >
        <div className="flex items-center gap-1.5">
          <Layers className="w-3 h-3 text-purple-400 flex-shrink-0" />
          <span className="text-xs font-medium text-white truncate flex-1">
            {sequence.title || `Séquence ${sequence.sort_order + 1}`}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[10px] text-slate-500">
            {plans.length} plan{plans.length > 1 ? 's' : ''}
          </span>
          <span className="text-[10px] text-slate-400 tabular-nums">
            {formatDuration(totalDuration)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Thumbnail cell for plans grid
function ThumbnailCell({ plan, index, total }: { plan: Plan; index: number; total: number }) {
  const imageUrl = plan.storyboard_image_url || plan.first_frame_url;
  const { signedUrl } = useSignedUrl(imageUrl || null);

  // If only 1 plan, span full width
  const spanFull = total === 1;

  return (
    <div className={cn("relative bg-slate-900 overflow-hidden", spanFull && "col-span-2 row-span-2")}>
      {signedUrl ? (
        <img
          src={signedUrl}
          alt={`Plan ${plan.shot_number}`}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-[10px] text-slate-600">P{plan.shot_number}</span>
        </div>
      )}
      {/* Plan number overlay */}
      {!spanFull && (
        <div className="absolute bottom-0.5 right-0.5 px-1 py-0.5 bg-black/60 rounded text-[8px] text-white">
          P{plan.shot_number}
        </div>
      )}
    </div>
  );
}
