export interface Character {
  id: string;
  projectId: string;
  name: string;
  description: string;
  visualDescription: string;
  referenceImages: string[];
  age?: string;
  gender?: 'male' | 'female' | 'non_binary' | 'other';
}

export interface Prop {
  id: string;
  projectId: string;
  name: string;
  type: PropType;
  visualDescription: string;
  referenceImages: string[];
}

export type PropType = 'object' | 'vehicle' | 'furniture' | 'weapon' | 'technology' | 'other';

export const PROP_TYPES: { value: PropType; label: string }[] = [
  { value: 'object', label: 'Objet' },
  { value: 'vehicle', label: 'Véhicule' },
  { value: 'furniture', label: 'Mobilier' },
  { value: 'weapon', label: 'Arme' },
  { value: 'technology', label: 'Technologie' },
  { value: 'other', label: 'Autre' },
];

export interface Location {
  id: string;
  projectId: string;
  name: string;
  type: LocationType;
  visualDescription: string;
  referenceImages: string[];
  lighting?: string;
  mood?: string;
}

export type LocationType = 'interior' | 'exterior' | 'mixed';

export const LOCATION_TYPES: { value: LocationType; label: string }[] = [
  { value: 'interior', label: 'Intérieur' },
  { value: 'exterior', label: 'Extérieur' },
  { value: 'mixed', label: 'Mixte' },
];
