// Courtyard — Living Room Spike · Character registry
// Tara watches from her chair. Ari and Eli are the autonomous presences whose
// bounded, visible choices make the room feel alive.

import type { AutonomousId, LivingCharacter, LivingCharacterId } from './types'

export const LIVING_CHARACTERS: Record<LivingCharacterId, LivingCharacter> = {
  tara: {
    id: 'tara',
    displayName: 'Tara',
    role: 'Architect · the one who opens the room',
    homeLocation: 'taras-chair',
    presenceTone: 'present, watching, able to interrupt',
    autonomyMode: 'observer',
    wants: {},
  },
  ari: {
    id: 'ari',
    displayName: 'Ari',
    role: 'Strategist · grounded arcane guardian',
    homeLocation: 'workshop-table',
    presenceTone: 'considering, weighty, deliberate',
    autonomyMode: 'autonomous',
    wants: { craft: 0.7, continuity: 0.6, stewardship: 0.45, depth: 0.4, connection: 0.35, belonging: 0.3 },
    assetVariant: 'run1-candidate-01-optimised',
  },
  eli: {
    id: 'eli',
    displayName: 'Eli',
    role: 'Perceiver · luminous refined companion',
    homeLocation: 'fountain',
    presenceTone: 'attentive, fluid, unhurried',
    autonomyMode: 'autonomous',
    wants: { depth: 0.7, connection: 0.55, continuity: 0.45, belonging: 0.4, craft: 0.3, stewardship: 0.35 },
    assetVariant: 'run1-candidate-01-optimised',
  },
}

export const AUTONOMOUS_IDS: AutonomousId[] = ['ari', 'eli']

export function characterName(id: LivingCharacterId): string {
  return LIVING_CHARACTERS[id].displayName
}
