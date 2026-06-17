/**
 * Phase 41.12 — Helper Review Mutation planner tests
 *
 * Run: npx tsx src/lib/helpers/__tests__/helperReviewMutation.test.ts
 *
 * No DB, no Supabase, no network. Pure planner / request-shape tests.
 */

import {
  HELPER_REVIEW_WORKFLOW_ACTIONS,
  FORBIDDEN_WORKFLOW_ACTIONS,
  WORKFLOW_ACTION_TARGET_STATE,
  isHelperReviewWorkflowAction,
  isForbiddenWorkflowAction,
  parseReviewRequestBody,
  planHelperReviewMutation,
  availableWorkflowActions,
  type HelperReviewWorkflowAction,
  type ReviewMutationRow,
} from '../helperReviewMutation'

// ─── Harness ───────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}

function section(name: string) { console.log(`\n── ${name} ──`) }

function row(o: Partial<ReviewMutationRow> = {}): ReviewMutationRow {
  return { id: 'ho-1', review_state: 'unreviewed', deleted_at: null, ...o }
}

// ═════════════════════════════════════════════════════════════════════════════
// A. Action vocabulary
// ═════════════════════════════════════════════════════════════════════════════

section('A. Workflow action vocabulary')
{
  assert(HELPER_REVIEW_WORKFLOW_ACTIONS.length === 3, 'exactly three workflow actions')
  for (const a of ['mark_reviewed_no_action', 'dismiss_not_useful', 'needs_followup']) {
    assert(isHelperReviewWorkflowAction(a), `${a} is a workflow action`)
  }
  assert(!isHelperReviewWorkflowAction('defer_review'), 'defer_review is NOT a v1 action')
  // Mapping uses existing 41.6 states only.
  assert(WORKFLOW_ACTION_TARGET_STATE.mark_reviewed_no_action === 'viewed', 'mark_reviewed_no_action → viewed')
  assert(WORKFLOW_ACTION_TARGET_STATE.dismiss_not_useful === 'dismissed', 'dismiss_not_useful → dismissed')
  assert(WORKFLOW_ACTION_TARGET_STATE.needs_followup === 'needs_action', 'needs_followup → needs_action')
}

// ═════════════════════════════════════════════════════════════════════════════
// B. Forbidden / authority-like actions rejected
// ═════════════════════════════════════════════════════════════════════════════

section('B. Forbidden actions')
{
  for (const a of ['approve', 'accept', 'apply', 'confirm', 'promote', 'make_memory', 'remember', 'make_evidence', 'send_to_prompt', 'route_to_reasoning', 'send_to_graph', 'make_candidate', 'auto_fix', 'bulk_approve', 'bulk_apply']) {
    assert(isForbiddenWorkflowAction(a), `${a} is forbidden`)
    const p = parseReviewRequestBody({ action: a })
    assert(!p.ok && p.status === 400, `${a} body rejected 400`)
  }
  const overlap = HELPER_REVIEW_WORKFLOW_ACTIONS.filter((a) => (FORBIDDEN_WORKFLOW_ACTIONS as readonly string[]).includes(a))
  assert(overlap.length === 0, 'workflow + forbidden sets are disjoint')
}

// ═════════════════════════════════════════════════════════════════════════════
// C. Request body parsing (single row only)
// ═════════════════════════════════════════════════════════════════════════════

section('C. Body parsing')
{
  assert(parseReviewRequestBody({ action: 'mark_reviewed_no_action' }).ok, 'valid action parses')
  // note accepted but ignored (B1 — no persistence).
  const withNote = parseReviewRequestBody({ action: 'dismiss_not_useful', note: 'whatever' })
  assert(withNote.ok && !('note' in (withNote.ok ? withNote.value : {})), 'note is ignored (not persisted)')
  // Arrays / batch rejected.
  assert(!parseReviewRequestBody([{ action: 'mark_reviewed_no_action' }]).ok, 'array body rejected')
  assert(!parseReviewRequestBody(null).ok, 'null body rejected')
  assert(!parseReviewRequestBody('x').ok, 'string body rejected')
  // Body ids rejected (id only comes from path).
  for (const f of ['id', 'ids', 'helper_output_id', 'helper_output_ids']) {
    const p = parseReviewRequestBody({ action: 'mark_reviewed_no_action', [f]: 'x' })
    assert(!p.ok && p.code === 'MULTIPLE_IDS_NOT_ALLOWED', `body '${f}' rejected`)
  }
  // Missing / non-string action.
  assert(!parseReviewRequestBody({}).ok, 'missing action rejected')
  assert(!parseReviewRequestBody({ action: 5 }).ok, 'non-string action rejected')
  // expectedReviewState type guard.
  assert(!parseReviewRequestBody({ action: 'mark_reviewed_no_action', expectedReviewState: 5 }).ok, 'non-string expectedReviewState rejected')
  const ok = parseReviewRequestBody({ action: 'needs_followup', expectedReviewState: 'unreviewed' })
  assert(ok.ok && ok.value.expectedReviewState === 'unreviewed', 'expectedReviewState carried through')
}

// ═════════════════════════════════════════════════════════════════════════════
// D. Plan — not found / deleted / concurrency
// ═════════════════════════════════════════════════════════════════════════════

section('D. Plan guards')
{
  const notFound = planHelperReviewMutation({ action: 'mark_reviewed_no_action', row: null })
  assert(!notFound.ok && notFound.status === 404, 'null row → 404')
  const deleted = planHelperReviewMutation({ action: 'mark_reviewed_no_action', row: row({ deleted_at: '2026-06-14T00:00:00Z' }) })
  assert(!deleted.ok && deleted.status === 422 && deleted.code === 'HELPER_OUTPUT_DELETED', 'soft-deleted → 422')
  const stale = planHelperReviewMutation({ action: 'mark_reviewed_no_action', expectedReviewState: 'viewed', row: row({ review_state: 'unreviewed' }) })
  assert(!stale.ok && stale.status === 409 && stale.code === 'REVIEW_STATE_CHANGED', 'stale expected state → 409')
  const badCur = planHelperReviewMutation({ action: 'mark_reviewed_no_action', row: row({ review_state: 'bogus' }) })
  assert(!badCur.ok && badCur.status === 422, 'unknown current state → 422')
}

// ═════════════════════════════════════════════════════════════════════════════
// E. Plan — transitions (41.6 allow-list)
// ═════════════════════════════════════════════════════════════════════════════

section('E. Plan transitions')
{
  // unreviewed → any of the three workflow targets.
  for (const [action, target] of Object.entries(WORKFLOW_ACTION_TARGET_STATE) as [HelperReviewWorkflowAction, string][]) {
    const p = planHelperReviewMutation({ action, row: row({ review_state: 'unreviewed' }) })
    assert(p.ok && p.new_state === target, `unreviewed + ${action} → ${target} allowed`)
  }
  // dismissed is terminal — nothing is allowed.
  for (const action of HELPER_REVIEW_WORKFLOW_ACTIONS) {
    const p = planHelperReviewMutation({ action, row: row({ review_state: 'dismissed' }) })
    assert(!p.ok && p.status === 422 && p.code === 'TRANSITION_NOT_ALLOWED', `dismissed + ${action} → 422 (terminal)`)
  }
  // viewed → viewed is a no-op, not an allowed transition.
  const viewedAgain = planHelperReviewMutation({ action: 'mark_reviewed_no_action', row: row({ review_state: 'viewed' }) })
  assert(!viewedAgain.ok && viewedAgain.code === 'TRANSITION_NOT_ALLOWED', 'viewed + mark_reviewed (no-op) → 422')
  // viewed → dismissed / needs_action allowed.
  assert(planHelperReviewMutation({ action: 'dismiss_not_useful', row: row({ review_state: 'viewed' }) }).ok, 'viewed + dismiss → allowed')
  assert(planHelperReviewMutation({ action: 'needs_followup', row: row({ review_state: 'viewed' }) }).ok, 'viewed + needs_followup → allowed')
  // useful → needs_action allowed; useful → dismissed NOT allowed (41.6).
  assert(planHelperReviewMutation({ action: 'needs_followup', row: row({ review_state: 'useful' }) }).ok, 'useful + needs_followup → allowed')
  assert(!planHelperReviewMutation({ action: 'dismiss_not_useful', row: row({ review_state: 'useful' }) }).ok, 'useful + dismiss → not allowed (41.6)')
  // needs_action → dismissed allowed.
  assert(planHelperReviewMutation({ action: 'dismiss_not_useful', row: row({ review_state: 'needs_action' }) }).ok, 'needs_action + dismiss → allowed')
}

// ═════════════════════════════════════════════════════════════════════════════
// F. Plan exposes no authority movement
// ═════════════════════════════════════════════════════════════════════════════

section('F. Plan carries no authority')
{
  const p = planHelperReviewMutation({ action: 'mark_reviewed_no_action', row: row() })
  assert(p.ok, 'valid plan')
  if (p.ok) {
    const keys = Object.keys(p).sort()
    assert(JSON.stringify(keys) === JSON.stringify(['action', 'new_state', 'ok', 'previous_state']), 'plan exposes only action + states (no authority fields)')
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// G. availableWorkflowActions (UI control gating)
// ═════════════════════════════════════════════════════════════════════════════

section('G. availableWorkflowActions')
{
  // unreviewed → all three actions are valid transitions.
  assert(JSON.stringify(availableWorkflowActions('unreviewed').sort()) === JSON.stringify(['dismiss_not_useful', 'mark_reviewed_no_action', 'needs_followup']), 'unreviewed → all three actions')
  // viewed → mark_reviewed (viewed→viewed) is a no-op; only dismiss + needs_followup.
  assert(JSON.stringify(availableWorkflowActions('viewed').sort()) === JSON.stringify(['dismiss_not_useful', 'needs_followup']), 'viewed → dismiss + needs_followup (no mark_reviewed no-op)')
  // useful → only needs_followup (useful→dismissed is not allowed in 41.6).
  assert(JSON.stringify(availableWorkflowActions('useful')) === JSON.stringify(['needs_followup']), 'useful → needs_followup only')
  // needs_action / needs_decision → only dismiss.
  assert(JSON.stringify(availableWorkflowActions('needs_action')) === JSON.stringify(['dismiss_not_useful']), 'needs_action → dismiss only')
  assert(JSON.stringify(availableWorkflowActions('needs_decision')) === JSON.stringify(['dismiss_not_useful']), 'needs_decision → dismiss only')
  // dismissed is terminal → no actions; unknown state → no actions.
  assert(availableWorkflowActions('dismissed').length === 0, 'dismissed → no actions (terminal)')
  assert(availableWorkflowActions('bogus').length === 0, 'unknown state → no actions')
  assert(availableWorkflowActions('').length === 0, 'empty state → no actions')
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
