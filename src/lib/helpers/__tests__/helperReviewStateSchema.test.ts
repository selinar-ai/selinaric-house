/**
 * Phase 41.7 — Helper Review State Schema tests
 *
 * Run: npx tsx src/lib/helpers/__tests__/helperReviewStateSchema.test.ts
 *
 * No DB, no Supabase, no network. Statically validates the additive migration
 * SQL and the read-only review_state display helper, and cross-checks the
 * migration's allowed states against the Phase 41.6 contract.
 */

import * as fs from 'fs'
import * as path from 'path'

import { ALL_HELPER_REVIEW_STATES } from '../helperReviewActions'
import {
  reviewStateForDisplay,
  DEFAULT_REVIEW_STATE,
  type HelperOutputRow,
} from '../helperReviewPresenter'

// ─── Harness ───────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}

function section(name: string) { console.log(`\n── ${name} ──`) }

function readRepo(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../../../', rel), 'utf-8')
}
function readSrc(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, rel), 'utf-8')
}

function makeRow(o: Partial<HelperOutputRow> = {}): HelperOutputRow {
  return {
    id: 'r', helper_type: 'library_metadata_helper', output_status: 'deterministic_check',
    suggested_action: 'add_summary', confidence_label: 'structural', presence_scope: 'house',
    created_by: 'system_candidate', created_at: '2026-06-13T00:00:00Z',
    not_memory: true, not_evidence: true, prompt_eligible: false, authority_changed: false,
    human_review_required: true, review_routed: false, reviewed_by: null, reviewed_at: null,
    source_refs: [{ source_surface: 'library_item', source_id: 'i' }], suggestion_payload: {},
    deleted_at: null, ...o,
  }
}

const MIGRATION = 'supabase-migrations/075_helper_outputs_review_state.sql'

// ═════════════════════════════════════════════════════════════════════════════
// A. Migration is additive and correctly shaped
// ═════════════════════════════════════════════════════════════════════════════

// Strip -- comment lines so negative scans test executable SQL, not the
// migration's own explanatory header (which names rename/cascade/reviewed_by
// only to say it does NOT do them).
function sqlCodeOnly(): string {
  return readRepo(MIGRATION).toLowerCase().replace(/--.*$/gm, '')
}

section('A. Migration shape')
{
  const sql = sqlCodeOnly()
  assert(sql.includes('alter table helper_outputs'), 'alters helper_outputs')
  assert(sql.includes("add column review_state text not null default 'unreviewed'"), 'adds review_state not null default unreviewed')
  assert(sql.includes('add constraint ho_review_state_vocab check'), 'adds named CHECK constraint')
  assert(sql.includes('create index helper_outputs_review_state_idx'), 'adds review_state index')
  // Additive only.
  assert(!sql.includes('drop column'), 'no drop column')
  assert(!sql.includes('drop constraint'), 'no drop constraint')
  assert(!sql.includes('rename'), 'no rename')
  assert(!sql.includes('cascade'), 'no cascade')
  assert(!/create trigger/.test(sql), 'no trigger')
  assert(!sql.includes('foreign key') && !sql.includes('references '), 'no foreign key')
}

// ═════════════════════════════════════════════════════════════════════════════
// B. Migration does not touch authority locks or reviewer fields
// ═════════════════════════════════════════════════════════════════════════════

section('B. Migration leaves authority + reviewer fields untouched')
{
  const sql = sqlCodeOnly()
  // It must not re-declare or mutate the locked invariant columns.
  for (const col of ['not_memory', 'not_evidence', 'prompt_eligible', 'authority_changed', 'human_review_required', 'review_routed']) {
    assert(!sql.includes(`column ${col}`) && !sql.includes(`alter column ${col}`) && !sql.includes(`set ${col}`), `does not touch ${col}`)
  }
  // It must not set reviewed_by / reviewed_at.
  assert(!sql.includes('reviewed_by') && !sql.includes('reviewed_at'), 'does not set reviewed_by/reviewed_at')
  // No UPDATE / backfill of existing rows.
  assert(!sql.includes('update helper_outputs'), 'no UPDATE/backfill of existing rows')
}

// ═════════════════════════════════════════════════════════════════════════════
// C. Allowed states == the six Phase 41.6 states; no authority-like states
// ═════════════════════════════════════════════════════════════════════════════

section('C. Allowed states match the 41.6 contract')
{
  const sql = readRepo(MIGRATION)
  for (const s of ALL_HELPER_REVIEW_STATES) {
    assert(sql.includes(`'${s}'`), `migration includes contract state '${s}'`)
  }
  assert(ALL_HELPER_REVIEW_STATES.length === 6, 'contract defines exactly six states')
  // Forbidden authority-like states must NOT appear.
  for (const bad of ['accepted', 'approved', 'promoted', 'applied', 'remembered', 'evidence', 'prompt_visible']) {
    assert(!sql.includes(`'${bad}'`), `migration does not allow '${bad}'`)
  }
  assert(sql.includes("default 'unreviewed'"), "default is 'unreviewed'")
}

// ═════════════════════════════════════════════════════════════════════════════
// D. Read-only display helper
// ═════════════════════════════════════════════════════════════════════════════

section('D. reviewStateForDisplay (read-only)')
{
  assert(DEFAULT_REVIEW_STATE === 'unreviewed', 'default review state is unreviewed')
  for (const s of ALL_HELPER_REVIEW_STATES) {
    assert(reviewStateForDisplay(makeRow({ review_state: s })) === s, `displays valid state '${s}'`)
  }
  // Missing / null / unknown all fall back to unreviewed.
  assert(reviewStateForDisplay(makeRow({ review_state: undefined })) === 'unreviewed', 'missing → unreviewed')
  assert(reviewStateForDisplay(makeRow({ review_state: null })) === 'unreviewed', 'null → unreviewed')
  assert(reviewStateForDisplay(makeRow({ review_state: 'approved' })) === 'unreviewed', 'unknown/authority-like → unreviewed')
}

// ═════════════════════════════════════════════════════════════════════════════
// E. Page displays review_state read-only, adds no controls / no mutation
// ═════════════════════════════════════════════════════════════════════════════

section('E. Page displays review_state read-only')
{
  const page = readSrc('../../../app/(house)/helpers/page.tsx')
  assert(page.includes('reviewStateForDisplay'), 'page renders review_state via the read-only helper')
  assert(page.includes('review_state:'), 'page shows a review_state label')
  // Still no mutation controls of any kind.
  // No authority-like controls. (41.13 adds workflow controls incl. Dismiss —
  // a workflow state change, not an authority move.)
  for (const forbidden of ['Accept', 'Approve', 'Promote', 'Apply', 'Mark useful', 'Mark viewed', 'Bulk']) {
    assert(!page.includes(forbidden), `page has no '${forbidden}' control`)
  }
  for (const mut of ["method: 'PATCH'", "method: 'DELETE'", '.insert(', '.update(']) {
    assert(!page.includes(mut), `page does not perform ${mut}`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// F. API route was NOT given a mutation path or a review_state write
// ═════════════════════════════════════════════════════════════════════════════

section('F. API route remains GET-only / read-only')
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
