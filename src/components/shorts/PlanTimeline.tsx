'use client';

import { useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PlanCard } from './PlanCard';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Plan } from '@/store/shorts-store';

interface SortablePlanItemProps {
  plan: Plan;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  compact?: boolean;
}

function SortablePlanItem({ plan, isSelected, onSelect, onEdit, onDelete, compact }: SortablePlanItemProps) {
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
        isSelected={isSelected}
        onSelect={onSelect}
        onEdit={onEdit}
        onDelete={onDelete}
        dragHandleProps={listeners}
        compact={compact}
      />
    </div>
  );
}

interface PlanTimelineProps {
  plans: Plan[];
  selectedPlanId: string | null;
  onSelectPlan: (planId: string) => void;
  onEditPlan: (plan: Plan) => void;
  onDeletePlan: (planId: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onAddPlan: () => void;
  compact?: boolean;
}

export function PlanTimeline({
  plans,
  selectedPlanId,
  onSelectPlan,
  onEditPlan,
  onDeletePlan,
  onReorder,
  onAddPlan,
  compact,
}: PlanTimelineProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = plans.findIndex((p) => p.id === active.id);
        const newIndex = plans.findIndex((p) => p.id === over.id);
        const newOrder = arrayMove(plans, oldIndex, newIndex);
        onReorder(newOrder.map((p) => p.id));
      }
    },
    [plans, onReorder]
  );

  return (
    <div className={cn("space-y-2", compact && "space-y-1.5")}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={plans.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          {plans.map((plan) => (
            <SortablePlanItem
              key={plan.id}
              plan={plan}
              isSelected={selectedPlanId === plan.id}
              onSelect={() => onSelectPlan(plan.id)}
              onEdit={() => onEditPlan(plan)}
              onDelete={() => onDeletePlan(plan.id)}
              compact={compact}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* Add plan button */}
      <Button
        variant="outline"
        size={compact ? "sm" : "default"}
        className={cn(
          "w-full border-dashed border-white/20 text-slate-400 hover:text-white hover:border-white/40",
          compact && "text-xs h-8"
        )}
        onClick={onAddPlan}
      >
        <Plus className={cn("mr-2", compact ? "w-3 h-3" : "w-4 h-4")} />
        {compact ? "Ajouter" : "Ajouter un plan"}
      </Button>
    </div>
  );
}
