'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TimelineEditor } from '@/components/montage';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Pencil, Layers, Sparkles } from 'lucide-react';
import { useShortsStore } from '@/store/shorts-store';
import { useProject } from '@/hooks/use-project';
import { formatDuration } from '@/components/shorts/DurationPicker';
import { cn } from '@/lib/utils';
import type { AspectRatio } from '@/types/database';

export default function TimelineEditorPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const shortId = params.shortId as string;

  const { shorts, isLoading, fetchShorts, getShortById } = useShortsStore();
  const { project } = useProject();
  const aspectRatio: AspectRatio = (project?.aspect_ratio as AspectRatio) || '16:9';

  // Fetch shorts and project data
  useEffect(() => {
    fetchShorts(projectId);
  }, [projectId, fetchShorts]);

  // Get current short
  const short = getShortById(shortId);

  if (isLoading || !short) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Compact Header - same as Edition page */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/project/${projectId}/shorts`)}
            className="text-slate-400 hover:text-white h-8 w-8"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          {/* Title */}
          <h1 className="text-base font-medium text-white">
            {short.title}
          </h1>

          {/* Compact info badges */}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{short.plans.length} plans</span>
            <span>•</span>
            <span>{formatDuration(short.totalDuration)}</span>
            <span>•</span>
            <span>{aspectRatio}</span>
          </div>

          {/* Separator */}
          <div className="w-px h-5 bg-white/10 mx-2" />

          {/* Integrated Tab Switch */}
          <div className="inline-flex rounded-md bg-white/5 p-0.5">
            <button
              onClick={() => router.push(`/project/${projectId}/shorts/${shortId}`)}
              className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all text-slate-400 hover:text-white"
            >
              <Pencil className="w-3 h-3" />
              Édition
            </button>
            <button
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all",
                "bg-white/10 text-white"
              )}
            >
              <Layers className="w-3 h-3" />
              Timeline
            </button>
          </div>
        </div>

        {/* Right side - cinematic badge */}
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 text-xs font-medium">
          <Sparkles className="w-3 h-3" />
          Cinématique
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
