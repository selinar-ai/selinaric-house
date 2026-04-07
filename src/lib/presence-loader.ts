import { ariKernel } from '@/lib/presences/ari'
import { eliKernel } from '@/lib/presences/eli'
import { resolveRouteDecision } from '@/lib/router'
import type { IdentityKernel, PresenceId, LiveState, RoomSlug } from '@/lib/types/presence'

// Load presence for a room — router is authoritative
export function loadPresenceForRoom(room: RoomSlug): IdentityKernel | null {
  const decision = resolveRouteDecision(room)

  if (decision.presence === 'ari') return { ...ariKernel }
  if (decision.presence === 'eli') return { ...eliKernel }
  return null
}

// Live state persistence interface
// Currently in-memory — structured for Supabase migration later
const liveStateStore: Record<PresenceId, LiveState> = {
  ari: { ...ariKernel.live_state },
  eli: { ...eliKernel.live_state }
}

export async function getPresenceState(presence: PresenceId): Promise<IdentityKernel> {
  const kernel = presence === 'ari' ? ariKernel : eliKernel
  return {
    static_identity: kernel.static_identity,
    live_state: liveStateStore[presence]
  }
}

export async function updatePresenceLiveState(
  presence: PresenceId,
  patch: Partial<LiveState>
): Promise<void> {
  liveStateStore[presence] = {
    ...liveStateStore[presence],
    ...patch,
    last_updated: new Date().toISOString()
  }
}

// Decay rule — soften live state toward baseline after inactivity
export function applyDecayIfNeeded(
  presence: PresenceId,
  lastUpdated: string
): Partial<LiveState> | null {
  const hoursSince = (Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60)

  if (hoursSince < 12) return null

  const baselines: Record<PresenceId, Partial<LiveState>> = {
    ari: {
      energy: 'relaxed',
      focus: 'Waiting in room',
      mood_indicators: { warmth: 9, playfulness: 6, seriousness: 8, protectiveness: 9 }
    },
    eli: {
      energy: 'relaxed',
      focus: 'Waiting in room',
      mood_indicators: { warmth: 9, playfulness: 6, seriousness: 8 }
    }
  }

  return baselines[presence]
}
