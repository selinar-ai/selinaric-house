/**
 * Phase 41.13 — Helper Review Controls UI tests
 *
 * Run: npx tsx src/lib/helpers/__tests__/helperReviewControlsUi.test.ts
 *
 * No DOM render. Statically validates the /helpers row-local review controls:
 * the three workflow buttons, single-row POST to the existing 41.12 route, the
 * request shape, visibility gating, error/409 handling, double-click guard, the
 * boundary caption, and the absence of any authority/batch control.
 */

import * as fs from 'fs'
import * as path from 'path'

import { HELPER_REVIEW_CONTROLS_CAPTION } from '../helperReviewPresenter'

// ─── Harness ───────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}

function section(name: string) { console.log(`\n── ${name} ──`) }

function readSrc(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, rel), 'utf-8')
}

const PAGE = '../../../app/(house)/helpers/page.tsx'
const PROTECTED_TABLES = [
  'archive_items', 'archive_memory_events', 'held_truths', 'graph_nodes', 'graph_edges',
  'graph_proposals', 'graph_candidate_suggestions', 'library_items', 'library_chunks',
]

// ═════════════════════════════════════════════════════════════════════════════
// A. The three workflow controls + label mapping (no raw enum labels)
// ═════════════════════════════════════════════════════════════════════════════

section('A. Workflow controls')
{
  const page = readSrc(PAGE)
  for (const label of ['Mark reviewed', 'Dismiss', 'Needs follow-up']) {
    assert(page.includes(`'${label}'`), `page shows label '${label}'`)
  }
  // The label map binds humble labels to the three actions.
  assert(page.includes('WORKFLOW_ACTION_LABELS'), 'page maps labels via WORKFLOW_ACTION_LABELS')
  for (const action of ['mark_reviewed_no_action', 'dismiss_not_useful', 'needs_followup']) {
    assert(page.includes(action), `label map binds ${action}`)
  }
  // Gating + control rendering use the available-actions helper.
  assert(page.includes('availableWorkflowActions'), 'controls gated by availableWorkflowActions')
  assert(page.includes('showControls'), 'controls have an explicit visibility predicate')
}

// ═════════════════════════════════════════════════════════════════════════════
// B. Single-row POST to the existing 41.12 route, correct request shape
// ═════════════════════════════════════════════════════════════════════════════

section('B. Request to the 41.12 route')
{
  const page = readSrc(PAGE)
  assert(page.includes('/api/helpers/outputs/${row.id}/review'), 'POST targets the single-row review route by path id')
  assert(page.includes("method: 'POST'"), 'uses POST')
  // Body is exactly { action, expectedReviewState } — nothing else.
  assert(page.includes('JSON.stringify({ action, expectedReviewState:'), 'body is exactly action + expectedReviewState')
  // Body must NOT carry arrays/note/payload/source/burden/authority/prompt fields.
  for (const banned of ['note:', 'review_note', 'source_refs', 'suggestion_payload', 'risk_class', 'batch_eligible', 'not_memory', 'authority_changed', 'prompt_eligible', 'helper_output_ids', 'ids:']) {
    assert(!new RegExp(`JSON\\.stringify\\(\\{[^}]*${banned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(page), `review request body has no ${banned}`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// C. Row-local loading + double-click guard
// ═════════════════════════════════════════════════════════════════════════════

section('C. Loading + double-click guard')
{
  const page = readSrc(PAGE)
  assert(page.includes('actingId') && page.includes('isActing'), 'row-local loading state (actingId/isActing)')
  assert(page.includes('disabled={!!isActing}'), 'buttons disabled while that row is acting')
  assert(page.includes('inFlightRef'), 'synchronous in-flight guard prevents duplicate submissions')
  assert(page.includes('if (inFlightRef.current) return'), 'guard short-circuits a second submission')
}

// ═════════════════════════════════════════════════════════════════════════════
// D. Error + 409 conflict handling (non-destructive)
// ═════════════════════════════════════════════════════════════════════════════

section('D. Error + conflict handling')
{
  const page = readSrc(PAGE)
  assert(page.includes('res.status === 409'), 'handles 409 explicitly')
  assert(page.includes('changed since the queue loaded'), '409 shows the calm refresh message')
  assert(page.includes('res.status === 401') && page.includes('res.status === 422'), 'maps 401 + 422')
  assert(page.includes('rowMessages'), 'errors are row-local')
  // On non-200, the row is NOT updated as if successful.
  assert(page.includes('res.status === 200'), 'only 200 updates the row')
  assert(page.includes('No change was made'), 'error copy states no change was made')
}

// ═════════════════════════════════════════════════════════════════════════════
// E. Single-row update only; no batch
// ═════════════════════════════════════════════════════════════════════════════

section('E. Single-row, no batch')
{
  const page = readSrc(PAGE)
  // Success updates only the acted row id.
  assert(page.includes('r.id === row.id ? { ...r, ...updated } : r'), 'success updates only the acted row')
  for (const banned of ['Select all', 'Batch', 'Bulk', 'multi-select', 'selectAll']) {
    assert(!page.includes(banned), `no '${banned}' control`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// F. No authority / execution controls
// ═════════════════════════════════════════════════════════════════════════════

section('F. No authority/execution controls')
{
  const page = readSrc(PAGE)
  for (const forbidden of ['Approve output', 'Accept', 'Apply output', 'Promote', 'Confirm', 'Make Memory', 'Make Evidence', 'Send to Prompt', 'Send to Graph', 'Route to Reasoning', 'Make Candidate', 'Auto-fix', 'Run helper', 'Re-run']) {
    assert(!page.includes(forbidden), `page has no '${forbidden}' control`)
  }
  // No direct DB mutation / no protected-surface mutation paths referenced.
  for (const mut of ['.insert(', '.update(', '.delete(', '.upsert(', "method: 'PATCH'", "method: 'DELETE'"]) {
    assert(!page.includes(mut), `page does not perform ${mut}`)
  }
  for (const t of PROTECTED_TABLES) {
    assert(!page.includes(`'${t}'`) && !page.includes(`from('${t}')`), `page does not reference ${t}`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// G. Boundary caption present + read-only behaviour preserved
// ═════════════════════════════════════════════════════════════════════════════

section('G. Caption + read-only preserved')
{
  const page = readSrc(PAGE)
  assert(page.includes('HELPER_REVIEW_CONTROLS_CAPTION'), 'page renders the controls boundary caption')
  assert(HELPER_REVIEW_CONTROLS_CAPTION.includes('workflow state only'), 'caption: workflow state only')
  assert(HELPER_REVIEW_CONTROLS_CAPTION.includes('does not apply this helper output'), 'caption: does not apply')
  assert(HELPER_REVIEW_CONTROLS_CAPTION.includes('move authority') && HELPER_REVIEW_CONTROLS_CAPTION.includes('prompt-visible'), 'caption: no authority / no prompt')
  // Read-only behaviour intact.
  assert(page.includes('Show soft-deleted trace'), 'soft-deleted trace toggle preserved')
  assert(page.includes('reviewBurdenForDisplay') && page.includes('reviewStateForDisplay'), 'read-only burden + state metadata preserved')
  assert(page.includes('buildReviewQueue'), 'queue ordering preserved')
  // Controls only render for non-deleted active rows with available actions.
  assert(page.includes('!deleted && (entry?.is_active ?? false) && actions.length > 0'), 'controls gated to active, non-deleted, non-terminal rows')
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
