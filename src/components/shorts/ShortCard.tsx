'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Pause, Clock, MoreVertical, Pencil, Trash2, Film, Volume2, VolumeX, Download, Maximize2 } from 'lucide-react';
import { StorageImg } from '@/components/ui/storage-image';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatDuration } from './DurationPicker';
import { cn } from '@/lib/utils';
import type { Short } from '@/store/shorts-store';

interface ShortCardProps {
  short: Short;
  projectId: string;
  onDelete: (shortId: string) => void;
  onEdit: (short: Short) => void;
  onGallery?: (short: Short) => void;
}

export function ShortCard({ short, projectId, onDelete, onEdit, onGallery }: ShortCardProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true); // Start muted for autoplay
  const [progress, setProgress] = useState(0);
  const [signedVideoUrl, setSignedVideoUrl] = useState<string | null>(null);

  // Get thumbnail from first plan's storyboard
  const thumbnailUrl = short.plans[0]?.storyboard_image_url;
  const hasAssembledVideo = !!short.assembled_video_url;

  // Sign the video URL if needed
  useEffect(() => {
    if (!short.assembled_video_url) {
      setSignedVideoUrl(null);
      return;
    }

    const signUrl = async () => {
      const url = short.assembled_video_url;
      if (url && url.startsWith('b2://')) {
        try {
          const res = await fetch('/api/storage/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: [url] }),
          });
          if (res.ok) {
            const data = await res.json();
            setSignedVideoUrl(data.signedUrls?.[url] || url);
          }
        } catch {
          setSignedVideoUrl(url);
        }
      } else {
        setSignedVideoUrl(url);
      }
    };

    signUrl();
  }, [short.assembled_video_url]);

  // Handle hover - autoplay video
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !signedVideoUrl) return;

    if (isHovering) {
      video.play().catch(() => {
        // Autoplay might be blocked
      });
      setIsPlaying(true);
    } else {
      video.pause();
      video.currentTime = 0;
      setIsPlaying(false);
      setProgress(0);
    }
  }, [isHovering, signedVideoUrl]);

  // Update progress
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (video.duration) {
        setProgress((video.currentTime / video.duration) * 100);
      }
    };

    const handleEnded = () => {
      video.currentTime = 0;
      video.play().catch(() => {});
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
    };
  }, []);

  const handleClick = () => {
    router.push(`/project/${projectId}/shorts/${short.id}`);
  };

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
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    video.currentTime = percentage * video.duration;
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!short.assembled_video_url) return;

    const filename = `${short.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`;
    const downloadUrl = `/api/storage/download?url=${encodeURIComponent(short.assembled_video_url)}&filename=${encodeURIComponent(filename)}`;

    window.open(downloadUrl, '_blank');
  };

  const handleGallery = (e: React.MouseEvent) => {
    e.stopPropagation();
    onGallery?.(short);
  };

  return (
    <>
      <div
        className="group relative rounded-xl bg-[#151d28] border border-white/5 overflow-hidden cursor-pointer hover:border-blue-500/30 transition-all"
        onClick={handleClick}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {/* Thumbnail / Video */}
        <div className="aspect-[9/16] bg-slate-800/50 relative">
          {/* Video element (hidden until hover with assembled video) */}
          {hasAssembledVideo && signedVideoUrl && (
            <video
              ref={videoRef}
              src={signedVideoUrl}
              className={cn(
                "absolute inset-0 w-full h-full object-cover transition-opacity duration-300",
                isHovering ? "opacity-100" : "opacity-0"
              )}
              muted={isMuted}
              playsInline
              loop
            />
          )}

          {/* Thumbnail (visible when not hovering or no video) */}
          <div className={cn(
            "absolute inset-0 transition-opacity duration-300",
            isHovering && hasAssembledVideo && signedVideoUrl ? "opacity-0" : "opacity-100"
          )}>
            {thumbnailUrl ? (
              <StorageImg
                src={thumbnailUrl}
                alt={short.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Film className="w-12 h-12 text-slate-600" />
              </div>
            )}
          </div>

          {/* Hover overlay */}
          <div className={cn(
            "absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 transition-opacity",
            isHovering ? "opacity-100" : "opacity-0"
          )}>
            {/* Top row */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
              {/* Download button (left) */}
              {hasAssembledVideo && signedVideoUrl && (
                <button
                  onClick={handleDownload}
                  className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
                  title="Télécharger"
                >
                  <Download className="w-4 h-4 text-white" />
                </button>
              )}
              {!hasAssembledVideo && <div />}

              {/* Modifier button (center) */}
              <button
                onClick={handleClick}
                className="px-4 py-1.5 rounded-full bg-white/20 backdrop-blur-sm text-white text-sm font-medium hover:bg-white/30 transition-colors"
              >
                Modifier
              </button>

              {/* Gallery button (right) */}
              {hasAssembledVideo && signedVideoUrl && (
                <button
                  onClick={handleGallery}
                  className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
                  title="Plein écran"
                >
                  <Maximize2 className="w-4 h-4 text-white" />
                </button>
              )}
              {!hasAssembledVideo && <div />}
            </div>

            {/* Center - Play/Pause button (only if has video) */}
            {hasAssembledVideo && signedVideoUrl && (
              <button
                onClick={togglePlayPause}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
              >
                {isPlaying ? (
                  <Pause className="w-7 h-7 text-white" />
                ) : (
                  <Play className="w-7 h-7 text-white ml-1" />
                )}
              </button>
            )}

            {/* Bottom controls (only if has video and hovering) */}
            {hasAssembledVideo && signedVideoUrl && (
              <div className="absolute bottom-0 left-0 right-0 p-3 space-y-2">
                {/* Progress bar */}
                <div
                  className="h-1 bg-white/20 rounded-full cursor-pointer overflow-hidden"
                  onClick={handleProgressClick}
                >
                  <div
                    className="h-full bg-white rounded-full transition-all duration-100"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                {/* Controls row */}
                <div className="flex items-center justify-between">
                  {/* Duration */}
                  <div className="flex items-center gap-1 text-white text-xs">
                    <Clock className="w-3 h-3" />
                    {formatDuration(short.assembled_video_duration ?? short.totalDuration)}
                    <span className="ml-1 text-green-400">✓</span>
                  </div>

                  {/* Volume */}
                  <button
                    onClick={toggleMute}
                    className="p-1 rounded hover:bg-white/20 transition-colors"
                  >
                    {isMuted ? (
                      <VolumeX className="w-4 h-4 text-white" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-white" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Static badges (visible when not hovering) */}
          {!isHovering && (
            <>
              {/* Duration badge */}
              <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded bg-black/60 text-white text-xs">
                <Clock className="w-3 h-3" />
                {formatDuration(short.assembled_video_duration ?? short.totalDuration)}
                {short.assembled_video_url && (
                  <span className="ml-1 text-green-400">✓</span>
                )}
              </div>

              {/* Plans count */}
              <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/60 text-white text-xs">
                {short.plans.length} plan{short.plans.length !== 1 ? 's' : ''}
              </div>
            </>
          )}
        </div>

        {/* Info */}
        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-white truncate">{short.title}</h3>
              {short.description && (
                <p className="text-sm text-slate-400 truncate mt-0.5">
                  {short.description}
                </p>
              )}
            </div>

            {/* Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-[#1a2433] border-white/10"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem
                  onClick={() => onEdit(short)}
                  className="text-slate-300 focus:text-white focus:bg-white/10"
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  Renommer
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-red-400 focus:text-red-300 focus:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-[#1a2433] border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Supprimer ce short ?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Le short &quot;{short.title}&quot; et ses {short.plans.length} plan{short.plans.length !== 1 ? 's' : ''} seront définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={() => onDelete(short.id)}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
