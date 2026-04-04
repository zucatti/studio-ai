'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useMontageStore, MontageClip } from '@/store/montage-store';

interface AudioInstance {
  clipId: string;
  audio: HTMLAudioElement;
  clip: MontageClip;
  ready: boolean;
}

/**
 * AudioPlayback - Manages audio playback for audio clips in the timeline
 * This component doesn't render anything, it just manages audio elements
 *
 * Strategy:
 * 1. PRELOAD all audio clips when component mounts or clips change
 * 2. Sign URLs in batch upfront
 * 3. Create Audio elements and wait for 'canplaythrough'
 * 4. During playback, just play/pause - no async operations
 */
export function AudioPlayback() {
  const audioInstancesRef = useRef<Map<string, AudioInstance>>(new Map());
  const signedUrlCacheRef = useRef<Map<string, string>>(new Map());
  const activeClipIdsRef = useRef<Set<string>>(new Set());
  const preloadedClipIdsRef = useRef<Set<string>>(new Set());

  const isPlaying = useMontageStore((state) => state.isPlaying);

  // Sign multiple B2 URLs in batch
  const signUrls = useCallback(async (urls: string[]): Promise<Map<string, string>> => {
    const result = new Map<string, string>();
    const urlsToSign: string[] = [];

    // Check cache first
    for (const url of urls) {
      const cached = signedUrlCacheRef.current.get(url);
      if (cached) {
        result.set(url, cached);
      } else if (url.startsWith('b2://')) {
        urlsToSign.push(url);
      } else {
        result.set(url, url);
      }
    }

    if (urlsToSign.length === 0) return result;

    try {
      const res = await fetch('/api/storage/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: urlsToSign }),
      });

      if (res.ok) {
        const data = await res.json();
        for (const url of urlsToSign) {
          const signedUrl = data.signedUrls?.[url] || url;
          signedUrlCacheRef.current.set(url, signedUrl);
          result.set(url, signedUrl);
        }
      }
    } catch (error) {
      console.error('Failed to sign audio URLs:', error);
      // Fallback to original URLs
      for (const url of urlsToSign) {
        result.set(url, url);
      }
    }

    return result;
  }, []);

  // Preload new audio clips - uses subscription instead of selector to avoid re-renders
  useEffect(() => {
    const preloadNewClips = async () => {
      const { clips } = useMontageStore.getState();
      const audioClips = Object.values(clips).filter(
        (c) => c.type === 'audio' && c.assetUrl
      );

      if (audioClips.length === 0) return;

      // Find clips that need preloading
      const clipsToPreload = audioClips.filter(
        (c) => !preloadedClipIdsRef.current.has(c.id)
      );

      if (clipsToPreload.length === 0) return;

      // Sign all URLs in batch
      const urlsToSign = clipsToPreload
        .map((c) => c.assetUrl!)
        .filter((url, i, arr) => arr.indexOf(url) === i); // unique

      const signedUrls = await signUrls(urlsToSign);

      // Create and preload Audio elements
      for (const clip of clipsToPreload) {
        if (audioInstancesRef.current.has(clip.id)) continue;

        const signedUrl = signedUrls.get(clip.assetUrl!) || clip.assetUrl!;
        const audio = new Audio();
        audio.preload = 'auto';

        const instance: AudioInstance = {
          clipId: clip.id,
          audio,
          clip,
          ready: false,
        };

        // Mark as ready when loaded
        audio.addEventListener('canplaythrough', () => {
          instance.ready = true;
        }, { once: true });

        audio.src = signedUrl;
        audio.load(); // Start loading immediately

        audioInstancesRef.current.set(clip.id, instance);
        preloadedClipIdsRef.current.add(clip.id);
      }
    };

    // Preload on mount
    preloadNewClips();

    // Subscribe to clip changes (only triggers preload for NEW audio clips)
    const unsubscribe = useMontageStore.subscribe((state, prevState) => {
      // Only check if clips object changed
      if (state.clips !== prevState.clips) {
        preloadNewClips();
      }
    });

    return unsubscribe;
  }, [signUrls]);

  // Find active audio clips at a given time
  const findActiveAudioClips = useCallback((time: number): MontageClip[] => {
    const store = useMontageStore.getState();
    const audioTracks = store.tracks.filter((t) => t.type === 'audio' && !t.muted);
    const activeClips: MontageClip[] = [];

    for (const track of audioTracks) {
      const clip = Object.values(store.clips).find(
        (c) =>
          c.trackId === track.id &&
          time >= c.start &&
          time < c.start + c.duration
      );

      if (clip) {
        activeClips.push(clip);
      }
    }

    return activeClips;
  }, []);

  // Start/stop playback - NO async operations here, everything is preloaded
  useEffect(() => {
    if (!isPlaying) {
      // Pause all audio immediately
      audioInstancesRef.current.forEach((instance) => {
        instance.audio.pause();
      });
      activeClipIdsRef.current.clear();
      return;
    }

    // Start playback - find active clips and start them (sync, no await)
    const store = useMontageStore.getState();
    const currentTime = store.currentTime;
    const activeClips = findActiveAudioClips(currentTime);

    for (const clip of activeClips) {
      const instance = audioInstancesRef.current.get(clip.id);
      if (!instance) continue;

      // Calculate where in the audio we should be
      const clipTime = currentTime - clip.start;
      const sourceTime = (clip.sourceStart || 0) + clipTime;

      instance.audio.currentTime = sourceTime;
      instance.audio.play().catch(() => {});
      activeClipIdsRef.current.add(clip.id);
    }

    // Check for clip transitions every 100ms (faster now that it's sync)
    const intervalId = setInterval(() => {
      const store = useMontageStore.getState();
      if (!store.isPlaying) return;

      const currentTime = store.currentTime;
      const activeClips = findActiveAudioClips(currentTime);
      const newActiveIds = new Set(activeClips.map((c) => c.id));

      // Stop clips that are no longer active
      activeClipIdsRef.current.forEach((clipId) => {
        if (!newActiveIds.has(clipId)) {
          const instance = audioInstancesRef.current.get(clipId);
          if (instance) {
            instance.audio.pause();
          }
          activeClipIdsRef.current.delete(clipId);
        }
      });

      // Start new clips (sync - already preloaded)
      for (const clip of activeClips) {
        if (activeClipIdsRef.current.has(clip.id)) continue;

        const instance = audioInstancesRef.current.get(clip.id);
        if (!instance) continue;

        const clipTime = currentTime - clip.start;
        const sourceTime = (clip.sourceStart || 0) + clipTime;

        instance.audio.currentTime = sourceTime;
        instance.audio.play().catch(() => {});
        activeClipIdsRef.current.add(clip.id);
      }
    }, 100);

    return () => {
      clearInterval(intervalId);
      // Pause all audio
      audioInstancesRef.current.forEach((instance) => {
        instance.audio.pause();
      });
      activeClipIdsRef.current.clear();
    };
  }, [isPlaying, findActiveAudioClips]);

  // Handle track mute changes
  useEffect(() => {
    const unsubscribe = useMontageStore.subscribe((state, prevState) => {
      // Check if any track mute state changed
      const tracksChanged = state.tracks.some((track, i) => {
        const prevTrack = prevState.tracks[i];
        return prevTrack && track.muted !== prevTrack.muted;
      });

      if (tracksChanged && state.isPlaying) {
        // Update muted clips
        const mutedTrackIds = new Set(
          state.tracks.filter((t) => t.muted).map((t) => t.id)
        );

        audioInstancesRef.current.forEach((instance) => {
          const clip = state.clips[instance.clipId];
          if (clip && mutedTrackIds.has(clip.trackId)) {
            instance.audio.pause();
            activeClipIdsRef.current.delete(instance.clipId);
          }
        });
      }
    });

    return unsubscribe;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioInstancesRef.current.forEach((instance) => {
        instance.audio.pause();
        instance.audio.src = '';
      });
      audioInstancesRef.current.clear();
      preloadedClipIdsRef.current.clear();
    };
  }, []);

  return null;
}
