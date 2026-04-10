'use client';

/**
 * Timeline Audio Waveform
 *
 * Displays the waveform for an audio clip using WaveSurfer.js.
 */

import { useRef, useEffect, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';

interface TimelineAudioWaveformProps {
  assetUrl?: string;
  width: number;
  sourceStart?: number;
  sourceEnd?: number;
}

export function TimelineAudioWaveform({
  assetUrl,
  width,
  sourceStart,
  sourceEnd,
}: TimelineAudioWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  // Sign the URL if it's a B2 URL
  useEffect(() => {
    if (!assetUrl) return;

    const signUrl = async () => {
      try {
        if (assetUrl.startsWith('b2://') || assetUrl.includes('backblazeb2')) {
          const response = await fetch('/api/storage/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: assetUrl }),
          });

          if (response.ok) {
            const data = await response.json();
            setSignedUrl(data.signedUrl);
          } else {
            setSignedUrl(assetUrl);
          }
        } else {
          setSignedUrl(assetUrl);
        }
      } catch {
        setSignedUrl(assetUrl);
      }
    };

    signUrl();
  }, [assetUrl]);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current || !signedUrl) return;

    setIsLoading(true);
    setError(null);

    // Destroy previous instance
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
    }

    try {
      wavesurferRef.current = WaveSurfer.create({
        container: containerRef.current,
        waveColor: '#4ade80',
        progressColor: '#22c55e',
        cursorWidth: 0,
        height: 48,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        normalize: true,
        interact: false,
        fillParent: true,
        minPxPerSec: 1,
      });

      wavesurferRef.current.on('ready', () => {
        setIsLoading(false);

        // Apply region if trim is set
        if (wavesurferRef.current && (sourceStart !== undefined || sourceEnd !== undefined)) {
          const duration = wavesurferRef.current.getDuration();
          const start = sourceStart || 0;
          const end = sourceEnd || duration;

          // Zoom to show only the trimmed region
          if (start > 0 || end < duration) {
            const regionDuration = end - start;
            const pxPerSec = width / regionDuration;
            wavesurferRef.current.zoom(pxPerSec);
            wavesurferRef.current.seekTo(start / duration);
          }
        }
      });

      wavesurferRef.current.on('error', (err) => {
        console.error('[Waveform] Error:', err);
        setError('Failed to load audio');
        setIsLoading(false);
      });

      wavesurferRef.current.load(signedUrl);
    } catch (err) {
      console.error('[Waveform] Init error:', err);
      setError('Failed to initialize');
      setIsLoading(false);
    }

    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
    };
  }, [signedUrl, width, sourceStart, sourceEnd]);

  if (!assetUrl) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-zinc-500">
        No audio
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="relative h-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-green-950/50">
          <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{ opacity: isLoading ? 0 : 1 }}
      />
    </div>
  );
}
