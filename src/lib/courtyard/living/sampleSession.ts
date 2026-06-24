// Courtyard — Living Room Spike · Sample session
// Deterministic helper: build a session and run a few steps so the room can open
// already "mid-breath" if desired. Pure/client-safe; no side effects.

import { createSession, startSession, step } from './sessionSimulator'
import type { SessionState } from './types'

export const DEFAULT_SEED = 7251

/** A fresh, idle, quiet room (Tara hasn't pressed Start yet). */
export function freshSession(seed = DEFAULT_SEED): SessionState {
  return createSession(seed)
}

/** A session pre-advanced by `steps` ticks — handy for previews/demos. */
export function buildSampleSession(seed = DEFAULT_SEED, steps = 6): SessionState {
  let s = startSession(createSession(seed))
  for (let i = 0; i < steps; i += 1) s = step(s)
  return s
}
