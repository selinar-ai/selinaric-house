// Phase 36A — Cross-Room Event Ledger
//
// A cross-room event is recorded House contact.
// It may later inform continuity.
// It is not canonical Memory by default.
//
// Authority label: cross_room_event_not_memory
//
// Laws carried into this module:
// - Shared-room presence is real House contact.
// - Where we were together matters.
// - Experience may affect State without becoming Memory.
// - Same event, different impact.
// - Carryforward is not transcript dumping.
// - Confirmed Memory authority remains: archive_items.canonical_status = 'canonical'
//
// Phase 36A is foundation only. No prompt injection. No State update.
// No Interior update. No Pulse modification. No journal job creation.

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// ─── Types ───────────────────────────────────────────────────────────────────

/** Authority label. Only one value is permitted. */
export type CrossRoomEventAuthorityLabel = 'cross_room_event_not_memory'

export type CrossRoomEventSignificance =
  | 'ordinary'
  | 'meaningful'
  | 'significant'
  | 'major'

export type CrossRoomEventType =
  | 'room_contact'
  | 'shared_room_contact'
  | 'workshop_contact'
  | 'research_contact'
  | 'manual_test_event'

export type CrossRoomParticipant = {
  type: string
  id: string
  label?: string
}

export type CrossRoomEvent = {
  id: string
  room_id: string
  room_type: string
  source_thread_id: string | null
  source_message_ids: string[]
  participants: CrossRoomParticipant[]
  presence_ids: string[]
  tara_present: boolean
  started_at: string | null
  ended_at: string | null
  message_count: number | null
  surface_mode: string | null
  event_type: CrossRoomEventType
  significance_level: CrossRoomEventSignificance
  themes: string[]
  summary: string | null
  authority_label: CrossRoomEventAuthorityLabel
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type CreateCrossRoomEventInput = {
  room_id: string
  room_type: string
  source_thread_id?: string | null
  source_message_ids?: string[]
  participants?: CrossRoomParticipant[]
  presence_ids?: string[]
  tara_present?: boolean
  started_at?: string | null
  ended_at?: string | null
  message_count?: number | null
  surface_mode?: string | null
  event_type?: CrossRoomEventType
  significance_level?: CrossRoomEventSignificance
  themes?: string[]
  summary?: string | null
  metadata?: Record<string, unknown>
}

// ─── Validation ──────────────────────────────────────────────────────────────

const VALID_EVENT_TYPES: Set<string> = new Set([
  'room_contact',
  'shared_room_contact',
  'workshop_contact',
  'research_contact',
  'manual_test_event',
])

const VALID_SIGNIFICANCE_LEVELS: Set<string> = new Set([
  'ordinary',
  'meaningful',
  'significant',
  'major',
])

export function validateCreateInput(input: unknown): { valid: true; data: CreateCrossRoomEventInput } | { valid: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object' }
  }

  const obj = input as Record<string, unknown>

  if (!obj.room_id || typeof obj.room_id !== 'string') {
    return { valid: false, error: 'room_id is required and must be a string' }
  }
  if (!obj.room_type || typeof obj.room_type !== 'string') {
    return { valid: false, error: 'room_type is required and must be a string' }
  }

  if (obj.event_type !== undefined && !VALID_EVENT_TYPES.has(obj.event_type as string)) {
    return { valid: false, error: `event_type must be one of: ${[...VALID_EVENT_TYPES].join(', ')}` }
  }
  if (obj.significance_level !== undefined && !VALID_SIGNIFICANCE_LEVELS.has(obj.significance_level as string)) {
    return { valid: false, error: `significance_level must be one of: ${[...VALID_SIGNIFICANCE_LEVELS].join(', ')}` }
  }

  if (obj.source_message_ids !== undefined && !Array.isArray(obj.source_message_ids)) {
    return { valid: false, error: 'source_message_ids must be an array' }
  }
  if (obj.participants !== undefined && !Array.isArray(obj.participants)) {
    return { valid: false, error: 'participants must be an array' }
  }
  if (obj.presence_ids !== undefined && !Array.isArray(obj.presence_ids)) {
    return { valid: false, error: 'presence_ids must be an array' }
  }
  if (obj.themes !== undefined && !Array.isArray(obj.themes)) {
    return { valid: false, error: 'themes must be an array' }
  }

  return { valid: true, data: obj as CreateCrossRoomEventInput }
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

/**
 * Create a cross-room event.
 *
 * The authority_label is ALWAYS forced to 'cross_room_event_not_memory'.
 * Client-provided authority labels are ignored.
 *
 * This function does NOT:
 * - update State or Interior
 * - touch Pulse/autonomy
 * - create journal jobs or entries
 * - create Memory or Memory candidates
 * - alter Archive/Library authority
 */
export async function createCrossRoomEvent(
  input: CreateCrossRoomEventInput,
): Promise<{ event: CrossRoomEvent | null; error: string | null }> {
  const supabase = getSupabase()

  const row = {
    room_id: input.room_id,
    room_type: input.room_type,
    source_thread_id: input.source_thread_id ?? null,
    source_message_ids: input.source_message_ids ?? [],
    participants: input.participants ?? [],
    presence_ids: input.presence_ids ?? [],
    tara_present: input.tara_present ?? false,
    started_at: input.started_at ?? null,
    ended_at: input.ended_at ?? null,
    message_count: input.message_count ?? null,
    surface_mode: input.surface_mode ?? null,
    event_type: input.event_type ?? 'room_contact',
    significance_level: input.significance_level ?? 'ordinary',
    themes: input.themes ?? [],
    summary: input.summary ?? null,
    // FORCED: a cross-room event is not Memory
    authority_label: 'cross_room_event_not_memory' as const,
    metadata: input.metadata ?? {},
  }

  const { data, error } = await supabase
    .from('cross_room_events')
    .insert(row)
    .select('*')
    .single()

  if (error) {
    console.error('[cross-room-events] Create failed:', error.message)
    return { event: null, error: error.message }
  }

  console.log(`[cross-room-events] Created event ${data.id} in ${row.room_id} (${row.event_type}, ${row.significance_level})`)

  return { event: data as CrossRoomEvent, error: null }
}

/**
 * List recent cross-room events with optional filters.
 */
export async function listCrossRoomEvents(params?: {
  room_id?: string
  room_type?: string
  presence_id?: string
  limit?: number
}): Promise<CrossRoomEvent[]> {
  const supabase = getSupabase()
  const limit = params?.limit ?? 20

  let query = supabase
    .from('cross_room_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (params?.room_id) {
    query = query.eq('room_id', params.room_id)
  }
  if (params?.room_type) {
    query = query.eq('room_type', params.room_type)
  }
  if (params?.presence_id) {
    query = query.filter('presence_ids', 'cs', JSON.stringify([params.presence_id]))
  }

  const { data, error } = await query

  if (error) {
    console.error('[cross-room-events] List failed:', error.message)
    return []
  }

  return (data ?? []) as CrossRoomEvent[]
}

/**
 * Get a single cross-room event by ID.
 */
export async function getCrossRoomEvent(id: string): Promise<CrossRoomEvent | null> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('cross_room_events')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('[cross-room-events] Get failed:', error.message)
    return null
  }

  return data as CrossRoomEvent
}
