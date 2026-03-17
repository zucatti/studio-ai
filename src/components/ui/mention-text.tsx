'use client';

import { useMemo, Fragment } from 'react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { User, MapPin, Package } from 'lucide-react';
import { StorageImg } from '@/components/ui/storage-image';

// Entity data for tooltip display
export interface MentionEntity {
  reference: string; // @MorganeLeFay
  name: string; // Morgane Le Fay
  type: 'character' | 'location' | 'prop';
  visual_description?: string;
  reference_images?: string[];
}

interface MentionTextProps {
  text: string;
  entities?: MentionEntity[];
  className?: string;
  highlightClassName?: string;
  showTooltip?: boolean;
  onClick?: (reference: string, entity?: MentionEntity) => void;
}

// Colors for different entity types
const MENTION_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  character: {
    bg: 'bg-blue-500/20',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
  },
  location: {
    bg: 'bg-green-500/20',
    text: 'text-green-400',
    border: 'border-green-500/30',
  },
  prop: {
    bg: 'bg-orange-500/20',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
  },
  unknown: {
    bg: 'bg-purple-500/20',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
  },
};

const ENTITY_ICONS = {
  character: User,
  location: MapPin,
  prop: Package,
};

// Parse text and extract mentions with positions
function parseMentions(text: string): { text: string; isMention: boolean; reference?: string }[] {
  const mentionRegex = /@[A-Z][a-zA-Z0-9]*/g;
  const parts: { text: string; isMention: boolean; reference?: string }[] = [];

  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before mention
    if (match.index > lastIndex) {
      parts.push({
        text: text.slice(lastIndex, match.index),
        isMention: false,
      });
    }

    // Add mention
    parts.push({
      text: match[0],
      isMention: true,
      reference: match[0],
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      text: text.slice(lastIndex),
      isMention: false,
    });
  }

  return parts;
}

// Mention badge component
function MentionBadge({
  reference,
  entity,
  showTooltip,
  onClick,
}: {
  reference: string;
  entity?: MentionEntity;
  showTooltip?: boolean;
  onClick?: (reference: string, entity?: MentionEntity) => void;
}) {
  const entityType = entity?.type || 'unknown';
  const colors = MENTION_COLORS[entityType];
  const Icon = entity?.type ? ENTITY_ICONS[entity.type] : null;

  const badge = (
    <span
      onClick={() => onClick?.(reference, entity)}
      className={cn(
        'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium',
        'transition-colors cursor-pointer',
        colors.bg,
        colors.text,
        onClick && 'hover:brightness-125'
      )}
    >
      {Icon && <Icon className="w-3 h-3" />}
      <span className="font-mono">{reference}</span>
    </span>
  );

  if (!showTooltip || !entity) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-xs bg-[#1a2433] border-white/10 p-3"
        >
          <div className="space-y-2">
            {/* Header with icon and name */}
            <div className="flex items-center gap-2">
              {Icon && (
                <div className={cn('p-1.5 rounded', colors.bg)}>
                  <Icon className={cn('w-4 h-4', colors.text)} />
                </div>
              )}
              <div>
                <p className="font-medium text-white text-sm">{entity.name}</p>
                <p className="text-[10px] text-slate-500 font-mono">{reference}</p>
              </div>
            </div>

            {/* Visual description */}
            {entity.visual_description && (
              <p className="text-xs text-slate-300 line-clamp-3">
                {entity.visual_description}
              </p>
            )}

            {/* Reference images preview */}
            {entity.reference_images && entity.reference_images.length > 0 && (
              <div className="flex gap-1">
                {entity.reference_images.slice(0, 3).map((img, idx) => (
                  <StorageImg
                    key={idx}
                    src={img}
                    alt={`${entity.name} ref ${idx + 1}`}
                    className="w-10 h-10 rounded object-cover object-top"
                  />
                ))}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * MentionText - Renders text with highlighted @mentions
 *
 * Usage:
 * ```tsx
 * <MentionText
 *   text="@Morgana walks into the room with @LeSceptre"
 *   entities={[
 *     { reference: '@Morgana', name: 'Morgana Le Fay', type: 'character', ... },
 *     { reference: '@LeSceptre', name: 'Le Sceptre', type: 'prop', ... }
 *   ]}
 *   showTooltip
 *   onClick={(ref) => console.log('Clicked', ref)}
 * />
 * ```
 */
export function MentionText({
  text,
  entities = [],
  className,
  showTooltip = true,
  onClick,
}: MentionTextProps) {
  const parts = useMemo(() => parseMentions(text), [text]);

  // Create entity map for quick lookup
  const entityMap = useMemo(() => {
    const map = new Map<string, MentionEntity>();
    for (const entity of entities) {
      map.set(entity.reference, entity);
    }
    return map;
  }, [entities]);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (!part.isMention) {
          return <Fragment key={index}>{part.text}</Fragment>;
        }

        const entity = part.reference ? entityMap.get(part.reference) : undefined;

        return (
          <MentionBadge
            key={index}
            reference={part.reference!}
            entity={entity}
            showTooltip={showTooltip}
            onClick={onClick}
          />
        );
      })}
    </span>
  );
}

/**
 * Hook to extract all mentions from text
 */
export function extractMentions(text: string): string[] {
  const matches = text.match(/@[A-Z][a-zA-Z0-9]*/g);
  return [...new Set(matches || [])];
}

/**
 * Check if text contains any mentions
 */
export function hasMentions(text: string): boolean {
  return /@[A-Z][a-zA-Z0-9]*/.test(text);
}
