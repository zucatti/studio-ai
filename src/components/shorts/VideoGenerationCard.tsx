'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Video } from 'lucide-react';

export interface VideoGenerationProgress {
  planId: string;
  progress: number;
  step: string;
  message: string;
  status: 'generating' | 'completed' | 'failed';
  videoUrl?: string;
}

interface VideoGenerationCardProps {
  progress: VideoGenerationProgress;
  aspectRatio: string;
  onComplete?: () => void;
}

export function VideoGenerationCard({
  progress,
  aspectRatio,
  onComplete,
}: VideoGenerationCardProps) {
  const [showVideo, setShowVideo] = useState(false);

  // Transition to video when complete
  useEffect(() => {
    if (progress.status === 'completed' && progress.videoUrl) {
      // Small delay for smooth transition
      const timer = setTimeout(() => {
        setShowVideo(true);
        onComplete?.();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [progress.status, progress.videoUrl, onComplete]);

  // Aspect ratio styles
  const aspectStyles: Record<string, string> = {
    '9:16': 'aspect-[9/16]',
    '16:9': 'aspect-video',
    '1:1': 'aspect-square',
    '4:5': 'aspect-[4/5]',
    '2:3': 'aspect-[2/3]',
    '21:9': 'aspect-[21/9]',
  };
  const aspectClass = aspectStyles[aspectRatio] || 'aspect-video';

  // Show video if complete
  if (showVideo && progress.videoUrl) {
    return (
      <div
        className={cn(
          "relative rounded-lg overflow-hidden border-2 border-green-500/50 transition-all",
          aspectClass
        )}
      >
        <video
          src={progress.videoUrl}
          controls
          autoPlay
          className="w-full h-full object-contain bg-black"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative rounded-lg overflow-hidden border-2 border-purple-500/50",
        aspectClass
      )}
    >
      {/* Animated rainbow radial gradient background */}
      <div className="absolute inset-0 rainbow-radial-animation" />

      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
        {/* Icon */}
        <div className="relative mb-4">
          <Video className="w-10 h-10 text-white/80" />
          {/* Pulsing ring */}
          <div className="absolute inset-0 -m-2 rounded-full border-2 border-white/30 animate-ping" />
        </div>

        {/* Step message */}
        <p className="text-sm font-medium text-white mb-1 line-clamp-2">
          {progress.message}
        </p>

        {/* Percentage */}
        <p className="text-2xl font-bold text-white/90">
          {progress.progress}%
        </p>
      </div>

      {/* Progress bar at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-2 bg-black/50">
        <div
          className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 transition-all duration-300 ease-out"
          style={{ width: `${progress.progress}%` }}
        />
      </div>

      {/* CSS for rainbow animation */}
      <style jsx>{`
        .rainbow-radial-animation {
          background: conic-gradient(
            from 0deg,
            #ff0000,
            #ff8000,
            #ffff00,
            #00ff00,
            #00ffff,
            #0080ff,
            #8000ff,
            #ff0080,
            #ff0000
          );
          animation: rainbow-spin 3s linear infinite;
          filter: blur(40px);
          opacity: 0.7;
          transform: scale(1.5);
        }

        @keyframes rainbow-spin {
          from {
            transform: scale(1.5) rotate(0deg);
          }
          to {
            transform: scale(1.5) rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
