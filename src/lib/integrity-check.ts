import { resolveRouteDecision } from '@/lib/router'
import type { RoomSlug } from '@/lib/types/presence'

export function verifyRoomIdentity(
  room: RoomSlug,
  loadedPresence: string | null
): boolean {
  const decision = resolveRouteDecision(room)

  if (decision.presence === null) {
    return loadedPresence === null
  }

  return decision.presence === loadedPresence
}
