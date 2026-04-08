'use client';

import { useRef, useEffect, useState } from 'react';
import { Check, Clock, Image as ImageIcon, Video as VideoIcon, Edit2, Maximize2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useRushCreatorStore } from '@/store/rush-creator-store';
import { useSignedUrl, isB2Url } from '@/hooks/use-signed-url';
import type { RushMedia } from '@/types/database';

interface RushMediaCardProps {
  media: RushMedia;
  isCurrent: boolean;
}

export function RushMediaCard({ media, isCurrent }: RushMediaCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fullscreenVideoRef = useRef<HTMLVideoElement>(null);
  const { selectedIds, toggleSelect, loadPromptFromMedia } = useRushCreatorStore();
  const isSelected = selectedIds.has(media.id);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sign URLs if needed
  const { signedUrl: signedMediaUrl } = useSignedUrl(media.url);
  const { signedUrl: signedThumbUrl } = useSignedUrl(media.thumbnail_url || null);

  const finalUrl = signedMediaUrl || (media.url && !isB2Url(media.url) ? media.url : null);
  const finalThumbUrl = signedThumbUrl || (media.thumbnail_url && !isB2Url(media.thumbnail_url) ? media.thumbnail_url : null);

  const isVideo = media.media_type === 'video';

  // Auto-play video when current
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo || !finalUrl) return;

    if (isCurrent && !isFullscreen) {
      if (video.readyState >= 3) {
        video.play().catch(() => {});
      } else {
        const handleCanPlay = () => {
          video.play().catch(() => {});
        };
        video.addEventListener('canplay', handleCanPlay);
        return () => video.removeEventListener('canplay', handleCanPlay);
      }
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [isCurrent, isVideo, finalUrl, isFullscreen]);

  // Handle fullscreen keyboard
  useEffect(() => {
    if (!isFullscreen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isFullscreen]);

  // Calculate aspect ratio style
  const aspectStyle = (() => {
    const ratio = media.aspect_ratio || '9:16';
    const [w, h] = ratio.split(':').map(Number);
    return { aspectRatio: `${w}/${h}` };
  })();

  const handleClick = (e: React.MouseEvent) => {
    // Only handle selection for current card
    if (!isCurrent) return;
    e.stopPropagation();
    toggleSelect(media.id);
  };

  const handleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFullscreen(true);
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  return (
    <>
      <div
        className={cn(
          'relative rounded-xl overflow-hidden shadow-2xl transition-all duration-300',
          isCurrent && 'ring-2',
          isCurrent && isSelected ? 'ring-green-500' : 'ring-white/20'
        )}
        onClick={handleClick}
      >
        {/* Media content */}
        {isVideo && finalUrl ? (
          <video
            ref={videoRef}
            src={finalUrl}
            loop
            muted={!isCurrent}
            playsInline
            controls={isCurrent}
            poster={finalThumbUrl || undefined}
            className="w-full object-cover bg-black"
            style={aspectStyle}
          />
        ) : finalUrl ? (
          <img
            src={finalUrl}
            alt={media.prompt || 'Rush media'}
            className="w-full object-cover bg-black"
            style={aspectStyle}
          />
        ) : (
          <div
            className="bg-slate-800 flex items-center justify-center"
            style={aspectStyle}
          >
            {isVideo ? (
              <VideoIcon className="w-12 h-12 text-slate-600" />
            ) : (
              <ImageIcon className="w-12 h-12 text-slate-600" />
            )}
          </div>
        )}

        {/* Info overlay - top */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-3 pb-10">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white flex items-center gap-2 pointer-events-none">
              {isVideo ? (
                <VideoIcon className="w-4 h-4 text-purple-400" />
              ) : (
                <ImageIcon className="w-4 h-4 text-blue-400" />
              )}
              {media.model || 'Media'}
            </span>
            <div className="flex items-center gap-2">
              {isVideo && media.duration && (
                <span className="text-xs text-slate-300 flex items-center gap-1 pointer-events-none">
                  <Clock className="w-3 h-3" />
                  {formatDuration(media.duration)}
                </span>
              )}
              {/* Fullscreen button */}
              {isCurrent && finalUrl && (
                <button
                  onClick={handleFullscreen}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                  title="Plein écran"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Selection indicator */}
        {isCurrent && (
          <div className={cn(
            'absolute inset-0 transition-all pointer-events-none',
            isSelected ? 'bg-green-500/20' : 'bg-transparent'
          )}>
            {isSelected && (
              <div className="absolute top-3 right-12 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                <Check className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        )}

        {/* Bottom overlay - prompt and status */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 pt-10">
          {/* Status badge + edit button row */}
          <div className="flex items-center justify-between mb-1">
            <span className={cn(
              'px-2 py-0.5 rounded text-xs font-medium',
              media.status === 'selected' && 'bg-green-500/20 text-green-400',
              media.status === 'pending' && 'bg-blue-500/20 text-blue-400',
              media.status === 'rejected' && 'bg-orange-500/20 text-orange-400'
            )}>
              {media.status === 'selected' ? 'Gallery' : media.status === 'pending' ? 'Nouveau' : 'Rush'}
            </span>
            {isCurrent && media.prompt && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  loadPromptFromMedia(media.id);
                }}
                className="flex-shrink-0 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Reprendre ce prompt"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
          </div>
          {/* Prompt text */}
          {isCurrent && media.prompt && (
            <p className="text-xs text-slate-300 line-clamp-2">{media.prompt}</p>
          )}
        </div>
      </div>

      {/* Fullscreen overlay */}
      {isFullscreen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[99999] bg-black flex items-center justify-center"
          onClick={() => setIsFullscreen(false)}
        >
          {/* Close button */}
          <button
            onClick={() => setIsFullscreen(false)}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Fermer (Escape)"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Media */}
          <div
            className="max-w-[95vw] max-h-[95vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {isVideo && finalUrl ? (
              <video
                ref={fullscreenVideoRef}
                src={finalUrl}
                autoPlay
                loop
                controls
                playsInline
                className="max-w-full max-h-[95vh] object-contain"
              />
            ) : finalUrl ? (
              <img
                src={finalUrl}
                alt={media.prompt || 'Rush media'}
                className="max-w-full max-h-[95vh] object-contain"
              />
            ) : null}
          </div>

          {/* Prompt at bottom */}
          {media.prompt && (
            <div className="absolute bottom-4 left-4 right-4 text-center">
              <p className="text-sm text-white/70 bg-black/50 backdrop-blur rounded-lg px-4 py-2 inline-block max-w-3xl">
                {media.prompt}
              </p>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
