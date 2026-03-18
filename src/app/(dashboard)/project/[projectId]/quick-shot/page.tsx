'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { QuickShotGenerator } from '@/components/quick-shot/QuickShotGenerator';
import { ImageSelectionGrid } from '@/components/quick-shot/ImageSelectionGrid';
import { ProjectBibleButton } from '@/components/bible/ProjectBible';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRight, Trash2 } from 'lucide-react';
import type { Shot, Project, ShotStatus } from '@/types/database';

export default function QuickShotPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isMovingToGallery, setIsMovingToGallery] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [projectRes, shotsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/shots?status=draft`),
      ]);

      if (projectRes.ok) {
        const data = await projectRes.json();
        setProject(data.project);
      }

      if (shotsRes.ok) {
        const data = await shotsRes.json();
        // Filter to only show shots without scene_id (quick shots)
        const quickShots = (data.shots || []).filter((s: Shot) => !s.scene_id);
        setShots(quickShots);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleShotsGenerated = (newShots: Shot[]) => {
    setShots((prev) => [...newShots, ...prev]);
  };

  const handleUpdateStatus = async (shotId: string, status: ShotStatus) => {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/shots/${shotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        setShots((prev) =>
          prev.map((s) => (s.id === shotId ? { ...s, status } : s))
        );
      }
    } catch (error) {
      console.error('Failed to update shot:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleMoveSelectedToGallery = async () => {
    const selectedShots = shots.filter((s) => s.status === 'selected');
    if (selectedShots.length === 0) return;

    setIsMovingToGallery(true);
    try {
      // Already marked as selected, just navigate to gallery
      router.push(`/project/${projectId}/gallery`);
    } finally {
      setIsMovingToGallery(false);
    }
  };

  const handleMoveOthersToRushes = async () => {
    const draftShots = shots.filter((s) => s.status === 'draft');
    if (draftShots.length === 0) return;

    setIsUpdating(true);
    try {
      // Update all draft shots to rush status
      await Promise.all(
        draftShots.map((shot) =>
          fetch(`/api/projects/${projectId}/shots/${shot.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'rush' }),
          })
        )
      );

      // Remove from current view
      setShots((prev) => prev.filter((s) => s.status === 'selected'));
    } catch (error) {
      console.error('Failed to move shots to rushes:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const selectedCount = shots.filter((s) => s.status === 'selected').length;
  const draftCount = shots.filter((s) => s.status === 'draft').length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Quick Shot</h1>
          <p className="text-slate-500 text-sm mt-1">
            Generez rapidement des images a partir de votre Bible
          </p>
        </div>
        <ProjectBibleButton projectId={projectId} />
      </div>

      {/* Generator */}
      <QuickShotGenerator
        projectId={projectId}
        defaultAspectRatio={project?.aspect_ratio || '2:3'}
        onShotsGenerated={handleShotsGenerated}
      />

      {/* Results */}
      {shots.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              Resultats ({shots.length})
            </h2>
            <div className="flex items-center gap-3">
              {selectedCount > 0 && (
                <Button
                  onClick={handleMoveSelectedToGallery}
                  disabled={isMovingToGallery}
                  className="bg-yellow-500 hover:bg-yellow-600 text-black"
                >
                  {isMovingToGallery ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4 mr-2" />
                  )}
                  Garder {selectedCount} vers Gallery
                </Button>
              )}
              {draftCount > 0 && (
                <Button
                  onClick={handleMoveOthersToRushes}
                  disabled={isUpdating}
                  variant="outline"
                  className="border-white/10 text-slate-400 hover:text-white hover:bg-white/5"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Autres vers Rushes
                </Button>
              )}
            </div>
          </div>

          <div className="text-sm text-slate-500 mb-2">
            Cliquez sur une image pour la selectionner
          </div>

          <ImageSelectionGrid
            shots={shots}
            onUpdateStatus={handleUpdateStatus}
            isUpdating={isUpdating}
          />
        </div>
      )}
    </div>
  );
}
