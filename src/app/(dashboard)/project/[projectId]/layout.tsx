'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PipelineStepper } from '@/components/layout/pipeline-stepper';
import { useProject } from '@/hooks/use-project';
import { ArrowLeft, Film, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { projectId, project, currentStep, isLoading, error } = useProject();

  useEffect(() => {
    if (!isLoading && error) {
      router.push('/projects');
    }
  }, [isLoading, error, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-slate-500">Chargement du projet...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
            <Film className="w-6 h-6 text-slate-600" />
          </div>
          <p className="text-slate-500">Projet non trouvé</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Project Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="text-slate-500 hover:text-white hover:bg-white/5 rounded-xl"
        >
          <Link href="/projects">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white truncate">
            {project.name}
          </h1>
          {project.description && (
            <p className="text-slate-500 text-sm truncate">
              {project.description}
            </p>
          )}
        </div>
      </div>

      {/* Pipeline Stepper */}
      <PipelineStepper
        projectId={projectId!}
        currentStep={currentStep}
      />

      {/* Page Content */}
      <div className="mt-6">{children}</div>
    </div>
  );
}
