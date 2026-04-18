// Conversational continuity store — Phase 17
// In-memory, per-room, short horizon (10 min).
// Note: Vercel may run multiple instances; continuity is best-effort across restarts.
// This is intentional — the spec explicitly calls for in-memory, not persisted storage.

export type ContinuityRoom = 'ari' | 'eli' | 'watchtower'

export interface ContinuityState {
  lastQuery: string
  lastAnswer: string
  lastMode?: string
  timestamp: number
}

const EXPIRY_MS = 10 * 60 * 1000 // 10 minutes

const store = new Map<ContinuityRoom, ContinuityState>()

// Returns active state or null if missing / expired
export function getContinuity(room: ContinuityRoom): ContinuityState | null {
  const state = store.get(room)
  if (!state) return null
  if (Date.now() - state.timestamp > EXPIRY_MS) {
    store.delete(room)
    return null
  }
  return state
}

// Write continuity after a response is produced
export function updateContinuity(
  room: ContinuityRoom,
  data: Pick<ContinuityState, 'lastQuery' | 'lastAnswer'> & { lastMode?: string }
): void {
  store.set(room, { ...data, timestamp: Date.now() })
}

// Explicit reset — called by the clear-continuity API route
export function clearContinuity(room: ContinuityRoom): void {
  store.delete(room)
}

// Detects whether a query references a prior turn.
// Covers explicit reference words and common follow-up patterns.
export function hasPriorReference(query: string): boolean {
  if (!query) return false
  return /\b(this|that|previous|prior|earlier|above|the edge|the answer|the result|the reasoning|your answer|your previous|your reasoning|your last)\b/i.test(
    query
  )
}
