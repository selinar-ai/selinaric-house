/**
 * Phase 41.11 — Read-only Helper Queue Surface Wiring tests
 *
 * Run: npx tsx src/lib/helpers/__tests__/helperReviewQueueSurface.test.ts
 *
 * No DB, no Supabase, no network, no DOM. Statically validates the read-only
 * wiring of the Phase 41.10 queue model into the GET route + /helpers page, and
 * does a light functional ordering check.
 */

import * as fs from 'fs'
import * as path from 'path'

import { buildReviewQueue } from '../helperReviewQueue'
import { HELPER_QUEUE_CAPTION, type HelperOutputRow } from '../helperReviewPresenter'

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

function makeRow(o: Partial<HelperOutputRow> = {}): HelperOutputRow {
  return {
    id: 'r', helper_type: 'library_metadata_helper', output_status: 'deterministic_check',
    suggested_action: 'add_summary', confidence_label: 'structural', presence_scope: 'house',
    created_by: 'system_candidate', created_at: '2026-06-14T00:00:00Z',
    not_memory: true, not_evidence: true, prompt_eligible: false, authority_changed: false,
    human_review_required: true, review_routed: false, reviewed_by: null, reviewed_at: null,
    source_refs: [{ source_surface: 'library_item', source_id: 'i' }], suggestion_payload: {},
    deleted_at: null, review_state: 'unreviewed',
    risk_class: 'authority_critical', review_priority: 'normal', review_mode: 'two_gate_review_required',
    batch_eligible: false, sample_required: false, escalation_required: true,
    escalation_reasons: ['human_judgement_required'], ...o,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// A. GET route selects burden fields, stays GET-only / read-only / authed
// ═════════════════════════════════════════════════════════════════════════════

section('A. GET route wiring')
{
  const route = readSrc('../../../app/api/helper-outputs/route.ts')
  for (const f of ['risk_class', 'review_priority', 'review_mode', 'batch_eligible', 'sample_required', 'escalation_required', 'escalation_reasons', 'review_state']) {
    assert(route.includes(f), `route selects ${f}`)
  }
  assert(/export async function GET/.test(route), 'route exports GET')
  for (const verb of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    assert(!new RegExp(`export\\s+async\\s+function\\s+${verb}`).test(route), `route does NOT export ${verb}`)
  }
  for (const mut of ['.insert(', '.update(', '.delete(', '.upsert(']) {
    assert(!route.includes(mut), `route does not call ${mut}`)
  }
  assert(route.includes('requireHouseApiAuth'), 'route still server-side auth-gated')
}

// ═════════════════════════════════════════════════════════════════════════════
// B. Page wires the queue model read-only
// ═════════════════════════════════════════════════════════════════════════════

section('B. Page queue wiring')
{
  const page = readSrc('../../../app/(house)/helpers/page.tsx')
  assert(page.includes('buildReviewQueue'), 'page imports/uses buildReviewQueue')
  assert(page.includes('includeInactive: true'), 'page keeps all fetched rows visible (includeInactive)')
  assert(page.includes('queue.entries'), 'page orders rows by queue.entries')
  assert(page.includes('queue_rank'), 'page renders queue_rank')
  assert(page.includes('queue_bucket'), 'page renders queue_bucket')
  assert(page.includes('HELPER_QUEUE_CAPTION'), 'page renders the governance caption')
  assert(page.includes('reviewBurdenForDisplay'), 'page still renders read-only burden')
  // No mutation / no review controls introduced.
  // No authority-like controls. (41.13 adds workflow controls Mark reviewed /
  // Dismiss / Needs follow-up — workflow state, not authority.)
  for (const forbidden of ['Accept', 'Approve', 'Promote', 'Apply', 'Mark useful', 'Mark viewed', 'Bulk', 'Batch approve', 'Batch dismiss', 'Run helper']) {
    assert(!page.includes(forbidden), `page has no '${forbidden}' control`)
  }
  for (const mut of ["method: 'PATCH'", "method: 'DELETE'", '.insert(', '.update(']) {
    assert(!page.includes(mut), `page does not perform ${mut}`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// C. Governance caption text
// ═════════════════════════════════════════════════════════════════════════════

section('C. Governance caption')
{
  assert(HELPER_QUEUE_CAPTION.includes('Queue rank is not authority'), 'caption: rank is not authority')
  assert(HELPER_QUEUE_CAPTION.includes('Queue bucket is not truth'), 'caption: bucket is not truth')
  assert(HELPER_QUEUE_CAPTION.includes('Batch candidate is not approval'), 'caption: batch candidate is not approval')
}

// ═════════════════════════════════════════════════════════════════════════════
// D. Functional: ordering uses the queue model (authority-critical first)
// ═════════════════════════════════════════════════════════════════════════════

section('D. Functional ordering')
{
  const rows = [
    makeRow({ id: 'low', risk_class: 'low', review_mode: 'batch_review_allowed', batch_eligible: true, escalation_required: false, escalation_reasons: [], review_priority: 'routine' }),
    makeRow({ id: 'ac', risk_class: 'authority_critical', review_mode: 'two_gate_review_required', review_priority: 'urgent' }),
    makeRow({ id: 'med', risk_class: 'medium', review_mode: 'individual_review_required', escalation_required: true, escalation_reasons: ['human_judgement_required'] }),
  ]
  const q = buildReviewQueue(rows, { includeInactive: true })
  assert(q.entries[0].id === 'ac', 'authority_critical ranked first on the surface ordering')
  assert(q.entries[0].queue_rank === 1, 'first row has queue_rank 1')
  assert(q.entries[q.entries.length - 1].id === 'low', 'low-risk batch candidate ranked after higher burden')
  // includeInactive keeps everything; deleted would only arrive when requested.
  const withDeleted = buildReviewQueue([...rows, makeRow({ id: 'del', deleted_at: '2026-06-14T01:00:00Z' })], { includeInactive: true })
  assert(withDeleted.entries[withDeleted.entries.length - 1].queue_bucket === 'deleted', 'deleted ranked last when present')
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
