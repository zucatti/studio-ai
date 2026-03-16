/**
 * Generic characters for screenplay dialogues
 *
 * These are standard anonymous character types used in professional screenwriting
 * when you need dialogue from unnamed or group characters.
 *
 * IDs are prefixed with "generic:" to distinguish from Bible characters.
 */

export interface GenericCharacter {
  id: string;
  name: string;
  nameFr: string;
  description: string;
  icon: 'crowd' | 'voice' | 'person' | 'child' | 'announcer' | 'narrator';
}

export const GENERIC_CHARACTERS: GenericCharacter[] = [
  {
    id: 'generic:crowd',
    name: 'FOULE',
    nameFr: 'Foule',
    description: 'Groupe de personnes parlant ensemble',
    icon: 'crowd',
  },
  {
    id: 'generic:voice',
    name: 'VOIX',
    nameFr: 'Voix',
    description: 'Voix non identifiee',
    icon: 'voice',
  },
  {
    id: 'generic:man',
    name: 'HOMME',
    nameFr: 'Homme',
    description: 'Personnage masculin anonyme',
    icon: 'person',
  },
  {
    id: 'generic:woman',
    name: 'FEMME',
    nameFr: 'Femme',
    description: 'Personnage feminin anonyme',
    icon: 'person',
  },
  {
    id: 'generic:child',
    name: 'ENFANT',
    nameFr: 'Enfant',
    description: 'Enfant anonyme',
    icon: 'child',
  },
  {
    id: 'generic:bystander',
    name: 'PASSANT',
    nameFr: 'Passant',
    description: 'Personnage de passage',
    icon: 'person',
  },
  {
    id: 'generic:announcer',
    name: 'ANNONCEUR',
    nameFr: 'Annonceur',
    description: 'Voix annonce, radio, intercom',
    icon: 'announcer',
  },
  {
    id: 'generic:narrator',
    name: 'NARRATEUR',
    nameFr: 'Narrateur',
    description: 'Voix de narration',
    icon: 'narrator',
  },
  {
    id: 'generic:group',
    name: 'GROUPE',
    nameFr: 'Groupe',
    description: 'Petit groupe de personnes',
    icon: 'crowd',
  },
  {
    id: 'generic:all',
    name: 'TOUS',
    nameFr: 'Tous',
    description: 'Tous les personnages presents',
    icon: 'crowd',
  },
];

/**
 * Check if a character ID is a generic character
 */
export function isGenericCharacter(characterId: string | null | undefined): boolean {
  return characterId?.startsWith('generic:') ?? false;
}

/**
 * Get a generic character by ID
 */
export function getGenericCharacter(characterId: string): GenericCharacter | undefined {
  return GENERIC_CHARACTERS.find((c) => c.id === characterId);
}

/**
 * Get generic character name by ID (for display)
 */
export function getGenericCharacterName(characterId: string): string | undefined {
  return getGenericCharacter(characterId)?.name;
}
