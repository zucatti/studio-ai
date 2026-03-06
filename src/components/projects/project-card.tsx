'use client';

import Link from 'next/link';
import type { Project, PipelineStep } from '@/types/database';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
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
  { step: 'storyboard', label: 'Storyboard' },
  { step: 'library', label: 'Bibliothèque' },
  { step: 'preprod', label: 'Préprod' },
  { step: 'production', label: 'Production' },
];

const statusConfig = {
  draft: {
    label: 'Brouillon',
    className: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  in_progress: {
    label: 'En cours',
    className: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  completed: {
    label: 'Terminé',
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
};

export function ProjectCard({ project, onDelete, onEdit }: ProjectCardProps) {
  const currentStepInfo = PIPELINE_STEPS.find(
    (s) => s.step === project.current_step
  );
  const status = statusConfig[project.status];

  return (
    <Card className="group overflow-hidden bg-gradient-to-br from-[#1e3a52] to-[#1a3048] border-white/5 hover:border-blue-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/5">
      <Link href={`/project/${project.id}/${project.current_step}`}>
        <div className="aspect-video relative bg-[#0f1f2e] flex items-center justify-center overflow-hidden">
          {project.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={project.thumbnail_url}
              alt={project.name}
              className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-slate-600">
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
                <Film className="w-8 h-8" />
              </div>
              <span className="text-xs font-medium">Pas d&apos;aperçu</span>
            </div>
          )}

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-6">
            <div className="flex items-center gap-2 text-white text-sm font-medium">
              <Play className="w-4 h-4" />
              Ouvrir le projet
            </div>
          </div>
        </div>
      </Link>

      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/project/${project.id}/${project.current_step}`} className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg text-white hover:text-blue-400 transition-colors line-clamp-1">
              {project.name}
            </h3>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-white hover:bg-white/5">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[#1e3a52] border-white/10">
              <DropdownMenuItem onClick={() => onEdit?.(project)} className="text-slate-300 focus:text-white focus:bg-white/5">
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
        {project.description && (
          <p className="text-sm text-slate-500 mt-1.5 line-clamp-2">
            {project.description}
          </p>
        )}
      </CardContent>

      <CardFooter className="p-4 pt-0 flex items-center justify-between">
        <Badge variant="outline" className={cn('border', status.className)}>
          {status.label}
        </Badge>
        <span className="text-xs text-slate-600 font-medium">
          {currentStepInfo?.label}
        </span>
      </CardFooter>
    </Card>
  );
}
