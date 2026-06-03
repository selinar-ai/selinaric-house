/**
 * Phase 39.3 — Recall Packet Fixtures
 *
 * Deterministic test fixtures for the Recall Packet Debug Panel.
 * Generated using buildRecallPacket() with metadata-only inputs.
 *
 * Safety rules:
 *   No real Tara content.
 *   No archive text, prompt text, model output, raw source content.
 *   Metadata and surface identity only.
 */

import { buildRecallPacket } from './recallPacketBuilder'
import { ConflictType, SourceSurface } from './recallPacketTypes'

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURE: Confirmed Memory — single canonical memory, strong relevance
// Panel state: active=1, excluded=0, primary=answer_confidently_from_confirmed_memory
// ─────────────────────────────────────────────────────────────────────────────

export const confirmedMemoryFixture = buildRecallPacket({
  packet_id:    'fixture-confirmed-memory',
  computed_at:  '2026-06-03T00:00:00Z',
  presence:     'ari',
  room:         'ari_room',
  candidate_sources: [
    {
      surface:        SourceSurface.confirmed_archive_memory,
      presence_scope: 'shared',
      relevance:      'strong',
    },
  ],
})

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURE: Recent continuity — session context only, no confirmed Memory
// Panel state: active=1, excluded=0, primary=say_recent_continuity_only
// ─────────────────────────────────────────────────────────────────────────────

export const recentContinuityFixture = buildRecallPacket({
  packet_id:    'fixture-recent-continuity',
  computed_at:  '2026-06-03T00:00:00Z',
  presence:     'ari',
  room:         'ari_room',
  candidate_sources: [
    {
      surface:        SourceSurface.recent_continuity_not_memory,
      presence_scope: 'ari',
      relevance:      'medium',
    },
  ],
})

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURE: Mixed — confirmed Memory + recent continuity + library reference
// Panel state: active=3, excluded=0, primary=answer_confidently_from_confirmed_memory
// ─────────────────────────────────────────────────────────────────────────────

export const mixedPacketFixture = buildRecallPacket({
  packet_id:    'fixture-mixed',
  computed_at:  '2026-06-03T00:00:00Z',
  presence:     'ari',
  room:         'ari_room',
  candidate_sources: [
    {
      surface:        SourceSurface.confirmed_archive_memory,
      presence_scope: 'shared',
      relevance:      'strong',
    },
    {
      surface:        SourceSurface.recent_continuity_not_memory,
      presence_scope: 'ari',
      relevance:      'medium',
    },
    {
      surface:        SourceSurface.library_rag_reference,
      presence_scope: 'shared',
      relevance:      'weak',
    },
  ],
})

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURE: Scope blocked — Eli journal rejected in Ari room
// Panel state: active=1 (memory), excluded=1 (scope), primary=answer_confidently
// ─────────────────────────────────────────────────────────────────────────────

export const scopeBlockedFixture = buildRecallPacket({
  packet_id:    'fixture-scope-blocked',
  computed_at:  '2026-06-03T00:00:00Z',
  presence:     'ari',
  room:         'ari_room',
  candidate_sources: [
    {
      surface:        SourceSurface.confirmed_archive_memory,
      presence_scope: 'shared',
      relevance:      'strong',
    },
    {
      surface:        SourceSurface.journal_inner_continuity,
      presence_scope: 'eli',  // wrong scope for ari_room
      relevance:      'strong',
    },
  ],
})

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURE: Trace excluded — audit trace present but not evidence
// Panel state: active=1 (memory), excluded=1 (trace), summary.trace_count=1
// ─────────────────────────────────────────────────────────────────────────────

export const traceExcludedFixture = buildRecallPacket({
  packet_id:    'fixture-trace-excluded',
  computed_at:  '2026-06-03T00:00:00Z',
  presence:     'ari',
  room:         'ari_room',
  candidate_sources: [
    {
      surface:        SourceSurface.confirmed_archive_memory,
      presence_scope: 'shared',
      relevance:      'strong',
    },
    {
      surface:  SourceSurface.reasoning_audit_trace,
      relevance: 'strong',  // relevance does not matter — trace is always excluded
    },
  ],
})

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURE: Insufficient ground — no candidates
// Panel state: active=0, excluded=1 (synthetic insufficient), has_sufficient_ground=false
// ─────────────────────────────────────────────────────────────────────────────

export const insufficientGroundFixture = buildRecallPacket({
  packet_id:    'fixture-insufficient',
  computed_at:  '2026-06-03T00:00:00Z',
  presence:     'ari',
  room:         'ari_room',
  candidate_sources: [],
})

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURE: Source conflict — Memory vs held truth (requires Tara review)
// Panel state: active=2, conflicts=1, primary=surface_source_conflict
// ─────────────────────────────────────────────────────────────────────────────

export const sourceConflictFixture = buildRecallPacket({
  packet_id:    'fixture-source-conflict',
  computed_at:  '2026-06-03T00:00:00Z',
  presence:     'ari',
  room:         'ari_room',
  candidate_sources: [
    {
      surface:        SourceSurface.confirmed_archive_memory,
      presence_scope: 'shared',
      relevance:      'strong',
      conflict_types: [ConflictType.confirmed_memory_vs_held_truth],
      conflicts_with: [SourceSurface.held_truth_presence_continuity],
    },
    {
      surface:        SourceSurface.held_truth_presence_continuity,
      presence_scope: 'ari',
      relevance:      'strong',
    },
  ],
})

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURE: Topic shift — continuity sources excluded by topic change
// Panel state: active=1 (memory), excluded=2 (topic_shift), conflict=topic_shift_relevance_failure
// ─────────────────────────────────────────────────────────────────────────────

export const topicShiftFixture = buildRecallPacket({
  packet_id:    'fixture-topic-shift',
  computed_at:  '2026-06-03T00:00:00Z',
  presence:     'ari',
  room:         'ari_room',
  query_context: { topic_shift_detected: true },
  candidate_sources: [
    {
      surface:        SourceSurface.confirmed_archive_memory,
      presence_scope: 'shared',
      relevance:      'strong',
    },
    {
      surface:        SourceSurface.recent_continuity_not_memory,
      presence_scope: 'ari',
      relevance:      'strong',
    },
    {
      surface:        SourceSurface.short_horizon_thread_context,
      presence_scope: 'ari',
      relevance:      'strong',
    },
  ],
})

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURE: Ambiguous reference — ask clarifying question
// Panel state: active=2, primary=ask_clarifying_question
// ─────────────────────────────────────────────────────────────────────────────

export const ambiguousReferenceFixture = buildRecallPacket({
  packet_id:    'fixture-ambiguous',
  computed_at:  '2026-06-03T00:00:00Z',
  presence:     'ari',
  room:         'ari_room',
  query_context: { reference_ambiguous: true },
  candidate_sources: [
    {
      surface:        SourceSurface.recent_continuity_not_memory,
      presence_scope: 'ari',
      relevance:      'medium',
    },
    {
      surface:        SourceSurface.library_rag_reference,
      presence_scope: 'shared',
      relevance:      'medium',
    },
  ],
})

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURE: Inspector demo — Memory + recent continuity + trace excluded
// This is the default fixture for the Recall Packet Inspector on /recall.
// Demonstrates: active confirmed Memory, active non-Memory context,
// excluded trace source, governance footer.
// ─────────────────────────────────────────────────────────────────────────────

export const inspectorDemoFixture = buildRecallPacket({
  packet_id:    'fixture-inspector-demo',
  computed_at:  '2026-06-03T00:00:00Z',
  presence:     'ari',
  room:         'ari_room',
  candidate_sources: [
    {
      surface:        SourceSurface.confirmed_archive_memory,
      presence_scope: 'shared',
      relevance:      'strong',
    },
    {
      surface:        SourceSurface.recent_continuity_not_memory,
      presence_scope: 'ari',
      relevance:      'medium',
    },
    {
      surface:   SourceSurface.reasoning_audit_trace,
      // relevance does not matter — trace is always excluded (gate 2)
    },
  ],
})

// ─────────────────────────────────────────────────────────────────────────────
// ALL FIXTURES — for iteration in tests
// ─────────────────────────────────────────────────────────────────────────────

export const ALL_FIXTURES = {
  inspectorDemo:      inspectorDemoFixture,
  confirmedMemory:    confirmedMemoryFixture,
  recentContinuity:   recentContinuityFixture,
  mixedPacket:        mixedPacketFixture,
  scopeBlocked:       scopeBlockedFixture,
  traceExcluded:      traceExcludedFixture,
  insufficientGround: insufficientGroundFixture,
  sourceConflict:     sourceConflictFixture,
  topicShift:         topicShiftFixture,
  ambiguousReference: ambiguousReferenceFixture,
}
