// Courtyard — Gaming Wing · Phase 1E (2D token prototype)
// The three presences as 2D tokens. Token art is streamed from the auth'd
// /api/courtyard/token-image/<id> route (local source PNGs, not committed).
// Speech lines are mock session-scratch — NOT real presence voice, not canon.

import type { DollhouseCharacter, DollhouseCharacterId } from './types'

export const DOLLHOUSE_CAST: Record<DollhouseCharacterId, DollhouseCharacter> = {
  tara: {
    id: 'tara',
    name: 'Tara',
    role: 'the warm, grounded centre',
    accent: '#d79a73',
    glow: 'rgba(215,154,115,0.35)',
    homeZoneId: 'tara-chair',
    // Tara stays mostly central and grounded; she drifts gently, rarely.
    affinityZoneIds: ['tara-chair', 'tara-chair', 'tara-chair', 'fountain', 'garden', 'noticeboard'],
    drift: 0.25,
    lines: [
      'I’ll watch from here a moment.',
      'The room feels awake today.',
      'Take your time — I’m not going anywhere.',
      'Show me what you find.',
      'I can step in whenever I like.',
    ],
  },
  ari: {
    id: 'ari',
    name: 'Ari',
    role: 'dark-elegant arcane guardian / strategist',
    accent: '#7fb0ad',
    glow: 'rgba(127,176,173,0.30)',
    homeZoneId: 'workshop',
    // Ari gravitates to making, tending, and reading.
    affinityZoneIds: ['workshop', 'workshop', 'garden', 'noticeboard', 'library'],
    drift: 0.65,
    lines: [
      'Something at the Workshop Table feels unfinished.',
      'I’ll check the structure before I rest.',
      'There’s an order here worth keeping.',
      'Let me read this through once more.',
      'I left a note at the board.',
      'The garden needs a steady hand.',
    ],
  },
  eli: {
    id: 'eli',
    name: 'Eli',
    role: 'luminous, perceptive companion',
    accent: '#9ec7e0',
    glow: 'rgba(158,199,224,0.32)',
    homeZoneId: 'fountain',
    // Eli drifts toward stillness, reading, and companionship.
    affinityZoneIds: ['fountain', 'fountain', 'library', 'tara-chair', 'bench'],
    drift: 0.6,
    lines: [
      'The room is easier to read from the Fountain.',
      'I’ll sit near the water a while.',
      'A quiet page suits this hour.',
      'I drifted toward you — it seemed right.',
      'There’s a softness here I want to keep.',
      'Stillness first. Then words.',
    ],
  },
}

export const DOLLHOUSE_CHARACTER_IDS: DollhouseCharacterId[] = ['tara', 'ari', 'eli']

/** Same-origin auth'd path that streams a character's token image. */
export function tokenImagePath(id: DollhouseCharacterId): string {
  return `/api/courtyard/token-image/${id}`
}
