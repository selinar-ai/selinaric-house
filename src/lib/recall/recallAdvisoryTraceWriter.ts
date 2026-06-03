/**
 * Phase 39.7 — Recall Advisory Trace Writer
 *
 * Writes a metadata-only trace row to `runtime_recall_advisory_traces`
 * after each Recall Packet Advisory is generated in a chat route.
 *
 * Authority boundary (enforced by DB constraints):
 *   NOT Memory. NOT evidence. NOT prompt authority. NOT a RecallPacket source surface.
 *   Trace rows must never be used as prompt context for Ari, Eli, or Lounge.
 *
 * Data safety:
 *   Accepts only RecallPacket + route metadata — no raw content.
 *   Does NOT accept: user message, assistant response, prompt text, source IDs,
 *   Memory IDs, journal body, Library snippets, model output, secrets, cookies.
 *
 * Non-fatal: if the trace write fails, chat continues without interruption.
 */

import { createClient } from '@supabase/supabase-js'
import type { RecallPacket } from './recallPacketTypes'
import { ExclusionReason, SourceSurface } from './recallPacketTypes'

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE CLIENT
// ─────────────────────────────────────────────────────────────────────────────

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SURFACE FAMILY SETS
// Maps SourceSurface values to the trace count columns.
// ─────────────────────────────────────────────────────────────────────────────

const CONFIRMED_MEMORY_SURFACES = new Set<SourceSurface>([
  SourceSurface.confirmed_archive_memory,
  SourceSurface.presence_scoped_confirmed_memory,
  SourceSurface.library_canonical_memory_reference,
])

const RECENT_CONTINUITY_SURFACES = new Set<SourceSurface>([
  SourceSurface.recent_continuity_not_memory,
])

const ARCHIVE_RECALL_SURFACES = new Set<SourceSurface>([
  SourceSurface.memory_candidate,
  SourceSurface.archive_only_context,
])

const CROSS_ROOM_SURFACES = new Set<SourceSurface>([
  SourceSurface.cross_room_prompt_carryforward,
  SourceSurface.lounge_recent_continuity,
  SourceSurface.recent_cross_room_context,
])

// ─────────────────────────────────────────────────────────────────────────────
// TRACE WRITER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write a metadata-only trace row for a Recall Packet Advisory event.
 *
 * Non-fatal: any write failure is logged safely (route/presence only, no content)
 * and does not interrupt response generation.
 */
export async function writeRecallAdvisoryTrace(input: {
  routeSurface: 'ari_chat' | 'eli_chat' | 'lounge_chat'
  presenceId:   'ari' | 'eli'
  roomContext:  'ari_room' | 'eli_room' | 'lounge'
  packet:       RecallPacket
  advisoryInserted: boolean
  advisoryError?:   boolean
  errorCode?:       string
}): Promise<void> {
  try {
    const { packet, routeSurface, presenceId, roomContext } = input
    const { active_sources, excluded_sources, summary } = packet

    // ── Compute per-source-family counts from active_sources ─────────────────
    // These are counts only — no source content, IDs, or text is recorded.
    let confirmedMemoryCount   = 0
    let recentContinuityCount  = 0
    let journalCount           = 0
    let libraryCount           = 0
    let crossRoomCount         = 0
    let archiveRecallCount     = 0
    let unknownCount           = 0
    let insufficientCount      = 0

    for (const src of active_sources) {
      if (CONFIRMED_MEMORY_SURFACES.has(src.surface))        confirmedMemoryCount++
      else if (RECENT_CONTINUITY_SURFACES.has(src.surface))  recentContinuityCount++
      else if (src.surface === SourceSurface.journal_inner_continuity) journalCount++
      else if (src.surface === SourceSurface.library_rag_reference)    libraryCount++
      else if (CROSS_ROOM_SURFACES.has(src.surface))         crossRoomCount++
      else if (ARCHIVE_RECALL_SURFACES.has(src.surface))     archiveRecallCount++
      else if (src.surface === SourceSurface.unknown)        unknownCount++
      else if (src.surface === SourceSurface.insufficient)   insufficientCount++
    }

    // ── Compute excluded-reason counts ───────────────────────────────────────
    let excludedScopeCount             = 0
    let excludedExpiredCount           = 0
    let excludedLowRelevanceCount      = 0
    let excludedNotPromptEligibleCount = 0

    for (const src of excluded_sources) {
      switch (src.exclusion_reason) {
        case ExclusionReason.scope_prohibited:    excludedScopeCount++;             break
        case ExclusionReason.expired:             excludedExpiredCount++;            break
        case ExclusionReason.relevance_too_weak:  excludedLowRelevanceCount++;       break
        case ExclusionReason.not_prompt_eligible: excludedNotPromptEligibleCount++;  break
      }
    }

    // ── Insert trace row (metadata only) ────────────────────────────────────
    const supabase = getSupabase()
    await supabase.from('runtime_recall_advisory_traces').insert({
      trace_kind:   'recall_advisory',
      route_surface: routeSurface,
      presence_id:   presenceId,
      room_context:  roomContext,

      // packet_id is our own generated advisory identifier — not a Memory ID or source ID
      packet_id:    packet.packet_id,

      primary_response_instruction: packet.primary_response_instruction,
      grounding_condition: packet.has_sufficient_ground ? 'sufficient' : 'insufficient',
      conflict_count:      summary.conflict_count,

      active_source_count:   summary.active_count,
      excluded_source_count: summary.excluded_count,

      confirmed_memory_count:   confirmedMemoryCount,
      recent_continuity_count:  recentContinuityCount,
      journal_count:            journalCount,
      library_count:            libraryCount,
      cross_room_count:         crossRoomCount,
      archive_recall_count:     archiveRecallCount,
      unknown_count:            unknownCount,
      insufficient_count:       insufficientCount,

      excluded_scope_count:              excludedScopeCount,
      excluded_expired_count:            excludedExpiredCount,
      excluded_low_relevance_count:      excludedLowRelevanceCount,
      excluded_not_prompt_eligible_count: excludedNotPromptEligibleCount,

      advisory_inserted: input.advisoryInserted,
      advisory_error:    input.advisoryError ?? false,
      error_code:        input.errorCode ?? null,

      // Governance flags — must match DB constraints (always true/false as declared)
      not_memory:          true,
      not_evidence:        true,
      not_prompt_eligible: true,
      authority_changed:   false,
      review_routed:       false,
    })
  } catch (err) {
    // Non-fatal: log only safe metadata (no packet contents, no source text)
    console.error(
      '[recall-advisory-trace] Write failed (non-fatal):',
      err instanceof Error ? err.message : 'unknown error',
      '| route:', input.routeSurface,
      '| presence:', input.presenceId,
      '| room:', input.roomContext,
    )
  }
}
