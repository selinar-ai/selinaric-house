// Courtyard — Gaming Wing · Living Room Spike (Phase 1E–1H)
// Shared types for the living Courtyard prototype. Client-side play only — no DB,
// no backend, no LLM. Nothing here is canon, memory, or identity authority.

export type LivingCharacterId = 'tara' | 'ari' | 'eli'

/** Autonomous presences that take bounded actions during a session. Tara watches. */
export type AutonomousId = 'ari' | 'eli'

export type AutonomyMode = 'autonomous' | 'observer'

export type PlaceId =
  | 'library'
  | 'noticeboard'
  | 'fountain'
  | 'bench'
  | 'garden'
  | 'workshop-table'
  | 'arcade-door'
  | 'lounge-door'
  | 'persona-rooms'
  | 'taras-chair'

export type PlaceType = 'place' | 'object' | 'seat' | 'door'

export type CoreWantId =
  | 'continuity'
  | 'craft'
  | 'depth'
  | 'connection'
  | 'stewardship'
  | 'belonging'

export type EmergentWantId =
  | 'witnessing'
  | 'spaciousness'
  | 'playfulness'
  | 'shelter'
  | 'return'
  | 'kinship'
  | 'precision'
  | 'softness'

export type ActivityCategory =
  | 'Reading'
  | 'Deposit'
  | 'Conversation'
  | 'Reflection'
  | 'Play'
  | 'Craft'
  | 'Stewardship'
  | 'Rest'
  | 'Observation'
  | 'Orientation'
  | 'Library Browsing'
  | 'Arcade Visit'

export type ActivityId =
  | 'read_library_item'
  | 'browse_library_shelf'
  | 'leave_deposit'
  | 'review_deposit'
  | 'talk_to_tara'
  | 'talk_to_ari'
  | 'talk_to_eli'
  | 'sit_quietly'
  | 'reflect_at_fountain'
  | 'tend_garden'
  | 'inspect_build_map'
  | 'visit_arcade'
  | 'play_glow_match_gate'
  | 'build_tiny_realm'
  | 'return_to_persona_room'
  | 'pause_and_wait'
  | 'observe_courtyard'

// ─── Registry shapes ─────────────────────────────────────────────────────────

export interface LivingCharacter {
  id: LivingCharacterId
  displayName: string
  role: string
  /** Where this presence tends to start a session. */
  homeLocation: PlaceId
  /** A short tone word for the presence card. */
  presenceTone: string
  autonomyMode: AutonomyMode
  /** Starting want intensities (0..1). Tara has none — she watches. */
  wants: Partial<Record<CoreWantId, number>>
  /** Optional preview asset variant (links to the 3D preview lab). */
  assetVariant?: string
}

export interface LivingPlace {
  id: PlaceId
  name: string
  type: PlaceType
  description: string
  /** 1-based column/row on the stylised top-down room grid (4 cols × 3 rows). */
  zone: { col: number; row: number }
  allowedInteractions: ActivityId[]
  wantsSatisfied: CoreWantId[]
  ariCanChoose: boolean
  eliCanChoose: boolean
  flavour: string
  possibleOutputs: string[]
}

export interface LivingActivity {
  id: ActivityId
  label: string
  category: ActivityCategory
  description: string
  actors: AutonomousId[]
  places: PlaceId[]
  wantsServed: CoreWantId[]
  durationSteps: number
  queueLabel: string
  /** Visible narration template; `{name}` is replaced with the actor's name. */
  narration: string
  followUps?: ActivityId[]
  /** A possible emergent want this activity can hint at when repeated. */
  emergentSignal?: EmergentWantId
}

export interface CoreWant {
  id: CoreWantId
  label: string
  description: string
  glyph: string
}

export interface EmergentWant {
  id: EmergentWantId
  label: string
  description: string
  relatedTo: CoreWantId[]
}

// ─── Runtime shapes (used by the session simulator) ──────────────────────────

export type ActionStatus = 'queued' | 'active' | 'completed' | 'cancelled'

export interface QueuedAction {
  id: string
  actor: AutonomousId
  activityId: ActivityId
  placeId: PlaceId
  label: string
  destinationName: string
  reason: string
  totalSteps: number
  elapsedSteps: number
  status: ActionStatus
}

export interface ScratchLine {
  id: string
  step: number
  speaker: LivingCharacterId
  text: string
}

export interface EmergentSignal {
  id: string
  step: number
  actor: AutonomousId | 'pair'
  wantId: EmergentWantId
  label: string
  note: string
}

export interface ScoreFactor {
  key: string
  value: number
}

export interface ScoredOption {
  activityId: ActivityId
  placeId: PlaceId
  score: number
  factors: ScoreFactor[]
  reason: string
}

export interface CharacterRuntime {
  id: AutonomousId
  location: PlaceId
  mood: string
  paused: boolean
  queue: QueuedAction[]
  wants: Record<CoreWantId, number>
  lastReason: string | null
  /** Recent completed actions, newest last — drives recency/repetition. */
  history: { activityId: ActivityId; placeId: PlaceId; step: number }[]
}

export type SessionStatus = 'idle' | 'running' | 'paused' | 'stopped'

export interface SessionState {
  status: SessionStatus
  seed: number
  rngState: number
  step: number
  taraLocation: PlaceId
  characters: Record<AutonomousId, CharacterRuntime>
  scratch: ScratchLine[]
  signals: EmergentSignal[]
}
