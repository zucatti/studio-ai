'use client';

import React, { useMemo, useState } from 'react';
import { Timeline } from '@xzdarcy/react-timeline-editor';
import type { TimelineRow, TimelineAction, TimelineEffect } from '@xzdarcy/timeline-engine';
import { cn } from '@/lib/utils';
import { Film, Music, Sparkles, Volume2 } from 'lucide-react';
import type { Plan } from '@/store/shorts-store';
import type { Sequence, TransitionType } from '@/types/cinematic';

// Custom effects for different track types
const effects: Record<string, TimelineEffect> = {
  video: {
    id: 'video',
    name: 'Video Clip',
  },
  transition: {
    id: 'transition',
    name: 'Transition',
  },
  music: {
    id: 'music',
    name: 'Music',
  },
};

interface MontageTimelineProps {
  plans: Plan[];
  sequences: Sequence[];
  musicAssetId?: string | null;
  musicVolume?: number;
  totalDuration: number;
  aspectRatio: string;
  onSelectPlan?: (planId: string) => void;
  selectedPlanId?: string | null;
}

// Transition labels
const transitionLabels: Partial<Record<TransitionType, string>> = {
  dissolve: 'Fondu',
  fade: 'Fade',
  fadeblack: 'Noir',
  fadewhite: 'Blanc',
  crosszoom: 'Zoom X',
  zoomin: 'Zoom +',
  zoomout: 'Zoom -',
  slideleft: '← Gliss',
  slideright: 'Gliss →',
  slideup: '↑ Gliss',
  slidedown: 'Gliss ↓',
  directionalwipe: 'Wipe',
  circleopen: '◯ Ouv',
  circleclose: '◯ Ferm',
  radial: 'Radial',
  cube: 'Cube 3D',
};

export function MontageTimeline({
  plans,
  sequences,
  musicAssetId,
  musicVolume = 0.3,
  totalDuration,
  onSelectPlan,
  selectedPlanId,
}: MontageTimelineProps) {
  const [scale, setScale] = useState(100); // pixels per second

  // Build timeline data from plans and sequences
  const timelineData = useMemo(() => {
    const rows: TimelineRow[] = [];
    const transitionActions: TimelineAction[] = [];
    const videoActions: TimelineAction[] = [];
    const musicActions: TimelineAction[] = [];

    let currentTime = 0;

    // Process sequences in order
    for (const sequence of sequences) {
      const sequencePlans = plans
        .filter(p => p.sequence_id === sequence.id)
        .sort((a, b) => a.sort_order - b.sort_order);

      // Add transition_in at start of sequence
      if (sequence.transition_in && currentTime > 0) {
        const duration = sequence.transition_duration || 0.5;
        transitionActions.push({
          id: `trans-in-${sequence.id}`,
          start: currentTime - duration / 2,
          end: currentTime + duration / 2,
          effectId: 'transition',
          data: {
            type: sequence.transition_in,
            label: transitionLabels[sequence.transition_in] || sequence.transition_in,
          },
        } as TimelineAction);
      }

      // Add plans as video actions
      for (const plan of sequencePlans) {
        videoActions.push({
          id: plan.id,
          start: currentTime,
          end: currentTime + plan.duration,
          effectId: 'video',
          data: {
            planNumber: plan.shot_number,
            hasVideo: !!plan.generated_video_url,
            sequenceId: sequence.id,
            sequenceTitle: sequence.title,
          },
        } as TimelineAction);
        currentTime += plan.duration;
      }

      // Add transition_out at end of sequence
      if (sequence.transition_out) {
        const duration = sequence.transition_duration || 0.5;
        transitionActions.push({
          id: `trans-out-${sequence.id}`,
          start: currentTime - duration / 2,
          end: currentTime + duration / 2,
          effectId: 'transition',
          data: {
            type: sequence.transition_out,
            label: transitionLabels[sequence.transition_out] || sequence.transition_out,
          },
        } as TimelineAction);
      }
    }

    // Add unassigned (rush) plans at the end
    const rushPlans = plans
      .filter(p => !p.sequence_id)
      .sort((a, b) => a.sort_order - b.sort_order);

    for (const plan of rushPlans) {
      videoActions.push({
        id: plan.id,
        start: currentTime,
        end: currentTime + plan.duration,
        effectId: 'video',
        data: {
          planNumber: plan.shot_number,
          hasVideo: !!plan.generated_video_url,
          isRush: true,
        },
      } as TimelineAction);
      currentTime += plan.duration;
    }

    // Add music track if present
    if (musicAssetId) {
      musicActions.push({
        id: 'music-main',
        start: 0,
        end: currentTime,
        effectId: 'music',
        data: {
          volume: musicVolume,
        },
      } as TimelineAction);
    }

    // Build rows
    rows.push({
      id: 'transitions',
      actions: transitionActions,
    });

    rows.push({
      id: 'video',
      actions: videoActions,
    });

    rows.push({
      id: 'music',
      actions: musicActions,
    });

    return rows;
  }, [plans, sequences, musicAssetId, musicVolume]);

  // Custom action renderer
  const getActionRender = (action: TimelineAction, _row: TimelineRow): React.ReactNode => {
    const actionData = action as TimelineAction & { data?: Record<string, unknown> };

    if (action.effectId === 'transition') {
      return (
        <div
          className={cn(
            "h-full flex items-center justify-center rounded text-[10px] font-medium",
            "bg-gradient-to-r from-blue-500/40 via-blue-500/60 to-blue-500/40",
            "border border-blue-400/50 text-blue-200"
          )}
        >
          <Sparkles className="w-3 h-3 mr-1" />
          {(actionData.data?.label as string) || 'Trans'}
        </div>
      );
    }

    if (action.effectId === 'video') {
      const isSelected = action.id === selectedPlanId;
      const hasVideo = actionData.data?.hasVideo;
      const isRush = actionData.data?.isRush;

      return (
        <div
          className={cn(
            "h-full flex items-center px-2 rounded text-xs font-medium cursor-pointer transition-all",
            isRush
              ? "bg-slate-700/60 border border-dashed border-slate-500/50 text-slate-300"
              : hasVideo
                ? "bg-purple-600/60 border border-purple-400/50 text-purple-100"
                : "bg-slate-600/60 border border-slate-500/50 text-slate-300",
            isSelected && "ring-2 ring-white/50"
          )}
          onClick={() => onSelectPlan?.(action.id)}
        >
          <Film className="w-3 h-3 mr-1.5 flex-shrink-0" />
          <span className="truncate">
            P{String(actionData.data?.planNumber || '')}
            {actionData.data?.sequenceTitle ? (
              <span className="ml-1 opacity-60 text-[10px]">
                ({String(actionData.data.sequenceTitle)})
              </span>
            ) : null}
          </span>
        </div>
      );
    }

    if (action.effectId === 'music') {
      return (
        <div
          className={cn(
            "h-full flex items-center px-2 rounded text-xs font-medium",
            "bg-green-600/40 border border-green-400/50 text-green-200"
          )}
        >
          <Music className="w-3 h-3 mr-1.5 flex-shrink-0" />
          <span>Musique</span>
          <span className="ml-2 text-[10px] opacity-70">
            {Math.round(((actionData.data?.volume as number) || 0.3) * 100)}%
          </span>
        </div>
      );
    }

    return null;
  };

  // Custom row labels
  const rowLabels = [
    { icon: Sparkles, label: 'Transitions', color: 'text-blue-400' },
    { icon: Film, label: 'Vidéo', color: 'text-purple-400' },
    { icon: Volume2, label: 'Audio', color: 'text-green-400' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Timeline header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-400">
            Durée totale: {totalDuration.toFixed(1)}s
          </span>
          <span className="text-xs text-slate-500">|</span>
          <span className="text-xs text-slate-400">
            {plans.length} plans
          </span>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale(Math.max(20, scale - 20))}
            className="px-2 py-0.5 text-xs bg-white/5 hover:bg-white/10 rounded"
          >
            -
          </button>
          <span className="text-xs text-slate-400 w-16 text-center">
            {Math.round(scale)}px/s
          </span>
          <button
            onClick={() => setScale(Math.min(200, scale + 20))}
            className="px-2 py-0.5 text-xs bg-white/5 hover:bg-white/10 rounded"
          >
            +
          </button>
        </div>
      </div>

      {/* Timeline with row labels */}
      <div className="flex flex-1 min-h-0">
        {/* Row labels */}
        <div className="w-24 flex-shrink-0 border-r border-white/10 bg-[#0a0f14]">
          <div className="h-[30px]" /> {/* Spacer for timeline ruler */}
          {rowLabels.map((row, i) => (
            <div
              key={i}
              className="h-10 flex items-center gap-2 px-2 border-b border-white/5"
            >
              <row.icon className={cn("w-3 h-3", row.color)} />
              <span className="text-[10px] text-slate-400 truncate">{row.label}</span>
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-x-auto bg-[#0d1218]">
          <Timeline
            editorData={timelineData}
            effects={effects}
            scale={scale}
            scaleWidth={50}
            startLeft={10}
            autoScroll={true}
            dragLine={false}
            disableDrag={true}
            hideCursor={true}
            getActionRender={getActionRender}
            rowHeight={40}
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: 'transparent',
            }}
          />
        </div>
      </div>
    </div>
  );
}
