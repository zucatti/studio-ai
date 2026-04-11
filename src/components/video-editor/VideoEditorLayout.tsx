'use client';

import { useMemo, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { PlanCard } from '@/components/shorts/PlanCard';
import { SequenceCard } from '@/components/shorts/SequenceCard';
import { SequenceClip } from '@/components/shorts/SequenceClip';
import { SequenceGalleryViewer } from '@/components/shorts/SequenceGalleryViewer';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Plan } from '@/store/shorts-store';
import type { AspectRatio } from '@/types/database';
import type { CinematicHeaderConfig, Sequence, TransitionType } from '@/types/cinematic';
import {
  Plus,
  Layers,
  Film,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// === SORTABLE PLAN ITEM ===
const SortablePlanItem = ({
  plan,
  selectedPlanId,
  onSelect,
  onDelete,
}: {
  plan: Plan;
  selectedPlanId: string | null;
  onSelect: (planId: string) => void;
  onDelete: (planId: string) => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: plan.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <PlanCard
        plan={plan}
        isSelected={selectedPlanId === plan.id}
        onSelect={() => onSelect(plan.id)}
        onEdit={() => onSelect(plan.id)}
        onDelete={() => onDelete(plan.id)}
        dragHandleProps={listeners}
        compact
      />
    </div>
  );
};

// === DROPPABLE SEQUENCE ===
const DroppableSequence = ({
  sequence,
  children,
}: {
  sequence: Sequence;
  children: React.ReactNode;
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `sequence-${sequence.id}`,
    data: { type: 'sequence', sequenceId: sequence.id },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(isOver && 'ring-2 ring-blue-500/50 rounded-lg')}
    >
      {children}
    </div>
  );
};

// === DROPPABLE RUSH ===
const DroppableRush = ({ children }: { children: React.ReactNode }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: 'rush',
    data: { type: 'rush' },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(isOver && 'ring-2 ring-amber-500/50 rounded-lg')}
    >
      {children}
    </div>
  );
};

// === STORYBOARD PLAN CARD ===
const StoryboardPlanCard = ({
  plan,
  aspectRatio,
  isSelected,
  isGenerating,
  isRush,
  onSelect,
  onExpand,
}: {
  plan: Plan;
  aspectRatio: AspectRatio;
  isSelected: boolean;
  isGenerating: boolean;
  isRush?: boolean;
  onSelect: () => void;
  onExpand: () => void;
}) => {
  const hasVideo = !!plan.generated_video_url;
  const hasImage = !!plan.storyboard_image_url || !!plan.first_frame_url;

  // Calculate dimensions based on aspect ratio
  const getRatioDimensions = () => {
    switch (aspectRatio) {
      case '9:16': return { width: 90, height: 160 };
      case '4:5': return { width: 100, height: 125 };
      case '2:3': return { width: 100, height: 150 };
      case '1:1': return { width: 120, height: 120 };
      case '16:9':
      default: return { width: 160, height: 90 };
    }
  };

  const { width, height } = getRatioDimensions();

  return (
    <div
      className={cn(
        'relative rounded-lg overflow-hidden cursor-pointer transition-all flex-shrink-0',
        'border border-white/10 hover:border-white/30',
        isSelected && 'ring-2 ring-blue-500',
        isGenerating && 'animate-pulse',
        isRush && 'opacity-60'
      )}
      style={{ width, height }}
      onClick={onSelect}
    >
      {/* Thumbnail */}
      {hasVideo || hasImage ? (
        <img
          src={plan.generated_video_url || plan.storyboard_image_url || plan.first_frame_url || ''}
          alt={`Plan ${plan.shot_number}`}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-slate-800 flex items-center justify-center">
          <Film className="w-6 h-6 text-slate-600" />
        </div>
      )}

      {/* Overlay with plan number */}
      <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1 rounded">
        {plan.shot_number}
      </div>

      {/* Video badge */}
      {hasVideo && (
        <div className="absolute top-1 right-1 bg-green-500/80 text-white text-[8px] px-1 rounded">
          ▶
        </div>
      )}
    </div>
  );
};

// === MAIN LAYOUT PROPS ===
export interface VideoEditorLayoutProps {
  // Data
  sequences: Sequence[];
  plans: Plan[];
  aspectRatio: AspectRatio;
  projectId: string;
  entityId: string; // shortId or projectId for clips
  entityType?: 'short' | 'clip'; // Determines API routes to use

  // State
  selectedPlanId: string | null;
  collapsedSequences: Set<string>;
  generationProgress: Map<string, { status: string }>;

  // Assembly states (optional, for sequence assembly)
  sequenceAssemblyStates?: Map<string, {
    status: string;
    assembledVideoUrl?: string;
    progress?: number;
  }>;

  // Header slot
  headerContent: React.ReactNode;

  // Callbacks
  onCreateSequence: () => void;
  onAddPlan: (sequenceId?: string | null) => void;
  onSelectPlan: (planId: string) => void;
  onDeletePlan: (planId: string) => void;
  onUpdateSequence: (sequenceId: string, updates: Partial<Sequence>) => void;
  onDeleteSequence: (sequenceId: string) => void;
  onToggleSequenceCollapse: (sequenceId: string) => void;
  onOpenCinematicWizard: (sequenceId: string) => void;
  onReorderPlans: (sequenceId: string | null, orderedIds: string[]) => void;
  onMovePlanToSequence: (planId: string, targetSequenceId: string | null) => void;
  onAssembleSequence?: (sequenceId: string) => void;
}

export function VideoEditorLayout({
  sequences,
  plans,
  aspectRatio,
  projectId,
  entityId,
  entityType = 'short',
  selectedPlanId,
  collapsedSequences,
  generationProgress,
  sequenceAssemblyStates = new Map(),
  headerContent,
  onCreateSequence,
  onAddPlan,
  onSelectPlan,
  onDeletePlan,
  onUpdateSequence,
  onDeleteSequence,
  onToggleSequenceCollapse,
  onOpenCinematicWizard,
  onReorderPlans,
  onMovePlanToSequence,
  onAssembleSequence,
}: VideoEditorLayoutProps) {
  // DnD state
  const [activeDragPlan, setActiveDragPlan] = useState<Plan | null>(null);

  // Gallery viewer state
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // Get plans for a sequence
  const getPlansForSequence = useCallback((sequenceId: string) => {
    return plans
      .filter((p) => p.sequence_id === sequenceId)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [plans]);

  // Unassigned plans (rush)
  const unassignedPlans = useMemo(() => {
    return plans
      .filter((p) => !p.sequence_id)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [plans]);

  // Sequences with plans for gallery viewer
  const sequencesForGallery = useMemo(() => {
    return sequences.map((sequence) => {
      const sequencePlans = plans
        .filter((p) => p.sequence_id === sequence.id)
        .sort((a, b) => a.sort_order - b.sort_order);
      const assemblyState = sequenceAssemblyStates.get(sequence.id);
      const assembledUrl = assemblyState?.status === 'completed'
        ? assemblyState.assembledVideoUrl || null
        : sequence.assembled_video_url || null;
      return {
        sequence,
        plans: sequencePlans,
        assembledVideoUrl: assembledUrl,
      };
    }).filter(s => s.plans.length > 0); // Only sequences with plans
  }, [sequences, plans, sequenceAssemblyStates]);

  // Open gallery at a specific sequence
  const handleOpenGallery = useCallback((sequenceId: string) => {
    const index = sequencesForGallery.findIndex(s => s.sequence.id === sequenceId);
    if (index >= 0) {
      setGalleryInitialIndex(index);
      setGalleryOpen(true);
    }
  }, [sequencesForGallery]);

  // DnD handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const planId = event.active.id as string;
    const plan = plans.find((p) => p.id === planId);
    if (plan) {
      setActiveDragPlan(plan);
    }
  }, [plans]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragPlan(null);
    const { active, over } = event;

    if (!over) return;

    const planId = active.id as string;
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;

    const overData = over.data.current as { type: string; sequenceId?: string } | undefined;

    // Dropping on a sequence
    if (overData?.type === 'sequence' && overData.sequenceId) {
      const targetSequenceId = overData.sequenceId;
      if (plan.sequence_id !== targetSequenceId) {
        onMovePlanToSequence(planId, targetSequenceId);
      }
      return;
    }

    // Dropping on rush
    if (overData?.type === 'rush') {
      if (plan.sequence_id) {
        onMovePlanToSequence(planId, null);
      }
      return;
    }

    // Reordering within same container
    if (active.id !== over.id) {
      const sourceSequenceId = plan.sequence_id;
      const sourcePlans = sourceSequenceId
        ? getPlansForSequence(sourceSequenceId)
        : unassignedPlans;

      const oldIndex = sourcePlans.findIndex((p) => p.id === active.id);
      const newIndex = sourcePlans.findIndex((p) => p.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(sourcePlans, oldIndex, newIndex);
        onReorderPlans(sourceSequenceId || null, reordered.map((p) => p.id));
      }
    }
  }, [plans, getPlansForSequence, unassignedPlans, onMovePlanToSequence, onReorderPlans]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header slot */}
      {headerContent}

      {/* Main content - Two columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 flex flex-col gap-4 min-h-0 p-4">
          <div className="flex-1 flex gap-4 min-h-0">

            {/* LEFT: Sequences + Plans */}
            <div className="w-[340px] flex-shrink-0 rounded-xl bg-[#151d28] border border-white/5 p-4 flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  Plans
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onCreateSequence}
                  className="h-7 gap-1 text-xs bg-[#0d1218] border-white/10 hover:bg-[#1a2433] text-slate-300"
                >
                  <Plus className="w-3 h-3" />
                  Séq
                </Button>
              </div>

              {/* Scrollable list */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-3">
                {/* Sequences */}
                {sequences.map((sequence) => {
                  const sequencePlans = getPlansForSequence(sequence.id);
                  const isExpanded = !collapsedSequences.has(sequence.id);
                  return (
                    <DroppableSequence key={sequence.id} sequence={sequence}>
                      <SequenceCard
                        sequence={sequence}
                        plans={sequencePlans}
                        isExpanded={isExpanded}
                        onToggleExpand={() => onToggleSequenceCollapse(sequence.id)}
                        onUpdateSequence={(updates) => onUpdateSequence(sequence.id, updates)}
                        onDeleteSequence={() => onDeleteSequence(sequence.id)}
                        onSelectPlan={onSelectPlan}
                        onEditPlan={onSelectPlan}
                        onDeletePlan={onDeletePlan}
                        onAddPlan={() => onAddPlan(sequence.id)}
                        onOpenCinematicWizard={() => onOpenCinematicWizard(sequence.id)}
                        selectedPlanId={selectedPlanId || undefined}
                        projectId={projectId}
                        shortId={entityId}
                        entityType={entityType}
                      />
                    </DroppableSequence>
                  );
                })}

                {/* Rush - unassigned plans */}
                <DroppableRush>
                  <div className="rounded-lg border border-dashed border-white/10 overflow-hidden">
                    <div className="flex items-center gap-2 px-2 py-1.5 bg-[#0a0f14]/50">
                      <Film className="w-3 h-3 text-slate-500" />
                      <span className="text-xs font-medium text-slate-400">Rush</span>
                      <span className="text-[10px] text-slate-600">
                        ({unassignedPlans.length})
                      </span>
                    </div>
                    <div className="p-1.5 space-y-1">
                      <SortableContext items={unassignedPlans.map(p => p.id)} strategy={verticalListSortingStrategy}>
                        {unassignedPlans.length === 0 ? (
                          <div className="text-center py-3 text-[10px] text-slate-600">
                            Glissez des plans ici ou créez-en un
                          </div>
                        ) : (
                          unassignedPlans.map((plan) => (
                            <SortablePlanItem
                              key={plan.id}
                              plan={plan}
                              selectedPlanId={selectedPlanId}
                              onSelect={onSelectPlan}
                              onDelete={onDeletePlan}
                            />
                          ))
                        )}
                      </SortableContext>
                      {/* Add Plan to Rush button */}
                      <button
                        onClick={() => onAddPlan(null)}
                        className="w-full py-1.5 rounded border border-dashed border-white/10 hover:border-blue-500/50 hover:bg-blue-500/5 text-slate-500 hover:text-blue-400 text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Plan
                      </button>
                    </div>
                  </div>
                </DroppableRush>
              </div>
            </div>

            {/* RIGHT: Storyboard */}
            <div className="flex-1 rounded-xl bg-[#151d28] border border-white/5 p-4 flex flex-col overflow-hidden">
              <h2 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider flex items-center gap-2">
                <Film className="w-4 h-4" />
                Storyboard
              </h2>

              <div className="flex-1 overflow-x-auto overflow-y-hidden">
                <div className="flex gap-6 h-full items-start pb-4">
                  {/* Sequences */}
                  {sequences.map((sequence) => {
                    const sequencePlans = getPlansForSequence(sequence.id);
                    if (sequencePlans.length === 0) return null;

                    const assemblyState = sequenceAssemblyStates.get(sequence.id);
                    const isCompiling = assemblyState?.status === 'checking' ||
                                       assemblyState?.status === 'queued' ||
                                       assemblyState?.status === 'assembling';
                    const assembledUrl = assemblyState?.status === 'completed'
                      ? assemblyState.assembledVideoUrl
                      : sequence.assembled_video_url;

                    return (
                      <SequenceClip
                        key={sequence.id}
                        sequence={sequence}
                        plans={sequencePlans}
                        aspectRatio={aspectRatio}
                        assembledVideoUrl={assembledUrl || null}
                        assemblyProgress={isCompiling ? (assemblyState?.progress || 0) : undefined}
                        onOpenGallery={() => handleOpenGallery(sequence.id)}
                      />
                    );
                  })}

                  {/* Rush plans */}
                  {unassignedPlans.length > 0 && (
                    <div className="flex-shrink-0 flex flex-col gap-2 opacity-70">
                      <div className="flex items-center gap-2 px-1">
                        <Film className="w-3 h-3 text-slate-500" />
                        <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                          Rush ({unassignedPlans.length})
                        </span>
                      </div>
                      <div className="flex gap-3">
                        {unassignedPlans.map((plan) => (
                          <StoryboardPlanCard
                            key={plan.id}
                            plan={plan}
                            aspectRatio={aspectRatio}
                            isSelected={selectedPlanId === plan.id}
                            isGenerating={generationProgress.has(plan.id)}
                            isRush
                            onSelect={() => onSelectPlan(plan.id)}
                            onExpand={() => onSelectPlan(plan.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Empty state */}
                  {plans.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-600 py-12 min-w-[300px]">
                      <Film className="w-12 h-12 opacity-20 mb-3" />
                      <p className="text-sm">Aucun plan</p>
                      <p className="text-xs mt-1">Ajoutez des plans pour créer votre storyboard</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {activeDragPlan && (
            <div className="opacity-90 pointer-events-none shadow-xl">
              <PlanCard
                plan={activeDragPlan}
                isSelected={false}
                onSelect={() => {}}
                onEdit={() => {}}
                onDelete={() => {}}
                compact
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Gallery viewer for sequence videos */}
      <SequenceGalleryViewer
        isOpen={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        sequences={sequencesForGallery}
        initialIndex={galleryInitialIndex}
      />
    </div>
  );
}
