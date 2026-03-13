'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useProject } from '@/hooks/use-project';
import { Film, Loader2 } from 'lucide-react';
import { BibleSidebar } from '@/components/bible/BibleSidebar';

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { project, isLoading, error } = useProject();

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
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>

      {/* Bible Sidebar - transversal across all project pages */}
      <BibleSidebar />
    </div>
  );
}
