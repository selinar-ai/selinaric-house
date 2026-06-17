/**
 * Phase 41.9 — Helper Review Burden Schema tests
 *
 * Run: npx tsx src/lib/helpers/__tests__/helperReviewBurdenSchema.test.ts
 *
 * No DB, no Supabase, no network. Statically validates the additive migration
 * SQL (constraints + conservative defaults), cross-checks the persisted
 * vocabularies against the Phase 41.8 contract, and tests the read-only burden
 * display helper.
 */

import * as fs from 'fs'
import * as path from 'path'

import {
  ALL_HELPER_RISK_CLASSES,
  ALL_HELPER_REVIEW_PRIORITIES,
  ALL_HELPER_REVIEW_MODES,
  ALL_HELPER_ESCALATION_REASONS,
} from '../helperReviewScalability'
import { reviewBurdenForDisplay, type HelperOutputRow } from '../helperReviewPresenter'

// ─── Harness ───────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}

function section(name: string) { console.log(`\n── ${name} ──`) }

const MIGRATION = 'supabase-migrations/076_helper_outputs_review_burden.sql'

function readRepo(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../../../', rel), 'utf-8')
}
function readSrc(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, rel), 'utf-8')
}
/** Migration SQL with -- comment lines stripped (negative scans test code). */
function sqlCodeOnly(): string {
  return readRepo(MIGRATION).toLowerCase().replace(/--.*$/gm, '')
}

function makeRow(o: Partial<HelperOutputRow> = {}): HelperOutputRow {
  return {
    id: 'r', helper_type: 'library_metadata_helper', output_status: 'deterministic_check',
    suggested_action: 'add_summary', confidence_label: 'structural', presence_scope: 'house',
    created_by: 'system_candidate', created_at: '2026-06-14T00:00:00Z',
    not_memory: true, not_evidence: true, prompt_eligible: false, authority_changed: false,
    human_review_required: true, review_routed: false, reviewed_by: null, reviewed_at: null,
    source_refs: [{ source_surface: 'library_item', source_id: 'i' }], suggestion_payload: {},
    deleted_at: null, ...o,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// A. Columns added with conservative defaults
// ═════════════════════════════════════════════════════════════════════════════

section('A. Columns + conservative defaults')
{
  const sql = sqlCodeOnly()
  assert(sql.includes('alter table helper_outputs'), 'alters helper_outputs')
  assert(sql.includes("add column risk_class") && sql.includes("default 'authority_critical'"), 'risk_class default authority_critical')
  assert(sql.includes("add column review_priority") && sql.includes("default 'normal'"), 'review_priority default normal')
  assert(sql.includes("add column review_mode") && sql.includes("default 'two_gate_review_required'"), 'review_mode default two_gate')
  assert(sql.includes('add column batch_eligible') && /batch_eligible\s+boolean\s+not null\s+default false/.test(sql), 'batch_eligible default false')
  assert(sql.includes('add column sample_required') && /sample_required\s+boolean\s+not null\s+default false/.test(sql), 'sample_required default false')
  assert(sql.includes('add column escalation_required') && /escalation_required\s+boolean\s+not null\s+default true/.test(sql), 'escalation_required default true')
  assert(sql.includes("add column escalation_reasons") && sql.includes("default array['human_judgement_required']"), 'escalation_reasons default human_judgement_required')
  // Additive only.
  for (const bad of ['drop column', 'drop constraint', 'rename', 'cascade', 'create trigger', 'update helper_outputs', 'foreign key']) {
    assert(!sql.includes(bad), `no ${bad}`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// B. Closed vocabularies match Phase 41.8 exactly
// ═════════════════════════════════════════════════════════════════════════════

section('B. Vocabularies match the 41.8 contract')
{
  const sql = readRepo(MIGRATION)
  for (const r of ALL_HELPER_RISK_CLASSES) assert(sql.includes(`'${r}'`), `risk_class includes '${r}'`)
  for (const p of ALL_HELPER_REVIEW_PRIORITIES) assert(sql.includes(`'${p}'`), `review_priority includes '${p}'`)
  for (const m of ALL_HELPER_REVIEW_MODES) assert(sql.includes(`'${m}'`), `review_mode includes '${m}'`)
  for (const e of ALL_HELPER_ESCALATION_REASONS) assert(sql.includes(`'${e}'`), `escalation_reasons includes '${e}'`)
  // Named constraints present.
  for (const c of ['ho_risk_class_vocab', 'ho_review_priority_vocab', 'ho_review_mode_vocab', 'ho_escalation_reasons_vocab']) {
    assert(sql.includes(c), `constraint ${c} present`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// C. Batch-eligibility + authority-critical constraints present
// ═════════════════════════════════════════════════════════════════════════════

section('C. Safety constraints present')
{
  const sql = sqlCodeOnly()
  assert(sql.includes('ho_batch_eligibility'), 'ho_batch_eligibility present')
  // batch true requires the full safe condition.
  assert(/batch_eligible = false\s*or\s*\(/.test(sql), 'batch_eligible gated by a safe condition')
  for (const need of ["risk_class = 'low'", "review_mode = 'batch_review_allowed'", 'not_memory = true', 'not_evidence = true', 'prompt_eligible = false', 'authority_changed = false', 'escalation_required = false']) {
    assert(sql.includes(need), `batch rule requires ${need}`)
  }
  assert(sql.includes('ho_two_gate_not_batch'), 'ho_two_gate_not_batch present')
  assert(sql.includes('ho_authority_critical_shape'), 'ho_authority_critical_shape present')
  assert(sql.includes('ho_escalation_reasons_when_required'), 'ho_escalation_reasons_when_required present')
  assert(sql.includes('ho_escalation_required_low_only'), 'ho_escalation_required_low_only present')
  // authority_critical shape: two_gate + escalation_required.
  assert(/risk_class <> 'authority_critical'\s*or\s*\(review_mode = 'two_gate_review_required' and escalation_required = true\)/.test(sql), 'authority_critical requires two_gate + escalation')
}

// ═════════════════════════════════════════════════════════════════════════════
// D. Indexes present
// ═════════════════════════════════════════════════════════════════════════════

section('D. Indexes')
{
  const sql = sqlCodeOnly()
  for (const idx of [
    'helper_outputs_risk_class_idx', 'helper_outputs_review_priority_idx', 'helper_outputs_review_mode_idx',
    'helper_outputs_batch_eligible_idx', 'helper_outputs_escalation_required_idx', 'helper_outputs_review_queue_idx',
  ]) {
    assert(sql.includes(idx), `index ${idx} present`)
  }
  assert(sql.includes('(deleted_at, review_state, risk_class, review_priority)'), 'composite review-queue index columns')
}

// ═════════════════════════════════════════════════════════════════════════════
// E. Does not touch authority invariants from 074/075
// ═════════════════════════════════════════════════════════════════════════════

section('E. Authority invariants untouched')
{
  const sql = sqlCodeOnly()
  // No re-declaration / alteration of the locked columns or review_state.
  for (const col of ['add column not_memory', 'add column not_evidence', 'add column prompt_eligible', 'add column authority_changed', 'add column human_review_required', 'add column review_state', 'add column review_routed']) {
    assert(!sql.includes(col), `does not re-add ${col}`)
  }
  for (const m of ['alter column', 'set not_memory', 'set prompt_eligible', 'drop constraint ho_']) {
    assert(!sql.includes(m), `does not ${m}`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// F. Read-only burden display helper
// ═════════════════════════════════════════════════════════════════════════════

section('F. reviewBurdenForDisplay (read-only)')
{
  // Absent burden → null (v1 API does not select these columns).
  assert(reviewBurdenForDisplay(makeRow()) === null, 'no burden fields → null (renders nothing)')
  // Present burden → normalized read-only view.
  const v = reviewBurdenForDisplay(makeRow({
    risk_class: 'low', review_priority: 'routine', review_mode: 'batch_review_allowed',
    batch_eligible: true, sample_required: true, escalation_required: false, escalation_reasons: [],
  }))
  assert(!!v && v.risk_class === 'low' && v.batch_eligible === true, 'present burden returns normalized view')
  assert(v!.escalation_required === false && v!.escalation_reasons.length === 0, 'low batch burden shown correctly')
  const ac = reviewBurdenForDisplay(makeRow({ risk_class: 'authority_critical', review_mode: 'two_gate_review_required', escalation_required: true, escalation_reasons: ['human_judgement_required'] }))
  assert(!!ac && ac.risk_class === 'authority_critical' && ac.escalation_reasons.includes('human_judgement_required'), 'authority_critical burden shown correctly')
}

// ═════════════════════════════════════════════════════════════════════════════
// G. Page shows burden read-only, adds no controls / no mutation
// ═════════════════════════════════════════════════════════════════════════════

section('G. Page burden display is read-only')
{
  const page = readSrc('../../../app/(house)/helpers/page.tsx')
  assert(page.includes('reviewBurdenForDisplay'), 'page renders burden via the read-only helper')
  // Still no mutation controls.
  // No authority-like controls. (41.13 adds workflow controls incl. Dismiss —
  // a workflow state change, not an authority move.)
  for (const forbidden of ['Accept', 'Approve', 'Promote', 'Apply', 'Mark useful', 'Mark viewed', 'Bulk', 'Batch approve', 'Batch dismiss']) {
    assert(!page.includes(forbidden), `page has no '${forbidden}' control`)
  }
  for (const mut of ["method: 'PATCH'", "method: 'DELETE'", '.insert(', '.update(']) {
    assert(!page.includes(mut), `page does not perform ${mut}`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// H. API route still GET-only / read-only (and does not select burden yet)
// ═════════════════════════════════════════════════════════════════════════════

section('H. API route unchanged / GET-only')
{
  const route = readSrc('../../../app/api/helper-outputs/route.ts')
  for (const verb of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    assert(!new RegExp(`export\\s+async\\s+function\\s+${verb}`).test(route), `route does NOT export ${verb}`)
  }
  for (const mut of ['.insert(', '.update(', '.delete(', '.upsert(']) {
    assert(!route.includes(mut), `route does not call ${mut}`)
  }
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
