/**
 * Phase 39.4 — Runtime Candidate Adapter
 *
 * Pure deterministic adapter that maps already-assembled runtime context signals
 * into CandidateRecallSource[] for buildRecallPacket().
 *
 * Design rule: map signals to surfaces and pass metadata through.
 * Delegate all scope / relevance / active-vs-excluded classification to buildRecallPacket().
 * Do not duplicate complex builder logic here.
 * Do not fetch, read, write, mutate, persist, or call external services.
 *
 * Purity guarantee:
 *   No fetch, Supabase, createClient, OpenAI, Anthropic, Brave Search,
 *   Date.now, crypto.randomUUID, process.env, localStorage, sessionStorage,
 *   window, or document.
 *   No async. No Promises. Pure synchronous mapping only.
 */

import { buildRecallPacket } from './recallPacketBuilder'
import {
  CandidateRecallSource,
  RecallPacket,
  RuntimeContextSignal,
  RuntimeContextSignalType,
  RuntimeRecallPacketInput,
  SourceSurface,
} from './recallPacketTypes'

// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL → SURFACE MAP
// Maps each RuntimeContextSignalType to its corresponding SourceSurface.
// Covers all 22 runtime-builder-v1 surfaces from Phase 39.1/39.2.
// ─────────────────────────────────────────────────────────────────────────────

export const SIGNAL_TO_SURFACE: Record<RuntimeContextSignalType, SourceSurface> = {
  // Memory tier
  [RuntimeContextSignalType.GovernedConfirmedMemory]:         SourceSurface.confirmed_archive_memory,
  [RuntimeContextSignalType.PresenceScopedConfirmedMemory]:   SourceSurface.presence_scoped_confirmed_memory,
  [RuntimeContextSignalType.ManualMemoryCandidateRecall]:     SourceSurface.memory_candidate,
  [RuntimeContextSignalType.ManualArchiveOnlyRecall]:         SourceSurface.archive_only_context,

  // Continuity tier
  [RuntimeContextSignalType.RecentContinuity]:                SourceSurface.recent_continuity_not_memory,
  [RuntimeContextSignalType.CurrentHouseContext]:             SourceSurface.current_house_context,
  [RuntimeContextSignalType.ShortHorizonThreadContext]:       SourceSurface.short_horizon_thread_context,
  [RuntimeContextSignalType.LoungeRecentContinuity]:          SourceSurface.lounge_recent_continuity,
  [RuntimeContextSignalType.RecentCrossRoomContext]:          SourceSurface.recent_cross_room_context,
  [RuntimeContextSignalType.CrossRoomPromptCarryforward]:     SourceSurface.cross_room_prompt_carryforward,

  // Presence state tier
  [RuntimeContextSignalType.PulseAutonomousContinuity]:       SourceSurface.pulse_autonomous_continuity,
  [RuntimeContextSignalType.PulseCurrentState]:               SourceSurface.pulse_current_state,
  [RuntimeContextSignalType.LivingState]:                     SourceSurface.living_state,
  [RuntimeContextSignalType.InteriorNotes]:                   SourceSurface.interior_notes,

  // Inner continuity tier
  [RuntimeContextSignalType.JournalInnerContinuity]:          SourceSurface.journal_inner_continuity,
  [RuntimeContextSignalType.HeldTruthPresenceContinuity]:     SourceSurface.held_truth_presence_continuity,

  // Reference tier
  [RuntimeContextSignalType.LibraryRagReference]:             SourceSurface.library_rag_reference,
  [RuntimeContextSignalType.LibraryCanonicalMemoryReference]: SourceSurface.library_canonical_memory_reference,
  [RuntimeContextSignalType.AttachmentContext]:               SourceSurface.attachment_context,

  // Identity continuity tier
  [RuntimeContextSignalType.IdentityTimeline]:                SourceSurface.identity_timeline,

  // Ground failure
  [RuntimeContextSignalType.Unknown]:                         SourceSurface.unknown,
  [RuntimeContextSignalType.Insufficient]:                    SourceSurface.insufficient,
}

// ─────────────────────────────────────────────────────────────────────────────
// MAP SIGNALS → CANDIDATES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map already-assembled runtime context signals into CandidateRecallSource[].
 *
 * Each signal becomes exactly one candidate. Metadata is passed through unchanged.
 * No classification occurs here — scope, relevance, and active/excluded
 * decisions are delegated to buildRecallPacket().
 *
 * Pure: no I/O, no async, no side effects.
 */
export function mapRuntimeContextSignalsToCandidates(
  signals: RuntimeContextSignal[],
): CandidateRecallSource[] {
  return signals.map(signal => {
    const candidate: CandidateRecallSource = {
      surface:        SIGNAL_TO_SURFACE[signal.signal_type],
      presence_scope: signal.presence_scope,
      prompt_eligible: signal.prompt_eligible,
      expired:        signal.expired,
      relevance:      signal.relevance,
      source_ref:     signal.source_ref,
      conflicts_with: signal.conflicts_with,
      conflict_types: signal.conflict_types,
    }
    return candidate
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a RecallPacket from runtime context signals in one step.
 *
 * Internally: signals → mapRuntimeContextSignalsToCandidates() → buildRecallPacket().
 * The caller provides packet_id and computed_at — this function does not generate them.
 *
 * Pure: no I/O, no async, no side effects.
 */
export function buildRecallPacketFromRuntimeSignals(
  input: RuntimeRecallPacketInput,
): RecallPacket {
  const candidate_sources = mapRuntimeContextSignalsToCandidates(input.signals)

  return buildRecallPacket({
    packet_id:        input.packet_id,
    computed_at:      input.computed_at,
    presence:         input.presence,
    room:             input.room,
    candidate_sources,
    query_context:    input.query_context,
  })
}
