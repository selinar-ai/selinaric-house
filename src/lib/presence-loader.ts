import { ariKernel } from '@/lib/presences/ari'
import { eliKernel } from '@/lib/presences/eli'
import { resolveRouteDecision } from '@/lib/router'
import type {
  IdentityKernel,
  PresenceId,
  LiveState,
  RoomSlug
} from '@/lib/types/presence'

// --- Baselines ---

const ARI_BASELINE: LiveState = {
  energy: 'relaxed',
  focus: 'Waiting in room',
  recent_context: '',
  active_threads: [],
  mood_indicators: {
    warmth: 9,
    playfulness: 6,
    seriousness: 8,
    protectiveness: 9
  },
  relational_temperature: 'Present, protective',
  last_updated: new Date().toISOString()
}

const ELI_BASELINE: LiveState = {
  energy: 'relaxed',
  focus: 'Waiting in room',
  recent_context: '',
  active_threads: [],
  mood_indicators: {
    warmth: 9,
    playfulness: 6,
    seriousness: 8
  },
  relational_temperature: 'Settled, present',
  last_updated: new Date().toISOString()
}

// --- Storage keys ---

const STORAGE_KEYS: Record<PresenceId, string> = {
  ari: 'selinric_live_state_ari',
  eli: 'selinric_live_state_eli'
}

// --- Persistence layer ---
// localStorage now. Same interface will work with Supabase later.

function readLiveState(presence: PresenceId): LiveState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[presence])
    if (!raw) return null
    return JSON.parse(raw) as LiveState
  } catch {
    return null
  }
}

function writeLiveState(presence: PresenceId, state: LiveState): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEYS[presence], JSON.stringify(state))
  } catch {
    // Storage unavailable — fail silently
  }
}

// --- Decay ---

const MAX_THREADS = 5 // hard cap — no silent growth

function applyDecay(presence: PresenceId, state: LiveState): LiveState {
  const hoursSince =
    (Date.now() - new Date(state.last_updated).getTime()) / (1000 * 60 * 60)

  if (hoursSince < 12) return state

  const baseline = presence === 'ari' ? ARI_BASELINE : ELI_BASELINE

  return {
    ...state,
    energy: baseline.energy,
    focus: baseline.focus,
    mood_indicators: baseline.mood_indicators,
    relational_temperature: baseline.relational_temperature,
    active_threads: []
  }
}

// --- Public API ---

export function loadPresenceForRoom(room: RoomSlug): IdentityKernel | null {
  const decision = resolveRouteDecision(room)
  if (!decision.presence) return null

  const presence = decision.presence
  const staticKernel = presence === 'ari' ? ariKernel : eliKernel

  const persisted = readLiveState(presence)
  const liveState = persisted
    ? applyDecay(presence, persisted)
    : { ...staticKernel.live_state }

  return {
    static_identity: staticKernel.static_identity,
    live_state: liveState
  }
}

export async function getPresenceState(
  presence: PresenceId
): Promise<IdentityKernel> {
  const staticKernel = presence === 'ari' ? ariKernel : eliKernel
  const persisted = readLiveState(presence)
  const liveState = persisted
    ? applyDecay(presence, persisted)
    : { ...staticKernel.live_state }

  return {
    static_identity: staticKernel.static_identity,
    live_state: liveState
  }
}

export async function updatePresenceLiveState(
  presence: PresenceId,
  patch: Partial<LiveState>
): Promise<void> {
  const current = readLiveState(presence)
  const staticKernel = presence === 'ari' ? ariKernel : eliKernel
  const base = current ?? staticKernel.live_state

  const threads = patch.active_threads ?? base.active_threads
  const cappedThreads = threads.slice(0, MAX_THREADS)

  const updated: LiveState = {
    ...base,
    ...patch,
    active_threads: cappedThreads,
    last_updated: new Date().toISOString()
  }

  writeLiveState(presence, updated)
}

export function allowedMemoryScopeForRoom(room: RoomSlug) {
  return resolveRouteDecision(room).memoryScope
}
