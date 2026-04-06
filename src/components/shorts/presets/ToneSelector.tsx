'use client';

import { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { ToneGenre } from '@/types/cinematic';

interface ToneSelectorProps {
  value: {
    genre: ToneGenre;
  };
  onChange: (value: ToneSelectorProps['value']) => void;
}

// Genre options with GIF images
const GENRE_CARDS: {
  value: ToneGenre;
  label: string;
  video?: string;
  image?: string;
}[] = [
  { value: 'action', label: 'Action', image: '/img/Action.gif' },
  { value: 'comedy', label: 'Comedy', image: '/img/Comedy.gif' },
  { value: 'documentary', label: 'Documentary', image: '/img/Documentary.gif' },
  { value: 'horror', label: 'Horror', image: '/img/HOROR.gif' },
  { value: 'intimate', label: 'Intimate', image: '/img/Intimate 1.gif' },
  { value: 'spectacle', label: 'Spectacle', image: '/img/Spectacle.gif' },
  { value: 'suspense', label: 'Suspense', image: '/img/Suspense.gif' },
  { value: 'western', label: 'Western', image: '/img/Western.gif' },
];

// Card component for genre (video or image)
function GenreCard({
  genre,
  isSelected,
  onClick,
}: {
  genre: (typeof GENRE_CARDS)[0];
  isSelected: boolean;
  onClick: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVideo = !!genre.video;

  // Auto-play when selected, pause when not
  useEffect(() => {
    if (videoRef.current && isVideo) {
      if (isSelected) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
  }, [isSelected, isVideo]);

  const handleMouseEnter = () => {
    if (videoRef.current && isVideo && !isSelected) {
      videoRef.current.play().catch(() => {});
    }
  };

  const handleMouseLeave = () => {
    if (videoRef.current && isVideo && !isSelected) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  return (
    <button
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'group relative rounded-xl overflow-hidden border-2 transition-all aspect-[5/3]',
        isSelected
          ? 'border-green-500 ring-2 ring-green-500/30'
          : 'border-transparent hover:border-white/30'
      )}
    >
      {/* Video or Image */}
      {isVideo ? (
        <video
          ref={videoRef}
          src={genre.video}
          muted
          loop
          playsInline
          preload="metadata"
          className={cn(
            'w-full h-full object-cover transition-all',
            isSelected ? 'brightness-100' : 'brightness-75 group-hover:brightness-90'
          )}
        />
      ) : (
        <img
          src={genre.image}
          alt={genre.label}
          className={cn(
            'w-full h-full object-cover transition-all',
            isSelected ? 'brightness-100' : 'brightness-75 group-hover:brightness-90'
          )}
          loading="lazy"
        />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      {/* Label */}
      <div className="absolute bottom-0 left-0 right-0 p-2">
        <span
          className={cn('text-xs font-medium', isSelected ? 'text-green-300' : 'text-white')}
        >
          {genre.label}
        </span>
      </div>

      {/* Check mark */}
      {isSelected && (
        <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
          <svg
            className="w-3 h-3 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
      )}
    </button>
  );
}

export function ToneSelector({ value, onChange }: ToneSelectorProps) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {GENRE_CARDS.map((genre) => (
        <GenreCard
          key={genre.value}
          genre={genre}
          isSelected={value.genre === genre.value}
          onClick={() => onChange({ genre: genre.value })}
        />
      ))}
    </div>
  );
}
