// Courtyard — Gaming Wing · Phase 1E (2D token prototype)
// Lightweight, side-effect-free shapes for the dollhouse prototype.
// Prototype-only: no DB, no memory, no authority. Just a playable room.

export type DollhouseCharacterId = 'tara' | 'ari' | 'eli'

export interface DollhouseZone {
  id: string
  name: string
  /** Emoji glyph for quick visual reading at small size. */
  icon: string
  /** Anchor position as a percentage of the stage (0–100). */
  x: number
  y: number
  /** Charming one-line flavour shown on hover / in the places list. */
  blurb: string
  kind: 'place' | 'door' | 'rooms'
}

export interface DollhouseCharacter {
  id: DollhouseCharacterId
  name: string
  role: string
  /** Accent colour (hex) for the token ring + labels. */
  accent: string
  /** Soft glow colour (rgba) behind the token. */
  glow: string
  /** Where the character rests by default. */
  homeZoneId: string
  /** Zones this character gravitates toward in autoplay (repeat = stronger pull). */
  affinityZoneIds: string[]
  /** 0–1 likelihood of drifting somewhere new on an autoplay tick. */
  drift: number
  /** Mock, session-scratch speech lines (not real presence voice). */
  lines: string[]
}
