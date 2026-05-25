// Phase 36H.2 — Cross-Room Journal Invitation Hooks
//
// Source-surface agnostic pathway for creating governed journal invitations
// from cross-room events, future Gaming Wing, Wellbeing Wing, etc.
//
// Core Law:
//   The House may invite. The presence writes. The journal carries.
//   The journal is not Memory. Nothing becomes inner life automatically.
//
// Authority labels:
//   cross_room_journal_hook_not_memory  — on source_metadata
//   journal_invitation_not_memory       — on the invitation concept
//
// This module does NOT:
// - create final journal entries
// - create Memory or Memory candidates
// - create Archive entries
// - update State, Interior, or Pulse
// - create reflection jobs or held truths
// - create graph nodes/edges
// - create carrybacks or carryforwards
// - create cross-room events (reads them only)
//
// It creates ONLY: pending journal_jobs rows via createJournalJob()

import { createClient } from '@supabase/supabase-js'
import { createJournalJob, type JournalJob, type JournalJobSourceMetadata } from '@/lib/journal'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QueueJournalInvitationInput {
  presenceId: 'ari' | 'eli'
  sourceSurface: string
  sourceEventType: string
  sourceEventId: string
  sourceImpactId?: string
  sourceRoomId?: string
  sourceWingId?: string
  contextSummary: string
  eligibilityReason: string
  authorityLabel: 'cross_room_journal_hook_not_memory'
  createdBy: 'tara'
}

export interface QueueJournalInvitationResult {
  created: boolean
  job?: JournalJob
  skippedReason?:
    | 'duplicate_pending_job'
    | 'invalid_presence'
    | 'missing_source_event_id'
    | 'missing_context_summary'
    | 'db_error'
}

// ─── Context Summary Builder ─────────────────────────────────────────────────

const CONTEXT_SUMMARY_MAX_CHARS = 800

/**
 * Build a bounded, presence-specific context summary from a cross-room impact.
 *
 * The summary is descriptive, not interpretive. It does not force an emotional
 * reading or impose what the presence should feel about the event.
 */
export function buildJournalInviteContext(
  impact: {
    impact_summary: string
    continuity_signal?: string | null
    emotional_signal?: string | null
    what_remains_open?: string[]
  },
  eventSummary: string | null,
  presenceId: string,
): string {
  const presenceName = presenceId === 'eli' ? 'Eli' : 'Ari'
  const parts: string[] = []

  if (eventSummary) {
    parts.push(`From a shared-room exchange: ${eventSummary}`)
  }

  parts.push(`${presenceName}'s extracted impact: ${impact.impact_summary}`)

  if (impact.continuity_signal) {
    parts.push(`Continuity signal: ${impact.continuity_signal}`)
  }

  if (impact.what_remains_open && impact.what_remains_open.length > 0) {
    parts.push(`What remains open: ${impact.what_remains_open.slice(0, 3).join('; ')}`)
  }

  // Bounded: cap at CONTEXT_SUMMARY_MAX_CHARS
  return parts.join(' — ').slice(0, CONTEXT_SUMMARY_MAX_CHARS)
}

// ─── Queue Function ──────────────────────────────────────────────────────────

/**
 * Queue a journal invitation from a governed source event.
 *
 * This is the primary reusable hook for all source surfaces:
 * Lounge cross-room events, future Gaming Wing, Wellbeing Wing, etc.
 *
 * Creates a pending journal_job with structured source_metadata.
 * Does NOT create a final journal entry. The presence writes later.
 *
 * Duplicate handling: one pending cross_room_invite per presence per
 * Melbourne date. Second attempt returns { created: false, skippedReason }.
 */
export async function queueJournalInvitationFromSource(
  input: QueueJournalInvitationInput,
): Promise<QueueJournalInvitationResult> {
  // Validate presence
  if (input.presenceId !== 'ari' && input.presenceId !== 'eli') {
    return { created: false, skippedReason: 'invalid_presence' }
  }

  // Validate source event ID
  if (!input.sourceEventId || input.sourceEventId.trim().length === 0) {
    return { created: false, skippedReason: 'missing_source_event_id' }
  }

  // Validate context summary
  if (!input.contextSummary || input.contextSummary.trim().length === 0) {
    return { created: false, skippedReason: 'missing_context_summary' }
  }

  // Build source metadata (server-derived, not trusted from client)
  const sourceMetadata: JournalJobSourceMetadata = {
    source_surface: input.sourceSurface,
    source_event_type: input.sourceEventType,
    source_event_id: input.sourceEventId,
    ...(input.sourceImpactId ? { source_impact_id: input.sourceImpactId } : {}),
    ...(input.sourceRoomId ? { source_room_id: input.sourceRoomId } : {}),
    ...(input.sourceWingId ? { source_wing_id: input.sourceWingId } : {}),
    authority_label: input.authorityLabel,
    eligibility_reason: input.eligibilityReason,
  }

  // Cap context summary
  const cappedSummary = input.contextSummary.trim().slice(0, CONTEXT_SUMMARY_MAX_CHARS)

  // Create the pending journal job
  const job = await createJournalJob(
    input.presenceId,
    'cross_room_invite',
    cappedSummary,
    input.createdBy,
    sourceMetadata,
  )

  if (!job) {
    // Unique constraint violation = already pending for this presence/date/reason
    return { created: false, skippedReason: 'duplicate_pending_job' }
  }

  console.log(
    `[journal-invitation-hooks] Created cross-room invite for ${input.presenceId}: ` +
    `job ${job.id}, source ${input.sourceSurface}/${input.sourceEventType}`
  )

  return { created: true, job }
}

// ─── Server-Side Impact-to-Invitation Pipeline ──────────────────────────────

/**
 * Create a journal invitation from a cross-room event impact.
 *
 * Server-side only. Fetches impact + parent event from DB, derives all
 * provenance fields. The frontend sends only the impactId — no source
 * metadata is trusted from the client.
 *
 * Returns the queue result, or an error string if the impact/event
 * cannot be resolved.
 */
export async function createJournalInvitationFromImpact(
  impactId: string,
): Promise<{ result: QueueJournalInvitationResult; error?: string }> {
  const supabase = getSupabase()

  // 1. Fetch impact (server-side — not trusted from client)
  const { data: impact, error: impactErr } = await supabase
    .from('cross_room_event_impacts')
    .select('id, cross_room_event_id, presence_id, impact_summary, continuity_signal, emotional_signal, what_remains_open, impact_status, authority_label')
    .eq('id', impactId)
    .single()

  if (impactErr || !impact) {
    return {
      result: { created: false },
      error: 'Impact not found',
    }
  }

  // Validate presence
  if (impact.presence_id !== 'ari' && impact.presence_id !== 'eli') {
    return {
      result: { created: false, skippedReason: 'invalid_presence' },
      error: `Invalid presence_id on impact: ${impact.presence_id}`,
    }
  }

  // 2. Fetch parent event (server-side — derive room/surface provenance)
  const { data: event, error: eventErr } = await supabase
    .from('cross_room_events')
    .select('id, room_id, room_type, summary, event_type')
    .eq('id', impact.cross_room_event_id)
    .single()

  if (eventErr || !event) {
    return {
      result: { created: false },
      error: 'Parent event not found',
    }
  }

  // 3. Build server-derived context summary
  const contextSummary = buildJournalInviteContext(
    {
      impact_summary: impact.impact_summary,
      continuity_signal: impact.continuity_signal,
      emotional_signal: impact.emotional_signal,
      what_remains_open: Array.isArray(impact.what_remains_open) ? impact.what_remains_open : [],
    },
    event.summary,
    impact.presence_id,
  )

  // 4. Derive source surface from room_type
  const sourceSurface = event.room_type === 'lounge' ? 'lounge'
    : event.room_type === 'ari-room' ? 'ari_room'
    : event.room_type === 'eli-room' ? 'eli_room'
    : event.room_type === 'workshop' ? 'workshop'
    : event.room_type // pass through for future types

  // 5. Queue the invitation with server-derived metadata
  const result = await queueJournalInvitationFromSource({
    presenceId: impact.presence_id as 'ari' | 'eli',
    sourceSurface,
    sourceEventType: event.event_type ?? 'cross_room_event',
    sourceEventId: event.id,
    sourceImpactId: impact.id,
    sourceRoomId: event.room_id,
    contextSummary,
    eligibilityReason: 'tara_requested',
    authorityLabel: 'cross_room_journal_hook_not_memory',
    createdBy: 'tara',
  })

  return { result }
}
