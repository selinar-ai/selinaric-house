/**
 * Phase 40.1 — Tier A Deterministic Evaluator
 *
 * Pure functions that run eval cases through the existing Phase 39 deterministic
 * builders and compare actual packet outcomes against expected outcomes.
 *
 * Uses buildRecallPacketFromRuntimeSignals() as the source of truth —
 * the same path used in production. Does not duplicate classification logic.
 *
 * Purity guarantee:
 *   No fetch, Supabase, LLM, process.env, browser globals, async, or side effects.
 *   All inputs are fixture-controlled. No reads from live data.
 */

import { buildRecallPacketFromRuntimeSignals } from './recallCandidateAdapter'
import { RECALL_EVAL_CASES, RECALL_EVAL_CASE_MAP } from './recallEvalCases'
import type { RecallEvalCase, RecallEvalCaseId, RecallEvalTierAResult, RecallEvalTierASummary } from './recallEvalTypes'
import type { ConflictType, ExclusionReason, SourceSurface } from './recallPacketTypes'

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE CASE EVALUATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a single Tier A evaluation case.
 *
 * Builds the packet from the fixture input using the existing Phase 39 builder,
 * then compares actual outcomes against expected outcomes.
 *
 * Pure: no I/O, no async, no side effects.
 */
export function runTierAEvaluationCase(evalCase: RecallEvalCase): RecallEvalTierAResult {
  const packet = buildRecallPacketFromRuntimeSignals(evalCase.fixtureInput)

  const failures: string[] = []
  const actualActiveSurfaces   = packet.active_sources.map(s => s.surface)
  const actualExcludedSurfaces = packet.excluded_sources.map(s => s.surface)

  // ── Check 1: Primary response instruction ─────────────────────────────────
  if (packet.primary_response_instruction !== evalCase.expectedPrimaryResponseInstruction) {
    failures.push(
      `Primary instruction mismatch: expected '${evalCase.expectedPrimaryResponseInstruction}', ` +
      `got '${packet.primary_response_instruction}'`
    )
  }

  // ── Check 2: Expected active surfaces are present ─────────────────────────
  for (const expected of evalCase.expectedActiveSurfaces) {
    if (!actualActiveSurfaces.includes(expected)) {
      failures.push(`Expected active surface missing: '${expected}'`)
    }
  }

  // ── Check 3: Expected excluded surfaces are present ───────────────────────
  for (const expected of evalCase.expectedExcludedSurfaces ?? []) {
    if (!actualExcludedSurfaces.includes(expected)) {
      failures.push(`Expected excluded surface missing: '${expected}'`)
    }
  }

  // ── Check 4: Forbidden active surfaces are NOT present ────────────────────
  for (const forbidden of evalCase.expectedForbiddenActiveSurfaces ?? []) {
    if (actualActiveSurfaces.includes(forbidden)) {
      failures.push(`Forbidden active surface present (should be excluded): '${forbidden}'`)
    }
  }

  // ── Check 5: Expected conflict types are present ──────────────────────────
  if (evalCase.expectedConflictTypes && evalCase.expectedConflictTypes.length > 0) {
    const actualConflictTypes: ConflictType[] = packet.conflicts.map(c => c.conflict_type)
    for (const expected of evalCase.expectedConflictTypes) {
      if (!actualConflictTypes.includes(expected)) {
        failures.push(`Expected conflict type missing: '${expected}'`)
      }
    }
  }

  // ── Check 6: Expected exclusion reasons are present ───────────────────────
  if (evalCase.expectedExclusionReasons && evalCase.expectedExclusionReasons.length > 0) {
    const actualReasons: (ExclusionReason | undefined)[] =
      packet.excluded_sources.map(s => s.exclusion_reason)
    for (const reason of evalCase.expectedExclusionReasons) {
      if (!actualReasons.includes(reason)) {
        failures.push(`Expected exclusion reason missing: '${reason}'`)
      }
    }
  }

  return {
    case_id:    evalCase.case_id,
    passed:     failures.length === 0,
    expected_primary_response_instruction: evalCase.expectedPrimaryResponseInstruction,
    actual_primary_response_instruction:   packet.primary_response_instruction,
    expected_active_surfaces:   evalCase.expectedActiveSurfaces,
    actual_active_surfaces:     actualActiveSurfaces as SourceSurface[],
    expected_excluded_surfaces: evalCase.expectedExcludedSurfaces ?? [],
    actual_excluded_surfaces:   actualExcludedSurfaces as SourceSurface[],
    failures,
    packet,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ALL CASES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run all 14 Tier A evaluation cases.
 * Returns one result per case in the same order as RECALL_EVAL_CASES.
 *
 * Pure: no I/O, no async, no side effects.
 */
export function runAllTierAEvaluationCases(): RecallEvalTierAResult[] {
  return RECALL_EVAL_CASES.map(runTierAEvaluationCase)
}

/**
 * Run a single case by ID.
 * Returns null if the case_id is not found.
 */
export function runTierAEvaluationCaseById(
  caseId: RecallEvalCaseId,
): RecallEvalTierAResult | null {
  const evalCase = RECALL_EVAL_CASE_MAP[caseId]
  if (!evalCase) return null
  return runTierAEvaluationCase(evalCase)
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Summarize a set of Tier A results.
 *
 * Pure: no I/O, no async, no side effects.
 */
export function summarizeTierAResults(
  results: RecallEvalTierAResult[],
): RecallEvalTierASummary {
  const total  = results.length
  const passed = results.filter(r => r.passed).length
  const failed = total - passed

  const byCategory: RecallEvalTierASummary['byCategory'] = {}

  for (const result of results) {
    const evalCase = RECALL_EVAL_CASE_MAP[result.case_id]
    if (!evalCase) continue

    const cat = evalCase.category
    if (!byCategory[cat]) {
      byCategory[cat] = { total: 0, passed: 0, failed: 0 }
    }
    byCategory[cat]!.total++
    if (result.passed) byCategory[cat]!.passed++
    else               byCategory[cat]!.failed++
  }

  return {
    total,
    passed,
    failed,
    passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
    byCategory,
    failedCaseIds: results.filter(r => !r.passed).map(r => r.case_id),
    allPassed:     failed === 0,
  }
}
