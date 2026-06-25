// Courtyard — Gaming Wing · Phase 1F (visual Courtyard surface)
// Lightweight, side-effect-free shapes for the Courtyard scene.
// Prototype-only: no DB, no memory, no authority. A living place, not a panel.

export type CourtyardPresenceId = 'tara' | 'ari' | 'eli'

export interface CourtyardZone {
  id: string
  name: string
  /** Anchor position as a percentage of the Courtyard stage image (0–100). */
  x: number
  y: number
  /** Soft one-line flavour shown in the hover chip. */
  blurb: string
  kind: 'place' | 'door' | 'rooms'
}

export interface CourtyardPresence {
  id: CourtyardPresenceId
  name: string
  role: string
  /** Accent colour (hex) for the token ring + labels. */
  accent: string
  /** Soft glow colour (rgba) behind the token. */
  glow: string
  /** Where the presence rests by default. */
  homeZoneId: string
  /** Zones this presence gravitates toward in drift (repeat = stronger pull). */
  affinityZoneIds: string[]
  /** 0–1 likelihood of drifting somewhere new on a drift tick. */
  drift: number
  /** Mock, session-scratch speech lines (not real presence voice). */
  lines: string[]
}
