'use client';

import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Plus,
  Film,
  Clock,
  Loader2,
  AlertCircle,
  Trash2,
  Play,
  Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSectionSequence } from '@/hooks/use-section-sequence';
import type { MusicSection } from '@/types/database';

interface SectionSequenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  section: MusicSection | null;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export function SectionSequenceModal({
  isOpen,
  onClose,
  projectId,
  section,
}: SectionSequenceModalProps) {
  const {
    sequence,
    shots,
    sectionDuration,
    isLoading,
    error,
    createSequence,
    createShot,
    updateShot,
    deleteShot,
  } = useSectionSequence(projectId, section);

  const [isCreating, setIsCreating] = useState(false);

  // Calculate totals and suggestions
  const totalShotsDuration = useMemo(() => {
    return shots.reduce((acc, shot) => acc + (shot.duration || 0), 0);
  }, [shots]);

  const remainingDuration = sectionDuration - totalShotsDuration;

  const suggestedDuration = useMemo(() => {
    if (shots.length === 0) {
      // No shots yet - suggest dividing section into reasonable chunks
      if (sectionDuration <= 10) return sectionDuration;
      if (sectionDuration <= 30) return Math.ceil(sectionDuration / 3);
      return 10; // Default to 10s for longer sections
    }
    // Suggest filling remaining time, min 3s
    return Math.max(3, Math.min(remainingDuration, 10));
  }, [shots.length, sectionDuration, remainingDuration]);

  const handleCreateSequence = async () => {
    setIsCreating(true);
    try {
      await createSequence(section?.name);
    } finally {
      setIsCreating(false);
    }
  };

  const handleAddShot = async () => {
    if (!sequence) return;
    await createShot('', suggestedDuration);
  };

  const handleDeleteShot = async (shotId: string) => {
    if (confirm('Supprimer ce plan ?')) {
      await deleteShot(shotId);
    }
  };

  const handleDurationChange = async (shotId: string, newDuration: number) => {
    await updateShot(shotId, { duration: newDuration });
  };

  if (!isOpen || !section) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-[90vw] max-w-4xl h-[85vh] max-h-[700px] bg-[#0f1419] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Film className="w-5 h-5 text-purple-400" />
              <h2 className="text-lg font-semibold text-white">{section.name}</h2>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Clock className="w-4 h-4" />
              <span>{formatDuration(sectionDuration)}</span>
            </div>
            {sequence && (
              <div
                className={cn(
                  'px-2 py-0.5 rounded text-xs font-medium',
                  Math.abs(remainingDuration) < 1
                    ? 'bg-green-500/20 text-green-400'
                    : remainingDuration > 0
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-red-500/20 text-red-400'
                )}
              >
                {remainingDuration > 0
                  ? `${formatDuration(remainingDuration)} restant`
                  : remainingDuration < 0
                  ? `${formatDuration(Math.abs(remainingDuration))} de trop`
                  : 'Durée parfaite'}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 text-red-400">
              <AlertCircle className="w-12 h-12 mb-3" />
              <p>{error}</p>
            </div>
          ) : !sequence ? (
            /* No sequence - prompt to create */
            <div className="flex flex-col items-center justify-center h-64">
              <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-4">
                <Film className="w-8 h-8 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Créer une séquence visuelle
              </h3>
              <p className="text-slate-400 text-center max-w-md mb-6">
                Cette section n&apos;a pas encore de contenu visuel.
                Créez une séquence pour y ajouter des plans vidéo.
              </p>
              <Button
                onClick={handleCreateSequence}
                disabled={isCreating}
                className="bg-purple-500 hover:bg-purple-600"
              >
                {isCreating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Créer la séquence
              </Button>
            </div>
          ) : (
            /* Sequence exists - show shots */
            <div className="space-y-4">
              {/* Duration bar */}
              <div className="bg-white/5 rounded-lg p-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-slate-400">Progression</span>
                  <span className="text-white font-medium">
                    {formatDuration(totalShotsDuration)} / {formatDuration(sectionDuration)}
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full transition-all',
                      totalShotsDuration <= sectionDuration
                        ? 'bg-purple-500'
                        : 'bg-red-500'
                    )}
                    style={{
                      width: `${Math.min(100, (totalShotsDuration / sectionDuration) * 100)}%`,
                    }}
                  />
                </div>
              </div>

              {/* Shots list */}
              {shots.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p>Aucun plan. Ajoutez-en un pour commencer.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {shots.map((shot, index) => (
                    <div
                      key={shot.id}
                      className="bg-white/5 border border-white/10 rounded-lg p-4 hover:border-white/20 transition-colors"
                    >
                      <div className="flex items-start gap-4">
                        {/* Thumbnail */}
                        <div className="w-24 h-16 rounded bg-slate-800 flex-shrink-0 flex items-center justify-center overflow-hidden">
                          {shot.storyboard_image_url || shot.generated_video_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={shot.storyboard_image_url || shot.generated_video_url}
                              alt={`Plan ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="w-6 h-6 text-slate-600" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-white">
                              Plan {index + 1}
                            </span>
                            {shot.generated_video_url && (
                              <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                                Vidéo
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-400 line-clamp-2">
                            {shot.description || 'Pas de description'}
                          </p>
                        </div>

                        {/* Duration control */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={shot.duration}
                            onChange={(e) =>
                              handleDurationChange(shot.id, Number(e.target.value))
                            }
                            className="w-16 h-8 px-2 bg-white/5 border border-white/10 rounded text-white text-sm text-center focus:outline-none focus:border-purple-500"
                          />
                          <span className="text-sm text-slate-500">s</span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleDeleteShot(shot.id)}
                            className="p-2 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add shot button */}
              <button
                onClick={handleAddShot}
                className="w-full py-4 border-2 border-dashed border-white/10 rounded-lg text-slate-400 hover:text-white hover:border-purple-500/50 hover:bg-purple-500/5 transition-all flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                <span>
                  Ajouter un plan
                  {remainingDuration > 0 && (
                    <span className="text-slate-500 ml-1">
                      (suggéré: {suggestedDuration}s)
                    </span>
                  )}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {sequence && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 flex-shrink-0 bg-black/30">
            <div className="text-sm text-slate-500">
              {shots.length} plan{shots.length !== 1 ? 's' : ''} •{' '}
              {formatDuration(totalShotsDuration)} sur {formatDuration(sectionDuration)}
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={onClose}>
                Fermer
              </Button>
              <Button
                disabled={shots.length === 0}
                className="bg-purple-500 hover:bg-purple-600"
              >
                <Play className="w-4 h-4 mr-2" />
                Générer les vidéos
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
