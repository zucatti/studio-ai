'use client';

import { useState, useEffect, useRef } from 'react';
import { User, Plus, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Character {
  id: string;
  name: string;
}

interface CharacterAutocompleteProps {
  value: string;
  onChange: (value: string, characterId?: string) => void;
  characters: Character[];
  placeholder?: string;
  className?: string;
}

export function CharacterAutocomplete({
  value,
  onChange,
  characters,
  placeholder = 'Nom du personnage...',
  className,
}: CharacterAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync input value with prop value
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Filter characters based on input
  const filteredCharacters = characters.filter((char) =>
    char.name.toLowerCase().includes(inputValue.toLowerCase())
  );

  // Check if exact match exists
  const exactMatch = characters.find(
    (char) => char.name.toLowerCase() === inputValue.toLowerCase()
  );

  // Show "create new" option if no exact match and input is not empty
  const showCreateOption = inputValue.trim() && !exactMatch;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setIsOpen(true);
    setHighlightedIndex(0);
  };

  const handleSelect = (characterName: string, characterId?: string) => {
    setInputValue(characterName);
    onChange(characterName, characterId);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    const totalItems = filteredCharacters.length + (showCreateOption ? 1 : 0);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % totalItems);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + totalItems) % totalItems);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex < filteredCharacters.length) {
          const char = filteredCharacters[highlightedIndex];
          handleSelect(char.name, char.id);
        } else if (showCreateOption) {
          handleSelect(inputValue.trim().toUpperCase());
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Delay close to allow click on dropdown items
    setTimeout(() => {
      if (!dropdownRef.current?.contains(document.activeElement)) {
        setIsOpen(false);
        // Commit current value if changed
        if (inputValue !== value) {
          onChange(inputValue.trim().toUpperCase());
        }
      }
    }, 150);
  };

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="pl-8 bg-white/5 border-white/10 text-white placeholder:text-slate-500 uppercase"
        />
      </div>

      {isOpen && (filteredCharacters.length > 0 || showCreateOption) && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 rounded-md bg-[#1a2433] border border-white/10 shadow-lg max-h-48 overflow-y-auto"
        >
          {filteredCharacters.map((char, index) => (
            <button
              key={char.id}
              onClick={() => handleSelect(char.name, char.id)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
                index === highlightedIndex
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-slate-300 hover:bg-white/5'
              )}
            >
              <User className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 uppercase">{char.name}</span>
              {char.name.toLowerCase() === inputValue.toLowerCase() && (
                <Check className="w-4 h-4 text-green-400" />
              )}
            </button>
          ))}

          {showCreateOption && (
            <button
              onClick={() => handleSelect(inputValue.trim().toUpperCase())}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors border-t border-white/10',
                highlightedIndex === filteredCharacters.length
                  ? 'bg-green-500/20 text-green-400'
                  : 'text-slate-300 hover:bg-white/5'
              )}
            >
              <Plus className="w-4 h-4 flex-shrink-0" />
              <span>
                Creer &quot;{inputValue.trim().toUpperCase()}&quot;
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
