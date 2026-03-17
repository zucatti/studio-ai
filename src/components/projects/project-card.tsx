'use client';

import Link from 'next/link';
import type { Project, PipelineStep } from '@/types/database';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { StorageImg } from '@/components/ui/storage-image';
import { MoreVertical, Trash2, Edit, Film, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectCardProps {
  project: Project;
  onDelete?: (id: string) => void;
  onEdit?: (project: Project) => void;
}

const PIPELINE_STEPS: { step: PipelineStep; label: string }[] = [
  { step: 'brainstorming', label: 'Brainstorming' },
  { step: 'script', label: 'Script' },
  { step: 'decoupage', label: 'Decoupage' },
  { step: 'storyboard', label: 'Storyboard' },
  { step: 'preprod', label: 'Preprod' },
  { step: 'production', label: 'Production' },
];

const statusConfig = {
  draft: {
    label: 'Brouillon',
    className: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  },
  in_progress: {
    label: 'En cours',
    className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  completed: {
    label: 'Terminé',
    className: 'bg-slate-400/20 text-slate-300 border-slate-400/30',
  },
};

export function ProjectCard({ project, onDelete, onEdit }: ProjectCardProps) {
  const currentStepInfo = PIPELINE_STEPS.find(
    (s) => s.step === project.current_step
  );
  const status = statusConfig[project.status];

  return (
    <div className="group relative rounded-xl overflow-hidden bg-[#151d28] border border-white/5 hover:border-white/20 transition-all duration-300 hover:shadow-xl hover:shadow-black/20">
      {/* Image / Thumbnail */}
      <Link href={`/project/${project.id}/${project.current_step}`}>
        <div className="aspect-video relative bg-[#0d1520] overflow-hidden">
          {project.thumbnail_url ? (
            <StorageImg
              src={project.thumbnail_url}
              alt={project.name}
              className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-800/50 to-slate-900/50">
              <Film className="w-12 h-12 text-slate-600" />
            </div>
          )}

          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

          {/* Title */}
          <div className="absolute bottom-3 left-3 right-3">
            <div className="inline-block px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm">
              <h3 className="text-sm font-medium text-white truncate">
                {project.name}
              </h3>
            </div>
          </div>

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <div className="flex items-center gap-2 text-white text-sm font-medium bg-black/50 px-4 py-2 rounded-full backdrop-blur-sm">
              <Play className="w-4 h-4" />
              Ouvrir
            </div>
          </div>
        </div>
      </Link>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {project.description && (
              <p className="text-sm text-slate-500 line-clamp-2 mb-3">
                {project.description}
              </p>
            )}

            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'text-xs px-2 py-1 rounded border',
                  status.className
                )}
              >
                {status.label}
              </span>
              <span className="text-xs text-slate-600">
                {currentStepInfo?.label}
              </span>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-500 hover:text-white hover:bg-white/5 flex-shrink-0"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[#1a2433] border-white/10">
              <DropdownMenuItem
                onClick={() => onEdit?.(project)}
                className="text-slate-300 focus:text-white focus:bg-white/5"
              >
                <Edit className="w-4 h-4 mr-2" />
                Modifier
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem
                className="text-red-400 focus:text-red-300 focus:bg-red-500/10"
                onClick={() => onDelete?.(project.id)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
