'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { User, Users, Mic, Baby, Radio, BookOpen, MapPin, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateReferenceName } from '@/lib/reference-name';
import { GENERIC_CHARACTERS } from '@/lib/generic-characters';
import type { ProjectAssetFlat, GlobalAssetType } from '@/types/database';

// Icons for generic characters
const GENERIC_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  crowd: Users,
  voice: Mic,
  person: User,
  child: Baby,
  announcer: Radio,
  narrator: BookOpen,
};

// Icons and colors for asset types
const ASSET_TYPE_CONFIG: Record<GlobalAssetType, {
  icon: React.ComponentType<{ className?: string }>;
  bgColor: string;
  textColor: string;
  prefix: '@' | '#';
}> = {
  character: { icon: User, bgColor: 'bg-blue-500/20', textColor: 'text-blue-300', prefix: '@' },
  location: { icon: MapPin, bgColor: 'bg-green-500/20', textColor: 'text-green-300', prefix: '#' },
  prop: { icon: Package, bgColor: 'bg-orange-500/20', textColor: 'text-orange-300', prefix: '#' },
  audio: { icon: Mic, bgColor: 'bg-purple-500/20', textColor: 'text-purple-300', prefix: '#' },
};

interface MentionItem {
  id: string;
  name: string;
  reference: string;
  assetType: GlobalAssetType | 'generic';
  icon?: keyof typeof GENERIC_ICONS;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  className?: string;
  assets: ProjectAssetFlat[]; // All project assets (characters, locations, props)
  importedGenericIds: Set<string>;
}

// Parse text and extract mentions (@ for characters, # for locations/props)
function parseMentions(text: string): Array<{ type: 'text' | 'mention'; content: string; reference?: string; prefix?: '@' | '#' }> {
  const parts: Array<{ type: 'text' | 'mention'; content: string; reference?: string; prefix?: '@' | '#' }> = [];
  // Match @ReferenceName or #ReferenceName patterns
  const mentionRegex = /([@#])([A-Za-z][A-Za-z0-9_]*)/g;
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    // Add the mention with its prefix
    parts.push({
      type: 'mention',
      content: match[0],
      reference: match[2],
      prefix: match[1] as '@' | '#'
    });
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return parts;
}

// Normalize a reference for comparison (lowercase, no underscores)
const normalizeRef = (ref: string) => ref.toLowerCase().replace(/_/g, '');

// Render text with styled mentions
function MentionText({
  text,
  assets,
  importedGenericIds,
  className,
}: {
  text: string;
  assets: ProjectAssetFlat[];
  importedGenericIds: Set<string>;
  className?: string;
}) {
  const parts = parseMentions(text);

  // Build maps for @ mentions (characters) and # mentions (locations/props)
  const { atMap, hashMap } = useMemo(() => {
    const atMap = new Map<string, { name: string; assetType: GlobalAssetType | 'generic'; icon?: string }>();
    const hashMap = new Map<string, { name: string; assetType: GlobalAssetType }>();

    // Add assets based on their type
    for (const asset of assets) {
      const prefix = ASSET_TYPE_CONFIG[asset.asset_type].prefix;
      const ref = generateReferenceName(asset.name, prefix).slice(1); // Remove prefix

      if (prefix === '@') {
        atMap.set(normalizeRef(ref), { name: asset.name, assetType: asset.asset_type });
      } else {
        hashMap.set(normalizeRef(ref), { name: asset.name, assetType: asset.asset_type });
      }
    }

    // Add generic characters (@ prefix)
    for (const generic of GENERIC_CHARACTERS) {
      if (importedGenericIds.has(generic.id)) {
        const ref = generateReferenceName(generic.name, '@').slice(1);
        atMap.set(normalizeRef(ref), { name: generic.name, assetType: 'generic', icon: generic.icon });
      }
    }

    return { atMap, hashMap };
  }, [assets, importedGenericIds]);

  return (
    <span className={className}>
      {parts.map((part, idx) => {
        if (part.type === 'mention' && part.reference && part.prefix) {
          const map = part.prefix === '@' ? atMap : hashMap;
          const info = map.get(normalizeRef(part.reference));

          if (info) {
            // Get config based on asset type
            const isGeneric = info.assetType === 'generic';
            const config = isGeneric
              ? { icon: GENERIC_ICONS[info.icon || 'person'] || User, bgColor: 'bg-purple-500/20', textColor: 'text-purple-300' }
              : ASSET_TYPE_CONFIG[info.assetType as GlobalAssetType];

            const Icon = config.icon;

            return (
              <span
                key={idx}
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-sm font-medium',
                  config.bgColor,
                  config.textColor
                )}
              >
                <Icon className="w-3 h-3" />
                {info.name}
              </span>
            );
          }

          // Unknown mention - show as-is with warning style
          return (
            <span
              key={idx}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-sm bg-red-500/20 text-red-300"
            >
              {part.content}
            </span>
          );
        }
        return <span key={idx}>{part.content}</span>;
      })}
    </span>
  );
}

export function MentionInput({
  value,
  onChange,
  placeholder,
  multiline = false,
  className,
  assets,
  importedGenericIds,
}: MentionInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionQuery, setSuggestionQuery] = useState('');
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [currentTrigger, setCurrentTrigger] = useState<'@' | '#' | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Build mentions lists separated by prefix
  const { atMentions, hashMentions } = useMemo(() => {
    const atItems: MentionItem[] = [];
    const hashItems: MentionItem[] = [];

    // Add assets based on their type
    for (const asset of assets) {
      const config = ASSET_TYPE_CONFIG[asset.asset_type];
      const item: MentionItem = {
        id: asset.id,
        name: asset.name,
        reference: generateReferenceName(asset.name, config.prefix),
        assetType: asset.asset_type,
      };

      if (config.prefix === '@') {
        atItems.push(item);
      } else {
        hashItems.push(item);
      }
    }

    // Add generic characters (@ prefix)
    for (const generic of GENERIC_CHARACTERS) {
      if (importedGenericIds.has(generic.id)) {
        atItems.push({
          id: generic.id,
          name: generic.name,
          reference: generateReferenceName(generic.name, '@'),
          assetType: 'generic',
          icon: generic.icon as keyof typeof GENERIC_ICONS,
        });
      }
    }

    return { atMentions: atItems, hashMentions: hashItems };
  }, [assets, importedGenericIds]);

  // Normalize for comparison (lowercase, no underscores)
  const normalize = (s: string) => s.toLowerCase().replace(/_/g, '');

  // Filter suggestions based on current trigger and query
  const filteredSuggestions = useMemo(() => {
    const mentions = currentTrigger === '@' ? atMentions : currentTrigger === '#' ? hashMentions : [];
    if (!suggestionQuery) return mentions.slice(0, 8);
    const query = normalize(suggestionQuery);
    return mentions
      .filter(m =>
        normalize(m.name).includes(query) ||
        normalize(m.reference).includes(query)
      )
      .slice(0, 8);
  }, [atMentions, hashMentions, currentTrigger, suggestionQuery]);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Detect @ or # trigger and update suggestions
  const checkForMention = useCallback((text: string, position: number) => {
    // Look backwards from cursor to find @ or # trigger
    let triggerIndex = -1;
    let trigger: '@' | '#' | null = null;

    for (let i = position - 1; i >= 0; i--) {
      const char = text[i];
      // Stop at whitespace or newline - no trigger in current word
      if (/\s/.test(char)) {
        break;
      }
      // Found @ or #
      if (char === '@' || char === '#') {
        triggerIndex = i;
        trigger = char;
        break;
      }
    }

    if (triggerIndex >= 0 && trigger) {
      // Extract the query after the trigger
      const query = text.slice(triggerIndex + 1, position);
      // Only show suggestions if query is valid (letters, numbers, underscores)
      if (/^[A-Za-z0-9_]*$/.test(query)) {
        setCurrentTrigger(trigger);
        setShowSuggestions(true);
        setSuggestionQuery(query);
        setSuggestionIndex(0);
        return;
      }
    }

    setCurrentTrigger(null);
    setShowSuggestions(false);
    setSuggestionQuery('');
  }, []);

  // Focus effect - check for @ and set up textarea
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      // Restore cursor position
      inputRef.current.setSelectionRange(cursorPosition, cursorPosition);
      if (multiline && inputRef.current instanceof HTMLTextAreaElement) {
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
      }
      // Check for @ trigger at current position
      checkForMention(localValue, cursorPosition);
    }
  }, [isEditing, multiline, localValue, cursorPosition, checkForMention]);

  const insertMention = useCallback((mention: MentionItem) => {
    const input = inputRef.current;
    if (!input) return;

    const position = input.selectionStart || 0;
    const text = localValue;

    // Find the @ or # trigger by looking backwards
    let triggerIndex = -1;
    for (let i = position - 1; i >= 0; i--) {
      const char = text[i];
      if (/\s/.test(char)) break;
      if (char === '@' || char === '#') {
        triggerIndex = i;
        break;
      }
    }

    if (triggerIndex >= 0) {
      // Replace from trigger to current position with the mention
      const before = text.slice(0, triggerIndex);
      const after = text.slice(position);
      const newValue = before + mention.reference + ' ' + after;
      setLocalValue(newValue);
      onChange(newValue);

      // Set cursor after the mention + space
      const newPosition = triggerIndex + mention.reference.length + 1;
      setCursorPosition(newPosition);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(newPosition, newPosition);
          inputRef.current.focus();
        }
      }, 0);
    }

    setCurrentTrigger(null);
    setShowSuggestions(false);
    setSuggestionQuery('');
  }, [localValue, onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const newValue = e.target.value;
    const position = e.target.selectionStart || 0;

    setLocalValue(newValue);
    setCursorPosition(position);
    checkForMention(newValue, position);

    if (multiline && e.target instanceof HTMLTextAreaElement) {
      e.target.style.height = 'auto';
      e.target.style.height = e.target.scrollHeight + 'px';
    }
  };

  const handleBlur = () => {
    // Delay to allow clicking suggestions
    setTimeout(() => {
      if (!suggestionsRef.current?.contains(document.activeElement)) {
        setIsEditing(false);
        setShowSuggestions(false);
        if (localValue !== value) {
          onChange(localValue);
        }
      }
    }, 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions && filteredSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestionIndex(i => (i + 1) % filteredSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestionIndex(i => (i - 1 + filteredSuggestions.length) % filteredSuggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredSuggestions[suggestionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowSuggestions(false);
        return;
      }
    }

    if (e.key === 'Escape') {
      setLocalValue(value);
      setIsEditing(false);
    }
    if (e.key === 'Enter' && !multiline) {
      handleBlur();
    }
  };

  if (isEditing) {
    const Component = multiline ? 'textarea' : 'input';
    return (
      <div className="relative">
        <Component
          ref={inputRef as any}
          value={localValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onClick={(e) => {
            const target = e.target as HTMLTextAreaElement | HTMLInputElement;
            setCursorPosition(target.selectionStart || 0);
            checkForMention(localValue, target.selectionStart || 0);
          }}
          placeholder={placeholder}
          className={cn(
            'w-full bg-transparent border-none outline-none resize-none',
            'text-white placeholder:text-slate-600',
            'focus:ring-0',
            className
          )}
          rows={multiline ? 1 : undefined}
        />

        {/* Suggestions dropdown */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute left-0 top-full mt-1 w-64 rounded-lg bg-[#1e293b] border border-white/10 shadow-xl z-50 overflow-hidden"
          >
            {filteredSuggestions.map((mention, idx) => {
              const isGeneric = mention.assetType === 'generic';
              const config = isGeneric
                ? { icon: GENERIC_ICONS[mention.icon || 'person'] || User, textColor: 'text-purple-400' }
                : { icon: ASSET_TYPE_CONFIG[mention.assetType as GlobalAssetType].icon, textColor: ASSET_TYPE_CONFIG[mention.assetType as GlobalAssetType].textColor };
              const Icon = config.icon;

              return (
                <button
                  key={mention.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertMention(mention)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                    idx === suggestionIndex
                      ? 'bg-white/10 text-white'
                      : 'text-slate-300 hover:bg-white/5'
                  )}
                >
                  <Icon className={cn('w-4 h-4', config.textColor)} />
                  <span className="flex-1">{mention.name}</span>
                  <span className="text-xs text-slate-500 font-mono">{mention.reference}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // View mode - render with styled mentions
  return (
    <div
      onClick={() => setIsEditing(true)}
      className={cn(
        'cursor-text min-h-[24px] whitespace-pre-wrap',
        !value && 'text-slate-600',
        className
      )}
    >
      {value ? (
        <MentionText
          text={value}
          assets={assets}
          importedGenericIds={importedGenericIds}
        />
      ) : (
        placeholder
      )}
    </div>
  );
}

export { MentionText };
