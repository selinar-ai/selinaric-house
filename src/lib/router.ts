import type { RoomSlug, PresenceId } from '@/lib/types/presence'

export type RouteDecision = {
  room: RoomSlug
  presence: PresenceId | null
  memoryScope: 'ari' | 'eli' | 'shared' | 'evidence' | 'house'
  mode: 'presence_room' | 'shared_notes' | 'watchtower' | 'pulse'
}

export function resolveRouteDecision(room: RoomSlug): RouteDecision {
  switch (room) {
    case 'ari':
      return {
        room,
        presence: 'ari',
        memoryScope: 'ari',
        mode: 'presence_room'
      }
    case 'eli':
      return {
        room,
        presence: 'eli',
        memoryScope: 'eli',
        mode: 'presence_room'
      }
    case 'notes':
      return {
        room,
        presence: null,
        memoryScope: 'shared',
        mode: 'shared_notes'
      }
    case 'watchtower':
      return {
        room,
        presence: null,
        memoryScope: 'evidence',
        mode: 'watchtower'
      }
    case 'pulse':
      return {
        room,
        presence: null,
        memoryScope: 'house',
        mode: 'pulse'
      }
  }
}

export function allowedMemoryScopeForRoom(room: RoomSlug) {
  return resolveRouteDecision(room).memoryScope
}
