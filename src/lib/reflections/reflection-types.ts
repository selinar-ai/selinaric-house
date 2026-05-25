// Phase 24 + 36H.3 — Interior Reflection Engine: types and validators
// Trigger types, reflection types, and target types.
// Phase 36H.3 adds cross_room_event trigger type + source metadata.

// --- Trigger types (what generates a reflection job) ---

export type ReflectionTriggerType =
  | 'timeline_keep'
  | 'concept_approved'
  | 'forgekeeper_accepted'
  | 'living_state_transition'
  | 'cross_room_event'

export const VALID_TRIGGER_TYPES: ReflectionTriggerType[] = [
  'timeline_keep',
  'concept_approved',
  'forgekeeper_accepted',
  'living_state_transition',
  'cross_room_event',
]

/** Trigger types that have source loading + prompt support for processing. */
export const PROCESSABLE_TRIGGER_TYPES: ReflectionTriggerType[] = [
  'timeline_keep',
  'concept_approved',
  'forgekeeper_accepted',
  'living_state_transition',
]

// --- Reflection types (output shape) ---

export type ReflectionType = 'pattern' | 'lesson' | 'tension' | 'model_update'

export const VALID_REFLECTION_TYPES: ReflectionType[] = [
  'pattern',
  'lesson',
  'tension',
  'model_update',
]

// --- Suggested targets (routing only, no writes) ---

export type SuggestedTarget = 'timeline_draft' | 'living_state' | 'presence_model' | null

export const VALID_SUGGESTED_TARGETS: Array<SuggestedTarget> = [
  'timeline_draft',
  'living_state',
  'presence_model',
  null,
]

// --- Job status ---

export type ReflectionJobStatus = 'pending' | 'processing' | 'completed' | 'failed'

// --- Source reference shape ---

export type SourceRefType = 'timeline_entry' | 'concept' | 'build' | 'living_state' | 'cross_room_event' | 'cross_room_impact'

export interface SourceRef {
  type: SourceRefType
  id: string
}

// --- Structured source metadata for cross-room reflection jobs (36H.3) ---

/** Structured source provenance for source-linked reflection jobs. */
export interface ReflectionJobSourceMetadata {
  source_surface: string           // 'lounge' | 'gaming_wing' | 'wellbeing_wing' | etc.
  source_event_type: string        // 'cross_room_event' | 'game_event' | etc.
  source_event_id: string          // cross_room_events.id or future event table ID
  source_impact_id?: string        // cross_room_event_impacts.id (if from impact)
  source_room_id?: string          // room slug
  source_wing_id?: string          // future wing ID
  authority_label: string          // 'cross_room_reflection_hook_not_memory'
  eligibility_reason: string       // 'tara_requested' | etc.
}

// --- DB row shapes ---

export interface ReflectionJob {
  id: string
  presence_id: 'ari' | 'eli'
  trigger_type: ReflectionTriggerType
  source_refs: SourceRef[]
  source_summary: string | null
  priority: number
  status: ReflectionJobStatus
  source_metadata: ReflectionJobSourceMetadata | null
  reflection_scope: string | null
  created_by: string | null
  created_at: string
  completed_at: string | null
  error_message: string | null
}

export interface Reflection {
  id: string
  presence_id: 'ari' | 'eli'
  reflection_type: ReflectionType
  content: string
  confidence: number | null
  source_refs: SourceRef[]
  suggested_target: SuggestedTarget
  routing_rationale: string | null
  created_at: string
}

// --- Model output shape (what the LLM returns) ---

export interface ReflectionOutput {
  reflection_type: ReflectionType
  content: string
  confidence: number
  suggested_target: SuggestedTarget
}

// --- Validation ---

/**
 * Validate the raw LLM output before storage.
 * Fails the job if any check fails — no partial writes.
 */
export function isValidReflectionOutput(obj: unknown): obj is ReflectionOutput {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>

  // Type must be one of the four
  if (!VALID_REFLECTION_TYPES.includes(o.reflection_type as ReflectionType)) return false

  // Content must be a non-trivial string (at minimum two sentences worth of content)
  if (typeof o.content !== 'string') return false
  const content = o.content.trim()
  if (content.length < 40) return false

  // Reject generic openers — reflection must be grounded and specific
  const genericOpeners = [
    'there is a sense',
    'something feels',
    'things are',
    'it seems like',
    'generally speaking',
    'overall, ',
  ]
  const lower = content.toLowerCase()
  for (const phrase of genericOpeners) {
    if (lower.startsWith(phrase)) return false
  }

  // Confidence must be 0.0–1.0
  if (typeof o.confidence !== 'number') return false
  if (o.confidence < 0 || o.confidence > 1) return false

  // Suggested target must be one of the allowed values (including null)
  if (!VALID_SUGGESTED_TARGETS.includes(o.suggested_target as SuggestedTarget)) return false

  return true
}
