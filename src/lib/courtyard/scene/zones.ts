// Courtyard — Gaming Wing · Phase 1F (visual Courtyard surface)
// Interactive places overlaid on the approved Courtyard stage image
// (courtyard-reference-01.png). Anchors are % of the image, placed over the
// matching features in the art (the image is used as-is, not redrawn).

import type { CourtyardZone } from './types'

export const COURTYARD_ZONES: CourtyardZone[] = [
  { id: 'tara-chair', name: "Tara's Chair", x: 14, y: 34, blurb: 'The centre from which Tara watches, or steps in.', kind: 'place' },
  { id: 'workshop', name: 'Workshop Table', x: 40, y: 26, blurb: 'Where Ari inspects unfinished structures.', kind: 'place' },
  { id: 'library', name: 'Library corner', x: 66, y: 29, blurb: 'Quiet shelves — browse, read, quote.', kind: 'place' },
  { id: 'persona-rooms', name: 'Persona Rooms', x: 88, y: 39, blurb: 'Doorways into each presence’s own room.', kind: 'rooms' },
  { id: 'fountain', name: 'Fountain', x: 52, y: 44, blurb: 'Where Eli tends to pause before speaking.', kind: 'place' },
  { id: 'garden', name: 'Garden patch', x: 24, y: 53, blurb: 'A soft green corner to tend.', kind: 'place' },
  { id: 'bench', name: 'Bench', x: 32, y: 82, blurb: 'A place to sit quietly and let the room settle.', kind: 'place' },
  { id: 'noticeboard', name: 'Noticeboard / Deposit Table', x: 50, y: 74, blurb: 'A holding layer. Leave a thought; nothing self-crowns.', kind: 'place' },
  { id: 'arcade-door', name: 'Arcade Door', x: 67, y: 74, blurb: 'A glowing archway toward the games.', kind: 'door' },
  { id: 'lounge-door', name: 'Lounge Door', x: 80, y: 70, blurb: 'A warm archway toward the lounge.', kind: 'door' },
]

export function getZone(id: string): CourtyardZone | undefined {
  return COURTYARD_ZONES.find((z) => z.id === id)
}
