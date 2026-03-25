'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Plus,
  Trash2,
  Music,
  Loader2,
  Volume2,
  VolumeX,
  Clock,
  Film,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MusicSection, MusicSectionType } from '@/types/database';
import { toast } from 'sonner';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.js';

interface Shot {
  id: string;
  section_id: string;
  relative_start: number;
  duration: number;
  description?: string;
  storyboard_image_url?: string;
  first_frame_url?: string;
}

// Shot duration constraints (matching AI video generators like Kling, Runway, etc.)
const MIN_SHOT_DURATION = 3; // Minimum 3 seconds
const MAX_SHOT_DURATION = 15; // Maximum 15 seconds

interface ClipTimelineProps {
  projectId: string;
  audioUrl: string;
  audioDuration?: number;
  sections: MusicSection[];
  onSectionsChange: (sections: MusicSection[]) => void;
  onSectionSelect?: (section: MusicSection | null) => void;
  selectedSectionId?: string | null;
  className?: string;
}

const SECTION_TYPES: { value: MusicSectionType; label: string; color: string }[] = [
  { value: 'intro', label: 'Intro', color: '#6366f1' },
  { value: 'verse', label: 'Couplet', color: '#8b5cf6' },
  { value: 'chorus', label: 'Refrain', color: '#ec4899' },
  { value: 'bridge', label: 'Pont', color: '#f59e0b' },
  { value: 'outro', label: 'Outro', color: '#6366f1' },
  { value: 'instrumental', label: 'Instrumental', color: '#10b981' },
  { value: 'custom', label: 'Autre', color: '#64748b' },
];

export function ClipTimeline({
  projectId,
  audioUrl,
  audioDuration,
  sections,
  onSectionsChange,
  onSectionSelect,
  selectedSectionId,
  className,
}: ClipTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(audioDuration || 0);
  const [isLoading, setIsLoading] = useState(true);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // New section dialog
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionType, setNewSectionType] = useState<MusicSectionType>('verse');
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);

  // Shots per section
  const [sectionShots, setSectionShots] = useState<Record<string, Shot[]>>({});
  const [loadingShots, setLoadingShots] = useState<Record<string, boolean>>({});
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Shot resize state
  const [resizingShot, setResizingShot] = useState<{
    sectionId: string;
    shotId: string;
    edge: 'left' | 'right';
    initialX: number;
    initialStart: number;
    initialDuration: number;
    sectionDuration: number;
  } | null>(null);

  // Format time helper
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Fetch shots for a section
  const fetchSectionShots = useCallback(async (sectionId: string, section: MusicSection) => {
    if (loadingShots[sectionId] || sectionShots[sectionId]) return;

    setLoadingShots(prev => ({ ...prev, [sectionId]: true }));

    try {
      const res = await fetch(`/api/projects/${projectId}/sections/${sectionId}/shots`);
      if (res.ok) {
        const data = await res.json();
        const sectionDuration = section.end_time - section.start_time;

        // Calculate duration for each shot based on next shot's start or section end
        const shots = (data.shots || []).map((shot: Shot, index: number, arr: Shot[]) => {
          const nextShot = arr[index + 1];
          const duration = nextShot
            ? nextShot.relative_start - shot.relative_start
            : sectionDuration - shot.relative_start;
          return { ...shot, duration: Math.min(duration, MAX_SHOT_DURATION) };
        });

        setSectionShots(prev => ({ ...prev, [sectionId]: shots }));
      }
    } catch (error) {
      console.error('Error fetching shots:', error);
    } finally {
      setLoadingShots(prev => ({ ...prev, [sectionId]: false }));
    }
  }, [projectId, loadingShots, sectionShots]);

  // Toggle section expansion
  const toggleSectionExpand = useCallback((sectionId: string, section: MusicSection) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
        // Fetch shots when expanding
        fetchSectionShots(sectionId, section);
      }
      return next;
    });
  }, [fetchSectionShots]);

  // Create a new shot in a section
  const createShot = useCallback(async (sectionId: string, section: MusicSection, relativeStart: number) => {
    const sectionDuration = section.end_time - section.start_time;
    const existingShots = (sectionShots[sectionId] || []).sort((a, b) => a.relative_start - b.relative_start);

    // Helper to create shot via API
    const createShotAPI = async (start: number, duration: number, name: string) => {
      const res = await fetch(`/api/projects/${projectId}/sections/${sectionId}/shots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relative_start: start,
          duration: duration,
          description: name,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Erreur');
      }
      return res.json();
    };

    // Check if clicked on an existing shot - if so, do nothing
    const clickedShot = existingShots.find(
      s => relativeStart >= s.relative_start && relativeStart < s.relative_start + s.duration
    );
    if (clickedShot) {
      return; // Don't split, just ignore click on existing shot
    }

    // Clicked in empty space → find the gap and create a shot there
    // Find gap boundaries
    let gapStart = 0;
    let gapEnd = sectionDuration;

    // Find which gap we clicked in
    for (let i = 0; i <= existingShots.length; i++) {
      const prevEnd = i === 0 ? 0 : existingShots[i - 1].relative_start + existingShots[i - 1].duration;
      const nextStart = i === existingShots.length ? sectionDuration : existingShots[i].relative_start;

      if (relativeStart >= prevEnd && relativeStart < nextStart) {
        gapStart = prevEnd;
        gapEnd = nextStart;
        break;
      }
    }

    const gapDuration = gapEnd - gapStart;

    if (gapDuration < MIN_SHOT_DURATION) {
      return; // Space too small, silently ignore
    }

    // Create shot: fill the gap up to MAX_SHOT_DURATION
    const shotDuration = Math.min(gapDuration, MAX_SHOT_DURATION);

    try {
      const { shot } = await createShotAPI(gapStart, shotDuration, `Plan ${existingShots.length + 1}`);
      const newShots = [...existingShots, { ...shot, duration: shotDuration }]
        .sort((a, b) => a.relative_start - b.relative_start);
      setSectionShots(prev => ({ ...prev, [sectionId]: newShots }));
      toast.success('Plan créé');
    } catch (error) {
      console.error('Error creating shot:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur');
    }
  }, [projectId, sectionShots]);

  // Delete a shot (snapped mode: expand adjacent shot to fill gap)
  const deleteShotFromSection = useCallback(async (sectionId: string, shotId: string, section: MusicSection) => {
    const sectionDuration = section.end_time - section.start_time;
    const existingShots = [...(sectionShots[sectionId] || [])].sort((a, b) => a.relative_start - b.relative_start);
    const shotIndex = existingShots.findIndex(s => s.id === shotId);

    if (shotIndex === -1) return;

    const deletedShot = existingShots[shotIndex];
    const prevShot = existingShots[shotIndex - 1];
    const nextShot = existingShots[shotIndex + 1];

    try {
      const res = await fetch(`/api/projects/${projectId}/sections/${sectionId}/shots/${shotId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        // Remove the deleted shot
        let newShots = existingShots.filter(s => s.id !== shotId);

        // Expand adjacent shot to fill the gap
        if (prevShot) {
          // Extend previous shot to cover the deleted shot's space
          const newPrevDuration = prevShot.duration + deletedShot.duration;
          newShots = newShots.map(s =>
            s.id === prevShot.id ? { ...s, duration: newPrevDuration } : s
          );
        } else if (nextShot) {
          // Extend next shot backwards to cover the deleted shot's space
          const newNextStart = deletedShot.relative_start;
          const newNextDuration = nextShot.duration + deletedShot.duration;
          newShots = newShots.map(s =>
            s.id === nextShot.id
              ? { ...s, relative_start: newNextStart, duration: newNextDuration }
              : s
          );

          // Update next shot on server
          await fetch(`/api/projects/${projectId}/sections/${sectionId}/shots/${nextShot.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ relative_start: newNextStart }),
          });
        }

        setSectionShots(prev => ({ ...prev, [sectionId]: newShots }));
        toast.success('Plan supprimé');
      }
    } catch (error) {
      console.error('Error deleting shot:', error);
      toast.error('Erreur lors de la suppression');
    }
  }, [projectId, sectionShots]);

  // Start resizing a shot
  const startResize = useCallback((
    e: React.MouseEvent,
    sectionId: string,
    shot: Shot,
    edge: 'left' | 'right',
    sectionDuration: number
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setResizingShot({
      sectionId,
      shotId: shot.id,
      edge,
      initialX: e.clientX,
      initialStart: shot.relative_start,
      initialDuration: shot.duration,
      sectionDuration,
    });
  }, []);

  // Handle resize mouse move (snapped mode - push/pull neighbors)
  useEffect(() => {
    if (!resizingShot) return;

    const handleMouseMove = (e: MouseEvent) => {
      const filmstrip = document.querySelector(`[data-filmstrip="${resizingShot.sectionId}"]`);
      if (!filmstrip) return;

      const rect = filmstrip.getBoundingClientRect();
      const deltaX = e.clientX - resizingShot.initialX;
      const deltaPercent = deltaX / rect.width;
      const deltaTime = deltaPercent * resizingShot.sectionDuration;

      const shots = [...(sectionShots[resizingShot.sectionId] || [])].sort((a, b) => a.relative_start - b.relative_start);
      const shotIndex = shots.findIndex(s => s.id === resizingShot.shotId);
      if (shotIndex === -1) return;

      const shot = shots[shotIndex];
      const prevShot = shots[shotIndex - 1];
      const nextShot = shots[shotIndex + 1];

      if (resizingShot.edge === 'left') {
        // Moving left edge: changes this shot's start and previous shot's duration
        let newStart = resizingShot.initialStart + deltaTime;

        // Constraints: min start (prev shot min duration or 0), max start (this shot min duration)
        const minStart = prevShot ? prevShot.relative_start + MIN_SHOT_DURATION : 0;
        const maxStart = resizingShot.initialStart + resizingShot.initialDuration - MIN_SHOT_DURATION;

        newStart = Math.max(minStart, Math.min(maxStart, newStart));
        const newDuration = (resizingShot.initialStart + resizingShot.initialDuration) - newStart;

        const updatedShots = shots.map((s) => {
          if (s.id === resizingShot.shotId) {
            return { ...s, relative_start: newStart, duration: newDuration };
          }
          if (prevShot && s.id === prevShot.id) {
            // Previous shot's duration extends/shrinks to meet new start
            return { ...s, duration: newStart - s.relative_start };
          }
          return s;
        });

        setSectionShots(prev => ({ ...prev, [resizingShot.sectionId]: updatedShots }));
      } else {
        // Moving right edge: changes this shot's duration and next shot's start
        let newEnd = resizingShot.initialStart + resizingShot.initialDuration + deltaTime;

        // Constraints: min end (this shot min duration), max end (next shot min duration or section end)
        const minEnd = resizingShot.initialStart + MIN_SHOT_DURATION;
        const maxEnd = nextShot
          ? nextShot.relative_start + nextShot.duration - MIN_SHOT_DURATION
          : resizingShot.sectionDuration;

        newEnd = Math.max(minEnd, Math.min(maxEnd, newEnd));
        const newDuration = newEnd - shot.relative_start;

        const updatedShots = shots.map((s) => {
          if (s.id === resizingShot.shotId) {
            return { ...s, duration: newDuration };
          }
          if (nextShot && s.id === nextShot.id) {
            // Next shot's start moves and duration shrinks
            const nextNewStart = newEnd;
            const nextNewDuration = (nextShot.relative_start + nextShot.duration) - nextNewStart;
            return { ...s, relative_start: nextNewStart, duration: nextNewDuration };
          }
          return s;
        });

        setSectionShots(prev => ({ ...prev, [resizingShot.sectionId]: updatedShots }));
      }
    };

    const handleMouseUp = async () => {
      if (!resizingShot) return;

      const shots = [...(sectionShots[resizingShot.sectionId] || [])].sort((a, b) => a.relative_start - b.relative_start);
      const shotIndex = shots.findIndex(s => s.id === resizingShot.shotId);
      const shot = shots[shotIndex];
      const prevShot = shots[shotIndex - 1];
      const nextShot = shots[shotIndex + 1];

      // Save changes to server
      const updates: Promise<Response>[] = [];

      if (shot) {
        updates.push(
          fetch(`/api/projects/${projectId}/sections/${resizingShot.sectionId}/shots/${shot.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ relative_start: shot.relative_start }),
          })
        );
      }

      // Save neighbor if affected
      if (resizingShot.edge === 'left' && prevShot) {
        updates.push(
          fetch(`/api/projects/${projectId}/sections/${resizingShot.sectionId}/shots/${prevShot.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ relative_start: prevShot.relative_start }),
          })
        );
      } else if (resizingShot.edge === 'right' && nextShot) {
        updates.push(
          fetch(`/api/projects/${projectId}/sections/${resizingShot.sectionId}/shots/${nextShot.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ relative_start: nextShot.relative_start }),
          })
        );
      }

      try {
        await Promise.all(updates);
      } catch (error) {
        console.error('Error updating shots:', error);
      }

      setResizingShot(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingShot, sectionShots, projectId]);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current || !audioUrl) return;

    console.log('[ClipTimeline] Loading audio URL:', audioUrl);

    let isMounted = true;
    const regions = RegionsPlugin.create();
    regionsRef.current = regions;

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      height: 100,
      waveColor: '#4f46e5',
      progressColor: '#818cf8',
      cursorColor: '#ef4444',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      plugins: [
        regions,
        TimelinePlugin.create({
          height: 20,
          timeInterval: 15,
          primaryLabelInterval: 1,
          secondaryLabelInterval: 0,
          style: {
            fontSize: '10px',
            color: '#64748b',
          },
        }),
      ],
    });

    wavesurferRef.current = wavesurfer;

    // Load with error handling for aborts
    wavesurfer.load(audioUrl).catch(() => {
      // Ignore load errors (e.g., abort during unmount)
    });

    wavesurfer.on('ready', () => {
      if (!isMounted) return;
      const dur = wavesurfer.getDuration();
      setDuration(dur);
      setIsLoading(false);
    });

    wavesurfer.on('play', () => isMounted && setIsPlaying(true));
    wavesurfer.on('pause', () => isMounted && setIsPlaying(false));
    wavesurfer.on('finish', () => isMounted && setIsPlaying(false));
    wavesurfer.on('timeupdate', (time) => isMounted && setCurrentTime(time));

    // Handle click to select time for splitting
    wavesurfer.on('click', () => {
      if (!isMounted) return;
      const time = wavesurfer.getCurrentTime();
      if (!selectionRange) {
        setSelectionRange({ start: time, end: time + 15 });
      }
    });

    return () => {
      isMounted = false;
      wavesurfer.destroy();
    };
  }, [audioUrl]);

  // Update regions when sections change
  useEffect(() => {
    if (!regionsRef.current || isLoading) return;

    // Clear existing regions
    regionsRef.current.clearRegions();

    // Add section regions (just for waveform coloring, no handles)
    sections.forEach((section) => {
      const region = regionsRef.current!.addRegion({
        id: section.id,
        start: section.start_time,
        end: section.end_time,
        color: `${section.color}50`,
        drag: false,
        resize: false,
      });

      // Handle region updates
      region.on('update-end', () => {
        const updatedSections = sections.map((s) =>
          s.id === section.id
            ? { ...s, start_time: region.start, end_time: region.end }
            : s
        );
        onSectionsChange(updatedSections);
        updateSectionOnServer(section.id, {
          start_time: region.start,
          end_time: region.end,
        });
      });

      // Handle click to select
      region.on('click', () => {
        onSectionSelect?.(section);
      });
    });

    // Add selection region if active
    if (selectionRange && isAddingSection) {
      regionsRef.current.addRegion({
        id: 'selection',
        start: selectionRange.start,
        end: selectionRange.end,
        color: 'rgba(34, 197, 94, 0.3)',
        drag: true,
        resize: true,
      });
    }
  }, [sections, isLoading, selectionRange, isAddingSection]);

  // Update section on server
  const updateSectionOnServer = async (sectionId: string, data: Partial<MusicSection>) => {
    try {
      await fetch(`/api/projects/${projectId}/sections/${sectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (error) {
      console.error('Error updating section:', error);
    }
  };

  // Create new section
  const createSection = async () => {
    if (!selectionRange || !newSectionName.trim()) {
      toast.error('Sélectionnez une zone et donnez un nom');
      return;
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSectionName.trim(),
          section_type: newSectionType,
          start_time: selectionRange.start,
          end_time: selectionRange.end,
        }),
      });

      if (res.ok) {
        const { section } = await res.json();
        onSectionsChange([...sections, section]);
        setIsAddingSection(false);
        setNewSectionName('');
        setSelectionRange(null);
        toast.success('Section créée');
      } else {
        const error = await res.json();
        toast.error(error.error || 'Erreur lors de la création');
      }
    } catch (error) {
      console.error('Error creating section:', error);
      toast.error('Erreur lors de la création');
    }
  };

  // Delete section
  const deleteSection = async (sectionId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/sections/${sectionId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        onSectionsChange(sections.filter((s) => s.id !== sectionId));
        if (selectedSectionId === sectionId) {
          onSectionSelect?.(null);
        }
        toast.success('Section supprimée');
      }
    } catch (error) {
      console.error('Error deleting section:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  // Playback controls
  const togglePlayPause = useCallback(() => {
    wavesurferRef.current?.playPause();
  }, []);

  const skipBackward = useCallback(() => {
    const ws = wavesurferRef.current;
    if (ws) {
      const newTime = Math.max(0, ws.getCurrentTime() - 5);
      ws.seekTo(newTime / ws.getDuration());
    }
  }, []);

  const skipForward = useCallback(() => {
    const ws = wavesurferRef.current;
    if (ws) {
      const newTime = Math.min(ws.getDuration(), ws.getCurrentTime() + 5);
      ws.seekTo(newTime / ws.getDuration());
    }
  }, []);

  const toggleMute = useCallback(() => {
    const ws = wavesurferRef.current;
    if (ws) {
      if (isMuted) {
        ws.setVolume(volume);
        setIsMuted(false);
      } else {
        ws.setVolume(0);
        setIsMuted(true);
      }
    }
  }, [isMuted, volume]);

  // Calculate total sections duration
  const totalSectionsDuration = useMemo(() => {
    return sections.reduce((acc, s) => acc + (s.end_time - s.start_time), 0);
  }, [sections]);

  const uncoveredDuration = duration - totalSectionsDuration;

  return (
    <div className={cn('rounded-xl border border-white/10 bg-slate-900/50 overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-slate-800/50">
        <div className="flex items-center gap-3">
          <Music className="w-5 h-5 text-purple-400" />
          <span className="font-medium text-white">Timeline Audio</span>
          <span className="text-sm text-slate-400">
            {formatTime(duration)} • {sections.length} section{sections.length > 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {uncoveredDuration > 0 && (
            <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
              {formatTime(uncoveredDuration)} non couvert
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setIsAddingSection(true);
              setSelectionRange({ start: currentTime, end: Math.min(currentTime + 15, duration) });
            }}
            className="border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
          >
            <Plus className="w-4 h-4 mr-1" />
            Ajouter section
          </Button>
        </div>
      </div>

      {/* Waveform + Section labels (same container for alignment) */}
      <div className="relative">
        <div
          ref={containerRef}
          className={cn(
            'w-full',
            isLoading && 'animate-pulse'
          )}
        />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          </div>
        )}
      </div>

      {/* Section labels bar */}
      <div className="relative h-8 bg-slate-800/30 border-t border-white/5">
        {sections.map((section) => {
          const left = (section.start_time / duration) * 100;
          const width = ((section.end_time - section.start_time) / duration) * 100;
          const isSelected = section.id === selectedSectionId;

          return (
            <button
              key={section.id}
              onClick={() => onSectionSelect?.(section)}
              className={cn(
                'absolute top-0 bottom-0 flex items-center justify-center text-xs font-medium truncate px-2 transition-all',
                isSelected ? 'ring-2 ring-white ring-inset z-10' : 'hover:brightness-110'
              )}
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: section.color,
              }}
              title={`${section.name} (${formatTime(section.start_time)} - ${formatTime(section.end_time)})`}
            >
              <span className="text-white drop-shadow truncate">{section.name}</span>
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
        {/* Playback controls */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={skipBackward}>
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={togglePlayPause}>
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={skipForward}>
            <SkipForward className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleMute}>
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
        </div>

        {/* Time display */}
        <div className="font-mono text-sm text-slate-300">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>

        {/* Selected section info */}
        {selectedSectionId && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">
              {sections.find((s) => s.id === selectedSectionId)?.name}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
              onClick={() => deleteSection(selectedSectionId)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Add section dialog */}
      {isAddingSection && (
        <div className="px-4 py-4 border-t border-white/10 bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Input
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                placeholder="Nom de la section (ex: Couplet 1)"
                className="bg-white/5 border-white/10"
              />
            </div>
            <Select
              value={newSectionType}
              onValueChange={(v) => setNewSectionType(v as MusicSectionType)}
            >
              <SelectTrigger className="w-40 bg-white/5 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTION_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: type.color }}
                      />
                      {type.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-slate-400">
              {selectionRange && `${formatTime(selectionRange.start)} - ${formatTime(selectionRange.end)}`}
            </span>
            <Button size="sm" onClick={createSection} className="bg-purple-500 hover:bg-purple-600">
              Créer
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setIsAddingSection(false);
                setSelectionRange(null);
              }}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}

      {/* Sections list */}
      {sections.length > 0 && (
        <div className="border-t border-white/10">
          <div className="px-4 py-2 bg-slate-800/30 border-b border-white/5">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Sections ({sections.length})
            </span>
          </div>
          <div className="divide-y divide-white/5">
            {sections
              .sort((a, b) => a.start_time - b.start_time)
              .map((section) => {
                const sectionDuration = section.end_time - section.start_time;
                const isSelected = section.id === selectedSectionId;
                const isExpanded = expandedSections.has(section.id);
                const typeConfig = SECTION_TYPES.find((t) => t.value === section.section_type);
                const shots = sectionShots[section.id] || [];
                const isLoadingShots = loadingShots[section.id];

                return (
                  <div key={section.id}>
                    {/* Section header row */}
                    <div
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 transition-colors cursor-pointer',
                        isSelected ? 'bg-white/5' : 'hover:bg-white/[0.02]'
                      )}
                      onClick={() => onSectionSelect?.(section)}
                    >
                      {/* Expand toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSectionExpand(section.id, section);
                        }}
                        className="text-slate-400 hover:text-white transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>

                      {/* Color indicator */}
                      <div
                        className="w-1 h-10 rounded-full flex-shrink-0"
                        style={{ backgroundColor: section.color }}
                      />

                      {/* Section info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white truncate">
                            {section.name}
                          </span>
                          <span
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: `${section.color}20`,
                              color: section.color,
                            }}
                          >
                            {typeConfig?.label || section.section_type}
                          </span>
                          {shots.length > 0 && (
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <Film className="w-3 h-3" />
                              {shots.length} plan{shots.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTime(section.start_time)} - {formatTime(section.end_time)}
                          </span>
                          <span>({formatTime(sectionDuration)})</span>
                          {section.mood && (
                            <span className="text-slate-500">• {section.mood}</span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            const ws = wavesurferRef.current;
                            if (ws && duration > 0) {
                              ws.play(section.start_time, section.end_time);
                            }
                          }}
                          title="Jouer cette section"
                        >
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSection(section.id);
                          }}
                          title="Supprimer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Expanded content: Filmstrip and shots */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 bg-slate-800/30 border-t border-white/5">
                        {/* Filmstrip timeline */}
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                              Plans ({shots.length})
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                // Find first available gap
                                const sortedShots = [...shots].sort((a, b) => a.relative_start - b.relative_start);

                                // Check gap at start
                                if (sortedShots.length === 0 || sortedShots[0].relative_start >= MIN_SHOT_DURATION) {
                                  createShot(section.id, section, 0);
                                  return;
                                }

                                // Check gaps between shots
                                for (let i = 0; i < sortedShots.length - 1; i++) {
                                  const gapStart = sortedShots[i].relative_start + sortedShots[i].duration;
                                  const gapEnd = sortedShots[i + 1].relative_start;
                                  if (gapEnd - gapStart >= MIN_SHOT_DURATION) {
                                    createShot(section.id, section, gapStart);
                                    return;
                                  }
                                }

                                // Check gap at end
                                const lastShot = sortedShots[sortedShots.length - 1];
                                const lastEnd = lastShot.relative_start + lastShot.duration;
                                if (sectionDuration - lastEnd >= MIN_SHOT_DURATION) {
                                  createShot(section.id, section, lastEnd);
                                  return;
                                }

                                toast.info('Pas d\'espace disponible. Divisez un plan existant (≥6s)');
                              }}
                              className="h-6 text-xs text-purple-300 hover:text-purple-200"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Ajouter plan
                            </Button>
                          </div>

                          {/* Filmstrip visual */}
                          <div
                            data-filmstrip={section.id}
                            className={cn(
                              "relative h-10 bg-slate-800/50 rounded-lg border border-white/10 overflow-hidden",
                              resizingShot ? 'cursor-ew-resize' : 'cursor-pointer'
                            )}
                            onClick={(e) => {
                              if (resizingShot) return;
                              // Calculate click position as relative_start
                              const rect = e.currentTarget.getBoundingClientRect();
                              const relativeX = (e.clientX - rect.left) / rect.width;
                              const relativeStart = relativeX * sectionDuration;
                              // In snapped mode, clicking anywhere creates/splits
                              createShot(section.id, section, relativeStart);
                            }}
                          >

                            {/* Shot blocks */}
                            {shots.map((shot, idx) => {
                              const left = (shot.relative_start / sectionDuration) * 100;
                              const width = (shot.duration / sectionDuration) * 100;
                              const isResizing = resizingShot?.shotId === shot.id;
                              return (
                                <div
                                  key={shot.id}
                                  className={cn(
                                    "absolute inset-y-0 flex items-center justify-center text-xs font-medium transition-colors group/shot",
                                    isResizing
                                      ? 'bg-orange-500/70'
                                      : 'bg-purple-500/60 hover:bg-orange-500/70'
                                  )}
                                  style={{
                                    left: `${left}%`,
                                    width: `${width}%`,
                                    minWidth: '24px',
                                  }}
                                  title={`Plan ${idx + 1}: ${formatTime(shot.relative_start)} (${shot.duration.toFixed(1)}s)`}
                                >
                                  {/* Left resize handle - always visible */}
                                  <div
                                    className={cn(
                                      "absolute left-0 inset-y-0 w-1.5 cursor-ew-resize transition-colors z-10",
                                      isResizing
                                        ? 'bg-orange-300'
                                        : 'bg-purple-300/70 group-hover/shot:bg-orange-300'
                                    )}
                                    onMouseDown={(e) => startResize(e, section.id, shot, 'left', sectionDuration)}
                                    onClick={(e) => e.stopPropagation()}
                                  />

                                  {/* Shot duration */}
                                  <span className="text-white/90 text-[11px] font-medium select-none pointer-events-none">
                                    {shot.duration.toFixed(1)}s
                                  </span>

                                  {/* Right resize handle - always visible */}
                                  <div
                                    className={cn(
                                      "absolute right-0 inset-y-0 w-1.5 cursor-ew-resize transition-colors z-10",
                                      isResizing
                                        ? 'bg-orange-300'
                                        : 'bg-purple-300/70 group-hover/shot:bg-orange-300'
                                    )}
                                    onMouseDown={(e) => startResize(e, section.id, shot, 'right', sectionDuration)}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                              );
                            })}

                            {/* Loading indicator */}
                            {isLoadingShots && (
                              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                                <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                              </div>
                            )}

                            {/* Empty state */}
                            {!isLoadingShots && shots.length === 0 && (
                              <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs">
                                Cliquez pour créer le premier plan
                              </div>
                            )}
                          </div>

                          {/* Time markers */}
                          <div className="flex justify-between mt-1 text-[10px] text-slate-500">
                            <span>0:00</span>
                            <span>{formatTime(sectionDuration / 2)}</span>
                            <span>{formatTime(sectionDuration)}</span>
                          </div>
                        </div>

                        {/* Shot cards */}
                        {shots.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                            {shots.map((shot, idx) => (
                              <div
                                key={shot.id}
                                className="group relative bg-slate-800 rounded-lg border border-white/10 overflow-hidden hover:border-purple-500/30 transition-colors"
                              >
                                {/* Shot thumbnail or placeholder */}
                                <div className="aspect-video bg-slate-700 flex items-center justify-center">
                                  {shot.storyboard_image_url || shot.first_frame_url ? (
                                    <img
                                      src={shot.storyboard_image_url || shot.first_frame_url}
                                      alt={`Plan ${idx + 1}`}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <Film className="w-6 h-6 text-slate-500" />
                                  )}
                                </div>

                                {/* Shot info */}
                                <div className="p-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-white">
                                      Plan {idx + 1}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                      {shot.duration.toFixed(1)}s
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-500 truncate mt-0.5">
                                    {shot.description || 'Sans description'}
                                  </p>
                                </div>

                                {/* Delete button */}
                                <button
                                  onClick={() => deleteShotFromSection(section.id, shot.id, section)}
                                  className="absolute top-1 right-1 p-1 bg-red-500/80 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                                  title="Supprimer"
                                >
                                  <Trash2 className="w-3 h-3 text-white" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

export default ClipTimeline;
