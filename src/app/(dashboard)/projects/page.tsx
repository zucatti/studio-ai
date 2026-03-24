'use client';

import { useState } from 'react';
import { Plus, Search, FolderOpen, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProjectCard } from '@/components/projects/project-card';
import { CreateProjectDialog } from '@/components/projects/create-project-dialog';
import { useProjects } from '@/hooks/use-projects';
import type { Project, AspectRatio, ProjectType } from '@/types/database';

export default function ProjectsPage() {
  const { projects, isLoading, createProject, updateProject, deleteProject } = useProjects();
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const filteredProjects = projects.filter(
    (project) =>
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce projet ?')) {
      await deleteProject(id);
    }
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingProject(null);
    }
  };

  const handleCreateOrUpdate = async (name: string, description?: string, thumbnailUrl?: string, aspectRatio?: AspectRatio, projectType?: ProjectType, focalPoint?: { x: number; y: number }, masterAudioId?: string) => {
    if (editingProject) {
      await updateProject(editingProject.id, {
        name,
        description,
        thumbnail_url: thumbnailUrl || null,
        thumbnail_focal_point: focalPoint || { x: 50, y: 25 },
        aspect_ratio: aspectRatio || '16:9',
      });
    } else {
      await createProject(name, description, thumbnailUrl, aspectRatio, projectType, focalPoint, masterAudioId);
    }
    setDialogOpen(false);
    setEditingProject(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-slate-400">Chargement des projets...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Mes projets</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Gérez vos projets de production vidéo IA
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-blue-500 hover:bg-blue-600 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nouveau projet
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Rechercher un projet..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 pl-9 bg-[#1a2433] border-0 text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-blue-500/50 rounded-lg"
          />
        </div>
      </div>

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mb-6">
            <FolderOpen className="w-10 h-10 text-slate-600" />
          </div>
          <div className="text-center">
            {searchQuery ? (
              <p className="text-slate-500">Aucun projet ne correspond à votre recherche.</p>
            ) : (
              <>
                <p className="text-slate-400 text-lg">Vous n&apos;avez pas encore de projet</p>
                <p className="text-slate-600 mt-1">
                  Créez votre premier projet pour commencer.
                </p>
              </>
            )}
          </div>
          {!searchQuery && (
            <Button
              className="mt-6 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => setDialogOpen(true)}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Créer un projet
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <CreateProjectDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        editProject={editingProject}
        onSubmit={handleCreateOrUpdate}
      />
    </div>
  );
}
