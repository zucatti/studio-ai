'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Layers, Loader2, Download, Maximize2, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSignedUrl, isB2Url } from '@/hooks/use-signed-url';
import { Slider } from '@/components/ui/slider';
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
  onOpenGallery?: () => void; // Open in gallery viewer
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
  onOpenGallery,
  isDragging,
}: SequenceClipProps) {
  // Calculate width based on aspect ratio - height will be determined by aspect-ratio CSS
  const getClipWidth = () => {
    switch (aspectRatio) {
      case '16:9':
        return 320;
      case '1:1':
        return 240;
      case '9:16':
      default:
        return 180;
    }
  };
  const clipWidth = getClipWidth();

  // Parse aspect ratio for CSS
  const getAspectRatioValue = () => {
    switch (aspectRatio) {
      case '16:9':
        return '16 / 9';
      case '1:1':
        return '1 / 1';
      case '9:16':
      default:
        return '9 / 16';
    }
  };
  const aspectRatioValue = getAspectRatioValue();

  const [isHovered, setIsHovered] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  // Sign B2 URL if needed
  const { signedUrl } = useSignedUrl(assembledVideoUrl || null);
  const finalVideoUrl = signedUrl || (assembledVideoUrl && !isB2Url(assembledVideoUrl) ? assembledVideoUrl : null);

  const totalDuration = plans.reduce((sum, p) => sum + p.duration, 0);
  const isAssembling = assemblyProgress !== undefined && assemblyProgress < 100;
  const hasAssembledVideo = !!finalVideoUrl;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  };

  // Open gallery viewer
  const handleOpenGallery = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenGallery?.();
  }, [onOpenGallery]);

  // Download video
  const handleDownload = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!assembledVideoUrl) return;
    const filename = `${sequence.title || 'sequence'}.mp4`;
    const downloadUrl = `/api/download?url=${encodeURIComponent(assembledVideoUrl)}&filename=${encodeURIComponent(filename)}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => document.body.removeChild(link), 100);
  }, [assembledVideoUrl, sequence.title]);

  // Video controls
  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  }, [isPlaying]);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  const handleSeek = useCallback((value: number[]) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = value[0];
    setCurrentTime(value[0]);
  }, []);

  // Format time for display
  const formatVideoTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Auto-play video on hover
  useEffect(() => {
    if (!videoRef.current || !hasAssembledVideo) return;

    if (isHovered) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
      videoRef.current.currentTime = 0; // Reset to start when leaving
    }
  }, [isHovered, hasAssembledVideo]);

  return (
    <div
      className={cn(
          "relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer flex flex-col group",
          "bg-[#0d1218] flex-shrink-0",
          isSelected
            ? "border-blue-500 ring-2 ring-blue-500/30"
            : "border-white/10 hover:border-white/20",
          isDragging && "opacity-50 scale-95"
        )}
        style={{
          width: `${clipWidth}px`,
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Video/Thumbnail area with correct aspect ratio */}
        <div
          className="relative bg-black overflow-hidden"
          style={{ aspectRatio: aspectRatioValue }}
        >
          {hasAssembledVideo ? (
            <>
              {/* Video without native controls - auto-plays on hover */}
              <video
                ref={videoRef}
                key={assembledVideoUrl}
                src={finalVideoUrl}
                className="w-full h-full object-cover bg-black"
                muted={isMuted}
                loop
                playsInline
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
                onLoadedMetadata={() => setVideoDuration(videoRef.current?.duration || 0)}
              />


              {/* Custom controls overlay - hover only */}
              <div
                className={cn(
                  'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 transition-opacity',
                  isHovered ? 'opacity-100' : 'opacity-0'
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Progress bar */}
                <Slider
                  value={[currentTime]}
                  max={videoDuration || 1}
                  step={0.1}
                  onValueChange={handleSeek}
                  className="mb-2"
                />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={togglePlay}
                      className="w-6 h-6 flex items-center justify-center text-white hover:bg-white/20 rounded"
                    >
                      {isPlaying ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={toggleMute}
                      className="w-6 h-6 flex items-center justify-center text-white hover:bg-white/20 rounded"
                    >
                      {isMuted ? (
                        <VolumeX className="w-4 h-4" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>
                    <span className="text-[10px] text-white/80 ml-1">
                      {formatVideoTime(currentTime)} / {formatVideoTime(videoDuration)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {assembledVideoUrl && (
                      <button
                        onClick={handleDownload}
                        className="w-6 h-6 flex items-center justify-center text-white hover:bg-white/20 rounded"
                        title="Télécharger"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {onOpenGallery && (
                      <button
                        onClick={handleOpenGallery}
                        className="w-6 h-6 flex items-center justify-center text-white hover:bg-white/20 rounded"
                        title="Agrandir"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
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
            <Layers className="w-3 h-3 text-blue-400 flex-shrink-0" />
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
