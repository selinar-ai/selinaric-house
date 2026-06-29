/**
 * Phase 41.17.2 — Deterministic Helper Roster Pack governance tests
 *
 * Run: npx tsx src/lib/helpers/__tests__/helperRosterPackGovernance.test.ts
 *
 *  A. Migration 082 static scan — proves 082 ONLY widens the helper_type CHECK and
 *     the source-ref validation trigger (with completeness restricted to
 *     library_item), and adds no grants / RLS change / new table / apply-table
 *     change / new vocabulary.
 *  B. Workshop safety — proves the delegated apply control is hard-scoped to the
 *     metadata helper, so NONE of the three new roster helper types is ever
 *     delegatable (no apply button).
 *
 * No DB. No Supabase. No writes. Pure static-scan + pure-function assertions.
 */

import * as fs from 'fs'
import * as path from 'path'

import { isDelegatableExtractionOutput } from '../helperWorkOrder'
import type { HelperOutputRow } from '../helperReviewPresenter'

let passed = 0
let failed = 0
const failures: string[] = []
function assert(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) } else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}
function section(name: string) { console.log(`\n── ${name} ──`) }

const NEW_TYPES = [
  'library_content_health_helper',
  'source_reference_integrity_helper',
  'documentation_completeness_helper',
]

// ═════════════════════════════════════════════════════════════════════════════
// A. Migration 082 static scan
// ═════════════════════════════════════════════════════════════════════════════

section('A. Migration 082 static scan')
{
  const raw = fs.readFileSync(
    path.resolve(__dirname, '../../../../supabase-migrations/082_helper_roster_pack_types.sql'),
    'utf-8',
  )
  // Scan SQL CODE only — strip `--` line comments so the governance comment cannot
  // false-positive the forbidden-keyword bans.
  const sql = raw.replace(/--.*$/gm, '')
  const lower = sql.toLowerCase()

  // (a) Widens the helper_type CHECK to the five v1 types.
  assert(sql.includes('drop constraint ho_helper_type_v1'), 'drops the helper_type CHECK')
  assert(sql.includes('add constraint ho_helper_type_v1'), 're-adds the helper_type CHECK')
  for (const t of NEW_TYPES) assert(sql.includes(t), `CHECK/trigger registers ${t}`)
  assert(sql.includes('library_metadata_helper') && sql.includes('library_documentation_helper'), 'keeps the existing two v1 types')

  // (b) Updates the trigger; completeness restricted to library_item only.
  assert(sql.includes('create or replace function validate_helper_output_source_refs'), 'updates the source-ref validation trigger function')
  assert(sql.includes("elsif NEW.helper_type = 'documentation_completeness_helper'"), 'completeness has its own allow-map branch')
  assert(sql.includes("array['library_item']"), 'completeness allow-map is library_item ONLY (no library_item_file)')
  assert(sql.includes("array['library_item', 'library_item_file']"), 'the other v1 helpers keep both surfaces')

  // NO broad grants, NO RLS relaxation, NO new policy.
  assert(!lower.includes('grant'), '082 adds no grants')
  assert(!lower.includes('disable row level security'), '082 does not disable RLS')
  assert(!lower.includes('create policy') && !lower.includes('drop policy'), '082 adds/drops no policy')

  // NO apply / work-order / review-table change; NO new table.
  assert(!lower.includes('helper_work_orders'), '082 does not touch helper_work_orders')
  assert(!lower.includes('helper_apply_events'), '082 does not touch helper_apply_events')
  assert(!lower.includes('create table'), '082 creates no table')

  // NO new vocabulary beyond helper_type.
  for (const other of ['ho_action_vocab', 'ho_status_vocab', 'ho_confidence_vocab', 'ho_presence_scope_vocab', 'ho_created_by_vocab']) {
    assert(!sql.includes(other), `082 does not alter ${other}`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// B. Workshop safety — none of the new roster types is ever delegatable
// ═════════════════════════════════════════════════════════════════════════════

section('B. Workshop safety — no apply control for any roster helper')
{
  const row = (o: Partial<Record<string, unknown>> = {}): HelperOutputRow => ({
    id: 'o-1',
    helper_type: 'library_content_health_helper',
    suggested_action: 'prepare_review_note',
    suggestion_payload: { issue_code: 'file_content_truncated' },
    source_refs: [{ source_surface: 'library_item', source_id: 'item-1' }],
    deleted_at: null,
    ...o,
  } as unknown as HelperOutputRow)

  for (const t of NEW_TYPES) {
    // A normal finding for this type is not delegatable.
    assert(isDelegatableExtractionOutput(row({ helper_type: t })) === false, `${t}: normal finding has no apply control`)
    // Even a row that MAXIMALLY mimics the delegatable extraction shape stays
    // non-delegatable — the gate is hard-scoped by helper_type first.
    const mimic = row({
      helper_type: t,
      suggested_action: 'check_extraction_status',
      suggestion_payload: { issue_code: 'file_extraction_not_run' },
      source_refs: [{ source_surface: 'library_item_file', source_id: 'f-1' }],
    })
    assert(isDelegatableExtractionOutput(mimic) === false, `${t}: mimicking the extraction shape is still NOT delegatable`)
  }

  // Sanity: the genuine metadata extraction output IS delegatable (gate intact).
  const metadataDelegatable = row({
    helper_type: 'library_metadata_helper',
    suggested_action: 'check_extraction_status',
    suggestion_payload: { issue_code: 'file_extraction_not_run' },
    source_refs: [{ source_surface: 'library_item_file', source_id: 'f-1' }],
  })
  assert(isDelegatableExtractionOutput(metadataDelegatable) === true, 'the metadata extraction output remains delegatable (gate intact)')
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
if (failures.length > 0) { console.log('\n  Failures:'); for (const f of failures) console.log(`    ✗ ${f}`) }
console.log('══════════════════════════════════════════\n')
process.exit(failed > 0 ? 1 : 0)
