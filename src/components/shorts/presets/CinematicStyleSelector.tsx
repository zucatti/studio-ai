'use client';

import { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { CinematicStyle } from '@/types/cinematic';
import { CINEMATIC_STYLE_OPTIONS } from '@/types/cinematic';

interface CinematicStyleSelectorProps {
  value: CinematicStyle | undefined;
  onChange: (value: CinematicStyle) => void;
}

// Map cinematic styles to image assets (GIFs for previews)
const STYLE_MEDIA: Record<CinematicStyle, { video?: string; image?: string }> = {
  cinematic_realism: { image: '/img/Intimate 1.gif' },
  hollywood_blockbuster: { image: '/img/Spectacle.gif' },
  film_noir: { image: '/img/Suspense.gif' },
  wes_anderson: { image: '/img/wesanderson.gif' },
  christopher_nolan: { image: '/img/Action.gif' },
  blade_runner: { image: '/img/Suspense.gif' },
  studio_ghibli: { image: '/img/ghibli.gif' },
  vintage_vhs: { image: '/img/vhs.gif' },
  documentary: { image: '/img/Documentary.gif' },
  epic_fantasy: { image: '/img/epicfantasy.gif' },
  custom: {}, // No media for custom
};

// Card component for style (video or image)
function StyleCard({
  style,
  isSelected,
  onClick,
}: {
  style: CinematicStyle;
  isSelected: boolean;
  onClick: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const media = STYLE_MEDIA[style];
  const option = CINEMATIC_STYLE_OPTIONS.find(o => o.value === style);
  const isVideo = !!media?.video;
  const hasMedia = isVideo || !!media?.image;

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

  // Custom style card (no media)
  if (style === 'custom') {
    return (
      <button
        onClick={onClick}
        className={cn(
          'group relative rounded-lg overflow-hidden border-2 transition-all aspect-video',
          'bg-gradient-to-br from-slate-800 to-slate-900',
          isSelected
            ? 'border-amber-500 ring-2 ring-amber-500/30'
            : 'border-white/10 hover:border-white/30'
        )}
      >
        {/* Custom icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </div>

        {/* Label */}
        <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
          <span className={cn('text-[10px] font-medium', isSelected ? 'text-amber-300' : 'text-white')}>
            {option?.label || 'Custom'}
          </span>
        </div>

        {/* Check mark */}
        {isSelected && (
          <div className="absolute top-1 right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center">
            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'group relative rounded-lg overflow-hidden border-2 transition-all aspect-video',
        isSelected
          ? 'border-amber-500 ring-2 ring-amber-500/30'
          : 'border-transparent hover:border-white/30'
      )}
    >
      {/* Video or Image */}
      {isVideo ? (
        <video
          ref={videoRef}
          src={media.video}
          muted
          loop
          playsInline
          preload="metadata"
          className={cn(
            'w-full h-full object-cover transition-all',
            isSelected ? 'brightness-100' : 'brightness-75 group-hover:brightness-90'
          )}
        />
      ) : media?.image ? (
        <img
          src={media.image}
          alt={option?.label}
          className={cn(
            'w-full h-full object-cover transition-all',
            isSelected ? 'brightness-100' : 'brightness-75 group-hover:brightness-90'
          )}
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full bg-slate-800 flex items-center justify-center">
          <span className="text-slate-500 text-[10px]">No preview</span>
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      {/* Label */}
      <div className="absolute bottom-0 left-0 right-0 p-1.5">
        <span className={cn('text-[10px] font-medium', isSelected ? 'text-amber-300' : 'text-white')}>
          {option?.label || style}
        </span>
      </div>

      {/* Check mark */}
      {isSelected && (
        <div className="absolute top-1 right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center">
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </button>
  );
}

export function CinematicStyleSelector({ value, onChange }: CinematicStyleSelectorProps) {
  // Order styles for grid layout (custom last)
  const orderedStyles: CinematicStyle[] = [
    'cinematic_realism',
    'hollywood_blockbuster',
    'film_noir',
    'wes_anderson',
    'christopher_nolan',
    'blade_runner',
    'studio_ghibli',
    'vintage_vhs',
    'documentary',
    'epic_fantasy',
    'custom',
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {orderedStyles.map((style) => (
        <StyleCard
          key={style}
          style={style}
          isSelected={value === style}
          onClick={() => onChange(style)}
        />
      ))}
    </div>
  );
}
