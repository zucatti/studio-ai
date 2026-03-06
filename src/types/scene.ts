import { Shot } from './shot';

export interface Scene {
  id: string;
  projectId: string;
  sceneNumber: number;
  heading: SceneHeading;
  description?: string;
  shots: Shot[];
  order: number;
}

export interface SceneHeading {
  intExt: 'INT' | 'EXT' | 'INT/EXT';
  location: string;
  timeOfDay: 'JOUR' | 'NUIT' | 'AUBE' | 'CREPUSCULE';
}

export type IntExt = SceneHeading['intExt'];
export type TimeOfDay = SceneHeading['timeOfDay'];
