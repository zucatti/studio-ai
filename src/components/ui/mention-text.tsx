'use client';

import { useMemo, Fragment } from 'react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { User, MapPin, Package, Image as ImageIcon } from 'lucide-react';
import { StorageImg } from '@/components/ui/storage-image';

// Entity data for tooltip display
export interface MentionEntity {
  reference: string; // @MorganeLeFay, #LaPlage, !JumpPose
  name: string; // Morgane Le Fay
  type: 'character' | 'location' | 'prop' | 'reference';
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
  reference: {
    bg: 'bg-purple-500/20',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
  },
  unknown: {
    bg: 'bg-slate-500/20',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
  },
};

const ENTITY_ICONS = {
  character: User,
  location: MapPin,
  prop: Package,
  reference: ImageIcon,
};

// Parse text and extract mentions with positions
// Supports @ (characters), # (locations/props), ! (looks - associated with previous @)
// Example: "@Morgana !robeDeSoiree court vers @Kael !tenueRock"
// - !robeDeSoiree is associated with @Morgana
// - !tenueRock is associated with @Kael
function parseMentions(text: string): {
  text: string;
  isMention: boolean;
  reference?: string;
  prefix?: '@' | '#' | '!';
  associatedCharacter?: string; // For ! mentions, the @ character it belongs to
}[] {
  // Match @Character, #Location, !Look separately
  const mentionRegex = /[@#!][A-Z][a-zA-Z0-9_]*/g;
  const parts: {
    text: string;
    isMention: boolean;
    reference?: string;
    prefix?: '@' | '#' | '!';
    associatedCharacter?: string;
  }[] = [];

  let lastIndex = 0;
  let lastCharacter: string | undefined; // Track the last @Character for ! association
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before mention
    if (match.index > lastIndex) {
      parts.push({
        text: text.slice(lastIndex, match.index),
        isMention: false,
      });
    }

    const fullMatch = match[0];
    const prefix = fullMatch[0] as '@' | '#' | '!';

    // Track last character for look association
    if (prefix === '@') {
      lastCharacter = fullMatch;
    }

    parts.push({
      text: fullMatch,
      isMention: true,
      reference: fullMatch,
      prefix,
      associatedCharacter: prefix === '!' ? lastCharacter : undefined,
    });

    lastIndex = match.index + fullMatch.length;
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
  prefix,
  associatedCharacter,
  showTooltip,
  onClick,
}: {
  reference: string;
  entity?: MentionEntity;
  prefix?: '@' | '#' | '!';
  associatedCharacter?: string; // For ! mentions, shows which @ it belongs to
  showTooltip?: boolean;
  onClick?: (reference: string, entity?: MentionEntity) => void;
}) {
  // Determine entity type from entity data or infer from prefix
  // @ = character (blue), # = location (green), ! = look/reference (purple)
  const inferredType = prefix === '@' ? 'character' : prefix === '!' ? 'reference' : 'location';
  const entityType = entity?.type || inferredType;
  const colors = MENTION_COLORS[entityType] || MENTION_COLORS.unknown;
  const Icon = ENTITY_ICONS[entityType as keyof typeof ENTITY_ICONS] || null;

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
      title={associatedCharacter ? `Look pour ${associatedCharacter}` : undefined}
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
            prefix={part.prefix}
            associatedCharacter={part.associatedCharacter}
            showTooltip={showTooltip}
            onClick={onClick}
          />
        );
      })}
    </span>
  );
}

/**
 * Extract all mentions from text (@, #, ! tags)
 */
export function extractMentions(text: string): string[] {
  const matches = text.match(/[@#!][A-Z][a-zA-Z0-9_]*/g);
  return [...new Set(matches || [])];
}

/**
 * Extract only character mentions (@tags)
 */
export function extractCharacterMentions(text: string): string[] {
  const matches = text.match(/@[A-Z][a-zA-Z0-9_]*/g);
  return [...new Set(matches || [])];
}

/**
 * Extract only location/prop mentions (#tags)
 */
export function extractLocationMentions(text: string): string[] {
  const matches = text.match(/#[A-Z][a-zA-Z0-9_]*/g);
  return [...new Set(matches || [])];
}

/**
 * Extract only look/reference mentions (!tags)
 */
export function extractReferenceMentions(text: string): string[] {
  const matches = text.match(/![A-Z][a-zA-Z0-9_]*/g);
  return [...new Set(matches || [])];
}

/**
 * Check if text contains any mentions (@, #, or ! tags)
 */
export function hasMentions(text: string): boolean {
  return /[@#!][A-Z][a-zA-Z0-9_]*/.test(text);
}

/**
 * Extract character mentions with their associated looks
 * Example: "@Morgana !robeDeSoiree court vers @Kael !tenueRock"
 * Returns: [
 *   { character: "@Morgana", look: "!robeDeSoiree" },
 *   { character: "@Kael", look: "!tenueRock" }
 * ]
 */
export interface CharacterWithLook {
  character: string;
  look?: string;
}

export function extractCharactersWithLooks(text: string): CharacterWithLook[] {
  const mentionRegex = /[@!][A-Z][a-zA-Z0-9_]*/g;
  const results: CharacterWithLook[] = [];
  let currentCharacter: string | null = null;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    const ref = match[0];
    if (ref.startsWith('@')) {
      // New character - save previous if exists
      if (currentCharacter) {
        results.push({ character: currentCharacter });
      }
      currentCharacter = ref;
    } else if (ref.startsWith('!') && currentCharacter) {
      // Look for current character
      results.push({ character: currentCharacter, look: ref });
      currentCharacter = null; // Reset after associating
    }
  }

  // Don't forget last character without look
  if (currentCharacter) {
    results.push({ character: currentCharacter });
  }

  return results;
}
