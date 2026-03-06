'use client';

import { useParams } from 'next/navigation';
import { useLibraryStore } from '@/store/library-store';
import { Character, Prop, Location } from '@/types/character';

export function useLibrary() {
  const params = useParams();
  const projectId = params.projectId as string | undefined;

  const {
    getCharactersByProject,
    getPropsByProject,
    getLocationsByProject,
    addCharacter,
    updateCharacter,
    deleteCharacter,
    addProp,
    updateProp,
    deleteProp,
    addLocation,
    updateLocation,
    deleteLocation,
  } = useLibraryStore();

  const characters = projectId ? getCharactersByProject(projectId) : [];
  const props = projectId ? getPropsByProject(projectId) : [];
  const locations = projectId ? getLocationsByProject(projectId) : [];

  const createCharacter = (data: Omit<Character, 'id' | 'projectId'>) => {
    if (!projectId) return;

    const newCharacter: Character = {
      id: crypto.randomUUID(),
      projectId,
      ...data,
    };

    addCharacter(newCharacter);
    return newCharacter;
  };

  const createProp = (data: Omit<Prop, 'id' | 'projectId'>) => {
    if (!projectId) return;

    const newProp: Prop = {
      id: crypto.randomUUID(),
      projectId,
      ...data,
    };

    addProp(newProp);
    return newProp;
  };

  const createLocation = (data: Omit<Location, 'id' | 'projectId'>) => {
    if (!projectId) return;

    const newLocation: Location = {
      id: crypto.randomUUID(),
      projectId,
      ...data,
    };

    addLocation(newLocation);
    return newLocation;
  };

  return {
    characters,
    props,
    locations,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    createProp,
    updateProp,
    deleteProp,
    createLocation,
    updateLocation,
    deleteLocation,
  };
}
