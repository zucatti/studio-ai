'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DIALOGUE_TONE_OPTIONS,
  DIALOGUE_TONE_CATEGORIES,
  type DialogueTone,
  type DialogueToneOption,
} from '@/types/cinematic';

interface TonePickerProps {
  value: DialogueTone;
  onChange: (value: DialogueTone) => void;
  className?: string;
}

export function TonePicker({ value, onChange, className }: TonePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Find current option
  const currentOption = DIALOGUE_TONE_OPTIONS.find((opt) => opt.value === value);

  // Filter and group options
  const filteredOptions = useMemo(() => {
    const searchLower = search.toLowerCase();
    return DIALOGUE_TONE_OPTIONS.filter(
      (opt) =>
        opt.label.toLowerCase().includes(searchLower) ||
        opt.labelEn.toLowerCase().includes(searchLower) ||
        opt.value.toLowerCase().includes(searchLower)
    );
  }, [search]);

  // Group by category
  const groupedOptions = useMemo(() => {
    const groups: Record<string, DialogueToneOption[]> = {};
    for (const opt of filteredOptions) {
      if (!groups[opt.category]) {
        groups[opt.category] = [];
      }
      groups[opt.category].push(opt);
    }
    return groups;
  }, [filteredOptions]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      // Focus search input when opened
      setTimeout(() => inputRef.current?.focus(), 0);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setOpen(false);
        setSearch('');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const handleSelect = (tone: DialogueTone) => {
    onChange(tone);
    setOpen(false);
    setSearch('');
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center justify-between w-full px-2 h-7 text-[10px] rounded-md border',
          'bg-slate-800/50 border-white/10 text-white hover:bg-slate-700/50',
          'focus:outline-none focus:ring-1 focus:ring-blue-500'
        )}
      >
        <span className="truncate">{currentOption?.label || 'Neutre'}</span>
        <ChevronDown className={cn('ml-1 h-3 w-3 shrink-0 opacity-50 transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute z-50 mt-1 w-[320px] rounded-md border border-white/10 bg-slate-900 shadow-lg"
          style={{ left: 0 }}
        >
          {/* Search input */}
          <div className="flex items-center border-b border-white/10 px-3 py-2">
            <Search className="mr-2 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              placeholder="Rechercher une émotion..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-slate-400 hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Options list - native scroll */}
          <div
            className="overflow-y-auto overscroll-contain p-1"
            style={{ maxHeight: '300px' }}
          >
            {Object.keys(groupedOptions).length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500">
                Aucun résultat
              </div>
            ) : (
              Object.entries(groupedOptions).map(([category, options]) => (
                <div key={category}>
                  {/* Category header */}
                  <div className="px-2 py-1.5 text-[10px] font-medium text-slate-500 bg-slate-900 sticky top-0">
                    {DIALOGUE_TONE_CATEGORIES[category as keyof typeof DIALOGUE_TONE_CATEGORIES]}
                  </div>
                  {/* Options in category */}
                  {options.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleSelect(opt.value)}
                      className={cn(
                        'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none',
                        'hover:bg-white/10 text-white',
                        value === opt.value && 'bg-white/5'
                      )}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-3.5 w-3.5',
                          value === opt.value ? 'opacity-100 text-blue-400' : 'opacity-0'
                        )}
                      />
                      <span className="flex-1 text-left">{opt.label}</span>
                      <span className="text-[10px] text-slate-500">{opt.labelEn}</span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
