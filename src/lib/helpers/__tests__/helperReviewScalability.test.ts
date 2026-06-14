/**
 * Phase 41.8 — Helper Review Scalability Contract tests
 *
 * Run: npx tsx src/lib/helpers/__tests__/helperReviewScalability.test.ts
 *
 * No DB, no Supabase, no LLM, no network, no UI. Pure classification tests.
 */

import {
  type ReviewBurdenInput,
  ALL_HELPER_RISK_CLASSES,
  ALL_HELPER_REVIEW_PRIORITIES,
  ALL_HELPER_REVIEW_MODES,
  ALL_HELPER_ESCALATION_REASONS,
  FORBIDDEN_SCALABILITY_ACTIONS,
  isHelperRiskClass,
  isHelperReviewPriority,
  isHelperReviewMode,
  isForbiddenScalabilityAction,
  classifyReviewBurden,
  isBatchEligible,
  defaultBurdenForHelperType,
} from '../helperReviewScalability'

// ─── Harness ───────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}

function section(name: string) { console.log(`\n── ${name} ──`) }

// ─── Fixtures ──────────────────────────────────────────────────────────────

/** A safe low-risk library metadata output. */
function input(o: Partial<ReviewBurdenInput> = {}): ReviewBurdenInput {
  return {
    helper_type: 'library_metadata_helper',
    suggested_action: 'add_summary',
    source_surfaces: ['library_item'],
    not_memory: true,
    not_evidence: true,
    prompt_eligible: false,
    authority_changed: false,
    ...o,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// A. Vocabularies
// ═════════════════════════════════════════════════════════════════════════════

section('A. Vocabularies')
{
  assert(ALL_HELPER_RISK_CLASSES.length === 4, 'four risk classes')
  for (const r of ['low', 'medium', 'high', 'authority_critical']) assert(isHelperRiskClass(r), `${r} is a risk class`)
  for (const r of ['safe', 'crown', 'truth']) assert(!isHelperRiskClass(r), `${r} is NOT a risk class`)

  assert(ALL_HELPER_REVIEW_PRIORITIES.length === 4, 'four priorities')
  for (const p of ['routine', 'normal', 'elevated', 'urgent']) assert(isHelperReviewPriority(p), `${p} is a priority`)

  assert(ALL_HELPER_REVIEW_MODES.length === 4, 'four review modes')
  for (const m of ['no_review_needed', 'batch_review_allowed', 'individual_review_required', 'two_gate_review_required']) assert(isHelperReviewMode(m), `${m} is a review mode`)

  assert(ALL_HELPER_ESCALATION_REASONS.length === 14, 'fourteen escalation reasons')
}

// ═════════════════════════════════════════════════════════════════════════════
// B. Low-risk metadata hygiene → batch eligible
// ═════════════════════════════════════════════════════════════════════════════

section('B. Low-risk batch eligibility')
{
  for (const action of ['review_metadata', 'normalise_title', 'add_summary', 'add_tags', 'check_extraction_status', 'flag_missing_attachment_text']) {
    const b = classifyReviewBurden(input({ suggested_action: action }))
    assert(b.risk_class === 'low', `${action} → low risk`)
    assert(b.review_mode === 'batch_review_allowed', `${action} → batch_review_allowed`)
    assert(b.batch_eligible === true, `${action} → batch_eligible`)
    assert(isBatchEligible(input({ suggested_action: action }), b), `${action} passes independent batch gate`)
    assert(b.review_priority === 'routine', `${action} → routine`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// C. Medium-risk not batch eligible
// ═════════════════════════════════════════════════════════════════════════════

section('C. Medium-risk not batchable')
{
  const b = classifyReviewBurden(input({ suggested_action: 'flag_stale_document' }))
  assert(b.risk_class === 'medium', 'flag_stale_document → medium')
  assert(b.batch_eligible === false, 'medium not batch eligible')
  assert(b.review_mode === 'individual_review_required', 'medium → individual review')
  assert(!isBatchEligible(input({ suggested_action: 'flag_stale_document' }), b), 'medium fails independent batch gate')
  // Governance (41.9 schema rule): medium requires escalation + non-empty reasons.
  assert(b.escalation_required === true, 'medium → escalation_required true')
  assert(b.escalation_reasons.length >= 1, 'medium → non-empty escalation_reasons')
  // Unknown action for a known helper → classify upward (medium).
  const u = classifyReviewBurden(input({ suggested_action: 'some_unknown_action' }))
  assert(u.risk_class === 'medium' && u.batch_eligible === false, 'unknown action → medium, not batchable')
  assert(u.review_mode === 'individual_review_required', 'unknown action → individual review')
  assert(u.escalation_required === true && u.escalation_reasons.length >= 1, 'unknown action → escalation_required + reasons')
}

// ── Governance invariant: escalation_required=false only for low + no_review/batch
section('C2. escalation_required=false only for low (matches 41.9 ho_escalation_required_low_only)')
{
  const samples: ReviewBurdenInput[] = [
    input({ suggested_action: 'add_summary' }),              // low / batch
    input({ suggested_action: 'no_action', clean_no_issue: true }), // low / no_review
    input({ suggested_action: 'flag_stale_document' }),      // medium
    input({ suggested_action: 'some_unknown_action' }),      // medium
    input({ sensitive_scope: true }),                        // high
    input({ prompt_eligible: true }),                        // authority_critical
    input({ helper_type: 'retrieval_gap_helper' }),          // authority_critical
  ]
  for (const s of samples) {
    const b = classifyReviewBurden(s)
    if (b.escalation_required === false) {
      assert(b.risk_class === 'low' && (b.review_mode === 'no_review_needed' || b.review_mode === 'batch_review_allowed'),
        `escalation_required=false only for low+no_review/batch (got ${b.risk_class}/${b.review_mode})`)
    } else {
      assert(b.escalation_reasons.length >= 1, `escalation_required=true carries reasons (${b.risk_class})`)
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// D. High-risk (sensitive / unsupported / conflicting / missing provenance)
// ═════════════════════════════════════════════════════════════════════════════

section('D. High-risk not batchable')
{
  const sensitive = classifyReviewBurden(input({ sensitive_scope: true }))
  assert(sensitive.risk_class === 'high' && !sensitive.batch_eligible, 'sensitive_scope → high, not batchable')
  assert(sensitive.escalation_reasons.includes('sensitive_scope'), 'sensitive_scope reason recorded')

  const unsupported = classifyReviewBurden(input({ unsupported_inference: true }))
  assert(unsupported.risk_class === 'high' && unsupported.escalation_required, 'unsupported_inference → high + escalate')
  assert(unsupported.escalation_reasons.includes('unsupported_inference'), 'unsupported_inference reason recorded')

  const conflicting = classifyReviewBurden(input({ conflicting_sources: true }))
  assert(conflicting.risk_class === 'high', 'conflicting_sources → high')
  assert(conflicting.escalation_reasons.includes('conflicting_sources'), 'conflicting_sources reason recorded')

  const noProv = classifyReviewBurden(input({ source_surfaces: [] }))
  assert(noProv.risk_class === 'high', 'missing provenance → high')
  assert(noProv.escalation_reasons.includes('missing_provenance'), 'missing_provenance reason recorded')
}

// ═════════════════════════════════════════════════════════════════════════════
// E. Authority-critical → never batchable, two-gate
// ═════════════════════════════════════════════════════════════════════════════

section('E. Authority-critical never batchable')
{
  // Unsafe invariant flags.
  for (const bad of [{ not_memory: false }, { not_evidence: false }, { prompt_eligible: true }, { authority_changed: true }]) {
    const b = classifyReviewBurden(input(bad as Partial<ReviewBurdenInput>))
    assert(b.risk_class === 'authority_critical', `unsafe ${JSON.stringify(bad)} → authority_critical`)
    assert(b.review_mode === 'two_gate_review_required', `unsafe ${JSON.stringify(bad)} → two_gate`)
    assert(b.batch_eligible === false, `unsafe ${JSON.stringify(bad)} → not batchable`)
    assert(!isBatchEligible(input(bad as Partial<ReviewBurdenInput>), b), 'fails independent batch gate')
  }
  // Forbidden actions.
  for (const a of ['accept', 'approve', 'promote', 'apply', 'remember', 'make_memory', 'make_evidence', 'send_to_prompt', 'route_to_reasoning', 'auto_fix', 'bulk_approve', 'bulk_apply']) {
    assert(isForbiddenScalabilityAction(a), `${a} is a forbidden scalability action`)
    const b = classifyReviewBurden(input({ suggested_action: a }))
    assert(b.risk_class === 'authority_critical', `${a} → authority_critical`)
    assert(b.batch_eligible === false, `${a} → not batchable`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// F. Surface implications → authority-critical
// ═════════════════════════════════════════════════════════════════════════════

section('F. Surface implications → authority-critical')
{
  const cases: [string, string][] = [
    ['helper_output', 'authority_surface'],
    ['prompt_text', 'prompt_implication'],
    ['reasoning_output', 'reasoning_evidence_implication'],
    ['reasoning_audit_trail', 'reasoning_evidence_implication'],
    ['graph_node_metadata', 'graph_implication'],
    ['archive_item_metadata', 'archive_implication'],
    ['identity_kernel', 'sensitive_scope'],
    ['secret_or_credential', 'sensitive_scope'],
  ]
  for (const [surface, reason] of cases) {
    const b = classifyReviewBurden(input({ source_surfaces: [surface] }))
    assert(b.risk_class === 'authority_critical', `surface ${surface} → authority_critical`)
    assert(b.review_mode === 'two_gate_review_required', `surface ${surface} → two_gate`)
    assert(b.batch_eligible === false, `surface ${surface} → not batchable`)
    assert(b.escalation_reasons.includes(reason as never), `surface ${surface} → reason ${reason}`)
  }
  // helper-output-as-source is specifically not batchable.
  const ho = classifyReviewBurden(input({ source_surfaces: ['helper_output'] }))
  assert(!ho.batch_eligible, 'helper-output-as-source is never batch eligible')
}

// ═════════════════════════════════════════════════════════════════════════════
// G. Unknown / deferred helper types default to authority-critical
// ═════════════════════════════════════════════════════════════════════════════

section('G. Unknown/deferred helper types')
{
  for (const ht of ['retrieval_gap_helper', 'memory_candidate_preparation_helper', 'reasoning_evidence_helper', 'totally_unknown_helper']) {
    const b = classifyReviewBurden(input({ helper_type: ht }))
    assert(b.risk_class === 'authority_critical', `${ht} → authority_critical`)
    assert(b.review_mode === 'two_gate_review_required', `${ht} → two_gate`)
    assert(b.batch_eligible === false, `${ht} → not batchable`)
    // Default helper-type burden is also conservative.
    const d = defaultBurdenForHelperType(ht)
    assert(d.risk_class === 'authority_critical' && !d.batch_eligible, `${ht} default is authority_critical`)
  }
  // The v1 helper's own default is conservative (medium, individual) — not low.
  const lib = defaultBurdenForHelperType('library_metadata_helper')
  assert(lib.risk_class === 'medium' && lib.batch_eligible === false, 'library helper default is medium, not batchable')
  assert(lib.escalation_required === true && lib.escalation_reasons.length >= 1, 'library default: medium → escalation_required + reasons')
}

// ═════════════════════════════════════════════════════════════════════════════
// H. Clean no-issue → no review needed (still inert)
// ═════════════════════════════════════════════════════════════════════════════

section('H. Clean no-issue')
{
  const b = classifyReviewBurden(input({ suggested_action: 'no_action', clean_no_issue: true }))
  assert(b.review_mode === 'no_review_needed', 'clean no-issue → no_review_needed')
  assert(b.batch_eligible === false, 'nothing actionable to batch')
  assert(b.risk_class === 'low', 'clean no-issue → low risk')
  assert(!b.escalation_required, 'clean no-issue does not escalate')
}

// ═════════════════════════════════════════════════════════════════════════════
// I. Sampling never replaces high-risk review
// ═════════════════════════════════════════════════════════════════════════════

section('I. Sampling support')
{
  // Low-risk batch items may be sampled.
  const low = classifyReviewBurden(input({ suggested_action: 'add_tags' }))
  assert(low.sample_required === true, 'low-risk batch item is sample_required')
  // High and authority-critical items are NOT sampled-instead-of-reviewed.
  const high = classifyReviewBurden(input({ sensitive_scope: true }))
  assert(high.sample_required === false && high.review_mode === 'individual_review_required', 'high-risk: no sampling shortcut, individual review')
  const ac = classifyReviewBurden(input({ prompt_eligible: true }))
  assert(ac.sample_required === false && ac.review_mode === 'two_gate_review_required', 'authority-critical: no sampling shortcut, two-gate')
}

// ═════════════════════════════════════════════════════════════════════════════
// J. Batch eligibility never alters authority flags; no authority actions exist
// ═════════════════════════════════════════════════════════════════════════════

section('J. No authority movement in the contract')
{
  const before = input({ suggested_action: 'add_summary' })
  const b = classifyReviewBurden(before)
  // The classifier returns a burden; the input flags are unchanged objects.
  assert(before.not_memory === true && before.not_evidence === true && before.prompt_eligible === false && before.authority_changed === false, 'input flags untouched after classify')
  // The contract vocabulary contains no approve/accept/etc.
  for (const a of ['accept', 'approve', 'promote', 'apply', 'remember', 'make_evidence', 'send_to_prompt']) {
    assert((FORBIDDEN_SCALABILITY_ACTIONS as readonly string[]).includes(a), `${a} is in the forbidden set, not the vocabulary`)
  }
  // Even a batch-eligible item carries no authority change.
  assert(b.batch_eligible === true && b.risk_class === 'low', 'batch-eligible item is still just low-risk triage')
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
if (failures.length > 0) {
  console.log('\n  Failures:')
  for (const f of failures) console.log(`    ✗ ${f}`)
}
console.log('══════════════════════════════════════════\n')
process.exit(failed > 0 ? 1 : 0)
