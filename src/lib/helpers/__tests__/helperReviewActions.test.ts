/**
 * Phase 41.6 — Helper Review Actions Contract tests
 *
 * Run: npx tsx src/lib/helpers/__tests__/helperReviewActions.test.ts
 *
 * No DB, no Supabase, no LLM, no network, no UI. Pure contract validation.
 */

import {
  type HelperReviewAction,
  type HelperReviewState,
  type HelperReviewActionRequest,
  ALL_HELPER_REVIEW_ACTIONS,
  ALL_HELPER_REVIEW_STATES,
  FORBIDDEN_HELPER_REVIEW_ACTIONS,
  FORBIDDEN_HELPER_REVIEWERS,
  ALLOWED_HELPER_REVIEWERS,
  REVIEW_ACTION_TARGET_STATE,
  ALLOWED_REVIEW_TRANSITIONS,
  HELPER_REVIEW_STATE_MEANING,
  isHelperReviewAction,
  isForbiddenHelperReviewAction,
  isHelperReviewState,
  isAllowedTransition,
  isAllowedHelperReviewer,
  reviewPreservesAuthorityFlags,
  validateHelperReviewAction,
} from '../helperReviewActions'

// ─── Harness ───────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}

function section(name: string) { console.log(`\n── ${name} ──`) }

function req(o: Partial<HelperReviewActionRequest> = {}): HelperReviewActionRequest {
  return {
    action: 'mark_viewed',
    reviewer: 'tara',
    helper_output_id: 'ho-1',
    current_state: 'unreviewed',
    ...o,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// A. Review action vocabulary
// ═════════════════════════════════════════════════════════════════════════════

section('A. Review action vocabulary')
{
  const expected = ['mark_viewed', 'dismiss', 'mark_useful', 'needs_library_action', 'needs_human_decision']
  assert(ALL_HELPER_REVIEW_ACTIONS.length === 5, 'exactly five review actions')
  for (const a of expected) assert(isHelperReviewAction(a), `${a} is a review action`)
  // No authority-like action is in the vocabulary.
  for (const a of ['accept', 'approve', 'promote', 'apply', 'remember', 'make_memory', 'make_evidence', 'send_to_prompt', 'route_to_reasoning', 'auto_fix']) {
    assert(!isHelperReviewAction(a), `${a} is NOT a review action`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// B. Forbidden authority-like actions rejected
// ═════════════════════════════════════════════════════════════════════════════

section('B. Forbidden actions rejected')
{
  for (const a of ['accept', 'approve', 'promote', 'apply', 'remember', 'make_memory', 'make_evidence', 'send_to_prompt', 'route_to_reasoning', 'auto_fix']) {
    assert(isForbiddenHelperReviewAction(a), `${a} flagged forbidden`)
    assert(!validateHelperReviewAction(req({ action: a as never })).valid, `${a} request rejected`)
  }
  // Vocabulary and forbidden sets are disjoint.
  const overlap = ALL_HELPER_REVIEW_ACTIONS.filter((a) => (FORBIDDEN_HELPER_REVIEW_ACTIONS as readonly string[]).includes(a))
  assert(overlap.length === 0, 'review actions and forbidden actions are disjoint')
}

// ═════════════════════════════════════════════════════════════════════════════
// C. Review state vocabulary
// ═════════════════════════════════════════════════════════════════════════════

section('C. Review state vocabulary')
{
  const expected = ['unreviewed', 'viewed', 'dismissed', 'useful', 'needs_action', 'needs_decision']
  assert(ALL_HELPER_REVIEW_STATES.length === 6, 'exactly six review states')
  for (const s of expected) {
    assert(isHelperReviewState(s), `${s} is a review state`)
    assert(typeof HELPER_REVIEW_STATE_MEANING[s as HelperReviewState] === 'string', `${s} has a documented meaning`)
  }
  // No authority-like state exists.
  for (const s of ['approved', 'accepted', 'prompt_eligible', 'memory', 'evidence', 'canonical']) {
    assert(!isHelperReviewState(s), `${s} is NOT a review state`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// D. Allowed transitions pass
// ═════════════════════════════════════════════════════════════════════════════

section('D. Allowed transitions')
{
  const allowed: [HelperReviewState, HelperReviewState][] = [
    ['unreviewed', 'viewed'], ['unreviewed', 'dismissed'], ['unreviewed', 'useful'],
    ['unreviewed', 'needs_action'], ['unreviewed', 'needs_decision'],
    ['viewed', 'dismissed'], ['viewed', 'useful'], ['viewed', 'needs_action'], ['viewed', 'needs_decision'],
    ['useful', 'needs_action'], ['useful', 'needs_decision'],
    ['needs_action', 'dismissed'], ['needs_decision', 'dismissed'],
  ]
  for (const [from, to] of allowed) {
    assert(isAllowedTransition(from, to), `${from} → ${to} allowed`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// E. Forbidden transitions fail
// ═════════════════════════════════════════════════════════════════════════════

section('E. Forbidden transitions')
{
  const forbidden: [string, string][] = [
    ['dismissed', 'useful'], ['dismissed', 'needs_action'], ['dismissed', 'needs_decision'],
    ['dismissed', 'viewed'],
    ['useful', 'unreviewed'], ['viewed', 'unreviewed'],
    ['unreviewed', 'approved'], ['unreviewed', 'accepted'],
    ['useful', 'memory'], ['viewed', 'evidence'], ['needs_action', 'prompt_eligible'],
  ]
  for (const [from, to] of forbidden) {
    assert(!isAllowedTransition(from as HelperReviewState, to as HelperReviewState), `${from} → ${to} forbidden`)
  }
  // Dismissed is terminal.
  assert(ALLOWED_REVIEW_TRANSITIONS.dismissed.length === 0, 'dismissed is terminal (no outgoing transitions)')
}

// ═════════════════════════════════════════════════════════════════════════════
// F. Dismissed cannot be silently revived
// ═════════════════════════════════════════════════════════════════════════════

section('F. Dismissed cannot be revived')
{
  for (const action of ALL_HELPER_REVIEW_ACTIONS) {
    const r = validateHelperReviewAction(req({ action, current_state: 'dismissed' }))
    assert(!r.valid, `dismissed + ${action} is rejected`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// G. Tara-only reviewer
// ═════════════════════════════════════════════════════════════════════════════

section('G. Tara-only reviewer')
{
  assert(ALLOWED_HELPER_REVIEWERS.length === 1 && ALLOWED_HELPER_REVIEWERS[0] === 'tara', 'only tara allowed')
  assert(isAllowedHelperReviewer('tara'), 'tara is an allowed reviewer')
  for (const r of FORBIDDEN_HELPER_REVIEWERS) {
    assert(!isAllowedHelperReviewer(r), `${r} is not an allowed reviewer`)
    assert(!validateHelperReviewAction(req({ reviewer: r as never })).valid, `${r} review request rejected`)
  }
  // helper cannot review helper (recursion blocked via reviewer rule).
  assert(!validateHelperReviewAction(req({ reviewer: 'helper' as never })).valid, 'helper cannot review helper output')
}

// ═════════════════════════════════════════════════════════════════════════════
// H. Authority flags immutable through review
// ═════════════════════════════════════════════════════════════════════════════

section('H. Authority flags immutable')
{
  const locked = { not_memory: true, not_evidence: true, prompt_eligible: false, authority_changed: false, human_review_required: true }
  assert(reviewPreservesAuthorityFlags(locked, { ...locked }), 'identical locked flags preserved')
  // Any drift fails.
  assert(!reviewPreservesAuthorityFlags(locked, { ...locked, prompt_eligible: true }), 'marking prompt_eligible true fails')
  assert(!reviewPreservesAuthorityFlags(locked, { ...locked, not_memory: false }), 'not_memory:false fails')
  assert(!reviewPreservesAuthorityFlags(locked, { ...locked, authority_changed: true }), 'authority_changed:true fails')
  assert(!reviewPreservesAuthorityFlags(locked, { ...locked, not_evidence: false }), 'not_evidence:false fails')
  assert(!reviewPreservesAuthorityFlags(locked, { ...locked, human_review_required: false }), 'human_review_required:false fails')
}

// ═════════════════════════════════════════════════════════════════════════════
// I. mark_useful does not make prompt-eligible / authoritative
// ═════════════════════════════════════════════════════════════════════════════

section('I. mark_useful stays inert')
{
  const r = validateHelperReviewAction(req({ action: 'mark_useful', current_state: 'viewed' }))
  assert(r.valid && r.next_state === 'useful', 'mark_useful → useful is valid')
  // useful is a review-support state, not an authority state — it is not prompt_eligible/memory/evidence.
  assert(!isHelperReviewState('prompt_eligible'), 'useful does not imply prompt_eligible state')
  assert(REVIEW_ACTION_TARGET_STATE.mark_useful === 'useful', 'mark_useful targets useful, nothing authoritative')
  // The locked flags remain locked regardless of useful.
  const locked = { not_memory: true, not_evidence: true, prompt_eligible: false, authority_changed: false, human_review_required: true }
  assert(reviewPreservesAuthorityFlags(locked, { ...locked }), 'useful keeps prompt_eligible false')
}

// ═════════════════════════════════════════════════════════════════════════════
// J. Single-target only — no bulk shape
// ═════════════════════════════════════════════════════════════════════════════

section('J. Single-target only (no bulk)')
{
  // Empty / missing id rejected.
  assert(!validateHelperReviewAction(req({ helper_output_id: '' })).valid, 'empty id rejected')
  // A request type carries exactly one id (compile-time) — assert the shape has no array form.
  const r = req()
  assert(typeof r.helper_output_id === 'string', 'helper_output_id is a single string, not an array')
  assert(!('helper_output_ids' in r), 'no plural ids field exists')
  // Bulk-style actions are forbidden vocabulary.
  for (const a of ['bulk_accept', 'bulk_dismiss', 'mark_all_useful', 'dismiss_all']) {
    assert(isForbiddenHelperReviewAction(a), `${a} is forbidden`)
    assert(!validateHelperReviewAction(req({ action: a as never })).valid, `${a} request rejected`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// K. Valid happy-path request
// ═════════════════════════════════════════════════════════════════════════════

section('K. Valid request')
{
  const r = validateHelperReviewAction(req({ action: 'dismiss', current_state: 'needs_action' }))
  assert(r.valid && r.next_state === 'dismissed', 'tara dismiss from needs_action → dismissed valid')
  assert(r.errors.length === 0, 'no errors on a valid request')
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
