'use client';

import { Clock, Mic, MicOff, User } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Character {
  id: string;
  name: string;
}

interface TimelineBindingProps {
  startTime: number | null;
  endTime: number | null;
  hasVocals: boolean;
  lipSyncEnabled: boolean;
  singingCharacterId: string | null;
  characters: Character[];
  currentTime?: number;
  onSetStartTime: () => void;
  onSetEndTime: () => void;
  onToggleVocals: () => void;
  onSetSingingCharacter: (characterId: string | null) => void;
}

function formatTime(seconds: number | null): string {
  if (seconds === null) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function TimelineBinding({
  startTime,
  endTime,
  hasVocals,
  lipSyncEnabled,
  singingCharacterId,
  characters,
  currentTime = 0,
  onSetStartTime,
  onSetEndTime,
  onToggleVocals,
  onSetSingingCharacter,
}: TimelineBindingProps) {
  const duration = startTime !== null && endTime !== null ? endTime - startTime : null;

  return (
    <div className="flex items-center gap-4 flex-wrap p-3 bg-purple-500/5 rounded-lg border border-purple-500/20">
      {/* Time binding */}
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-purple-400" />
        <button
          onClick={onSetStartTime}
          className="text-xs font-mono bg-purple-500/20 text-purple-300 px-2 py-1 rounded hover:bg-purple-500/30 transition-colors"
          title={`Definir au temps actuel (${formatTime(currentTime)})`}
        >
          {formatTime(startTime)}
        </button>
        <span className="text-slate-500">-</span>
        <button
          onClick={onSetEndTime}
          className="text-xs font-mono bg-purple-500/20 text-purple-300 px-2 py-1 rounded hover:bg-purple-500/30 transition-colors"
          title={`Definir au temps actuel (${formatTime(currentTime)})`}
        >
          {formatTime(endTime)}
        </button>
        {duration !== null && (
          <span className="text-xs text-slate-500">
            ({formatTime(duration)})
          </span>
        )}
      </div>

      {/* Vocals toggle */}
      <button
        onClick={onToggleVocals}
        className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors ${
          hasVocals
            ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
            : 'bg-white/5 text-slate-400 hover:bg-white/10'
        }`}
        title={hasVocals ? 'Lip sync active' : 'Activer lip sync'}
      >
        {hasVocals ? (
          <Mic className="w-3.5 h-3.5" />
        ) : (
          <MicOff className="w-3.5 h-3.5" />
        )}
        {hasVocals ? 'Lip Sync' : 'Pas de lip sync'}
      </button>

      {/* Character selector for lip sync */}
      {hasVocals && characters.length > 0 && (
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-red-400" />
          <Select
            value={singingCharacterId || 'none'}
            onValueChange={(v) => onSetSingingCharacter(v === 'none' ? null : v)}
          >
            <SelectTrigger className="h-7 w-32 bg-white/5 border-white/10 text-white text-xs">
              <SelectValue placeholder="Personnage" />
            </SelectTrigger>
            <SelectContent className="bg-[#1a2433] border-white/10">
              <SelectItem value="none" className="text-slate-400 text-xs">
                Non defini
              </SelectItem>
              {characters.map((char) => (
                <SelectItem
                  key={char.id}
                  value={char.id}
                  className="text-white text-xs"
                >
                  {char.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
