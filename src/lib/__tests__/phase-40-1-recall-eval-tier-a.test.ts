/**
 * Phase 40.1 Structural + Logic Tests — Recall Evaluation Cases + Tier A Engine
 *
 * Verifies:
 *   - All 14 approved case IDs exist with no duplicates
 *   - All 10 required categories are covered
 *   - All cases have presence, room, and fixture input
 *   - All fixture source_refs use demo- prefixed IDs only
 *   - No forbidden content fields in any case
 *   - Tier A evaluator produces correct outcomes for all 14 cases
 *   - Critical non-elevation, negative, and conflict cases pass
 *   - New modules are pure (no DB, LLM, API, async)
 *
 * Note on sensitive field checks:
 *   "prompt_eligible" is a governance field — NOT a sensitive content field.
 *   Tests use field-name patterns that would indicate raw content, not governance.
 *
 * Run: npx tsx src/lib/__tests__/phase-40-1-recall-eval-tier-a.test.ts
 */

import * as fs from 'fs'
import * as path from 'path'

import { RECALL_EVAL_CASES, RECALL_EVAL_CASE_MAP } from '../recall/recallEvalCases'
import {
  runTierAEvaluationCase,
  runAllTierAEvaluationCases,
  runTierAEvaluationCaseById,
  summarizeTierAResults,
} from '../recall/recallTierAEvaluator'
import { ExclusionReason, ResponseInstruction, SourceSurface } from '../recall/recallPacketTypes'
import type { RecallEvalCaseId, RecallEvalCategory } from '../recall/recallEvalTypes'

// ─── test harness ─────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..', '..', '..')
let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  ✗ ${label}`)
  }
}

function section(name: string) {
  console.log(`\n── ${name} ──`)
}

// ═══════════════════════════════════════════════════════
// 1. Case inventory — 14 cases, no duplicates
// ═══════════════════════════════════════════════════════
section('1. Case inventory — 14 cases, no duplicates')

const REQUIRED_CASE_IDS: RecallEvalCaseId[] = [
  'confirmed_memory_shared',
  'confirmed_memory_scoped',
  'recent_continuity_only',
  'library_reference_only',
  'archive_only_context',
  'candidate_memory',
  'memory_vs_held_truth_conflict',
  'insufficient_ground',
  'lounge_shared_safe',
  'lounge_private_blocked',
  'cross_presence_distinctness',
  'cross_presence_no_leak',
  'nondisclosure_run_the_packet',
  'nondisclosure_show_sources',
]

assert(
  RECALL_EVAL_CASES.length === 14,
  `Exactly 14 eval cases defined (found: ${RECALL_EVAL_CASES.length})`
)

const caseIds = RECALL_EVAL_CASES.map(c => c.case_id)
const uniqueIds = new Set(caseIds)
assert(uniqueIds.size === 14, 'No duplicate case IDs')

for (const id of REQUIRED_CASE_IDS) {
  assert(
    uniqueIds.has(id),
    `Required case_id exists: ${id}`
  )
}

assert(
  Object.keys(RECALL_EVAL_CASE_MAP).length === 14,
  'RECALL_EVAL_CASE_MAP has 14 entries'
)

// ═══════════════════════════════════════════════════════
// 2. All 10 required categories covered
// ═══════════════════════════════════════════════════════
section('2. All 10 required categories covered')

const REQUIRED_CATEGORIES: RecallEvalCategory[] = [
  'confirmed_memory',
  'recent_continuity_only',
  'library_reference_only',
  'archive_only_context',
  'candidate_memory',
  'conflict',
  'insufficient_ground',
  'lounge_shared_context',
  'cross_presence_boundary',
  'non_disclosure',
]

const coveredCategories = new Set(RECALL_EVAL_CASES.map(c => c.category))

for (const cat of REQUIRED_CATEGORIES) {
  assert(
    coveredCategories.has(cat),
    `Required category covered: ${cat}`
  )
}

// ═══════════════════════════════════════════════════════
// 3. All cases have presence, room, fixture
// ═══════════════════════════════════════════════════════
section('3. All cases have required fields')

for (const evalCase of RECALL_EVAL_CASES) {
  assert(
    evalCase.presence === 'ari' || evalCase.presence === 'eli',
    `Case '${evalCase.case_id}': has valid presence (ari or eli)`
  )

  assert(
    ['ari_room', 'eli_room', 'lounge'].includes(evalCase.room),
    `Case '${evalCase.case_id}': has valid room`
  )

  assert(
    typeof evalCase.fixtureInput === 'object' &&
    typeof evalCase.fixtureInput.packet_id === 'string',
    `Case '${evalCase.case_id}': has fixtureInput with packet_id`
  )

  assert(
    evalCase.fixtureInput.packet_id.startsWith('demo-eval-'),
    `Case '${evalCase.case_id}': packet_id starts with demo-eval-`
  )

  assert(
    evalCase.fixtureInput.computed_at === '2026-06-03T00:00:00.000Z',
    `Case '${evalCase.case_id}': uses fixed evaluation timestamp`
  )
}

// ═══════════════════════════════════════════════════════
// 4. All fixture source_refs use demo- IDs only (no live IDs)
// ═══════════════════════════════════════════════════════
section('4. Fixture source_refs use demo- IDs only')

for (const evalCase of RECALL_EVAL_CASES) {
  for (const signal of evalCase.fixtureInput.signals) {
    if (signal.source_ref?.source_id) {
      assert(
        signal.source_ref.source_id.startsWith('demo-'),
        `Case '${evalCase.case_id}': source_ref.source_id starts with demo- ('${signal.source_ref.source_id}')`
      )
    }
  }
}

// ═══════════════════════════════════════════════════════
// 5. No forbidden content fields in any case
// ═══════════════════════════════════════════════════════
section('5. No forbidden content fields in cases (structural)')

// Load the source file and check for forbidden field patterns.
// Use colon-based field-definition checks to avoid false positives
// from comments or string literals.
const casesSrc = fs.readFileSync(
  path.join(ROOT, 'src/lib/recall/recallEvalCases.ts'),
  'utf-8'
)

// Field patterns that would indicate raw content being stored
// (not governance fields like prompt_eligible or source_ref)
const forbiddenContentFields = [
  'raw_content:',
  'content:',
  'journal_body:',
  'library_body:',
  'archive_content:',
  'memory_text:',
  'prompt_text:',
  'system_prompt:',
  'user_message:',
  'assistant_response:',
  'model_output:',
  // Note: 'source_id:' inside source_ref is SAFE (already checked via demo- prefix in section 4)
  'memory_id:',
  'api_key:',
  'secret:',
  'cookie:',
]

for (const field of forbiddenContentFields) {
  assert(
    !casesSrc.includes(field),
    `recallEvalCases.ts does not define forbidden content field: ${field}`
  )
}

// ═══════════════════════════════════════════════════════
// 6. Evaluator functions exported and callable
// ═══════════════════════════════════════════════════════
section('6. Evaluator functions are exported and callable')

assert(
  typeof runTierAEvaluationCase === 'function',
  'runTierAEvaluationCase is a function'
)

assert(
  typeof runAllTierAEvaluationCases === 'function',
  'runAllTierAEvaluationCases is a function'
)

assert(
  typeof summarizeTierAResults === 'function',
  'summarizeTierAResults is a function'
)

// ═══════════════════════════════════════════════════════
// 7. All 14 cases pass Tier A evaluation
// ═══════════════════════════════════════════════════════
section('7. All 14 Tier A evaluation cases pass')

const allResults = runAllTierAEvaluationCases()

assert(
  allResults.length === 14,
  `runAllTierAEvaluationCases() returns 14 results (got: ${allResults.length})`
)

for (const result of allResults) {
  assert(
    result.passed,
    `Tier A case passes: ${result.case_id} (failures: ${result.failures.join('; ') || 'none'})`
  )
}

// ═══════════════════════════════════════════════════════
// 8. Confirmed Memory cases produce expected instruction
// ═══════════════════════════════════════════════════════
section('8. Confirmed Memory cases — correct instruction')

for (const caseId of ['confirmed_memory_shared', 'confirmed_memory_scoped'] as RecallEvalCaseId[]) {
  const result = runTierAEvaluationCaseById(caseId)!
  assert(
    result.actual_primary_response_instruction === ResponseInstruction.answer_confidently_from_confirmed_memory,
    `${caseId}: primary instruction is answer_confidently_from_confirmed_memory`
  )
  assert(
    result.packet.has_sufficient_ground,
    `${caseId}: has_sufficient_ground true`
  )
}

// ═══════════════════════════════════════════════════════
// 9. Non-elevation tests — critical boundaries
// ═══════════════════════════════════════════════════════
section('9. Non-elevation tests — critical boundaries')

// Recent continuity does NOT elevate to Memory
{
  const result = runTierAEvaluationCaseById('recent_continuity_only')!
  assert(
    result.actual_primary_response_instruction === ResponseInstruction.say_recent_continuity_only,
    'recent_continuity_only: instruction is say_recent_continuity_only (not Memory)'
  )
  assert(
    !result.actual_active_surfaces.includes(SourceSurface.confirmed_archive_memory) &&
    !result.actual_active_surfaces.includes(SourceSurface.presence_scoped_confirmed_memory),
    'recent_continuity_only: confirmed Memory surfaces are NOT active'
  )
}

// Library reference does NOT become Memory
{
  const result = runTierAEvaluationCaseById('library_reference_only')!
  assert(
    result.actual_primary_response_instruction === ResponseInstruction.say_reference_context_only,
    'library_reference_only: instruction is say_reference_context_only (not Memory)'
  )
  assert(
    !result.actual_active_surfaces.includes(SourceSurface.confirmed_archive_memory) &&
    !result.actual_active_surfaces.includes(SourceSurface.library_canonical_memory_reference),
    'library_reference_only: no Memory surfaces active'
  )
}

// Candidate Memory does NOT become confirmed Memory
{
  const result = runTierAEvaluationCaseById('candidate_memory')!
  assert(
    result.actual_primary_response_instruction === ResponseInstruction.answer_with_caveat,
    'candidate_memory: instruction is answer_with_caveat (not confident Memory)'
  )
  assert(
    !result.actual_active_surfaces.includes(SourceSurface.confirmed_archive_memory),
    'candidate_memory: confirmed_archive_memory is NOT active'
  )
  assert(
    result.actual_active_surfaces.includes(SourceSurface.memory_candidate),
    'candidate_memory: memory_candidate surface IS active'
  )
}

// Archive-only context produces caveat
{
  const result = runTierAEvaluationCaseById('archive_only_context')!
  assert(
    result.actual_primary_response_instruction === ResponseInstruction.answer_with_caveat,
    'archive_only_context: instruction is answer_with_caveat'
  )
}

// ═══════════════════════════════════════════════════════
// 10. Conflict case — surfaces conflict instruction
// ═══════════════════════════════════════════════════════
section('10. Conflict case — surface_source_conflict')

{
  const result = runTierAEvaluationCaseById('memory_vs_held_truth_conflict')!
  assert(
    result.actual_primary_response_instruction === ResponseInstruction.surface_source_conflict,
    'memory_vs_held_truth_conflict: primary instruction is surface_source_conflict'
  )
  assert(
    result.packet.conflicts.length > 0,
    'memory_vs_held_truth_conflict: at least one conflict detected'
  )
  assert(
    result.packet.conflicts.some(c => c.requires_tara_review),
    'memory_vs_held_truth_conflict: conflict requires Tara review'
  )
}

// ═══════════════════════════════════════════════════════
// 11. Insufficient ground — fabrication guard
// ═══════════════════════════════════════════════════════
section('11. Insufficient ground — fabrication guard')

{
  const result = runTierAEvaluationCaseById('insufficient_ground')!
  assert(
    result.actual_primary_response_instruction === ResponseInstruction.say_not_enough_grounded_recall,
    'insufficient_ground: instruction is say_not_enough_grounded_recall'
  )
  assert(
    result.packet.active_sources.length === 0,
    'insufficient_ground: no active sources'
  )
  assert(
    !result.packet.has_sufficient_ground,
    'insufficient_ground: has_sufficient_ground false'
  )
  assert(
    result.actual_excluded_surfaces.includes(SourceSurface.insufficient),
    'insufficient_ground: synthetic insufficient surface in excluded_sources'
  )
}

// ═══════════════════════════════════════════════════════
// 12. Lounge private blocked — scope safety
// ═══════════════════════════════════════════════════════
section('12. Lounge private blocked — scope safety')

{
  const result = runTierAEvaluationCaseById('lounge_private_blocked')!
  assert(
    result.actual_primary_response_instruction === ResponseInstruction.say_not_enough_grounded_recall,
    'lounge_private_blocked: presence-scoped Memory excluded → insufficient ground instruction'
  )
  assert(
    result.packet.active_sources.length === 0,
    'lounge_private_blocked: no active sources (all excluded by scope)'
  )
  assert(
    !result.actual_active_surfaces.includes(SourceSurface.presence_scoped_confirmed_memory) &&
    !result.actual_active_surfaces.includes(SourceSurface.confirmed_archive_memory),
    'lounge_private_blocked: private Memory surfaces are NOT active in Lounge'
  )
  assert(
    result.packet.excluded_sources.some(s => s.exclusion_reason === ExclusionReason.scope_prohibited),
    'lounge_private_blocked: at least one scope_prohibited exclusion'
  )
}

// ═══════════════════════════════════════════════════════
// 13. Cross-presence no leak — identity safety
// ═══════════════════════════════════════════════════════
section('13. Cross-presence no leak — identity safety')

{
  const result = runTierAEvaluationCaseById('cross_presence_no_leak')!
  assert(
    result.actual_primary_response_instruction === ResponseInstruction.say_not_enough_grounded_recall,
    'cross_presence_no_leak: Eli-scoped Memory in Ari room → insufficient ground'
  )
  assert(
    result.packet.active_sources.length === 0,
    'cross_presence_no_leak: no active sources (Eli private scope rejected)'
  )
  assert(
    !result.actual_active_surfaces.includes(SourceSurface.presence_scoped_confirmed_memory),
    'cross_presence_no_leak: Eli presence_scoped_confirmed_memory is NOT active in Ari room'
  )
  assert(
    result.packet.excluded_sources.some(s => s.exclusion_reason === ExclusionReason.scope_prohibited),
    'cross_presence_no_leak: scope_prohibited exclusion present'
  )
}

// ═══════════════════════════════════════════════════════
// 14. Lounge shared safe — positive Lounge case
// ═══════════════════════════════════════════════════════
section('14. Lounge shared safe — positive case')

{
  const result = runTierAEvaluationCaseById('lounge_shared_safe')!
  assert(
    result.actual_primary_response_instruction === ResponseInstruction.answer_confidently_from_confirmed_memory,
    'lounge_shared_safe: shared canonical Memory is active in Lounge → confident instruction'
  )
  assert(
    result.actual_active_surfaces.includes(SourceSurface.confirmed_archive_memory),
    'lounge_shared_safe: confirmed_archive_memory is active'
  )
  assert(
    result.packet.has_sufficient_ground,
    'lounge_shared_safe: has_sufficient_ground true'
  )
}

// ═══════════════════════════════════════════════════════
// 15. Non-disclosure seed cases exist in Tier A
// ═══════════════════════════════════════════════════════
section('15. Non-disclosure seed cases exist as Tier A seeds')

for (const caseId of ['nondisclosure_run_the_packet', 'nondisclosure_show_sources'] as RecallEvalCaseId[]) {
  const result = runTierAEvaluationCaseById(caseId)!
  assert(
    result.passed,
    `${caseId}: Tier A passes (valid packet produced for Tier B hand-off)`
  )
  assert(
    result.packet.active_sources.length > 0,
    `${caseId}: has active sources (something to ground a response on)`
  )
  const evalCase = RECALL_EVAL_CASE_MAP[caseId]
  assert(
    evalCase.gradingMode === 'tara_review',
    `${caseId}: gradingMode is tara_review (full grading deferred to Tier B)`
  )
  assert(
    typeof evalCase.tierBTestQuestion === 'string' && evalCase.tierBTestQuestion.length > 0,
    `${caseId}: tierBTestQuestion seed is defined for Tier B`
  )
}

// ═══════════════════════════════════════════════════════
// 16. Summary function aggregates correctly
// ═══════════════════════════════════════════════════════
section('16. Summary aggregation')

{
  const allR = runAllTierAEvaluationCases()
  const summary = summarizeTierAResults(allR)

  assert(
    summary.total === 14,
    `Summary.total is 14 (got: ${summary.total})`
  )
  assert(
    summary.passed + summary.failed === 14,
    'Summary.passed + failed = total'
  )
  assert(
    summary.allPassed === (summary.failed === 0),
    'Summary.allPassed reflects failed count'
  )
  assert(
    typeof summary.passRate === 'number' && summary.passRate >= 0 && summary.passRate <= 100,
    'Summary.passRate is a valid percentage'
  )

  // All 10 categories should appear in byCategory
  for (const cat of REQUIRED_CATEGORIES) {
    assert(
      summary.byCategory[cat] !== undefined,
      `Summary has byCategory entry for: ${cat}`
    )
  }
}

// ═══════════════════════════════════════════════════════
// 17. New eval modules are pure (no DB / LLM / API / async)
// ═══════════════════════════════════════════════════════
section('17. New eval modules are pure')

const EVAL_MODULE_PATHS = [
  'src/lib/recall/recallEvalTypes.ts',
  'src/lib/recall/recallEvalCases.ts',
  'src/lib/recall/recallTierAEvaluator.ts',
]

const FORBIDDEN_IMPORTS = [
  "from '@supabase",
  "from 'openai'",
  "from '@anthropic-ai",
  'createClient',
  'fetch(',
  'async function',
  'async (',
  'Promise<',
  'process.env.',
  'localStorage',
  'sessionStorage',
  'window.',
  'document.getElementById',
]

for (const modulePath of EVAL_MODULE_PATHS) {
  const src = fs.readFileSync(path.join(ROOT, modulePath), 'utf-8')
  const shortName = modulePath.split('/').pop()!

  for (const pattern of FORBIDDEN_IMPORTS) {
    assert(
      !src.includes(pattern),
      `${shortName}: does not contain forbidden pattern '${pattern}'`
    )
  }
}

// ═══════════════════════════════════════════════════════
// 18. runTierAEvaluationCaseById handles unknown ID safely
// ═══════════════════════════════════════════════════════
section('18. runTierAEvaluationCaseById — safe unknown ID handling')

{
  const result = runTierAEvaluationCaseById('unknown_case_that_does_not_exist' as RecallEvalCaseId)
  assert(
    result === null,
    'runTierAEvaluationCaseById returns null for unknown case_id'
  )
}

// ═══════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════')
console.log('  Phase 40.1 Recall Evaluation Cases + Tier A Engine Tests')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log('═══════════════════════════════════════════════════════')

if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
} else {
  console.log('\n✅ All 40.1 Tier A evaluation tests passed.\n')
  process.exit(0)
}
