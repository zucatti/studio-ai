'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Wand2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProjectMentionText } from '@/components/ui/project-mention-text';
import { ShotCard } from './ShotCard';
import type { ShotType, CameraAngle, CameraMovement } from '@/types/shot';

interface Character {
  id: string;
  name: string;
}

interface Shot {
  id: string;
  shot_number: number;
  description: string;
  shot_type: ShotType | null;
  camera_angle: CameraAngle | null;
  camera_movement: CameraMovement | null;
  camera_notes: string | null;
  storyboard_image_url: string | null;
  start_time: number | null;
  end_time: number | null;
  has_vocals: boolean;
  lip_sync_enabled: boolean;
  singing_character_id: string | null;
}

interface Scene {
  id: string;
  scene_number: number;
  int_ext: string;
  location: string;
  time_of_day: string;
  description: string | null;
}

interface SceneDecoupageProps {
  scene: Scene;
  shots: Shot[];
  characters: Character[];
  hasAudio: boolean;
  currentAudioTime: number;
  isExpanded: boolean;
  onToggle: () => void;
  onAddShot: () => void;
  onGenerateShots: () => void;
  onUpdateShot: (shotId: string, updates: Partial<Shot>) => void;
  onDeleteShot: (shotId: string) => void;
  onReorderShot: (shotId: string, direction: 'up' | 'down') => void;
  isGenerating?: boolean;
}

export function SceneDecoupage({
  scene,
  shots,
  characters,
  hasAudio,
  currentAudioTime,
  isExpanded,
  onToggle,
  onAddShot,
  onGenerateShots,
  onUpdateShot,
  onDeleteShot,
  onReorderShot,
  isGenerating = false,
}: SceneDecoupageProps) {
  const sortedShots = [...shots].sort((a, b) => a.shot_number - b.shot_number);
  const shotsWithStoryboard = shots.filter((s) => s.storyboard_image_url);
  const shotsWithTimeline = shots.filter((s) => s.start_time !== null);

  return (
    <Card className="bg-gradient-to-br from-[#1e3a52] to-[#1a3048] border-white/10">
      <CardHeader
        className="cursor-pointer hover:bg-white/5 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-slate-400" />
          )}

          <div className="flex-1">
            <CardTitle className="text-white font-mono text-sm">
              SCENE {scene.scene_number} - {scene.int_ext}. {scene.location} -{' '}
              {scene.time_of_day}
            </CardTitle>
            {scene.description && (
              <p className="text-sm text-slate-400 mt-1">
                <ProjectMentionText text={scene.description} />
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 bg-white/5 px-2 py-1 rounded">
              {shots.length} plan{shots.length > 1 ? 's' : ''}
            </span>
            {shotsWithStoryboard.length > 0 && (
              <span className="text-xs text-green-500 bg-green-500/10 px-2 py-1 rounded">
                {shotsWithStoryboard.length} storyboard{shotsWithStoryboard.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-4 space-y-4">
          {/* Actions bar */}
          <div className="flex items-center gap-2 pb-3 border-b border-white/5">
            <Button
              variant="outline"
              size="sm"
              onClick={onAddShot}
              className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
            >
              <Plus className="w-4 h-4 mr-2" />
              Ajouter un plan
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onGenerateShots}
              disabled={isGenerating}
              className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generation...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-2" />
                  Generer plans IA
                </>
              )}
            </Button>
          </div>

          {/* Shots */}
          {sortedShots.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-400 text-sm">Aucun plan dans cette scene.</p>
              <p className="text-slate-500 text-xs mt-1">
                Ajoutez des plans manuellement ou generez-les avec l&apos;IA.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedShots.map((shot, index) => (
                <ShotCard
                  key={shot.id}
                  shot={shot}
                  sceneNumber={scene.scene_number}
                  characters={characters}
                  hasAudio={hasAudio}
                  currentAudioTime={currentAudioTime}
                  onUpdate={(updates) => onUpdateShot(shot.id, updates)}
                  onDelete={() => onDeleteShot(shot.id)}
                  onMoveUp={() => onReorderShot(shot.id, 'up')}
                  onMoveDown={() => onReorderShot(shot.id, 'down')}
                  isFirst={index === 0}
                  isLast={index === sortedShots.length - 1}
                />
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
