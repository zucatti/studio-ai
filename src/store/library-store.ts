import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Character, Prop, Location } from '@/types/character';

interface LibraryStore {
  characters: Character[];
  props: Prop[];
  locations: Location[];

  // Character actions
  addCharacter: (character: Character) => void;
  updateCharacter: (id: string, data: Partial<Character>) => void;
  deleteCharacter: (id: string) => void;
  getCharactersByProject: (projectId: string) => Character[];

  // Prop actions
  addProp: (prop: Prop) => void;
  updateProp: (id: string, data: Partial<Prop>) => void;
  deleteProp: (id: string) => void;
  getPropsByProject: (projectId: string) => Prop[];

  // Location actions
  addLocation: (location: Location) => void;
  updateLocation: (id: string, data: Partial<Location>) => void;
  deleteLocation: (id: string) => void;
  getLocationsByProject: (projectId: string) => Location[];
}

// Mock data
const mockCharacters: Character[] = [
  {
    id: 'char_1',
    projectId: '1',
    name: 'Capitaine Elena Rodriguez',
    description: 'Commandante du vaisseau Horizon. 45 ans, déterminée, calme sous pression.',
    visualDescription: 'Femme hispanique, cheveux gris courts, yeux bruns intenses, uniforme bleu marine',
    referenceImages: [],
    age: '45',
    gender: 'female',
  },
  {
    id: 'char_2',
    projectId: '1',
    name: 'Lieutenant Tom Chen',
    description: 'Second du vaisseau, expert en navigation. 35 ans, optimiste, brillant.',
    visualDescription: 'Homme asiatique, cheveux noirs, sourire chaleureux, uniforme technique gris',
    referenceImages: [],
    age: '35',
    gender: 'male',
  },
];

const mockProps: Prop[] = [
  {
    id: 'prop_1',
    projectId: '1',
    name: 'Console de navigation',
    type: 'technology',
    visualDescription: 'Interface holographique circulaire, lumières bleues, style futuriste épuré',
    referenceImages: [],
  },
  {
    id: 'prop_2',
    projectId: '1',
    name: 'Combinaison spatiale',
    type: 'object',
    visualDescription: 'Combinaison blanche avec détails bleus, casque transparent, design moderne',
    referenceImages: [],
  },
];

const mockLocations: Location[] = [
  {
    id: 'loc_1',
    projectId: '1',
    name: 'Cockpit du vaisseau',
    type: 'interior',
    visualDescription: 'Grand cockpit futuriste, panneaux de contrôle holographiques, vue panoramique sur l\'espace',
    referenceImages: [],
    lighting: 'Lumière ambiante bleue douce, étoiles visibles par les hublots',
    mood: 'Calme, contemplatif',
  },
  {
    id: 'loc_2',
    projectId: '1',
    name: 'Espace près de la planète',
    type: 'exterior',
    visualDescription: 'Vide spatial avec planète verdoyante en arrière-plan, étoiles scintillantes',
    referenceImages: [],
    lighting: 'Lumière de la planète, ombres profondes',
    mood: 'Majestueux, mystérieux',
  },
];

export const useLibraryStore = create<LibraryStore>()(
  persist(
    (set, get) => ({
      characters: mockCharacters,
      props: mockProps,
      locations: mockLocations,

      // Character actions
      addCharacter: (character) =>
        set((state) => ({
          characters: [...state.characters, character],
        })),

      updateCharacter: (id, data) =>
        set((state) => ({
          characters: state.characters.map((c) =>
            c.id === id ? { ...c, ...data } : c
          ),
        })),

      deleteCharacter: (id) =>
        set((state) => ({
          characters: state.characters.filter((c) => c.id !== id),
        })),

      getCharactersByProject: (projectId) =>
        get().characters.filter((c) => c.projectId === projectId),

      // Prop actions
      addProp: (prop) =>
        set((state) => ({
          props: [...state.props, prop],
        })),

      updateProp: (id, data) =>
        set((state) => ({
          props: state.props.map((p) =>
            p.id === id ? { ...p, ...data } : p
          ),
        })),

      deleteProp: (id) =>
        set((state) => ({
          props: state.props.filter((p) => p.id !== id),
        })),

      getPropsByProject: (projectId) =>
        get().props.filter((p) => p.projectId === projectId),

      // Location actions
      addLocation: (location) =>
        set((state) => ({
          locations: [...state.locations, location],
        })),

      updateLocation: (id, data) =>
        set((state) => ({
          locations: state.locations.map((l) =>
            l.id === id ? { ...l, ...data } : l
          ),
        })),

      deleteLocation: (id) =>
        set((state) => ({
          locations: state.locations.filter((l) => l.id !== id),
        })),

      getLocationsByProject: (projectId) =>
        get().locations.filter((l) => l.projectId === projectId),
    }),
    {
      name: 'library-storage',
    }
  )
);
