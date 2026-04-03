'use client';

import { useState, useMemo } from 'react';
import {
  Film,
  Layers,
  Play,
  Loader2,
  Sparkles,
  Volume2,
  Music,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { SequenceClip } from './SequenceClip';
import { VideoCard } from './VideoCard';
import type { Sequence, TransitionType } from '@/types/cinematic';
import { TRANSITION_TYPE_OPTIONS } from '@/types/cinematic';
import type { Plan, Short } from '@/store/shorts-store';

interface SequenceAssemblyState {
  sequenceId: string;
  status: 'idle' | 'checking' | 'queued' | 'assembling' | 'completed' | 'error';
  progress: number;
  jobId?: string;
  error?: string;
  assembledVideoUrl?: string | null;
}

interface MontageEditorProps {
  short: Short;
  sequences: Sequence[];
  aspectRatio: string;
  assembledVideoUrl: string | null;
  isAssembling: boolean;
  assemblyProgress: number;
  onAssemble: () => void;
  onDownload: () => void;
  // Per-sequence assembly states
  sequenceAssemblyStates?: Map<string, SequenceAssemblyState>;
  isSequenceAssembling?: boolean;
  sequenceOverallProgress?: number;
}

// Timeline track item
interface TimelineItem {
  id: string;
  type: 'sequence' | 'transition';
  start: number; // seconds
  duration: number;
  data: {
    sequenceId?: string;
    sequenceTitle?: string;
    transitionType?: TransitionType;
  };
}

export function MontageEditor({
  short,
  sequences,
  aspectRatio,
  assembledVideoUrl,
  isAssembling,
  assemblyProgress,
  onAssemble,
  onDownload,
  sequenceAssemblyStates,
  isSequenceAssembling,
  sequenceOverallProgress,
}: MontageEditorProps) {
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [selectedTransition, setSelectedTransition] = useState<TransitionType | null>(null);
  const [scale, setScale] = useState(50); // pixels per second

  // Get plans for each sequence
  const getPlansForSequence = (sequenceId: string) => {
    return short.plans
      .filter((p) => p.sequence_id === sequenceId)
      .sort((a, b) => a.sort_order - b.sort_order);
  };

  // Calculate total timeline duration
  const totalDuration = useMemo(() => {
    return timelineItems.reduce((max, item) => {
      return Math.max(max, item.start + item.duration);
    }, 0);
  }, [timelineItems]);

  // Sequence items on timeline
  const sequenceItems = timelineItems.filter((i) => i.type === 'sequence');
  const transitionItems = timelineItems.filter((i) => i.type === 'transition');

  // Handle drag start from storyboard
  const handleDragStart = (e: React.DragEvent, sequence: Sequence) => {
    const plans = getPlansForSequence(sequence.id);
    const duration = plans.reduce((sum, p) => sum + p.duration, 0);
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        type: 'sequence',
        sequenceId: sequence.id,
        sequenceTitle: sequence.title || `Séquence ${sequence.sort_order + 1}`,
        duration,
      })
    );
    e.dataTransfer.effectAllowed = 'copy';
  };

  // Handle drop on timeline
  const handleTimelineDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('application/json');
    if (!data) return;

    const parsed = JSON.parse(data);

    if (parsed.type === 'sequence') {
      // Calculate drop position
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left - 96; // 96px = row labels width
      const startTime = Math.max(0, x / scale);

      // Snap to end of last sequence
      const lastSequence = sequenceItems.sort((a, b) => b.start - a.start)[0];
      const snapTime = lastSequence ? lastSequence.start + lastSequence.duration : 0;
      const finalStart = Math.abs(startTime - snapTime) < 0.5 ? snapTime : startTime;

      // Check if already on timeline
      if (sequenceItems.some((i) => i.data.sequenceId === parsed.sequenceId)) {
        return; // Already exists
      }

      setTimelineItems((prev) => [
        ...prev,
        {
          id: `seq-${parsed.sequenceId}`,
          type: 'sequence',
          start: finalStart,
          duration: parsed.duration,
          data: {
            sequenceId: parsed.sequenceId,
            sequenceTitle: parsed.sequenceTitle,
          },
        },
      ]);
    } else if (parsed.type === 'transition') {
      // Find nearest sequence edge to snap to
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left - 96;
      const dropTime = x / scale;

      // Find closest gap between sequences
      const sortedSeqs = sequenceItems.sort((a, b) => a.start - b.start);
      let snapPoint = dropTime;

      for (let i = 0; i < sortedSeqs.length - 1; i++) {
        const gapStart = sortedSeqs[i].start + sortedSeqs[i].duration;
        const gapEnd = sortedSeqs[i + 1].start;
        const gapCenter = (gapStart + gapEnd) / 2;

        if (Math.abs(dropTime - gapCenter) < 1) {
          snapPoint = gapCenter - 0.25; // Center the 0.5s transition
          break;
        }
      }

      setTimelineItems((prev) => [
        ...prev,
        {
          id: `trans-${Date.now()}`,
          type: 'transition',
          start: snapPoint,
          duration: 0.5,
          data: {
            transitionType: parsed.transitionType,
          },
        },
      ]);
    }
  };

  // Handle transition drag start
  const handleTransitionDragStart = (e: React.DragEvent, type: TransitionType) => {
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        type: 'transition',
        transitionType: type,
      })
    );
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-4">
      {/* TOP: Storyboard + Preview + Transition picker */}
      <div className="flex-shrink-0 rounded-xl bg-[#151d28] border border-white/5 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Séquences
            {isSequenceAssembling && (
              <span className="ml-2 text-xs text-blue-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Colorimétrie {Math.round(sequenceOverallProgress || 0)}%
              </span>
            )}
          </h3>

          <div className="flex items-center gap-2">
            {/* Assemble button */}
            <Button
              size="sm"
              disabled={sequenceItems.length === 0 || isAssembling || isSequenceAssembling}
              onClick={onAssemble}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isAssembling ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  {Math.round(assemblyProgress)}%
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 mr-1.5" />
                  Assembler
                </>
              )}
            </Button>

            {/* Transition picker */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10 text-slate-300 hover:bg-white/5"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  Transition
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-64 p-2 bg-[#1a2433] border-white/10"
              >
                <p className="text-xs text-slate-400 mb-2 px-1">
                  Glissez une transition sur la timeline
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {TRANSITION_TYPE_OPTIONS.map((opt) => (
                    <div
                      key={opt.value}
                      draggable
                      onDragStart={(e) => handleTransitionDragStart(e, opt.value)}
                      className={cn(
                        "px-2 py-1.5 rounded text-xs cursor-grab active:cursor-grabbing",
                        "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors"
                      )}
                    >
                      {opt.label}
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Sequences grid + Preview */}
        <div className="flex gap-4" style={{ height: aspectRatio === '9:16' ? '300px' : aspectRatio === '1:1' ? '236px' : '196px' }}>
          {/* Sequences - scrollable grid */}
          <div className="flex-1 overflow-y-auto pr-2">
            {sequences.length === 0 ? (
              <div className="text-sm text-slate-500 py-8 text-center w-full">
                Créez des séquences dans l'onglet Édition
              </div>
            ) : (
              <div className="flex flex-wrap gap-3 content-start">
                {sequences.map((sequence) => {
                  const plans = getPlansForSequence(sequence.id);
                  const assemblyState = sequenceAssemblyStates?.get(sequence.id);
                  const seqAssembledUrl = assemblyState?.status === 'completed'
                    ? assemblyState.assembledVideoUrl
                    : sequence.assembled_video_url;
                  const seqProgress = assemblyState?.status === 'assembling' || assemblyState?.status === 'queued' || assemblyState?.status === 'checking'
                    ? assemblyState.progress
                    : undefined;
                  return (
                    <div
                      key={sequence.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, sequence)}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <SequenceClip
                        sequence={sequence}
                        plans={plans}
                        aspectRatio={aspectRatio}
                        assembledVideoUrl={seqAssembledUrl}
                        assemblyProgress={seqProgress}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Preview - fixed */}
          <div
            className={cn(
              "flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all",
              isAssembling
                ? "border-blue-500/50"
                : assembledVideoUrl
                  ? "border-purple-500/50"
                  : "border-dashed border-white/10"
            )}
            style={{
              width: aspectRatio === '9:16' ? '160px' : aspectRatio === '1:1' ? '220px' : '320px',
              height: aspectRatio === '9:16' ? '284px' : aspectRatio === '1:1' ? '220px' : '180px',
            }}
          >
            {assembledVideoUrl && !isAssembling ? (
              <VideoCard
                videoUrl={assembledVideoUrl}
                aspectRatio={aspectRatio}
                autoPlay={false}
                onDownload={onDownload}
                className="w-full h-full"
              />
            ) : (
              <div className="w-full h-full bg-[#0a0f14] flex items-center justify-center">
                {isAssembling ? (
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                ) : (
                  <Film className="w-5 h-5 text-white/10" />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM: Timeline */}
      <div className="flex-1 rounded-xl bg-[#151d28] border border-white/5 overflow-hidden flex flex-col">
          {/* Timeline header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
            <span className="text-xs text-slate-400">
              Durée: {totalDuration.toFixed(1)}s
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setScale(Math.max(20, scale - 10))}
                className="px-2 py-0.5 text-xs bg-white/5 hover:bg-white/10 rounded"
              >
                -
              </button>
              <span className="text-xs text-slate-400 w-12 text-center">
                {scale}px/s
              </span>
              <button
                onClick={() => setScale(Math.min(100, scale + 10))}
                className="px-2 py-0.5 text-xs bg-white/5 hover:bg-white/10 rounded"
              >
                +
              </button>
            </div>
          </div>

          {/* Timeline tracks */}
          <div
            className="flex-1 overflow-auto"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleTimelineDrop}
          >
            <div className="flex min-w-full">
              {/* Row labels */}
              <div className="w-28 flex-shrink-0 border-r border-white/10 bg-[#0a0f14]">
                <div className="h-10 border-b border-white/5" /> {/* Ruler space */}
                <div className="h-16 flex items-center gap-2 px-3 border-b border-white/5">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  <span className="text-xs text-slate-400">Transitions</span>
                </div>
                <div className="h-20 flex items-center gap-2 px-3 border-b border-white/5">
                  <Film className="w-4 h-4 text-purple-400" />
                  <span className="text-xs text-slate-400">Séquences</span>
                </div>
                <div className="h-16 flex items-center gap-2 px-3 border-b border-white/5">
                  <Volume2 className="w-4 h-4 text-green-400" />
                  <span className="text-xs text-slate-400">Audio</span>
                </div>
              </div>

              {/* Timeline content */}
              <div
                className="flex-1 bg-[#0d1218] relative"
                style={{ minWidth: `${Math.max(totalDuration * scale + 200, 400)}px` }}
              >
                {/* Ruler */}
                <div className="h-10 border-b border-white/5 flex items-end">
                  {Array.from({ length: Math.ceil(totalDuration) + 10 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-shrink-0 border-l border-white/10 h-3"
                      style={{ width: `${scale}px` }}
                    >
                      <span className="text-[9px] text-slate-600 ml-1">{i}s</span>
                    </div>
                  ))}
                </div>

                {/* Transitions track */}
                <div className="h-16 border-b border-white/5 relative">
                  {transitionItems.map((item) => (
                    <div
                      key={item.id}
                      className="absolute top-2 bottom-2 rounded bg-gradient-to-r from-blue-500/40 via-blue-500/60 to-blue-500/40 border border-blue-400/50 flex items-center justify-center"
                      style={{
                        left: `${item.start * scale}px`,
                        width: `${item.duration * scale}px`,
                      }}
                    >
                      <span className="text-xs text-blue-200 truncate px-2">
                        {item.data.transitionType}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Sequences track */}
                <div className="h-20 border-b border-white/5 relative">
                  {sequenceItems.map((item) => (
                    <div
                      key={item.id}
                      className="absolute top-2 bottom-2 rounded bg-purple-600/60 border border-purple-400/50 flex items-center px-3"
                      style={{
                        left: `${item.start * scale}px`,
                        width: `${item.duration * scale}px`,
                      }}
                    >
                      <Layers className="w-4 h-4 text-purple-200 mr-2 flex-shrink-0" />
                      <span className="text-sm text-purple-100 truncate">
                        {item.data.sequenceTitle}
                      </span>
                      <span className="text-xs text-purple-300 ml-auto pl-2">
                        {item.duration.toFixed(1)}s
                      </span>
                    </div>
                  ))}
                  {sequenceItems.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-600">
                      Glissez des séquences ici
                    </div>
                  )}
                </div>

                {/* Audio track */}
                <div className="h-16 border-b border-white/5 relative">
                  {short.music_asset_id && (
                    <div
                      className="absolute top-2 bottom-2 left-0 rounded bg-green-600/40 border border-green-400/50 flex items-center px-3"
                      style={{ width: `${totalDuration * scale}px`, minWidth: '100px' }}
                    >
                      <Music className="w-4 h-4 text-green-200 mr-2" />
                      <span className="text-sm text-green-100">Musique</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
    </div>
  );
}
