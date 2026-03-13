import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Scene } from '@/types/scene';
import { Shot } from '@/types/shot';

interface SceneStore {
  scenes: Scene[];
  currentScene: Scene | null;
  currentShot: Shot | null;
  brainstormingContent: Record<string, string>;

  // Scene actions
  setScenes: (scenes: Scene[]) => void;
  addScene: (scene: Scene) => void;
  updateScene: (id: string, data: Partial<Scene>) => void;
  deleteScene: (id: string) => void;
  setCurrentScene: (scene: Scene | null) => void;
  getScenesByProject: (projectId: string) => Scene[];

  // Shot actions
  addShot: (sceneId: string, shot: Shot) => void;
  updateShot: (sceneId: string, shotId: string, data: Partial<Shot>) => void;
  deleteShot: (sceneId: string, shotId: string) => void;
  setCurrentShot: (shot: Shot | null) => void;

  // Brainstorming
  setBrainstormingContent: (projectId: string, content: string) => void;
  getBrainstormingContent: (projectId: string) => string;
}

// Mock data
const mockScenes: Scene[] = [
  {
    id: 'scene_1',
    projectId: '1',
    sceneNumber: 1,
    heading: {
      intExt: 'INT',
      location: 'VAISSEAU SPATIAL - COCKPIT',
      timeOfDay: 'NUIT',
    },
    description: 'Le capitaine observe les étoiles à travers le hublot.',
    shots: [
      {
        id: 'shot_1',
        sceneId: 'scene_1',
        shotNumber: 1,
        description: 'Plan large du cockpit avec le capitaine assis',
        dialogues: [],
        actions: [
          { id: 'action_1', description: 'Le capitaine regarde par le hublot', order: 0 },
        ],
        cameraAnnotation: {
          angle: 'eye_level',
          movement: 'static',
          shotType: 'wide',
        },
        generationStatus: 'not_started',
        order: 0,
      },
      {
        id: 'shot_2',
        sceneId: 'scene_1',
        shotNumber: 2,
        description: 'Gros plan sur le visage du capitaine',
        dialogues: [
          {
            id: 'dialogue_1',
            characterName: 'CAPITAINE',
            text: 'Nous y sommes presque...',
            order: 0,
          },
        ],
        actions: [],
        cameraAnnotation: {
          angle: 'eye_level',
          shotType: 'close_up',
        },
        generationStatus: 'not_started',
        order: 1,
      },
    ],
    order: 0,
  },
  {
    id: 'scene_2',
    projectId: '1',
    sceneNumber: 2,
    heading: {
      intExt: 'EXT',
      location: 'ESPACE - PRÈS DE LA PLANÈTE',
      timeOfDay: 'NUIT',
    },
    description: 'Le vaisseau s\'approche de la planète inconnue.',
    shots: [
      {
        id: 'shot_3',
        sceneId: 'scene_2',
        shotNumber: 1,
        description: 'Plan large du vaisseau avec la planète en arrière-plan',
        dialogues: [],
        actions: [],
        cameraAnnotation: {
          angle: 'eye_level',
          movement: 'tracking_side',
          shotType: 'wide',
        },
        generationStatus: 'not_started',
        order: 0,
      },
    ],
    order: 1,
  },
];

const mockBrainstorming: Record<string, string> = {
  '1': `# Court-métrage Sci-Fi

## Concept
Un voyage interstellaire vers une nouvelle planète habitable en 2150.

## Thèmes
- Espoir et découverte
- Solitude dans l'espace
- Humanité face à l'inconnu

## Personnages principaux
- Capitaine Elena Rodriguez
- Lieutenant Tom Chen
- IA du vaisseau: ARIA

## Notes visuelles
- Esthétique épurée, high-tech
- Couleurs froides avec touches de chaleur humaine
- Inspiré de 2001, Interstellar, Arrival`,
};

export const useSceneStore = create<SceneStore>()(
  persist(
    (set, get) => ({
      scenes: mockScenes,
      currentScene: null,
      currentShot: null,
      brainstormingContent: mockBrainstorming,

      setScenes: (scenes) => set({ scenes }),

      addScene: (scene) =>
        set((state) => ({
          scenes: [...state.scenes, scene],
        })),

      updateScene: (id, data) =>
        set((state) => ({
          scenes: state.scenes.map((s) =>
            s.id === id ? { ...s, ...data } : s
          ),
          currentScene:
            state.currentScene?.id === id
              ? { ...state.currentScene, ...data }
              : state.currentScene,
        })),

      deleteScene: (id) =>
        set((state) => ({
          scenes: state.scenes.filter((s) => s.id !== id),
          currentScene:
            state.currentScene?.id === id ? null : state.currentScene,
        })),

      setCurrentScene: (scene) => set({ currentScene: scene }),

      getScenesByProject: (projectId) =>
        get().scenes.filter((s) => s.projectId === projectId),

      addShot: (sceneId, shot) =>
        set((state) => ({
          scenes: state.scenes.map((s) =>
            s.id === sceneId ? { ...s, shots: [...s.shots, shot] } : s
          ),
        })),

      updateShot: (sceneId, shotId, data) =>
        set((state) => ({
          scenes: state.scenes.map((s) =>
            s.id === sceneId
              ? {
                  ...s,
                  shots: s.shots.map((shot) =>
                    shot.id === shotId ? { ...shot, ...data } : shot
                  ),
                }
              : s
          ),
          currentShot:
            state.currentShot?.id === shotId
              ? { ...state.currentShot, ...data }
              : state.currentShot,
        })),

      deleteShot: (sceneId, shotId) =>
        set((state) => ({
          scenes: state.scenes.map((s) =>
            s.id === sceneId
              ? { ...s, shots: s.shots.filter((shot) => shot.id !== shotId) }
              : s
          ),
          currentShot:
            state.currentShot?.id === shotId ? null : state.currentShot,
        })),

      setCurrentShot: (shot) => set({ currentShot: shot }),

      setBrainstormingContent: (projectId, content) =>
        set((state) => ({
          brainstormingContent: {
            ...state.brainstormingContent,
            [projectId]: content,
          },
        })),

      getBrainstormingContent: (projectId) =>
        get().brainstormingContent[projectId] || '',
    }),
    {
      name: 'scene-storage',
    }
  )
);
