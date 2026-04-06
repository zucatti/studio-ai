'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ShortsList } from '@/components/shorts/ShortsList';
import { ProjectBibleButton } from '@/components/bible/ProjectBible';
import { useShortsStore } from '@/store/shorts-store';
import { useProject } from '@/hooks/use-project';
import type { AspectRatio } from '@/types/database';

export default function ShortsPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const { project } = useProject();
  const aspectRatio: AspectRatio = (project?.aspect_ratio as AspectRatio) || '16:9';

  const {
    shorts,
    isLoading,
    fetchShorts,
    createShort,
    deleteShort,
    updateShort,
  } = useShortsStore();

  useEffect(() => {
    fetchShorts(projectId);
  }, [projectId, fetchShorts]);

  const handleCreateShort = async (title: string) => {
    await createShort(projectId, title);
  };

  const handleDeleteShort = async (shortId: string) => {
    await deleteShort(projectId, shortId);
  };

  const handleUpdateShort = async (shortId: string, updates: { title?: string; description?: string }) => {
    await updateShort(projectId, shortId, updates);
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header with Bible button */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Shorts</h1>
          <p className="text-slate-500 text-sm mt-1">
            Créez et gérez vos vidéos courtes
          </p>
        </div>
        <ProjectBibleButton projectId={projectId} />
      </div>

      {/* Shorts list */}
      <ShortsList
        shorts={shorts}
        projectId={projectId}
        aspectRatio={aspectRatio}
        isLoading={isLoading}
        onCreateShort={handleCreateShort}
        onDeleteShort={handleDeleteShort}
        onUpdateShort={handleUpdateShort}
      />
    </div>
  );
}
