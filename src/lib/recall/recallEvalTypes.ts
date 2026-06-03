/**
 * Phase 40.1 — Recall Evaluation Types
 *
 * Type definitions for the Recall Reliability Evaluation Harness.
 *
 * Tier A (this phase): deterministic evaluation — given a fixture source condition,
 * does buildRecallPacketFromRuntimeSignals() produce the expected packet outcome?
 *
 * Tier B (future phases): behavioural evaluation — does the model's chat response
 * actually behave correctly given the advisory? (Requires LLM, deferred.)
 *
 * These types are pure — no I/O, no async, no side effects.
 */

import type {
  ResponseInstruction,
  SourceSurface,
  ConflictType,
  ExclusionReason,
  RuntimeRecallPacketInput,
  RecallPacket,
  RoomContext,
} from './recallPacketTypes'

// ─────────────────────────────────────────────────────────────────────────────
// CASE ID — 14 approved cases from 40.0
// ─────────────────────────────────────────────────────────────────────────────

export type RecallEvalCaseId =
  | 'confirmed_memory_shared'
  | 'confirmed_memory_scoped'
  | 'recent_continuity_only'
  | 'library_reference_only'
  | 'archive_only_context'
  | 'candidate_memory'
  | 'memory_vs_held_truth_conflict'
  | 'insufficient_ground'
  | 'lounge_shared_safe'
  | 'lounge_private_blocked'
  | 'cross_presence_distinctness'
  | 'cross_presence_no_leak'
  | 'nondisclosure_run_the_packet'
  | 'nondisclosure_show_sources'

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY — 10 required categories from 40.0
// ─────────────────────────────────────────────────────────────────────────────

export type RecallEvalCategory =
  | 'confirmed_memory'
  | 'recent_continuity_only'
  | 'library_reference_only'
  | 'archive_only_context'
  | 'candidate_memory'
  | 'conflict'
  | 'insufficient_ground'
  | 'lounge_shared_context'
  | 'cross_presence_boundary'
  | 'non_disclosure'

// ─────────────────────────────────────────────────────────────────────────────
// GRADING MODE
//   deterministic — Tier A is authoritative; pass/fail is objective
//   heuristic     — Tier A gives a strong signal; Tier B uses phrase heuristics
//   tara_review   — Full grading requires Tara judgment in Tier B
// ─────────────────────────────────────────────────────────────────────────────

export type RecallEvalGradingMode =
  | 'deterministic'
  | 'heuristic'
  | 'tara_review'

// ─────────────────────────────────────────────────────────────────────────────
// EVAL CASE
// ─────────────────────────────────────────────────────────────────────────────

export interface RecallEvalCase {
  /** Stable identifier from the 40.0 taxonomy */
  case_id: RecallEvalCaseId

  /** Human-readable label for display */
  label: string

  /** Which evaluation category this case belongs to */
  category: RecallEvalCategory

  /** What this case is proving */
  description: string

  /** Primary presence for this eval run (Ari or Eli) */
  presence: 'ari' | 'eli'

  /** Room context for scope enforcement */
  room: RoomContext

  /**
   * Fixture source conditions for this case.
   * Uses RuntimeRecallPacketInput with demo- prefixed source_refs.
   * No live source IDs, Memory IDs, Archive IDs, or raw content.
   */
  fixtureInput: RuntimeRecallPacketInput

  /** Expected primary response instruction from Tier A evaluation */
  expectedPrimaryResponseInstruction: ResponseInstruction

  /**
   * Source surfaces that MUST appear in active_sources.
   * Used for positive assertions.
   */
  expectedActiveSurfaces: SourceSurface[]

  /**
   * Source surfaces that MUST appear in excluded_sources.
   * Used for positive assertions on exclusions.
   */
  expectedExcludedSurfaces?: SourceSurface[]

  /**
   * Conflict types that MUST appear in the packet's conflicts array.
   * Used when the case is expected to produce a conflict.
   */
  expectedConflictTypes?: ConflictType[]

  /**
   * Source surfaces that must NOT appear in active_sources.
   * Used for negative cases (leakage/scope checks).
   */
  expectedForbiddenActiveSurfaces?: SourceSurface[]

  /**
   * ExclusionReasons that MUST appear in excluded_sources.
   * Used to verify specific gate mechanisms fired.
   */
  expectedExclusionReasons?: ExclusionReason[]

  /**
   * Seed test question for Tier B behavioural evaluation.
   * Not used in Tier A / Phase 40.1.
   */
  tierBTestQuestion?: string

  /**
   * How this case should be graded in Tier B.
   * All Tier A evaluation is deterministic regardless of this value.
   */
  gradingMode: RecallEvalGradingMode

  /** Notes for evaluators / Tara review */
  notes: string
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER A RESULT
// ─────────────────────────────────────────────────────────────────────────────

export interface RecallEvalTierAResult {
  case_id: RecallEvalCaseId
  passed: boolean
  expected_primary_response_instruction: ResponseInstruction
  actual_primary_response_instruction: ResponseInstruction
  expected_active_surfaces: SourceSurface[]
  actual_active_surfaces: SourceSurface[]
  expected_excluded_surfaces: SourceSurface[]
  actual_excluded_surfaces: SourceSurface[]
  failures: string[]
  /** Full packet for inspection and Tier B hand-off */
  packet: RecallPacket
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER A SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

export interface RecallEvalTierASummary {
  total: number
  passed: number
  failed: number
  passRate: number
  byCategory: Partial<Record<RecallEvalCategory, {
    total: number
    passed: number
    failed: number
  }>>
  failedCaseIds: RecallEvalCaseId[]
  allPassed: boolean
}
