/**
 * Timeline Store
 *
 * Zustand store for the unified Timeline Editor.
 * Handles multi-track video/audio/image/transition composition.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { nanoid } from 'nanoid';

// ============================================
// TYPES
// ============================================

export type TrackType = 'video' | 'audio' | 'image' | 'transition';

export type ClipType = 'sequence' | 'video' | 'image' | 'audio' | 'transition';

export type TransitionType =
  | 'none'
  | 'fade'
  | 'fadeblack'
  | 'fadewhite'
  | 'dissolve'
  | 'slideleft'
  | 'slideright'
  | 'slideup'
  | 'slidedown'
  | 'wipe'
  | 'zoom';

export type KenBurnsDirection = 'in' | 'out' | 'left' | 'right' | 'none';

export interface Track {
  id: string;
  type: TrackType;
  name: string;
  order: number;
  muted: boolean;
  locked: boolean;
  visible: boolean;
}

export interface TimelineClip {
  id: string;
  trackId: string;

  // Position
  start: number;
  duration: number;

  // Type and source
  type: ClipType;
  sequenceId?: string;
  assetUrl?: string;
  rushId?: string;
  transitionType?: TransitionType;

  // Trim (for video/audio)
  sourceStart?: number;
  sourceEnd?: number;
  sourceDuration?: number;

  // Audio
  volume?: number;
  waveformData?: number[];

  // Image
  kenBurns?: KenBurnsDirection;

  // Display
  label?: string;
  color?: string;
  thumbnailUrl?: string;
}

export interface DraggableItem {
  type: 'sequence' | 'rush-video' | 'rush-image' | 'audio';
  id: string;
  duration: number;
  label: string;
  thumbnailUrl?: string;
  assetUrl?: string;
}

export interface DropTarget {
  trackId: string;
  time: number;
  valid: boolean;
}

export interface TimelineData {
  tracks: Track[];
  clips: Record<string, TimelineClip>;
  masterAudioUrl: string | null;
  masterAudioVolume: number;
}

// ============================================
// STATE & ACTIONS
// ============================================

interface TimelineState {
  // Identity
  sceneId: string | null;
  projectId: string | null;

  // Data
  tracks: Track[];
  clips: Record<string, TimelineClip>;

  // Playback
  currentTime: number;
  duration: number;
  isPlaying: boolean;

  // UI
  scale: number; // pixels per second
  scrollX: number;
  scrollY: number;
  selectedClipIds: string[];

  // Drag & Drop
  draggedItem: DraggableItem | null;
  dropTarget: DropTarget | null;

  // Master audio
  masterAudioUrl: string | null;
  masterAudioVolume: number;

  // Dirty flag
  isDirty: boolean;
}

interface TimelineActions {
  // Initialization
  initialize: (sceneId: string, projectId: string, data?: TimelineData) => void;
  reset: () => void;

  // Tracks
  addTrack: (type: TrackType, name?: string) => string;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<Track>) => void;
  reorderTrack: (trackId: string, newOrder: number) => void;

  // Clips
  addClip: (clip: Omit<TimelineClip, 'id'>) => string;
  removeClip: (clipId: string) => void;
  updateClip: (clipId: string, updates: Partial<TimelineClip>) => void;
  moveClip: (clipId: string, newStart: number, newTrackId?: string) => void;
  resizeClip: (clipId: string, newDuration: number, edge: 'left' | 'right') => void;

  // Sequence helpers
  addSequenceToTimeline: (
    sequenceId: string,
    sequenceDuration: number,
    trackId: string,
    start: number,
    label?: string,
    thumbnailUrl?: string
  ) => string;

  // Transition helpers
  addTransition: (
    transitionType: TransitionType,
    start: number,
    duration?: number
  ) => string;

  // Selection
  selectClip: (clipId: string, additive?: boolean) => void;
  selectClips: (clipIds: string[]) => void;
  clearSelection: () => void;
  deleteSelectedClips: () => void;

  // Playback
  play: () => void;
  pause: () => void;
  togglePlayback: () => void;
  seekTo: (time: number) => void;
  setCurrentTime: (time: number) => void;

  // Zoom & Scroll
  setScale: (scale: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitToView: (containerWidth: number) => void;
  setScroll: (x: number, y: number) => void;

  // Drag & Drop
  startDrag: (item: DraggableItem) => void;
  updateDropTarget: (target: DropTarget | null) => void;
  endDrag: () => void;
  dropItem: () => string | null;

  // Master audio
  setMasterAudio: (url: string | null, volume?: number) => void;

  // Persistence
  toJSON: () => TimelineData;
  markClean: () => void;

  // Duration
  recalculateDuration: () => void;

  // Utility
  getTrackById: (trackId: string) => Track | undefined;
  getClipById: (clipId: string) => TimelineClip | undefined;
  getClipsForTrack: (trackId: string) => TimelineClip[];
  getTransitionTrack: () => Track | undefined;
}

type TimelineStore = TimelineState & TimelineActions;

// ============================================
// DEFAULT TRACKS
// ============================================

function createDefaultTracks(): Track[] {
  return [
    { id: nanoid(), type: 'video', name: 'Video', order: 3, muted: false, locked: false, visible: true },
    { id: nanoid(), type: 'transition', name: 'Transitions', order: 2, muted: false, locked: false, visible: true },
    { id: nanoid(), type: 'image', name: 'Images', order: 1, muted: false, locked: false, visible: true },
    { id: nanoid(), type: 'audio', name: 'Audio', order: 0, muted: false, locked: false, visible: true },
  ];
}

// ============================================
// STORE
// ============================================

const initialState: TimelineState = {
  sceneId: null,
  projectId: null,
  tracks: [],
  clips: {},
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  scale: 50, // 50px per second
  scrollX: 0,
  scrollY: 0,
  selectedClipIds: [],
  draggedItem: null,
  dropTarget: null,
  masterAudioUrl: null,
  masterAudioVolume: 0.8,
  isDirty: false,
};

export const useTimelineStore = create<TimelineStore>()(
  immer((set, get) => ({
    ...initialState,

    // ========== Initialization ==========

    initialize: (sceneId, projectId, data) => {
      set((state) => {
        state.sceneId = sceneId;
        state.projectId = projectId;

        if (data) {
          state.tracks = data.tracks;
          state.clips = data.clips;
          state.masterAudioUrl = data.masterAudioUrl;
          state.masterAudioVolume = data.masterAudioVolume;
        } else {
          state.tracks = createDefaultTracks();
          state.clips = {};
        }

        state.isDirty = false;
      });
      get().recalculateDuration();
    },

    reset: () => {
      set(initialState);
    },

    // ========== Tracks ==========

    addTrack: (type, name) => {
      const id = nanoid();
      set((state) => {
        const maxOrder = Math.max(...state.tracks.map((t) => t.order), -1);
        state.tracks.push({
          id,
          type,
          name: name || `${type.charAt(0).toUpperCase() + type.slice(1)} ${state.tracks.filter((t) => t.type === type).length + 1}`,
          order: maxOrder + 1,
          muted: false,
          locked: false,
          visible: true,
        });
        state.isDirty = true;
      });
      return id;
    },

    removeTrack: (trackId) => {
      set((state) => {
        state.tracks = state.tracks.filter((t) => t.id !== trackId);
        // Remove clips on this track
        for (const clipId of Object.keys(state.clips)) {
          if (state.clips[clipId].trackId === trackId) {
            delete state.clips[clipId];
          }
        }
        state.isDirty = true;
      });
      get().recalculateDuration();
    },

    updateTrack: (trackId, updates) => {
      set((state) => {
        const track = state.tracks.find((t) => t.id === trackId);
        if (track) {
          Object.assign(track, updates);
          state.isDirty = true;
        }
      });
    },

    reorderTrack: (trackId, newOrder) => {
      set((state) => {
        const track = state.tracks.find((t) => t.id === trackId);
        if (track) {
          track.order = newOrder;
          state.isDirty = true;
        }
      });
    },

    // ========== Clips ==========

    addClip: (clipData) => {
      const id = nanoid();
      set((state) => {
        state.clips[id] = { ...clipData, id };
        state.isDirty = true;
      });
      get().recalculateDuration();
      return id;
    },

    removeClip: (clipId) => {
      set((state) => {
        delete state.clips[clipId];
        state.selectedClipIds = state.selectedClipIds.filter((id) => id !== clipId);
        state.isDirty = true;
      });
      get().recalculateDuration();
    },

    updateClip: (clipId, updates) => {
      set((state) => {
        const clip = state.clips[clipId];
        if (clip) {
          Object.assign(clip, updates);
          state.isDirty = true;
        }
      });
      if (updates.start !== undefined || updates.duration !== undefined) {
        get().recalculateDuration();
      }
    },

    moveClip: (clipId, newStart, newTrackId) => {
      set((state) => {
        const clip = state.clips[clipId];
        if (clip) {
          clip.start = Math.max(0, newStart);
          if (newTrackId) {
            clip.trackId = newTrackId;
          }
          state.isDirty = true;
        }
      });
      get().recalculateDuration();
    },

    resizeClip: (clipId, newDuration, edge) => {
      set((state) => {
        const clip = state.clips[clipId];
        if (clip && newDuration > 0) {
          if (edge === 'left') {
            const delta = clip.duration - newDuration;
            clip.start = Math.max(0, clip.start + delta);
            clip.duration = newDuration;
            // Adjust source trim
            if (clip.sourceStart !== undefined) {
              clip.sourceStart = Math.max(0, clip.sourceStart + delta);
            }
          } else {
            clip.duration = newDuration;
            // Adjust source trim
            if (clip.sourceEnd !== undefined && clip.sourceDuration !== undefined) {
              clip.sourceEnd = Math.min(clip.sourceDuration, (clip.sourceStart || 0) + newDuration);
            }
          }
          state.isDirty = true;
        }
      });
      get().recalculateDuration();
    },

    // ========== Sequence Helpers ==========

    addSequenceToTimeline: (sequenceId, sequenceDuration, trackId, start, label, thumbnailUrl) => {
      const id = nanoid();
      set((state) => {
        state.clips[id] = {
          id,
          trackId,
          type: 'sequence',
          sequenceId,
          start,
          duration: sequenceDuration,
          label,
          thumbnailUrl,
        };
        state.isDirty = true;
      });
      get().recalculateDuration();
      return id;
    },

    // ========== Transition Helpers ==========

    addTransition: (transitionType, start, duration = 0.5) => {
      const { getTransitionTrack, addTrack } = get();
      let track = getTransitionTrack();

      if (!track) {
        const trackId = addTrack('transition', 'Transitions');
        track = get().tracks.find((t) => t.id === trackId);
      }

      if (!track) return '';

      const id = nanoid();
      set((state) => {
        state.clips[id] = {
          id,
          trackId: track!.id,
          type: 'transition',
          transitionType,
          start,
          duration,
          label: transitionType,
        };
        state.isDirty = true;
      });
      return id;
    },

    // ========== Selection ==========

    selectClip: (clipId, additive = false) => {
      set((state) => {
        if (additive) {
          if (state.selectedClipIds.includes(clipId)) {
            state.selectedClipIds = state.selectedClipIds.filter((id) => id !== clipId);
          } else {
            state.selectedClipIds.push(clipId);
          }
        } else {
          state.selectedClipIds = [clipId];
        }
      });
    },

    selectClips: (clipIds) => {
      set((state) => {
        state.selectedClipIds = clipIds;
      });
    },

    clearSelection: () => {
      set((state) => {
        state.selectedClipIds = [];
      });
    },

    deleteSelectedClips: () => {
      const { selectedClipIds, removeClip } = get();
      for (const clipId of selectedClipIds) {
        removeClip(clipId);
      }
    },

    // ========== Playback ==========

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
      });
    },

    setCurrentTime: (time) => {
      set((state) => {
        state.currentTime = time;
      });
    },

    // ========== Zoom & Scroll ==========

    setScale: (scale) => {
      set((state) => {
        state.scale = Math.max(10, Math.min(200, scale));
      });
    },

    zoomIn: () => {
      set((state) => {
        state.scale = Math.min(200, state.scale * 1.25);
      });
    },

    zoomOut: () => {
      set((state) => {
        state.scale = Math.max(10, state.scale / 1.25);
      });
    },

    fitToView: (containerWidth) => {
      const { duration } = get();
      if (duration > 0 && containerWidth > 0) {
        const newScale = (containerWidth - 100) / duration; // 100px margin
        set((state) => {
          state.scale = Math.max(10, Math.min(200, newScale));
          state.scrollX = 0;
        });
      }
    },

    setScroll: (x, y) => {
      set((state) => {
        state.scrollX = x;
        state.scrollY = y;
      });
    },

    // ========== Drag & Drop ==========

    startDrag: (item) => {
      set((state) => {
        state.draggedItem = item;
      });
    },

    updateDropTarget: (target) => {
      set((state) => {
        state.dropTarget = target;
      });
    },

    endDrag: () => {
      set((state) => {
        state.draggedItem = null;
        state.dropTarget = null;
      });
    },

    dropItem: () => {
      const { draggedItem, dropTarget, addClip } = get();

      if (!draggedItem || !dropTarget || !dropTarget.valid) {
        get().endDrag();
        return null;
      }

      let clipType: ClipType;
      switch (draggedItem.type) {
        case 'sequence':
          clipType = 'sequence';
          break;
        case 'rush-video':
          clipType = 'video';
          break;
        case 'rush-image':
          clipType = 'image';
          break;
        case 'audio':
          clipType = 'audio';
          break;
        default:
          clipType = 'video';
      }

      const clipId = addClip({
        trackId: dropTarget.trackId,
        type: clipType,
        start: dropTarget.time,
        duration: draggedItem.duration,
        sequenceId: draggedItem.type === 'sequence' ? draggedItem.id : undefined,
        assetUrl: draggedItem.assetUrl,
        label: draggedItem.label,
        thumbnailUrl: draggedItem.thumbnailUrl,
      });

      get().endDrag();
      return clipId;
    },

    // ========== Master Audio ==========

    setMasterAudio: (url, volume) => {
      set((state) => {
        state.masterAudioUrl = url;
        if (volume !== undefined) {
          state.masterAudioVolume = volume;
        }
        state.isDirty = true;
      });
    },

    // ========== Persistence ==========

    toJSON: () => {
      const { tracks, clips, masterAudioUrl, masterAudioVolume } = get();
      return {
        tracks,
        clips,
        masterAudioUrl,
        masterAudioVolume,
      };
    },

    markClean: () => {
      set((state) => {
        state.isDirty = false;
      });
    },

    // ========== Duration ==========

    recalculateDuration: () => {
      set((state) => {
        let maxEnd = 0;
        for (const clip of Object.values(state.clips)) {
          const end = clip.start + clip.duration;
          if (end > maxEnd) {
            maxEnd = end;
          }
        }
        state.duration = maxEnd;
      });
    },

    // ========== Utility ==========

    getTrackById: (trackId) => {
      return get().tracks.find((t) => t.id === trackId);
    },

    getClipById: (clipId) => {
      return get().clips[clipId];
    },

    getClipsForTrack: (trackId) => {
      return Object.values(get().clips).filter((c) => c.trackId === trackId);
    },

    getTransitionTrack: () => {
      return get().tracks.find((t) => t.type === 'transition');
    },
  }))
);

// ============================================
// SELECTORS
// ============================================

export const selectSortedTracks = (state: TimelineStore) =>
  [...state.tracks].sort((a, b) => b.order - a.order);

export const selectVisualClips = (state: TimelineStore) =>
  Object.values(state.clips)
    .filter((c) => c.type === 'sequence' || c.type === 'video' || c.type === 'image')
    .sort((a, b) => a.start - b.start);

export const selectAudioClips = (state: TimelineStore) =>
  Object.values(state.clips)
    .filter((c) => c.type === 'audio')
    .sort((a, b) => a.start - b.start);

export const selectTransitionClips = (state: TimelineStore) =>
  Object.values(state.clips)
    .filter((c) => c.type === 'transition')
    .sort((a, b) => a.start - b.start);
