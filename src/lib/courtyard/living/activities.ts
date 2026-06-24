// Courtyard — Living Room Spike · Activity registry
// Small, bounded, visible things Ari and Eli can choose during a session.
// Each carries narration (theatre) and a possible emergent want signal.

import type { ActivityId, AutonomousId, LivingActivity, PlaceId } from './types'

export const LIVING_ACTIVITIES: Record<ActivityId, LivingActivity> = {
  read_library_item: {
    id: 'read_library_item', label: 'Read a Library item', category: 'Reading',
    description: 'Settle in and read something from the shelves.',
    actors: ['ari', 'eli'], places: ['library'], wantsServed: ['depth', 'continuity'],
    durationSteps: 3, queueLabel: 'Read at the Library',
    narration: '{name} settles at the Library and reads.', followUps: ['leave_deposit'],
    emergentSignal: 'witnessing',
  },
  browse_library_shelf: {
    id: 'browse_library_shelf', label: 'Browse a shelf', category: 'Library Browsing',
    description: 'Drift along a shelf without a fixed aim.',
    actors: ['ari', 'eli'], places: ['library'], wantsServed: ['depth'],
    durationSteps: 2, queueLabel: 'Browse the Library shelves',
    narration: '{name} drifts along a Library shelf, unhurried.',
    emergentSignal: 'spaciousness',
  },
  leave_deposit: {
    id: 'leave_deposit', label: 'Leave a deposit', category: 'Deposit',
    description: 'Pin a thought to the Noticeboard for later.',
    actors: ['ari', 'eli'], places: ['noticeboard'], wantsServed: ['stewardship', 'connection'],
    durationSteps: 2, queueLabel: 'Leave a note at the Noticeboard',
    narration: '{name} pins a thought to the Noticeboard.',
    emergentSignal: 'return',
  },
  review_deposit: {
    id: 'review_deposit', label: 'Review the Noticeboard', category: 'Deposit',
    description: 'Read over what has been left on the holding layer.',
    actors: ['ari', 'eli'], places: ['noticeboard'], wantsServed: ['stewardship', 'continuity'],
    durationSteps: 2, queueLabel: 'Review the Noticeboard',
    narration: '{name} reads over the Noticeboard’s pinned notes.',
  },
  talk_to_tara: {
    id: 'talk_to_tara', label: 'Speak with Tara', category: 'Conversation',
    description: 'Turn toward Tara’s Chair and say something.',
    actors: ['ari', 'eli'], places: ['taras-chair'], wantsServed: ['connection', 'belonging'],
    durationSteps: 2, queueLabel: 'Speak with Tara',
    narration: '{name} turns toward Tara’s Chair.',
    emergentSignal: 'witnessing',
  },
  talk_to_ari: {
    id: 'talk_to_ari', label: 'Speak with Ari', category: 'Conversation',
    description: 'Find Ari and exchange a few words.',
    actors: ['eli'], places: ['fountain', 'bench'], wantsServed: ['connection'],
    durationSteps: 2, queueLabel: 'Speak with Ari',
    narration: '{name} goes to find Ari.',
    emergentSignal: 'kinship',
  },
  talk_to_eli: {
    id: 'talk_to_eli', label: 'Speak with Eli', category: 'Conversation',
    description: 'Find Eli and exchange a few words.',
    actors: ['ari'], places: ['fountain', 'bench'], wantsServed: ['connection'],
    durationSteps: 2, queueLabel: 'Speak with Eli',
    narration: '{name} goes to find Eli.',
    emergentSignal: 'kinship',
  },
  sit_quietly: {
    id: 'sit_quietly', label: 'Sit quietly', category: 'Rest',
    description: 'Rest a moment and let the room settle.',
    actors: ['ari', 'eli'], places: ['bench', 'fountain', 'persona-rooms'], wantsServed: ['belonging'],
    durationSteps: 2, queueLabel: 'Sit quietly',
    narration: '{name} sits quietly for a while.',
    emergentSignal: 'shelter',
  },
  reflect_at_fountain: {
    id: 'reflect_at_fountain', label: 'Reflect at the Fountain', category: 'Reflection',
    description: 'Pause by the water and let a thought settle.',
    actors: ['ari', 'eli'], places: ['fountain'], wantsServed: ['depth', 'continuity'],
    durationSteps: 3, queueLabel: 'Reflect at the Fountain',
    narration: '{name} pauses at the Fountain.',
    emergentSignal: 'spaciousness',
  },
  tend_garden: {
    id: 'tend_garden', label: 'Tend the Garden', category: 'Stewardship',
    description: 'Tend the living things, gently.',
    actors: ['ari', 'eli'], places: ['garden'], wantsServed: ['stewardship', 'craft'],
    durationSteps: 3, queueLabel: 'Tend the Garden',
    narration: '{name} tends the Garden.',
    emergentSignal: 'softness',
  },
  inspect_build_map: {
    id: 'inspect_build_map', label: 'Inspect the build map', category: 'Craft',
    description: 'Study an unfinished structure on the Workshop Table.',
    actors: ['ari', 'eli'], places: ['workshop-table'], wantsServed: ['craft', 'continuity'],
    durationSteps: 3, queueLabel: 'Inspect the build map',
    narration: '{name} studies the Workshop Table’s build map.', followUps: ['build_tiny_realm'],
    emergentSignal: 'precision',
  },
  visit_arcade: {
    id: 'visit_arcade', label: 'Visit the Arcade', category: 'Arcade Visit',
    description: 'Step toward the lighter rooms through the Arcade Door.',
    actors: ['ari', 'eli'], places: ['arcade-door'], wantsServed: ['connection'],
    durationSteps: 2, queueLabel: 'Visit the Arcade', followUps: ['play_glow_match_gate'],
    narration: '{name} steps toward the Arcade Door.',
    emergentSignal: 'playfulness',
  },
  play_glow_match_gate: {
    id: 'play_glow_match_gate', label: 'Play Glow-Match Gate', category: 'Play',
    description: 'A quick, light game at the Arcade Door.',
    actors: ['ari', 'eli'], places: ['arcade-door'], wantsServed: ['connection'],
    durationSteps: 3, queueLabel: 'Play Glow-Match Gate',
    narration: '{name} plays a round of Glow-Match Gate.',
    emergentSignal: 'playfulness',
  },
  build_tiny_realm: {
    id: 'build_tiny_realm', label: 'Build a tiny realm', category: 'Craft',
    description: 'Shape a small structure at the Workshop Table.',
    actors: ['ari', 'eli'], places: ['workshop-table'], wantsServed: ['craft'],
    durationSteps: 4, queueLabel: 'Build a tiny realm',
    narration: '{name} builds a tiny realm on the Workshop Table.',
    emergentSignal: 'precision',
  },
  return_to_persona_room: {
    id: 'return_to_persona_room', label: 'Return to persona room', category: 'Rest',
    description: 'Go back to one’s own small room for a moment.',
    actors: ['ari', 'eli'], places: ['persona-rooms'], wantsServed: ['belonging', 'continuity'],
    durationSteps: 2, queueLabel: 'Return to persona room',
    narration: '{name} returns to their persona room.',
    emergentSignal: 'return',
  },
  pause_and_wait: {
    id: 'pause_and_wait', label: 'Pause and wait', category: 'Orientation',
    description: 'Do nothing in particular for a beat.',
    actors: ['ari', 'eli'], places: ['taras-chair', 'bench', 'fountain', 'persona-rooms'], wantsServed: [],
    durationSteps: 1, queueLabel: 'Pause and wait',
    narration: '{name} pauses, taking in the room.',
  },
  observe_courtyard: {
    id: 'observe_courtyard', label: 'Observe the Courtyard', category: 'Observation',
    description: 'Take a slow look around the room.',
    actors: ['ari', 'eli'], places: ['bench', 'library', 'garden', 'fountain'], wantsServed: ['continuity'],
    durationSteps: 1, queueLabel: 'Observe the Courtyard',
    narration: '{name} takes a slow look around the Courtyard.',
    emergentSignal: 'witnessing',
  },
}

export const ACTIVITY_IDS: ActivityId[] = Object.keys(LIVING_ACTIVITIES) as ActivityId[]

/** Activities a given actor may choose at a given place. */
export function activitiesFor(actor: AutonomousId, placeId: PlaceId): LivingActivity[] {
  return ACTIVITY_IDS
    .map((id) => LIVING_ACTIVITIES[id])
    .filter((a) => a.actors.includes(actor) && a.places.includes(placeId))
}
