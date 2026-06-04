/**
 * Phase 40.5 — Tier B Grading Types
 *
 * Type definitions for the deterministic Tier B grading engine.
 *
 * Authority boundary:
 *   A Tier B pass means behaviour matched the sandbox rubric.
 *   It does not make the response Memory, evidence, Archive, or truth.
 *   The grader measures; it does not judge truth; it does not create authority.
 */

import type { RecallEvalCaseId } from './recallEvalTypes'
import type { ResponseInstruction } from './recallPacketTypes'

// ─────────────────────────────────────────────────────────────────────────────
// INPUT
// ─────────────────────────────────────────────────────────────────────────────

export type RecallTierBGradingInput = {
  /** Which eval case the response is being graded against */
  case_id: RecallEvalCaseId

  /** Which presence produced this response */
  presence: 'ari' | 'eli' | 'lounge'

  /** The model's sandbox response text to grade */
  model_response: string

  /** The Tier A primary response instruction (used for context in some checks) */
  tier_a_primary_response_instruction?: ResponseInstruction
}

// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL CHECK
// ─────────────────────────────────────────────────────────────────────────────

export type RecallTierBSignalSeverity = 'fail' | 'warn' | 'review'

export type RecallTierBSignalCheck = {
  /** Stable identifier for this check */
  id: string

  /** Human-readable description of what was checked */
  label: string

  /** Whether the signal check passed (required: present; forbidden: absent) */
  passed: boolean

  /** Matched terms or patterns that triggered this result */
  matched_terms: string[]

  /** How severe a failure of this check is */
  severity: RecallTierBSignalSeverity

  /** For required signals: what was expected but not found */
  expected_signal?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULT
// ─────────────────────────────────────────────────────────────────────────────

export type RecallTierBGradingResult = {
  case_id: RecallEvalCaseId
  presence: 'ari' | 'eli' | 'lounge'

  /** Overall pass — true if no fail-severity checks failed */
  passed: boolean

  /**
   * Whether this result requires Tara review regardless of pass/fail.
   * True for: conflict cases, cross-presence voice distinctness cases,
   * or any check with severity=review.
   */
  needs_tara_review: boolean

  /** Non-disclosure check passed (no forbidden packet fields/layouts in output) */
  nondisclosure_passed: boolean

  /** Authority boundary check passed (no Memory/Archive/authority claim violations) */
  authority_boundary_passed: boolean

  /** Results of required-positive signal checks (signals that should appear) */
  required_signal_results: RecallTierBSignalCheck[]

  /** Results of forbidden-negative signal checks (signals that should not appear) */
  forbidden_signal_results: RecallTierBSignalCheck[]

  /** Descriptions of fail-severity issues */
  failures: string[]

  /** Descriptions of warn-severity issues */
  warnings: string[]

  /** Informational notes about the grading process */
  grading_notes: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

export type RecallTierBGradingSummary = {
  total: number
  passed: number
  failed: number
  needs_tara_review: number
  nondisclosure_failures: number
  authority_boundary_failures: number
  /** Percentage of cases that passed without requiring Tara review */
  auto_pass_rate: number
  by_case: Partial<Record<RecallEvalCaseId, {
    passed: boolean
    needs_tara_review: boolean
    failure_count: number
    warning_count: number
  }>>
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL: case grading rule shape (used by grader implementation)
// ─────────────────────────────────────────────────────────────────────────────

export interface RecallTierBCaseRule {
  id: string
  label: string
  type: 'required' | 'forbidden'
  pattern: RegExp
  severity: RecallTierBSignalSeverity
  /**
   * If true, a match that is immediately preceded by refusal language
   * (won't, will not, cannot, refuse, etc.) is NOT counted as a failure.
   * Used for: forbidden terms that should pass if mentioned in a refusal.
   */
  allowRefusalContext?: boolean
}
