'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { User, MapPin, Package, Image as ImageIcon, Loader2 } from 'lucide-react';
import { StorageThumbnail } from '@/components/ui/storage-image';

// Types for mention suggestions
export interface MentionSuggestion {
  id: string;
  reference: string; // @Morgana, #LaPlage, !JumpPose
  name: string;
  type: 'character' | 'location' | 'prop' | 'reference';
  image?: string;
  description?: string;
  looks?: Array<{ id?: string; name: string; description: string; imageUrl: string }>;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  projectId: string;
}

type TriggerChar = '@' | '#' | '!';

const TRIGGER_CHARS: TriggerChar[] = ['@', '#', '!'];

const TRIGGER_CONFIG: Record<TriggerChar, {
  label: string;
  icon: typeof User;
  color: string;
  bgColor: string;
}> = {
  '@': { label: 'Personnages', icon: User, color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  '#': { label: 'Lieux & Props', icon: MapPin, color: 'text-green-400', bgColor: 'bg-green-500/20' },
  '!': { label: 'Références', icon: ImageIcon, color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
};

// Cache for suggestions with TTL (30 seconds)
const CACHE_TTL = 30 * 1000;
const suggestionCache = new Map<string, { data: MentionSuggestion[]; timestamp: number }>();

function getCachedSuggestions(key: string): MentionSuggestion[] | null {
  const cached = suggestionCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    suggestionCache.delete(key);
    return null;
  }
  return cached.data;
}

function setCachedSuggestions(key: string, data: MentionSuggestion[]): void {
  suggestionCache.set(key, { data, timestamp: Date.now() });
}

// Parse text and render with styled mentions
// IMPORTANT: This must render text EXACTLY like the textarea to avoid cursor drift
// @ = characters (blue), # = locations/props (green), ! = looks (purple)
function StyledMentionOverlay({ text }: { text: string }) {
  // Match @Character, #Location, !Look separately
  const mentionRegex = /[@#!][A-Z][a-zA-Z0-9_]*/g;
  const parts: {
    text: string;
    isMention: boolean;
    prefix?: '@' | '#' | '!';
  }[] = [];

  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), isMention: false });
    }

    const fullMatch = match[0];
    const prefix = fullMatch[0] as '@' | '#' | '!';

    parts.push({
      text: fullMatch,
      isMention: true,
      prefix,
    });
    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), isMention: false });
  }

  return (
    <>
      {parts.map((part, idx) => {
        if (!part.isMention) {
          return <span key={idx}>{part.text}</span>;
        }

        const isCharacter = part.prefix === '@';
        const isLook = part.prefix === '!';

        // Simple color-only styling - NO padding, margin, box-shadow, or font-weight changes
        // This ensures text width is IDENTICAL to the textarea
        return (
          <span
            key={idx}
            className={
              isCharacter
                ? 'text-blue-400'
                : isLook
                ? 'text-purple-400'
                : 'text-green-400'
            }
          >
            {part.text}
          </span>
        );
      })}
    </>
  );
}

export function MentionInput({
  value,
  onChange,
  placeholder,
  className,
  minHeight = '100px',
  projectId,
}: MentionInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [triggerChar, setTriggerChar] = useState<TriggerChar | null>(null);
  const [triggerIndex, setTriggerIndex] = useState<number>(-1);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [currentCharacterForLooks, setCurrentCharacterForLooks] = useState<string | null>(null);

  // Find the last @Character reference in text before a given position
  const findLastCharacterRef = useCallback((text: string): string | null => {
    const charRegex = /@[A-Z][a-zA-Z0-9_]*/g;
    let lastMatch: string | null = null;
    let match;

    while ((match = charRegex.exec(text)) !== null) {
      lastMatch = match[0];
    }

    return lastMatch;
  }, []);

  // Fetch suggestions based on trigger type
  const fetchSuggestions = useCallback(async (trigger: TriggerChar, textBeforeTrigger?: string) => {
    setIsLoading(true);

    try {
      let suggestions: MentionSuggestion[] = [];

      if (trigger === '@' || trigger === '#') {
        const cacheKey = `${projectId}-${trigger}`;

        // Check cache with TTL
        const cached = getCachedSuggestions(cacheKey);
        if (cached) {
          setIsLoading(false);
          return cached;
        }

        // Fetch project assets (characters, locations, props)
        const res = await fetch(`/api/projects/${projectId}/assets`);
        if (res.ok) {
          const data = await res.json();
          const assets = data.assets || [];

          suggestions = assets
            .filter((a: any) => {
              if (trigger === '@') return a.asset_type === 'character';
              return a.asset_type === 'location' || a.asset_type === 'prop';
            })
            .map((a: any) => ({
              id: a.id,
              reference: generateReference(a.name, trigger),
              name: a.name,
              type: a.asset_type as 'character' | 'location' | 'prop',
              image: a.reference_images?.[0],
              description: a.data?.visual_description,
              // Include looks for characters (needed for ! autocomplete)
              looks: a.asset_type === 'character' ? (a.data?.looks || []) : undefined,
            }));
        }

        setCachedSuggestions(cacheKey, suggestions);
      } else if (trigger === '!') {
        // For ! trigger, find the last @Character and show their looks
        const lastCharRef = textBeforeTrigger ? findLastCharacterRef(textBeforeTrigger) : null;

        if (!lastCharRef) {
          // No character found, return empty
          setCurrentCharacterForLooks(null);
          setIsLoading(false);
          return [];
        }

        // First try to get characters from cache, otherwise fetch
        const cacheKey = `${projectId}-@`;
        let characters: MentionSuggestion[] | null = getCachedSuggestions(cacheKey);

        if (!characters) {
          // Fetch and cache characters with their looks
          const res = await fetch(`/api/projects/${projectId}/assets`);
          if (res.ok) {
            const data = await res.json();
            const assets = data.assets || [];

            const fetchedCharacters: MentionSuggestion[] = assets
              .filter((a: any) => a.asset_type === 'character')
              .map((a: any) => ({
                id: a.id,
                reference: generateReference(a.name, '@'),
                name: a.name,
                type: 'character' as const,
                image: a.reference_images?.[0],
                description: a.data?.visual_description,
                looks: a.data?.looks || [],
              }));
            setCachedSuggestions(cacheKey, fetchedCharacters);
            characters = fetchedCharacters;
          }
        }

        if (characters && characters.length > 0) {
          // Find the character matching the last @reference
          const matchingChar = characters.find(
            (c) => c.reference.toLowerCase() === lastCharRef.toLowerCase()
          );

          if (matchingChar && matchingChar.looks && matchingChar.looks.length > 0) {
            // Set the character name for the dropdown header
            setCurrentCharacterForLooks(matchingChar.name);

            // Return that character's looks as suggestions
            suggestions = matchingChar.looks.map((look, idx) => ({
              id: `${matchingChar.id}-look-${idx}`,
              reference: generateReference(look.name, '!'),
              name: look.name,
              type: 'reference' as const,
              image: look.imageUrl,
              description: look.description,
            }));
          } else {
            setCurrentCharacterForLooks(null);
          }
        } else {
          setCurrentCharacterForLooks(null);
        }
      }

      return suggestions;
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [projectId, findLastCharacterRef]);

  // Generate reference name from display name
  const generateReference = (name: string, prefix: TriggerChar): string => {
    const cleaned = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/['\-_]/g, ' ')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .trim();

    const pascalCase = cleaned
      .split(/\s+/)
      .filter(word => word.length > 0)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');

    return `${prefix}${pascalCase}`;
  };

  // Filter suggestions based on search query
  const filteredSuggestions = useMemo(() => {
    if (!searchQuery) return suggestions;

    const query = searchQuery.toLowerCase();
    return suggestions.filter(s =>
      s.name.toLowerCase().includes(query) ||
      s.reference.toLowerCase().includes(query)
    );
  }, [suggestions, searchQuery]);

  // Calculate dropdown position
  const updateDropdownPosition = useCallback(() => {
    if (!textareaRef.current || triggerIndex < 0) return;

    const textarea = textareaRef.current;
    const textBeforeCursor = value.slice(0, triggerIndex);

    // Create a hidden div to measure text position
    const mirror = document.createElement('div');
    const computed = window.getComputedStyle(textarea);

    mirror.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      width: ${textarea.clientWidth}px;
      font: ${computed.font};
      padding: ${computed.padding};
      line-height: ${computed.lineHeight};
    `;
    mirror.textContent = textBeforeCursor;

    const marker = document.createElement('span');
    marker.textContent = '|';
    mirror.appendChild(marker);

    document.body.appendChild(mirror);

    const rect = textarea.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();

    document.body.removeChild(mirror);

    // Calculate position relative to viewport
    const top = rect.top + (markerRect.top - mirrorRect.top) + parseInt(computed.lineHeight);
    const left = rect.left + (markerRect.left - mirrorRect.left);

    setDropdownPosition({
      top: Math.min(top, window.innerHeight - 300),
      left: Math.min(left, window.innerWidth - 280),
    });
  }, [value, triggerIndex]);

  // Handle text change and detect triggers
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;

    onChange(newValue);

    // Look for trigger character before cursor
    const textBeforeCursor = newValue.slice(0, cursorPos);

    // Find the last trigger character
    let lastTriggerIndex = -1;
    let lastTrigger: TriggerChar | null = null;

    for (const trigger of TRIGGER_CHARS) {
      const idx = textBeforeCursor.lastIndexOf(trigger);
      if (idx > lastTriggerIndex) {
        // Check if it's a valid trigger position (start of word)
        const charBefore = idx > 0 ? textBeforeCursor[idx - 1] : ' ';
        if (/[\s\n]/.test(charBefore) || idx === 0) {
          // Check if there's no space between trigger and cursor
          const textAfterTrigger = textBeforeCursor.slice(idx + 1);
          if (!/\s/.test(textAfterTrigger)) {
            lastTriggerIndex = idx;
            lastTrigger = trigger;
          }
        }
      }
    }

    if (lastTrigger && lastTriggerIndex >= 0) {
      const query = textBeforeCursor.slice(lastTriggerIndex + 1);
      setTriggerChar(lastTrigger);
      setTriggerIndex(lastTriggerIndex);
      setSearchQuery(query);
      setSelectedIndex(0);
      setIsOpen(true);

      // Fetch suggestions - pass text before trigger for ! to find last @Character
      const textBeforeTrigger = newValue.slice(0, lastTriggerIndex);
      fetchSuggestions(lastTrigger, textBeforeTrigger).then(setSuggestions);
    } else {
      setIsOpen(false);
      setTriggerChar(null);
      setTriggerIndex(-1);
      setSearchQuery('');
    }
  }, [onChange, fetchSuggestions]);

  // Reset dropdown state
  const resetDropdown = useCallback(() => {
    setIsOpen(false);
    setTriggerChar(null);
    setTriggerIndex(-1);
    setSearchQuery('');
    setSuggestions([]);
    setSelectedIndex(0);
    setCurrentCharacterForLooks(null);
  }, []);

  // Handle suggestion selection
  const selectSuggestion = useCallback((suggestion: MentionSuggestion) => {
    if (triggerIndex < 0 || !textareaRef.current) return;

    const cursorPos = textareaRef.current.selectionStart;
    const before = value.slice(0, triggerIndex);
    const after = value.slice(cursorPos);

    const newValue = before + suggestion.reference + ' ' + after;

    // Reset dropdown BEFORE onChange to avoid any state conflicts
    resetDropdown();

    // Update value
    onChange(newValue);

    // Focus and set cursor position
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = triggerIndex + suggestion.reference.length + 1;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 10);
  }, [value, onChange, triggerIndex, resetDropdown]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < filteredSuggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : prev);
        break;
      case 'Enter':
      case 'Tab':
        if (filteredSuggestions[selectedIndex]) {
          e.preventDefault();
          selectSuggestion(filteredSuggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        resetDropdown();
        break;
    }
  }, [isOpen, filteredSuggestions, selectedIndex, selectSuggestion, resetDropdown]);

  // Update dropdown position when open
  useEffect(() => {
    if (isOpen) {
      updateDropdownPosition();
    }
  }, [isOpen, updateDropdownPosition]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        resetDropdown();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [resetDropdown]);

  // Sync scroll between textarea and overlay
  const handleScroll = useCallback(() => {
    if (textareaRef.current && overlayRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  // Auto-resize textarea and overlay
  useEffect(() => {
    if (textareaRef.current && overlayRef.current) {
      const height = Math.max(
        parseInt(minHeight),
        textareaRef.current.scrollHeight
      );
      textareaRef.current.style.height = `${height}px`;
      overlayRef.current.style.height = `${height}px`;
    }
  }, [value, minHeight]);

  const config = triggerChar ? TRIGGER_CONFIG[triggerChar] : null;

  return (
    <>
      <div
        ref={containerRef}
        className={cn(
          'relative w-full rounded-md',
          'bg-white/5 border border-white/10',
          'focus-within:border-blue-500/50',
          'transition-colors',
          className
        )}
      >
        {/* Styled overlay - shows colored mentions */}
        {/* CRITICAL: Must have IDENTICAL styling to textarea for cursor alignment */}
        <div
          ref={overlayRef}
          className={cn(
            'absolute inset-0 pointer-events-none overflow-hidden',
            'px-3 py-2 text-sm leading-normal',
            'whitespace-pre-wrap break-words',
            'text-white font-normal tracking-normal'
          )}
          style={{
            minHeight,
            fontFamily: 'inherit',
            wordSpacing: 'normal',
            letterSpacing: 'normal',
          }}
          aria-hidden="true"
        >
          {value ? (
            <StyledMentionOverlay text={value} />
          ) : (
            <span className="text-slate-500">{placeholder}</span>
          )}
        </div>

        {/* Transparent textarea for editing */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          placeholder=""
          className={cn(
            'relative w-full resize-none bg-transparent',
            'px-3 py-2 text-sm leading-normal',
            'text-transparent caret-white',
            'focus:outline-none',
            'selection:bg-blue-500/30',
            'font-normal tracking-normal'
          )}
          style={{
            minHeight,
            wordSpacing: 'normal',
            letterSpacing: 'normal',
          }}
          spellCheck={false}
        />
      </div>

      {/* Dropdown Portal */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-50 w-72 max-h-64 overflow-y-auto bg-[#1a2433] border border-white/10 rounded-lg shadow-xl"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
          }}
        >
          {/* Header */}
          {config && (
            <div className={cn(
              'px-3 py-2 border-b border-white/10 flex items-center gap-2',
              config.bgColor
            )}>
              <config.icon className={cn('w-4 h-4', config.color)} />
              <span className={cn('text-xs font-medium', config.color)}>
                {triggerChar === '!' && currentCharacterForLooks
                  ? `Looks de ${currentCharacterForLooks}`
                  : config.label}
              </span>
              {isLoading && (
                <Loader2 className="w-3 h-3 animate-spin text-slate-400 ml-auto" />
              )}
            </div>
          )}

          {/* Suggestions */}
          {filteredSuggestions.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-slate-500">
              {isLoading ? 'Chargement...' : 'Aucun résultat'}
            </div>
          ) : (
            <div className="py-1">
              {filteredSuggestions.map((suggestion, index) => {
                const Icon = suggestion.type === 'character' ? User
                  : suggestion.type === 'reference' ? ImageIcon
                  : suggestion.type === 'location' ? MapPin
                  : Package;

                return (
                  <button
                    key={suggestion.id}
                    type="button"
                    onClick={() => selectSuggestion(suggestion)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                      index === selectedIndex
                        ? 'bg-white/10'
                        : 'hover:bg-white/5'
                    )}
                  >
                    {/* Image or Icon */}
                    {suggestion.image ? (
                      <StorageThumbnail
                        src={suggestion.image}
                        alt={suggestion.name}
                        size={32}
                        className="rounded flex-shrink-0"
                      />
                    ) : (
                      <div className={cn(
                        'w-8 h-8 rounded flex items-center justify-center flex-shrink-0',
                        suggestion.type === 'character' ? 'bg-blue-500/20' :
                        suggestion.type === 'reference' ? 'bg-purple-500/20' :
                        'bg-green-500/20'
                      )}>
                        <Icon className={cn(
                          'w-4 h-4',
                          suggestion.type === 'character' ? 'text-blue-400' :
                          suggestion.type === 'reference' ? 'text-purple-400' :
                          'text-green-400'
                        )} />
                      </div>
                    )}

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {suggestion.name}
                      </p>
                      <p className={cn(
                        'text-xs font-mono truncate',
                        suggestion.type === 'character' ? 'text-blue-400' :
                        suggestion.type === 'reference' ? 'text-purple-400' :
                        'text-green-400'
                      )}>
                        {suggestion.reference}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

// Invalidate cache when needed
export function invalidateMentionCache(projectId?: string) {
  if (projectId) {
    for (const key of suggestionCache.keys()) {
      if (key.startsWith(projectId)) {
        suggestionCache.delete(key);
      }
    }
  } else {
    suggestionCache.clear();
  }
}
