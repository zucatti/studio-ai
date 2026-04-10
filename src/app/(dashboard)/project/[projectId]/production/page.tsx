'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useProject } from '@/hooks/use-project';
import { useSignedUrl } from '@/hooks/use-signed-url';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import {
  Film,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Download,
  SkipBack,
  SkipForward,
  Loader2,
  Layers,
  Calendar,
  Clock,
} from 'lucide-react';

// Format time as MM:SS
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Format date
function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ProductionPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const { project, isLoading } = useProject();

  // Video element ref
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isVideoLoading, setIsVideoLoading] = useState(true);

  // Action indicator (brief play/pause icon shown on click)
  const [actionIndicator, setActionIndicator] = useState<'play' | 'pause' | null>(null);

  // Get project data with type assertion
  const projectData = project as {
    name?: string;
    rendered_video_url?: string;
    rendered_video_duration?: number;
    rendered_at?: string;
    aspect_ratio?: string;
  } | null;

  // Sign the video URL
  const { signedUrl, isLoading: isSigningUrl } = useSignedUrl(
    projectData?.rendered_video_url || null
  );

  // Hide controls after inactivity
  useEffect(() => {
    if (!isPlaying) {
      setShowControls(true);
      return;
    }

    let timeout: NodeJS.Timeout;
    const handleMouseMove = () => {
      setShowControls(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setShowControls(false), 3000);
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousemove', handleMouseMove);
      timeout = setTimeout(() => setShowControls(false), 3000);
    }

    return () => {
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
      }
      clearTimeout(timeout);
    };
  }, [isPlaying]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlayback();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skip(-5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          skip(5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          handleVolumeChange([Math.min(1, volume + 0.1)]);
          break;
        case 'ArrowDown':
          e.preventDefault();
          handleVolumeChange([Math.max(0, volume - 0.1)]);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [volume]);

  // Video event handlers
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setIsVideoLoading(false);
    }
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  // Controls
  const togglePlayback = useCallback(() => {
    if (!videoRef.current) return;

    // Show action indicator
    const newAction = isPlaying ? 'pause' : 'play';
    setActionIndicator(newAction);
    setTimeout(() => setActionIndicator(null), 500);

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleSeek = useCallback((value: number[]) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = value[0];
    setCurrentTime(value[0]);
  }, []);

  const skip = useCallback((seconds: number) => {
    if (!videoRef.current) return;
    const newTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  const handleVolumeChange = useCallback((value: number[]) => {
    if (!videoRef.current) return;
    const newVolume = value[0];
    videoRef.current.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  }, []);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    const newMuted = !isMuted;
    videoRef.current.muted = newMuted;
    setIsMuted(newMuted);
  }, [isMuted]);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  }, []);

  const handleDownload = useCallback(() => {
    if (!projectData?.rendered_video_url) return;
    const filename = `${projectData.name || 'clip'}_final.mp4`.replace(/[^a-zA-Z0-9._-]/g, '_');
    window.open(
      `/api/download?url=${encodeURIComponent(projectData.rendered_video_url)}&filename=${encodeURIComponent(filename)}`,
      '_blank'
    );
  }, [projectData]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  // No rendered video
  if (!projectData?.rendered_video_url) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center p-6">
        <div className="w-20 h-20 rounded-2xl bg-slate-800 flex items-center justify-center mb-6">
          <Film className="w-10 h-10 text-slate-500" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">
          Aucune vidéo finale
        </h2>
        <p className="text-slate-400 max-w-md mb-6">
          Rendez votre clip dans l&apos;onglet Montage pour le visualiser ici.
        </p>
        <Button
          onClick={() => router.push(`/project/${projectId}/clip`)}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Layers className="w-4 h-4 mr-2" />
          Aller au Montage
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Film className="w-5 h-5 text-blue-400" />
          <div>
            <h1 className="text-lg font-semibold text-white">
              {projectData.name || 'Clip'} - Version Finale
            </h1>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              {projectData.rendered_at && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDate(projectData.rendered_at)}
                </span>
              )}
              {projectData.rendered_video_duration && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatTime(projectData.rendered_video_duration)}
                </span>
              )}
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={handleDownload}
          className="border-green-500/30 text-green-400 hover:bg-green-500/10"
        >
          <Download className="w-4 h-4 mr-2" />
          Télécharger MP4
        </Button>
      </div>

      {/* Video Player */}
      <div className="flex-1 flex items-center justify-center p-4 bg-black/50">
        <div
          ref={containerRef}
          className={cn(
            'relative group bg-black rounded-lg overflow-hidden',
            isFullscreen ? 'w-full h-full' : 'max-w-5xl w-full'
          )}
          style={{
            aspectRatio: projectData.aspect_ratio?.replace(':', '/') || '16/9',
          }}
        >
          {/* Loading overlay */}
          {(isSigningUrl || isVideoLoading) && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            </div>
          )}

          {/* Video element */}
          {signedUrl && (
            <video
              ref={videoRef}
              src={signedUrl}
              className="w-full h-full object-contain"
              playsInline
              preload="metadata"
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleEnded}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onClick={togglePlayback}
            />
          )}

          {/* Center play button (shown when paused) */}
          {!isPlaying && !isVideoLoading && (
            <button
              onClick={togglePlayback}
              className={cn(
                'absolute inset-0 flex items-center justify-center transition-opacity',
                showControls ? 'opacity-100' : 'opacity-0'
              )}
            >
              <div className="w-20 h-20 rounded-full bg-blue-600/90 backdrop-blur flex items-center justify-center hover:bg-blue-500 transition-colors">
                <Play className="w-10 h-10 text-white ml-1" fill="white" />
              </div>
            </button>
          )}

          {/* Action indicator (brief play/pause animation on click) */}
          {actionIndicator && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
              key={actionIndicator + Date.now()}
            >
              <div
                className="w-20 h-20 rounded-full bg-black/70 backdrop-blur flex items-center justify-center"
                style={{
                  animation: 'action-indicator 0.5s ease-out forwards',
                }}
              >
                {actionIndicator === 'play' ? (
                  <Play className="w-10 h-10 text-white ml-1" fill="white" />
                ) : (
                  <Pause className="w-10 h-10 text-white" fill="white" />
                )}
              </div>
              <style jsx>{`
                @keyframes action-indicator {
                  0% {
                    transform: scale(0.8);
                    opacity: 1;
                  }
                  100% {
                    transform: scale(1.2);
                    opacity: 0;
                  }
                }
              `}</style>
            </div>
          )}

          {/* Controls overlay */}
          <div
            className={cn(
              'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 pt-12 transition-opacity duration-300',
              showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
            )}
          >
            {/* Progress bar */}
            <Slider
              value={[currentTime]}
              max={duration || 1}
              step={0.1}
              onValueChange={handleSeek}
              className="mb-4"
            />

            <div className="flex items-center justify-between">
              {/* Left controls */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-white hover:bg-white/20"
                  onClick={() => skip(-10)}
                >
                  <SkipBack className="h-5 w-5" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 text-white hover:bg-white/20"
                  onClick={togglePlayback}
                >
                  {isPlaying ? (
                    <Pause className="h-6 w-6" />
                  ) : (
                    <Play className="h-6 w-6" />
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-white hover:bg-white/20"
                  onClick={() => skip(10)}
                >
                  <SkipForward className="h-5 w-5" />
                </Button>

                {/* Time display */}
                <span className="text-white text-sm font-mono ml-2">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              {/* Right controls */}
              <div className="flex items-center gap-2">
                {/* Volume */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-white hover:bg-white/20"
                    onClick={toggleMute}
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="h-5 w-5" />
                    ) : (
                      <Volume2 className="h-5 w-5" />
                    )}
                  </Button>
                  <div className="w-24">
                    <Slider
                      value={[isMuted ? 0 : volume]}
                      max={1}
                      step={0.05}
                      onValueChange={handleVolumeChange}
                    />
                  </div>
                </div>

                {/* Download */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-white hover:bg-white/20"
                  onClick={handleDownload}
                >
                  <Download className="h-5 w-5" />
                </Button>

                {/* Fullscreen */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-white hover:bg-white/20"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? (
                    <Minimize className="h-5 w-5" />
                  ) : (
                    <Maximize className="h-5 w-5" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer info */}
      <div className="px-4 py-3 border-t border-white/10 text-xs text-slate-500">
        <p>
          Raccourcis: <kbd className="px-1 bg-white/10 rounded">Espace</kbd> Play/Pause •{' '}
          <kbd className="px-1 bg-white/10 rounded">←</kbd><kbd className="px-1 bg-white/10 rounded">→</kbd> ±10s •{' '}
          <kbd className="px-1 bg-white/10 rounded">↑</kbd><kbd className="px-1 bg-white/10 rounded">↓</kbd> Volume •{' '}
          <kbd className="px-1 bg-white/10 rounded">F</kbd> Plein écran •{' '}
          <kbd className="px-1 bg-white/10 rounded">M</kbd> Muet
        </p>
      </div>
    </div>
  );
}
