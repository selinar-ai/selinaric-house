/**
 * Phase 39.4.1 — Demo Runtime Context Signal Fixtures
 *
 * Metadata-only RuntimeContextSignal[] arrays for adapter-generated preview.
 * Used by the /recall Recall Packet Inspector and by tests.
 *
 * Safety rules:
 *   No real Tara content.
 *   No archive text, prompt text, model output, raw source content.
 *   No journal body, Pulse text, Telegram text, library body.
 *   No API keys, cookies, or secrets.
 *   signal_type, presence_scope, relevance, source_ref, conflict metadata only.
 *   Fake IDs use the demo- prefix.
 */

import {
  ConflictType,
  RuntimeContextSignal,
  RuntimeContextSignalType,
  SourceSurface,
} from './recallPacketTypes'

// ─────────────────────────────────────────────────────────────────────────────
// INSPECTOR DEMO SIGNALS
// Active: confirmed Memory + recent continuity + living state
// Excluded: Eli-scoped journal → scope_prohibited in ari_room
// Demonstrates: Memory, non-Memory context, scope boundary
// ─────────────────────────────────────────────────────────────────────────────

export const inspectorDemoSignals: RuntimeContextSignal[] = [
  {
    signal_type:    RuntimeContextSignalType.GovernedConfirmedMemory,
    presence_scope: 'shared',
    relevance:      'strong',
    source_ref:     { source_id: 'demo-memory-1', count: 2 },
  },
  {
    signal_type:    RuntimeContextSignalType.RecentContinuity,
    presence_scope: 'ari',
    relevance:      'medium',
    source_ref:     { source_id: 'demo-continuity-1', count: 5 },
  },
  {
    signal_type:    RuntimeContextSignalType.LivingState,
    presence_scope: 'ari',
    relevance:      'weak',
  },
  {
    // Eli-scoped journal → excluded with scope_prohibited when packet is for ari_room
    signal_type:    RuntimeContextSignalType.JournalInnerContinuity,
    presence_scope: 'eli',
    relevance:      'strong',
    source_ref:     { source_id: 'demo-scope-blocked-1' },
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// CONFLICT DEMO SIGNALS
// Active: confirmed Memory + held truth + journal
// Conflict: confirmed_memory_vs_held_truth → requires Tara review
// Demonstrates: surface_source_conflict, requires_tara_review
// ─────────────────────────────────────────────────────────────────────────────

export const conflictSignals: RuntimeContextSignal[] = [
  {
    signal_type:    RuntimeContextSignalType.GovernedConfirmedMemory,
    presence_scope: 'shared',
    relevance:      'strong',
    source_ref:     { source_id: 'demo-memory-conflict-1' },
    conflict_types: [ConflictType.confirmed_memory_vs_held_truth],
    conflicts_with: [SourceSurface.held_truth_presence_continuity],
  },
  {
    signal_type:    RuntimeContextSignalType.HeldTruthPresenceContinuity,
    presence_scope: 'ari',
    relevance:      'strong',
    source_ref:     { source_id: 'demo-held-truth-1' },
  },
  {
    signal_type:    RuntimeContextSignalType.JournalInnerContinuity,
    presence_scope: 'ari',
    relevance:      'medium',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// INSUFFICIENT GROUND SIGNALS
// Empty — produces synthetic insufficient excluded source and say_not_enough_grounded_recall
// ─────────────────────────────────────────────────────────────────────────────

export const insufficientSignals: RuntimeContextSignal[] = []

// ─────────────────────────────────────────────────────────────────────────────
// TOPIC SHIFT SIGNALS
// Used with query_context.topic_shift_detected = true
// Active: confirmed Memory (topic shift does not affect Memory)
// Excluded: short-horizon thread + recent continuity → topic_shift
// ─────────────────────────────────────────────────────────────────────────────

export const topicShiftSignals: RuntimeContextSignal[] = [
  {
    signal_type:    RuntimeContextSignalType.GovernedConfirmedMemory,
    presence_scope: 'shared',
    relevance:      'strong',
    source_ref:     { source_id: 'demo-memory-3' },
  },
  {
    signal_type:    RuntimeContextSignalType.ShortHorizonThreadContext,
    presence_scope: 'ari',
    relevance:      'strong',
    source_ref:     { source_id: 'demo-thread-1' },
  },
  {
    signal_type:    RuntimeContextSignalType.RecentContinuity,
    presence_scope: 'ari',
    relevance:      'medium',
    source_ref:     { source_id: 'demo-continuity-2' },
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// ALL SIGNAL FIXTURES — for iteration in tests
// ─────────────────────────────────────────────────────────────────────────────

export const ALL_SIGNAL_FIXTURES = {
  inspectorDemo:    inspectorDemoSignals,
  conflict:         conflictSignals,
  insufficient:     insufficientSignals,
  topicShift:       topicShiftSignals,
}
