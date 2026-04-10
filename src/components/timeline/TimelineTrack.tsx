'use client';

/**
 * Timeline Track
 *
 * A single track in the timeline with its clips.
 */

import { useMemo } from 'react';
import { Film, Image, Music, Zap, Volume2, VolumeX, Lock, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTimelineStore, Track, TimelineClip } from '@/store/timeline-store';
import { TimelineClipComponent } from './TimelineClip';

interface TimelineTrackProps {
  track: Track;
}

const TRACK_HEIGHT = 64;

const TRACK_ICONS: Record<string, React.ReactNode> = {
  video: <Film className="h-4 w-4" />,
  audio: <Music className="h-4 w-4" />,
  image: <Image className="h-4 w-4" />,
  transition: <Zap className="h-4 w-4" />,
};

const TRACK_COLORS: Record<string, string> = {
  video: 'border-blue-500/30',
  audio: 'border-green-500/30',
  image: 'border-purple-500/30',
  transition: 'border-yellow-500/30',
};

export function TimelineTrack({ track }: TimelineTrackProps) {
  const { clips, scale, duration, dropTarget, updateTrack, getClipsForTrack } = useTimelineStore();

  // Get clips for this track
  const trackClips = useMemo(() => {
    return getClipsForTrack(track.id);
  }, [getClipsForTrack, track.id, clips]);

  // Timeline width
  const timelineWidth = Math.max(duration * scale + 200, 1000);

  // Check if this track is the drop target
  const isDropTarget = dropTarget?.trackId === track.id;
  const isValidDrop = dropTarget?.trackId === track.id && dropTarget.valid;

  // Toggle handlers
  const toggleMute = () => {
    updateTrack(track.id, { muted: !track.muted });
  };

  const toggleLock = () => {
    updateTrack(track.id, { locked: !track.locked });
  };

  const toggleVisible = () => {
    updateTrack(track.id, { visible: !track.visible });
  };

  return (
    <div
      data-track-id={track.id}
      className={cn(
        'flex border-b border-zinc-800 relative',
        isDropTarget && !isValidDrop && 'bg-red-500/10',
        isValidDrop && 'bg-green-500/10'
      )}
      style={{ height: TRACK_HEIGHT }}
    >
      {/* Track header (sticky left) */}
      <div
        className={cn(
          'sticky left-0 z-10 w-32 flex-shrink-0 bg-zinc-900 border-r px-2 py-1',
          'flex flex-col justify-between',
          TRACK_COLORS[track.type]
        )}
      >
        {/* Track name */}
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-zinc-400',
            track.type === 'video' && 'text-blue-400',
            track.type === 'audio' && 'text-green-400',
            track.type === 'image' && 'text-purple-400',
            track.type === 'transition' && 'text-yellow-400',
          )}>
            {TRACK_ICONS[track.type]}
          </span>
          <span className="text-xs font-medium truncate">{track.name}</span>
        </div>

        {/* Track controls */}
        <div className="flex items-center gap-1">
          {track.type === 'audio' && (
            <button
              onClick={toggleMute}
              className={cn(
                'p-1 rounded hover:bg-zinc-800',
                track.muted && 'text-red-400'
              )}
              title={track.muted ? 'Unmute' : 'Mute'}
            >
              {track.muted ? (
                <VolumeX className="h-3 w-3" />
              ) : (
                <Volume2 className="h-3 w-3" />
              )}
            </button>
          )}

          <button
            onClick={toggleVisible}
            className={cn(
              'p-1 rounded hover:bg-zinc-800',
              !track.visible && 'text-zinc-600'
            )}
            title={track.visible ? 'Hide' : 'Show'}
          >
            {track.visible ? (
              <Eye className="h-3 w-3" />
            ) : (
              <EyeOff className="h-3 w-3" />
            )}
          </button>

          <button
            onClick={toggleLock}
            className={cn(
              'p-1 rounded hover:bg-zinc-800',
              track.locked && 'text-orange-400'
            )}
            title={track.locked ? 'Unlock' : 'Lock'}
          >
            <Lock className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Track content */}
      <div
        className="relative flex-1"
        style={{ width: timelineWidth }}
      >
        {/* Grid lines */}
        <div className="absolute inset-0 pointer-events-none">
          {/* 1-second lines */}
          {Array.from({ length: Math.ceil(duration) + 10 }).map((_, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-px bg-zinc-800/50"
              style={{ left: i * scale }}
            />
          ))}
        </div>

        {/* Clips */}
        {trackClips.map((clip) => (
          <TimelineClipComponent
            key={clip.id}
            clip={clip}
            track={track}
            scale={scale}
          />
        ))}

        {/* Drop indicator */}
        {isValidDrop && dropTarget && (
          <div
            className="absolute top-1 bottom-1 w-1 bg-green-500 rounded z-20"
            style={{ left: dropTarget.time * scale }}
          />
        )}
      </div>
    </div>
  );
}
