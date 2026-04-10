import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// Types for montage editor
export type ClipType = 'video' | 'image' | 'audio' | 'text' | 'transition';
export type TrackType = 'video' | 'audio' | 'text' | 'transition';

// Transition types (matches Editly)
export type TransitionType =
  | 'fade'
  | 'fadeblack'
  | 'fadewhite'
  | 'dissolve'
  | 'directional-left'
  | 'directional-right'
  | 'directional-up'
  | 'directional-down'
  | 'crosszoom'
  | 'zoomin'
  | 'zoomout';

export interface MontageClip {
  id: string;
  type: ClipType;
  trackId: string;

  // Timing (in seconds)
  start: number;      // Position on timeline
  duration: number;   // Clip duration on timeline

  // Source timing (for video/audio)
  sourceStart?: number;  // Trim start in source
  sourceEnd?: number;    // Trim end in source
  sourceDuration?: number; // Total source duration

  // Asset reference
  assetId?: string;      // Reference to rush/video/audio asset
  assetUrl?: string;     // Direct URL (b2:// or signed)
  thumbnailUrl?: string; // Thumbnail for preview

  // Display
  name: string;
  color?: string;

  // Audio specific
  volume?: number;
  muted?: boolean;

  // Text specific
  text?: string;
  fontSize?: number;
  fontColor?: string;

  // Transition specific
  transitionType?: TransitionType;
}

export interface MontageTrack {
  id: string;
  type: TrackType;
  name: string;
  height: number;
  locked: boolean;
  muted: boolean;
  visible: boolean;
  order: number;
}

export interface MontageAsset {
  id: string;
  type: 'rush' | 'video' | 'audio' | 'image' | 'storyboard' | 'sequence';
  name: string;
  url: string;
  thumbnailUrl?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

interface MontageState {
  // Project info
  projectId: string | null;
  shortId: string | null;
  aspectRatio: string;

  // Timeline state
  tracks: MontageTrack[];
  clips: Record<string, MontageClip>;

  // Playback
  currentTime: number;
  duration: number;
  isPlaying: boolean;

  // UI state
  scale: number;           // Pixels per second
  scrollLeft: number;
  scrollTop: number;
  selectedClipIds: string[];
  draggedClip: MontageClip | null;

  // Available assets
  assets: MontageAsset[];
  isLoadingAssets: boolean;
}

interface MontageActions {
  // Initialize
  setProject: (projectId: string, shortId: string, aspectRatio: string) => void;
  reset: () => void;

  // Tracks
  addTrack: (type: TrackType, name?: string) => string;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<MontageTrack>) => void;
  reorderTracks: (trackIds: string[]) => void;

  // Clips
  addClip: (clip: Omit<MontageClip, 'id'>) => string;
  removeClip: (clipId: string) => void;
  updateClip: (clipId: string, updates: Partial<MontageClip>) => void;
  moveClip: (clipId: string, trackId: string, start: number) => void;
  resizeClip: (clipId: string, start: number, duration: number) => void;
  duplicateClip: (clipId: string) => string | null;

  // Selection
  selectClip: (clipId: string, addToSelection?: boolean) => void;
  deselectClip: (clipId: string) => void;
  clearSelection: () => void;
  selectClipsInRange: (startTime: number, endTime: number, trackIds?: string[]) => void;

  // Playback
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  play: () => void;
  pause: () => void;
  togglePlayback: () => void;
  seekTo: (time: number) => void;

  // UI
  setScale: (scale: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitToView: (containerWidth: number) => void;
  setScroll: (left: number, top: number) => void;
  setDraggedClip: (clip: MontageClip | null) => void;

  // Assets
  setAssets: (assets: MontageAsset[]) => void;
  addAsset: (asset: MontageAsset) => void;
  setLoadingAssets: (loading: boolean) => void;

  // Utility
  getClipsForTrack: (trackId: string) => MontageClip[];
  getClipAtTime: (trackId: string, time: number) => MontageClip | null;
  calculateDuration: () => number;

  // Import/Export
  exportToJSON: () => MontageExport;
  importFromJSON: (data: MontageExport) => void;
}

export interface MontageExport {
  version: number;
  projectId: string;
  shortId: string;
  aspectRatio: string;
  duration: number;
  tracks: MontageTrack[];
  clips: MontageClip[];
}

const DEFAULT_TRACK_HEIGHT = 48;
const MIN_SCALE = 10;  // 10px per second (zoomed out)
const MAX_SCALE = 200; // 200px per second (zoomed in)
const DEFAULT_SCALE = 50;

const initialState: MontageState = {
  projectId: null,
  shortId: null,
  aspectRatio: '9:16',
  tracks: [],
  clips: {},
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  scale: DEFAULT_SCALE,
  scrollLeft: 0,
  scrollTop: 0,
  selectedClipIds: [],
  draggedClip: null,
  assets: [],
  isLoadingAssets: false,
};

// Generate unique ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// Helper to calculate duration from clips record (works with immer draft or plain object)
const calculateDurationFromClips = (clips: Record<string, MontageClip>): number => {
  let maxEnd = 0;
  Object.values(clips).forEach((clip) => {
    const end = clip.start + clip.duration;
    if (end > maxEnd) maxEnd = end;
  });
  return maxEnd;
};

export const useMontageStore = create<MontageState & MontageActions>()(
  immer((set, get) => ({
    ...initialState,

    // Initialize
    setProject: (projectId, shortId, aspectRatio) => {
      set((state) => {
        state.projectId = projectId;
        state.shortId = shortId;
        state.aspectRatio = aspectRatio;
      });
    },

    reset: () => {
      set(initialState);
    },

    // Tracks
    addTrack: (type, name) => {
      const id = generateId();
      const order = get().tracks.length;

      set((state) => {
        state.tracks.push({
          id,
          type,
          name: name || `${type.charAt(0).toUpperCase() + type.slice(1)} ${order + 1}`,
          height: DEFAULT_TRACK_HEIGHT,
          locked: false,
          muted: false,
          visible: true,
          order,
        });
      });

      return id;
    },

    removeTrack: (trackId) => {
      set((state) => {
        // Remove track
        state.tracks = state.tracks.filter((t: MontageTrack) => t.id !== trackId);

        // Remove clips on this track
        Object.keys(state.clips).forEach((clipId) => {
          if (state.clips[clipId].trackId === trackId) {
            delete state.clips[clipId];
          }
        });

        // Reorder remaining tracks
        state.tracks.forEach((t: MontageTrack, i: number) => {
          t.order = i;
        });
      });
    },

    updateTrack: (trackId, updates) => {
      set((state) => {
        const track = state.tracks.find((t: MontageTrack) => t.id === trackId);
        if (track) {
          Object.assign(track, updates);
        }
      });
    },

    reorderTracks: (trackIds) => {
      set((state) => {
        const trackMap = new Map<string, MontageTrack>(state.tracks.map((t: MontageTrack) => [t.id, t]));
        state.tracks = trackIds
          .map((id, index) => {
            const track = trackMap.get(id);
            if (track) {
              track.order = index;
            }
            return track;
          })
          .filter(Boolean) as MontageTrack[];
      });
    },

    // Clips
    addClip: (clip) => {
      const id = generateId();

      set((state) => {
        state.clips[id] = { ...clip, id };

        // Update duration
        const endTime = clip.start + clip.duration;
        if (endTime > state.duration) {
          state.duration = endTime;
        }
      });

      return id;
    },

    removeClip: (clipId) => {
      set((state) => {
        delete state.clips[clipId];
        state.selectedClipIds = state.selectedClipIds.filter((id: string) => id !== clipId);

        // Recalculate duration from draft state
        state.duration = calculateDurationFromClips(state.clips);
      });
    },

    updateClip: (clipId, updates) => {
      set((state) => {
        const clip = state.clips[clipId];
        if (clip) {
          Object.assign(clip, updates);

          // Recalculate total duration from draft state
          state.duration = calculateDurationFromClips(state.clips);
        }
      });
    },

    moveClip: (clipId, trackId, start) => {
      set((state) => {
        const clip = state.clips[clipId];
        if (clip) {
          clip.trackId = trackId;
          clip.start = Math.max(0, start);

          // Recalculate total duration from draft state
          state.duration = calculateDurationFromClips(state.clips);
        }
      });
    },

    resizeClip: (clipId, start, duration) => {
      set((state) => {
        const clip = state.clips[clipId];
        if (clip) {
          clip.start = Math.max(0, start);
          clip.duration = Math.max(0.1, duration); // Min 0.1s

          // Recalculate total duration from draft state
          state.duration = calculateDurationFromClips(state.clips);
        }
      });
    },

    duplicateClip: (clipId) => {
      const clip = get().clips[clipId];
      if (!clip) return null;

      const newId = generateId();

      set((state) => {
        state.clips[newId] = {
          ...clip,
          id: newId,
          start: clip.start + clip.duration, // Place after original
        };

        // Update duration
        const endTime = state.clips[newId].start + state.clips[newId].duration;
        if (endTime > state.duration) {
          state.duration = endTime;
        }
      });

      return newId;
    },

    // Selection
    selectClip: (clipId, addToSelection = false) => {
      set((state) => {
        if (addToSelection) {
          if (!state.selectedClipIds.includes(clipId)) {
            state.selectedClipIds.push(clipId);
          }
        } else {
          state.selectedClipIds = [clipId];
        }
      });
    },

    deselectClip: (clipId) => {
      set((state) => {
        state.selectedClipIds = state.selectedClipIds.filter((id: string) => id !== clipId);
      });
    },

    clearSelection: () => {
      set((state) => {
        state.selectedClipIds = [];
      });
    },

    selectClipsInRange: (startTime, endTime, trackIds) => {
      set((state) => {
        const clips = Object.values(state.clips) as MontageClip[];
        const selected = clips
          .filter((clip: MontageClip) => {
            const clipEnd = clip.start + clip.duration;
            const overlaps = clip.start < endTime && clipEnd > startTime;
            const trackMatch = !trackIds || trackIds.includes(clip.trackId);
            return overlaps && trackMatch;
          })
          .map((clip: MontageClip) => clip.id);

        state.selectedClipIds = selected;
      });
    },

    // Playback
    setCurrentTime: (time) => {
      set((state) => {
        state.currentTime = Math.max(0, Math.min(time, state.duration));
      });
    },

    setIsPlaying: (playing) => {
      set((state) => {
        state.isPlaying = playing;
      });
    },

    play: () => {
      set((state) => {
        state.isPlaying = true;
      });
    },

    pause: () => {
      set((state) => {
        state.isPlaying = false;
      });
    },

    togglePlayback: () => {
      set((state) => {
        state.isPlaying = !state.isPlaying;
      });
    },

    seekTo: (time) => {
      set((state) => {
        state.currentTime = Math.max(0, Math.min(time, state.duration));
        state.isPlaying = false;
      });
    },

    // UI
    setScale: (scale) => {
      set((state) => {
        state.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
      });
    },

    zoomIn: () => {
      set((state) => {
        state.scale = Math.min(MAX_SCALE, state.scale * 1.25);
      });
    },

    zoomOut: () => {
      set((state) => {
        state.scale = Math.max(MIN_SCALE, state.scale / 1.25);
      });
    },

    fitToView: (containerWidth) => {
      const { duration } = get();
      if (duration > 0 && containerWidth > 0) {
        const newScale = (containerWidth - 100) / duration; // Leave some padding
        set((state) => {
          state.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
          state.scrollLeft = 0;
        });
      }
    },

    setScroll: (left, top) => {
      set((state) => {
        state.scrollLeft = Math.max(0, left);
        state.scrollTop = Math.max(0, top);
      });
    },

    setDraggedClip: (clip) => {
      set((state) => {
        state.draggedClip = clip;
      });
    },

    // Assets
    setAssets: (assets) => {
      set((state) => {
        state.assets = assets;
      });
    },

    addAsset: (asset) => {
      set((state) => {
        if (!state.assets.find((a: MontageAsset) => a.id === asset.id)) {
          state.assets.push(asset);
        }
      });
    },

    setLoadingAssets: (loading) => {
      set((state) => {
        state.isLoadingAssets = loading;
      });
    },

    // Utility
    getClipsForTrack: (trackId) => {
      const { clips } = get();
      return Object.values(clips)
        .filter((clip) => clip.trackId === trackId)
        .sort((a, b) => a.start - b.start);
    },

    getClipAtTime: (trackId, time) => {
      const { clips } = get();
      return Object.values(clips).find(
        (clip) =>
          clip.trackId === trackId &&
          time >= clip.start &&
          time < clip.start + clip.duration
      ) || null;
    },

    calculateDuration: () => {
      const { clips } = get();
      let maxEnd = 0;
      Object.values(clips).forEach((clip) => {
        const end = clip.start + clip.duration;
        if (end > maxEnd) maxEnd = end;
      });
      return maxEnd;
    },

    // Import/Export
    exportToJSON: () => {
      const { projectId, shortId, aspectRatio, duration, tracks, clips } = get();
      return {
        version: 1,
        projectId: projectId || '',
        shortId: shortId || '',
        aspectRatio,
        duration,
        tracks,
        clips: Object.values(clips),
      };
    },

    importFromJSON: (data) => {
      set((state) => {
        state.projectId = data.projectId;
        state.shortId = data.shortId;
        state.aspectRatio = data.aspectRatio;
        state.tracks = data.tracks;
        state.clips = {};
        data.clips.forEach((clip) => {
          state.clips[clip.id] = clip;
        });
        // Recalculate duration from clips (don't trust saved value)
        state.duration = calculateDurationFromClips(state.clips);
        state.currentTime = 0;
        state.isPlaying = false;
        state.selectedClipIds = [];
      });
    },
  }))
);
