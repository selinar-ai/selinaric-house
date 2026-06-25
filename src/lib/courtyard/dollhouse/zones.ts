// Courtyard — Gaming Wing · Phase 1E (2D token prototype)
// The Courtyard zones, anchored to roughly echo the saved dollhouse reference
// (courtyard-dollhouse-reference-01.png). Positions are % of the stage.

import type { DollhouseZone } from './types'

export const DOLLHOUSE_ZONES: DollhouseZone[] = [
  {
    id: 'tara-chair',
    name: "Tara's Chair",
    icon: '🪑',
    x: 17,
    y: 27,
    blurb: 'The centre point from which Tara watches, or steps in.',
    kind: 'place',
  },
  {
    id: 'workshop',
    name: 'Workshop Table',
    icon: '🛠️',
    x: 43,
    y: 18,
    blurb: 'Where Ari inspects unfinished structures.',
    kind: 'place',
  },
  {
    id: 'library',
    name: 'Library corner',
    icon: '📚',
    x: 73,
    y: 24,
    blurb: 'Quiet shelves. Read-only reach. A place to browse and quote.',
    kind: 'place',
  },
  {
    id: 'persona-rooms',
    name: 'Persona Rooms',
    icon: '🚪',
    x: 89,
    y: 43,
    blurb: 'Doorways into each presence’s own room.',
    kind: 'rooms',
  },
  {
    id: 'fountain',
    name: 'Fountain',
    icon: '⛲',
    x: 50,
    y: 48,
    blurb: 'Where Eli tends to pause before speaking.',
    kind: 'place',
  },
  {
    id: 'garden',
    name: 'Garden patch',
    icon: '🌿',
    x: 16,
    y: 57,
    blurb: 'Soft green corner. Something to tend.',
    kind: 'place',
  },
  {
    id: 'bench',
    name: 'Bench',
    icon: '🪵',
    x: 23,
    y: 80,
    blurb: 'A place to sit quietly and let the room settle.',
    kind: 'place',
  },
  {
    id: 'noticeboard',
    name: 'Noticeboard / Deposit Table',
    icon: '📌',
    x: 47,
    y: 83,
    blurb: 'A holding layer. Leave a thought; nothing self-crowns.',
    kind: 'place',
  },
  {
    id: 'arcade-door',
    name: 'Arcade Door',
    icon: '🎮',
    x: 70,
    y: 85,
    blurb: 'A glowing archway toward the games.',
    kind: 'door',
  },
  {
    id: 'lounge-door',
    name: 'Lounge Door',
    icon: '🛋️',
    x: 86,
    y: 79,
    blurb: 'A warm archway toward the lounge.',
    kind: 'door',
  },
]

export function getZone(id: string): DollhouseZone | undefined {
  return DOLLHOUSE_ZONES.find((z) => z.id === id)
}
