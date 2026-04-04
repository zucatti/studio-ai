'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TimelineEditor } from '@/components/montage';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useShortsStore } from '@/store/shorts-store';
import type { AspectRatio } from '@/types/database';

export default function TimelineEditorPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const shortId = params.shortId as string;

  const { shorts, isLoading, fetchShorts, getShortById } = useShortsStore();
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');

  // Fetch shorts and project data
  useEffect(() => {
    fetchShorts(projectId);
  }, [projectId, fetchShorts]);

  // Get current short
  const short = getShortById(shortId);

  // Fetch project aspect ratio
  useEffect(() => {
    const fetchProject = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}`);
        if (response.ok) {
          const project = await response.json();
          setAspectRatio(project.aspect_ratio || '9:16');
        }
      } catch (error) {
        console.error('Failed to fetch project:', error);
      }
    };
    fetchProject();
  }, [projectId]);

  if (isLoading || !short) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/10">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/project/${projectId}/shorts/${shortId}`)}
          className="gap-1.5 h-7 px-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour
        </Button>

        <div className="flex-1">
          <h1 className="text-sm font-medium text-white">{short.title}</h1>
        </div>
      </div>

      {/* Timeline Editor */}
      <TimelineEditor
        projectId={projectId}
        shortId={shortId}
        aspectRatio={aspectRatio}
        className="flex-1 min-h-0"
      />
    </div>
  );
}
