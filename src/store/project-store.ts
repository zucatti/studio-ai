import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Project, PipelineStep } from '@/types/project';

interface ProjectStore {
  projects: Project[];
  currentProject: Project | null;
  currentStep: PipelineStep;

  // Actions
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  updateProject: (id: string, data: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  setCurrentProject: (project: Project | null) => void;
  setCurrentStep: (step: PipelineStep) => void;
  getProject: (id: string) => Project | undefined;
}

// Mock data for initial projects
const mockProjects: Project[] = [
  {
    id: '1',
    name: 'Court-métrage Sci-Fi',
    description: 'Un voyage dans l\'espace en 2150',
    status: 'in_progress',
    currentStep: 'script',
    userId: 'user_1',
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-20'),
  },
  {
    id: '2',
    name: 'Publicité Produit',
    description: 'Spot publicitaire pour nouveau smartphone',
    status: 'draft',
    currentStep: 'brainstorming',
    userId: 'user_1',
    createdAt: new Date('2024-01-18'),
    updatedAt: new Date('2024-01-18'),
  },
];

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      projects: mockProjects,
      currentProject: null,
      currentStep: 'brainstorming',

      setProjects: (projects) => set({ projects }),

      addProject: (project) =>
        set((state) => ({
          projects: [...state.projects, project],
        })),

      updateProject: (id, data) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...data, updatedAt: new Date() } : p
          ),
          currentProject:
            state.currentProject?.id === id
              ? { ...state.currentProject, ...data, updatedAt: new Date() }
              : state.currentProject,
        })),

      deleteProject: (id) =>
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          currentProject:
            state.currentProject?.id === id ? null : state.currentProject,
        })),

      setCurrentProject: (project) => set({ currentProject: project }),

      setCurrentStep: (step) =>
        set((state) => {
          if (state.currentProject) {
            return {
              currentStep: step,
              currentProject: { ...state.currentProject, currentStep: step },
            };
          }
          return { currentStep: step };
        }),

      getProject: (id) => get().projects.find((p) => p.id === id),
    }),
    {
      name: 'project-storage',
    }
  )
);
