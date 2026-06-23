// Phase 11F — House Noticeboard
//
// A noticeboard in the hallway. A note on the kitchen table.
// A small deposit of presence — not a Telegram, not a journal, not a build
// concept, not a memory, and not an obligation for Tara to reply.
//
// Core Law:
//   A House Noticeboard item is a shared deposit, not Memory, not Journal,
//   not Telegram, not Lounge chat, and not prompt authority.
//   The House may confirm that Ari or Eli CHOSE to leave a deposit (that fact
//   is confirmed continuity in pulse_autonomy_events). The deposited TEXT does
//   not become Memory, evidence, Library, Archive, Journal, or Held Truth
//   unless Tara later routes it through an existing governed review pathway.
//
// This module owns:
//   - Noticeboard types
//   - The locked deposit payload builder (authority flags can never drift)
//   - The Tara review/status transition rules
//   - DB helpers used by Pulse execution and the Noticeboard API
//
// It deliberately does NOT touch archive_items, presence_journal, room_messages,
// lounge_*, memory_*, library_*, helper_*, or any prompt/recall surface.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ─── Types ───────────────────────────────────────────────────────────────────

export type HouseNoticeboardSourceType = 'pulse_house_deposit' | 'tara_manual_note'

export type HouseNoticeboardNoteKind =
  | 'deposit'
  | 'observation'
  | 'fragment'
  | 'open_thread'
  | 'house_note'

export type HouseNoticeboardStatus =
  | 'active'
  | 'viewed'
  | 'pinned'
  | 'released'
  | 'routed_to_library_review'
  | 'routed_to_archive_review'
  | 'hidden'

export type HouseNoticeboardItem = {
  id: string
  source_type: HouseNoticeboardSourceType
  source_event_id: string | null
  presence_id: 'ari' | 'eli' | null
  content: string
  note_kind: HouseNoticeboardNoteKind
  visibility: 'shared_house'
  authority_label: 'house_noticeboard_not_memory'
  status: HouseNoticeboardStatus
  not_memory: true
  not_evidence: true
  not_prompt_authority: true
  authority_changed: false
  created_at: string
  viewed_at: string | null
  reviewed_at: string | null
  reviewed_by: string | null
}

// ─── Governance constants ────────────────────────────────────────────────────

/**
 * The locked authority label. A deposit is never Memory.
 * The matching column has a CHECK constraint enforcing this exact value.
 */
export const NOTICEBOARD_AUTHORITY_LABEL = 'house_noticeboard_not_memory' as const

/**
 * The locked authority flags, applied to every deposit. These are never derived
 * from input and never change. The DB enforces them with CHECK constraints
 * (not_memory = true, not_evidence = true, not_prompt_authority = true,
 * authority_changed = false), so even a malformed write cannot flip them.
 */
export const NOTICEBOARD_AUTHORITY_FLAGS = {
  authority_label: NOTICEBOARD_AUTHORITY_LABEL,
  not_memory: true,
  not_evidence: true,
  not_prompt_authority: true,
  authority_changed: false,
} as const

// ─── Tara review / status transitions ────────────────────────────────────────

/**
 * Allowed status transitions (Phase 11F, §11).
 *
 * Tara may review a deposit: mark it viewed, pin it, release it, hide it, or
 * route it to a Library/Archive review (status-only in this phase). None of
 * these change authority — they are review/status metadata only.
 *
 * `released`, `hidden`, `routed_to_library_review`, and `routed_to_archive_review`
 * are terminal (no onward transitions in this phase).
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<HouseNoticeboardStatus, HouseNoticeboardStatus[]> = {
  active: ['viewed', 'pinned', 'released', 'hidden', 'routed_to_library_review', 'routed_to_archive_review'],
  viewed: ['pinned', 'released', 'hidden', 'routed_to_library_review', 'routed_to_archive_review'],
  pinned: ['viewed', 'released', 'hidden', 'routed_to_library_review', 'routed_to_archive_review'],
  released: [],
  hidden: [],
  routed_to_library_review: [],
  routed_to_archive_review: [],
}

export function isAllowedStatusTransition(
  from: HouseNoticeboardStatus,
  to: HouseNoticeboardStatus,
): boolean {
  return ALLOWED_STATUS_TRANSITIONS[from]?.includes(to) ?? false
}

const ROUTED_STATUSES: HouseNoticeboardStatus[] = [
  'routed_to_library_review',
  'routed_to_archive_review',
]

/**
 * Build the set of column updates for a status transition. Only ever touches
 * status + review/status metadata timestamps. NEVER touches content or any
 * authority flag — those are immutable (and DB-locked).
 */
export function buildStatusUpdate(
  to: HouseNoticeboardStatus,
  nowIso: string,
): Record<string, string> {
  const update: Record<string, string> = { status: to }
  if (to === 'viewed') {
    update.viewed_at = nowIso
  }
  if (ROUTED_STATUSES.includes(to)) {
    update.reviewed_at = nowIso
    update.reviewed_by = 'tara'
  }
  return update
}

// ─── Deposit payload builder (pure) ──────────────────────────────────────────

/**
 * Build the insert payload for a Pulse house_deposit. Authority flags are
 * always the locked safe values — never derived from the presence's text.
 * The deposit content is the presence's note; nothing else is stored here.
 */
export function buildPulseDepositPayload(args: {
  presenceId: 'ari' | 'eli'
  eventId: string
  content: string
  noteKind?: HouseNoticeboardNoteKind
}) {
  return {
    source_type: 'pulse_house_deposit' as const,
    source_event_id: args.eventId,
    presence_id: args.presenceId,
    content: args.content,
    note_kind: args.noteKind ?? 'deposit',
    visibility: 'shared_house' as const,
    status: 'active' as const,
    ...NOTICEBOARD_AUTHORITY_FLAGS,
  }
}

/**
 * Fact-only confirmed-continuity wording for a house_deposit choice.
 * Records ONLY that the presence chose to leave a deposit — never the deposit
 * content, which is not Memory, not evidence, not prompt authority.
 *
 * Used wherever the Pulse system surfaces the fact of the choice (e.g. room
 * continuity). The deposit content is never included.
 */
export function buildDepositContinuityFact(presenceName: string, windowTimeStr: string): string {
  return `${presenceName} chose House Deposit at the ${windowTimeStr} autonomy window and left a shared Noticeboard item. The deposit content is not Memory, not evidence, and not prompt authority unless Tara separately reviews it.`
}

// ─── Supabase client ─────────────────────────────────────────────────────────

function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

export interface CreateDepositResult {
  id: string | null
  already_existed: boolean
  error: string | null
}

/**
 * Create exactly one Noticeboard deposit for a Pulse autonomy event.
 *
 * Idempotent: if a deposit already exists for this event, returns it instead of
 * inserting a second one. A partial unique index on (source_event_id) for
 * pulse_house_deposit rows is the database-level backstop against a race.
 *
 * This NEVER creates Memory, Archive, Journal, Library, Graph, Helper, or any
 * prompt-authority record. It writes one row to house_noticeboard_items.
 */
export async function createDepositForEvent(args: {
  presenceId: 'ari' | 'eli'
  eventId: string
  content: string
  noteKind?: HouseNoticeboardNoteKind
  client?: SupabaseClient
}): Promise<CreateDepositResult> {
  const supabase = args.client ?? getServiceClient()

  // Idempotency: one deposit per event.
  const { data: existing } = await supabase
    .from('house_noticeboard_items')
    .select('id')
    .eq('source_event_id', args.eventId)
    .eq('source_type', 'pulse_house_deposit')
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    return { id: existing.id, already_existed: true, error: null }
  }

  const payload = buildPulseDepositPayload({
    presenceId: args.presenceId,
    eventId: args.eventId,
    content: args.content,
    noteKind: args.noteKind,
  })

  const { data, error } = await supabase
    .from('house_noticeboard_items')
    .insert(payload)
    .select('id')
    .single()

  if (error) {
    // Unique-index race: a concurrent run created the deposit first.
    if (error.code === '23505') {
      const { data: raced } = await supabase
        .from('house_noticeboard_items')
        .select('id')
        .eq('source_event_id', args.eventId)
        .eq('source_type', 'pulse_house_deposit')
        .limit(1)
        .maybeSingle()
      if (raced?.id) return { id: raced.id, already_existed: true, error: null }
    }
    console.error('[house-noticeboard] Deposit insert failed:', error.message)
    return { id: null, already_existed: false, error: error.message }
  }

  return { id: data?.id ?? null, already_existed: false, error: null }
}

/**
 * Reverse-lookup: fetch the deposit linked to a Pulse event (for UI enrichment).
 * Returns a lightweight preview, never injected into any prompt.
 */
export async function getDepositForEvent(
  eventId: string,
  client?: SupabaseClient,
): Promise<Pick<HouseNoticeboardItem, 'id' | 'content' | 'status' | 'note_kind'> | null> {
  const supabase = client ?? getServiceClient()
  const { data } = await supabase
    .from('house_noticeboard_items')
    .select('id, content, status, note_kind')
    .eq('source_event_id', eventId)
    .eq('source_type', 'pulse_house_deposit')
    .limit(1)
    .maybeSingle()
  return (data as Pick<HouseNoticeboardItem, 'id' | 'content' | 'status' | 'note_kind'> | null) ?? null
}
