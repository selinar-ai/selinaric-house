/**
 * Workshop Visual Pass — motion scaffolding (Slice 0, presentation-only)
 *
 * The single seam between the Helper Workshop and the `motion` library (the
 * renamed Framer Motion; React entry `motion/react`). It centralises the
 * reduced-motion hook and the timing/easing constants the later slices use, so
 * the surface has ONE place to reason about animation.
 *
 * This is PRESENTATION ONLY. It holds no data, no review logic, no route, no
 * authority. Nothing here reads helper outputs, changes review state, or touches
 * the 41.12 mutation route or the 41.14 read-only trace. Motion may change how a
 * room feels; it may not change what a helper can do.
 *
 * Reduced motion: components call `useReducedMotion()` and, when it returns true,
 * render the still (non-animated) form. The List view remains the full fallback.
 */

export { useReducedMotion } from 'motion/react'

/** Gentle, GPU-friendly timings (transform/opacity only). Tuned in later slices. */
export const WORKSHOP_MOTION = {
  /** Courier idle hover — a slow, small vertical bob. */
  courierBob: { duration: 4.6, ease: 'easeInOut' as const, distance: 12 },
  /** Courier arrival/departure drift (Slice 1). */
  courierTravel: { duration: 0.7, ease: 'easeOut' as const },
  /** Candle-glow pulse on a room tile — opacity only. */
  glowPulse: { duration: 5.2, ease: 'easeInOut' as const, min: 0.5, max: 0.9 },
  /** Map ↔ room transition (Slice 2) — a soft spring, not a snap. */
  roomTransition: { type: 'spring' as const, stiffness: 220, damping: 30 },
  /** Ambient motes — subtle by default, off under reduced motion (Slice 3). */
  motes: { duration: 6, ease: 'easeInOut' as const, minOpacity: 0.15, maxOpacity: 0.8 },
} as const
