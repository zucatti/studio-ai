'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, FolderOpen } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRushCreatorStore } from '@/store/rush-creator-store';

interface Project {
  id: string;
  name: string;
}

export function RushProjectSelector() {
  const { currentProjectId, setCurrentProjectId } = useRushCreatorStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch user's projects
  useEffect(() => {
    async function fetchProjects() {
      try {
        const res = await fetch('/api/projects');
        if (res.ok) {
          const data = await res.json();
          setProjects(data.projects || []);
        }
      } catch (error) {
        console.error('[RushProjectSelector] Error fetching projects:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchProjects();
  }, []);

  const currentProject = projects.find(p => p.id === currentProjectId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
          <FolderOpen className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-white">
            {isLoading ? 'Chargement...' : currentProject?.name || 'Sélectionner un projet'}
          </span>
          <ChevronDown className="w-3 h-3 text-slate-500" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-[#1a2433] border-white/10 min-w-[200px]">
        {projects.length === 0 ? (
          <div className="px-3 py-2 text-sm text-slate-500">
            Aucun projet
          </div>
        ) : (
          projects.map((project) => (
            <DropdownMenuItem
              key={project.id}
              onClick={() => setCurrentProjectId(project.id)}
              className={`text-slate-300 focus:text-white focus:bg-white/5 ${
                project.id === currentProjectId ? 'bg-white/5' : ''
              }`}
            >
              {project.name}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
