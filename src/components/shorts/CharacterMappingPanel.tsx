'use client';

import { useEffect, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StorageImg } from '@/components/ui/storage-image';
import { Check, AlertCircle, Mic, User, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CharacterMapping } from '@/types/cinematic';
import type { ProjectAssetFlat } from '@/types/database';
import type { Plan } from '@/store/shorts-store';

interface CharacterMappingPanelProps {
  plans: Plan[];
  characters: ProjectAssetFlat[];
  mappings: CharacterMapping[] | null;
  onMappingsChange: (mappings: CharacterMapping[]) => void;
}

interface CharacterInfo {
  id: string;
  name: string;
  hasVoice: boolean;
  hasFalVoice: boolean;
  voiceName?: string;
  thumbnailUrl?: string;
}

export function CharacterMappingPanel({
  plans,
  characters,
  mappings,
  onMappingsChange,
}: CharacterMappingPanelProps) {

  // Extract unique character IDs from plans with dialogue
  const dialogueCharacterIds = useMemo(() => {
    const ids = new Set<string>();
    for (const plan of plans) {
      if (plan.dialogue_character_id) {
        ids.add(plan.dialogue_character_id);
      }
    }
    return Array.from(ids);
  }, [plans]);

  // Build character info map
  const characterInfo = useMemo(() => {
    const info: CharacterInfo[] = [];

    for (const charId of dialogueCharacterIds) {
      const character = characters.find(c => c.id === charId);
      if (!character) continue;

      const charData = character.data as Record<string, unknown> | null;

      info.push({
        id: character.id,
        name: character.name,
        hasVoice: !!(charData?.voice_id),
        hasFalVoice: !!(charData?.fal_voice_id),
        voiceName: charData?.voice_name as string | undefined,
        thumbnailUrl: character.reference_images?.[0],
      });
    }

    return info;
  }, [dialogueCharacterIds, characters]);

  // Current mappings map for easy lookup
  const mappingsMap = useMemo(() => {
    const map = new Map<string, CharacterMapping>();
    if (mappings) {
      for (const m of mappings) {
        map.set(m.character_id, m);
      }
    }
    return map;
  }, [mappings]);

  // Auto-generate mappings if empty
  useEffect(() => {
    if (!mappings || mappings.length === 0) {
      if (characterInfo.length > 0) {
        const autoMappings: CharacterMapping[] = characterInfo
          .slice(0, 4)
          .map((char, idx) => ({
            character_id: char.id,
            element_index: idx + 1,
            voice_index: Math.min(idx + 1, 2),
          }));
        onMappingsChange(autoMappings);
      }
    }
  }, [characterInfo, mappings, onMappingsChange]);

  // Update a mapping
  const updateMapping = (charId: string, field: 'element_index' | 'voice_index', value: number) => {
    const currentMappings = mappings || [];
    const existingIndex = currentMappings.findIndex(m => m.character_id === charId);

    let newMappings: CharacterMapping[];

    if (existingIndex >= 0) {
      newMappings = currentMappings.map((m, idx) =>
        idx === existingIndex ? { ...m, [field]: value } : m
      );
    } else {
      newMappings = [
        ...currentMappings,
        {
          character_id: charId,
          element_index: field === 'element_index' ? value : 1,
          voice_index: field === 'voice_index' ? value : 1,
        },
      ];
    }

    onMappingsChange(newMappings);
  };

  if (characterInfo.length === 0) {
    return (
      <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-center">
        <User className="w-8 h-8 text-slate-500 mx-auto mb-2" />
        <p className="text-sm text-slate-400">
          Aucun personnage avec dialogue détecté dans les plans.
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Ajoutez des dialogues aux plans pour activer le mapping.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-purple-400" />
        <Label className="text-slate-300 font-medium">Mapping des personnages</Label>
      </div>

      <div className="text-xs text-slate-500 mb-2">
        Assignez chaque personnage à un Element Kling (@Element1-4) et une voix (voice_1-2)
      </div>

      {/* Character cards */}
      <div className="space-y-2">
        {characterInfo.map((char) => {
          const mapping = mappingsMap.get(char.id);

          return (
            <div
              key={char.id}
              className="p-3 rounded-lg bg-white/5 border border-white/10 flex items-center gap-3"
            >
              {/* Thumbnail */}
              <div className="w-10 h-10 rounded-lg bg-slate-800 overflow-hidden flex-shrink-0">
                {char.thumbnailUrl ? (
                  <StorageImg
                    src={char.thumbnailUrl}
                    alt={char.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <User className="w-5 h-5 text-slate-600" />
                  </div>
                )}
              </div>

              {/* Name & Voice Status */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white text-sm truncate">
                  {char.name}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {/* ElevenLabs voice status */}
                  {char.hasVoice ? (
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <Check className="w-3 h-3" />
                      {char.voiceName || 'ElevenLabs'}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-red-400">
                      <AlertCircle className="w-3 h-3" />
                      Pas de voix
                    </span>
                  )}

                  {/* Fal voice status */}
                  {char.hasVoice && (
                    <>
                      <span className="text-slate-600">•</span>
                      {char.hasFalVoice ? (
                        <span className="flex items-center gap-1 text-xs text-purple-400">
                          <Check className="w-3 h-3" />
                          Kling
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-amber-400">
                          <AlertCircle className="w-3 h-3" />
                          Kling manquant
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Element selector */}
              <div className="flex-shrink-0">
                <Select
                  value={mapping?.element_index?.toString() || '1'}
                  onValueChange={(v) => updateMapping(char.id, 'element_index', parseInt(v))}
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white h-7 text-xs w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a2e44] border-white/10">
                    {[1, 2, 3, 4].map((idx) => (
                      <SelectItem key={idx} value={idx.toString()} className="text-xs">
                        @Element{idx}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Voice selector */}
              <div className="flex-shrink-0">
                <Select
                  value={mapping?.voice_index?.toString() || '1'}
                  onValueChange={(v) => updateMapping(char.id, 'voice_index', parseInt(v))}
                  disabled={!char.hasFalVoice}
                >
                  <SelectTrigger
                    className={cn(
                      "h-7 text-xs w-20",
                      char.hasFalVoice
                        ? "bg-white/5 border-white/10 text-white"
                        : "bg-slate-800/50 border-white/5 text-slate-500"
                    )}
                  >
                    <Mic className="w-3 h-3 mr-1" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a2e44] border-white/10">
                    {[1, 2].map((idx) => (
                      <SelectItem key={idx} value={idx.toString()} className="text-xs">
                        voice_{idx}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          );
        })}
      </div>

      {/* Info */}
      <div className="text-xs text-slate-500 bg-white/5 rounded-lg p-2">
        <p>
          <strong>@Element</strong> : Images de référence pour la cohérence visuelle (max 4)
        </p>
        <p className="mt-1">
          <strong>voice_</strong> : Voix pour les dialogues avec lip-sync natif Kling (max 2)
        </p>
      </div>
    </div>
  );
}
