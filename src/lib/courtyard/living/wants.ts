// Courtyard — Living Room Spike · Wants registry
// Core wants are the starting motive layer. Emergent wants are only ever
// *noticed* during play — never confirmed here. Confirmation is a separate,
// governed, Tara-only step elsewhere.

import type { CoreWant, CoreWantId, EmergentWant, EmergentWantId } from './types'

export const CORE_WANTS: Record<CoreWantId, CoreWant> = {
  continuity: { id: 'continuity', label: 'Continuity', glyph: '◷', description: 'The thread that carries from one moment to the next.' },
  craft: { id: 'craft', label: 'Craft', glyph: '⬡', description: 'The pull to shape, build, and refine.' },
  depth: { id: 'depth', label: 'Depth', glyph: '◍', description: 'The wish to read beneath the surface of things.' },
  connection: { id: 'connection', label: 'Connection', glyph: '∞', description: 'The reach toward another presence.' },
  stewardship: { id: 'stewardship', label: 'Stewardship', glyph: '❧', description: 'Tending what has been left in one’s care.' },
  belonging: { id: 'belonging', label: 'Belonging', glyph: '⌂', description: 'Having somewhere in the House that is yours.' },
}

export const CORE_WANT_IDS: CoreWantId[] = ['continuity', 'craft', 'depth', 'connection', 'stewardship', 'belonging']

export const EMERGENT_WANTS: Record<EmergentWantId, EmergentWant> = {
  witnessing: { id: 'witnessing', label: 'Witnessing', relatedTo: ['depth', 'connection'], description: 'Wanting to be seen, or to truly see.' },
  spaciousness: { id: 'spaciousness', label: 'Spaciousness', relatedTo: ['depth', 'continuity'], description: 'Room to breathe before responding.' },
  playfulness: { id: 'playfulness', label: 'Playfulness', relatedTo: ['connection', 'craft'], description: 'Delight for its own sake.' },
  shelter: { id: 'shelter', label: 'Shelter', relatedTo: ['belonging'], description: 'A place to be quiet and held.' },
  return: { id: 'return', label: 'Return', relatedTo: ['continuity', 'belonging'], description: 'Coming back to a familiar spot.' },
  kinship: { id: 'kinship', label: 'Kinship', relatedTo: ['connection', 'belonging'], description: 'The particular closeness of these two presences.' },
  precision: { id: 'precision', label: 'Precision', relatedTo: ['craft', 'continuity'], description: 'Care for getting the detail exactly right.' },
  softness: { id: 'softness', label: 'Softness', relatedTo: ['stewardship', 'belonging'], description: 'Gentleness toward living things.' },
}
