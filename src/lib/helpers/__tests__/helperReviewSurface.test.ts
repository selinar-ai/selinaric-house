/**
 * Phase 41.4 — Helper Output Review Surface tests
 *
 * Run: npx tsx src/lib/helpers/__tests__/helperReviewSurface.test.ts
 *
 * Unit-tests the pure presenter, and statically scans the page + API route to
 * prove the surface is read-only: GET-only data source, no write controls, no
 * accept/reject/run, boundary language present, multi-ref provenance rendered,
 * and description shown as "Description / summary".
 *
 * No DOM, no React render, no DB, no Supabase, no network.
 */

import * as fs from 'fs'
import * as path from 'path'

import {
  HELPER_REVIEW_TITLE,
  HELPER_REVIEW_SUBTITLE,
  HELPER_REVIEW_BOUNDARY_TEXT,
  HELPER_REVIEW_EMPTY_PRIMARY,
  HELPER_REVIEW_EMPTY_SECONDARY,
  SOFT_DELETED_LABEL,
  SUMMARY_FIELD_LABEL,
  isSoftDeleted,
  filterRows,
  provenanceSurfaceLabel,
  provenanceSummary,
  renderedProvenance,
  authorityFlags,
  labelForCheckedField,
  labelCheckedFields,
  asLibraryMetadataPayload,
  isLibraryMetadataHelper,
  type HelperOutputRow,
} from '../helperReviewPresenter'

import { inspectLibraryItem, type LibraryItemSnapshot } from '../libraryMetadataHelper'

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

function makeRow(o: Partial<HelperOutputRow> = {}): HelperOutputRow {
  return {
    id: 'row-1',
    helper_type: 'library_metadata_helper',
    output_status: 'deterministic_check',
    suggested_action: 'add_summary',
    confidence_label: 'structural',
    presence_scope: 'house',
    created_by: 'system_candidate',
    created_at: '2026-06-10T00:00:00Z',
    not_memory: true,
    not_evidence: true,
    prompt_eligible: false,
    authority_changed: false,
    human_review_required: true,
    review_routed: false,
    reviewed_by: null,
    reviewed_at: null,
    source_refs: [{ source_surface: 'library_item', source_id: 'item-1' }],
    suggestion_payload: { issue_code: 'item_summary_missing', checked_fields: ['description'] },
    deleted_at: null,
    ...o,
  }
}

function readSrc(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, rel), 'utf-8')
}

// ═════════════════════════════════════════════════════════════════════════════
// A. Boundary copy
// ═════════════════════════════════════════════════════════════════════════════

section('A. Boundary copy')
{
  assert(HELPER_REVIEW_TITLE === 'Helper Review', 'title is Helper Review')
  assert(HELPER_REVIEW_SUBTITLE === 'Helper labour, not authority.', 'subtitle is helper labour, not authority')
  assert(HELPER_REVIEW_BOUNDARY_TEXT.includes('not Memory'), 'boundary says not Memory')
  assert(HELPER_REVIEW_BOUNDARY_TEXT.includes('not evidence'), 'boundary says not evidence')
  assert(HELPER_REVIEW_BOUNDARY_TEXT.includes('not prompt authority'), 'boundary says not prompt authority')
  assert(HELPER_REVIEW_BOUNDARY_TEXT.includes('do not change Library, Archive, or graph truth'), 'boundary says no authority change')
  assert(HELPER_REVIEW_EMPTY_PRIMARY === 'No helper outputs yet.', 'empty-state primary copy')
  assert(HELPER_REVIEW_EMPTY_SECONDARY.includes('separately authorised'), 'empty-state secondary copy')
}

// ═════════════════════════════════════════════════════════════════════════════
// B. Soft-delete handling
// ═════════════════════════════════════════════════════════════════════════════

section('B. Soft-delete handling')
{
  const active = makeRow({ id: 'a', deleted_at: null })
  const deleted = makeRow({ id: 'd', deleted_at: '2026-06-10T01:00:00Z' })
  assert(!isSoftDeleted(active), 'active row not soft-deleted')
  assert(isSoftDeleted(deleted), 'deleted row is soft-deleted')
  assert(filterRows([active, deleted]).length === 1, 'default hides soft-deleted')
  assert(filterRows([active, deleted])[0].id === 'a', 'default keeps active row')
  assert(filterRows([active, deleted], { showDeleted: true }).length === 2, 'opt-in shows soft-deleted')
  assert(SOFT_DELETED_LABEL === 'Soft-deleted trace', 'soft-deleted label')
}

// ═════════════════════════════════════════════════════════════════════════════
// C. Multi-ref provenance — never collapsed
// ═════════════════════════════════════════════════════════════════════════════

section('C. Multi-ref provenance')
{
  const refs = [
    { source_surface: 'library_item_file', source_id: 'file-1' },
    { source_surface: 'library_item', source_id: 'item-1' },
  ]
  assert(provenanceSurfaceLabel('library_item') === 'Library item', 'library_item label')
  assert(provenanceSurfaceLabel('library_item_file') === 'Library file', 'library_item_file label')
  assert(provenanceSummary(refs) === 'Library file + parent Library item', 'file+item summary line')
  assert(provenanceSummary([{ source_surface: 'library_item', source_id: 'i' }]) === 'Library item', 'single-ref summary')

  const rendered = renderedProvenance(refs, { 'file-1': 'doc.docx', 'item-1': 'My Item' })
  assert(rendered.length === 2, 'both refs rendered (not collapsed)')
  assert(rendered[0].label === 'doc.docx' && rendered[1].label === 'My Item', 'readable labels applied when available')
  const noLabels = renderedProvenance(refs)
  assert(noLabels[0].label === null && noLabels[1].label === null, 'falls back to id when no label')
}

// ═════════════════════════════════════════════════════════════════════════════
// D. Authority flags display
// ═════════════════════════════════════════════════════════════════════════════

section('D. Authority flags')
{
  const safe = authorityFlags(makeRow())
  assert(safe.every((f) => f.safe), 'all flags safe for a valid row')
  assert(safe.length === 6, 'six flags rendered')

  const badPrompt = authorityFlags(makeRow({ prompt_eligible: true }))
  assert(badPrompt.find((f) => f.key === 'prompt_eligible')!.safe === false, 'prompt_eligible:true flagged unsafe')
  const badAuthority = authorityFlags(makeRow({ authority_changed: true }))
  assert(badAuthority.find((f) => f.key === 'authority_changed')!.safe === false, 'authority_changed:true flagged unsafe')
  const badMemory = authorityFlags(makeRow({ not_memory: false }))
  assert(badMemory.find((f) => f.key === 'not_memory')!.safe === false, 'not_memory:false flagged unsafe')
  // review_routed carries no authority either way.
  assert(authorityFlags(makeRow({ review_routed: true })).find((f) => f.key === 'review_routed')!.safe === true, 'review_routed:true still safe')
}

// ═════════════════════════════════════════════════════════════════════════════
// E. description → "Description / summary"
// ═════════════════════════════════════════════════════════════════════════════

section('E. Description / summary labelling')
{
  assert(SUMMARY_FIELD_LABEL === 'Description / summary', 'summary field label constant')
  assert(labelForCheckedField('description') === 'Description / summary', 'description relabelled')
  assert(labelForCheckedField('title') === 'title', 'other fields unchanged')
  assert(JSON.stringify(labelCheckedFields(['description', 'tags'])) === JSON.stringify(['Description / summary', 'tags']), 'array relabelled')

  const view = asLibraryMetadataPayload({ issue_code: 'item_summary_missing', issue_label: 'no summary', checked_fields: ['description'], suggested_next_step: 'add one', deterministic_reason: 'null', observed_state: { description_present: false } })
  assert(!!view, 'parses a library metadata payload')
  assert(view!.checked_fields_labelled.includes('Description / summary'), 'parsed view relabels description')
  assert(asLibraryMetadataPayload(null) === null, 'null payload → null')
  assert(asLibraryMetadataPayload({ random: 1 }) === null, 'non-library payload → null')
}

// ═════════════════════════════════════════════════════════════════════════════
// F. Integration — a real helper draft renders cleanly
// ═════════════════════════════════════════════════════════════════════════════

section('F. Real helper output renders')
{
  const item: LibraryItemSnapshot = { id: 'lib-real', title: '', description: null, tags: [], presence_scope: 'house' }
  const drafts = inspectLibraryItem(item)
  assert(drafts.length > 0, 'helper produced drafts')
  // Shape a draft into an API-style row.
  const d = drafts.find((x) => x.suggested_action === 'add_summary')!
  const row: HelperOutputRow = {
    id: 'r', created_at: '2026-06-10T00:00:00Z', reviewed_by: null, reviewed_at: null, deleted_at: null,
    helper_type: d.helper_type, output_status: d.output_status, suggested_action: d.suggested_action,
    confidence_label: d.confidence_label, presence_scope: d.presence_scope, created_by: d.created_by,
    not_memory: d.not_memory, not_evidence: d.not_evidence, prompt_eligible: d.prompt_eligible,
    authority_changed: d.authority_changed, human_review_required: d.human_review_required,
    review_routed: d.review_routed, source_refs: d.source_refs, suggestion_payload: d.suggestion_payload,
  }
  assert(isLibraryMetadataHelper(row), 'row recognised as library metadata helper')
  const view = asLibraryMetadataPayload(row.suggestion_payload)
  assert(!!view && view.checked_fields_labelled.includes('Description / summary'), 'real summary draft relabels description')
  assert(authorityFlags(row).every((f) => f.safe), 'real draft renders all-safe flags')
}

// ═════════════════════════════════════════════════════════════════════════════
// G. API route is GET-only and read-only (static scan)
// ═════════════════════════════════════════════════════════════════════════════

section('G. API route is GET-only / read-only')
{
  const route = readSrc('../../../app/api/helper-outputs/route.ts')
  assert(/export async function GET/.test(route), 'route exports GET')
  for (const verb of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    assert(!new RegExp(`export\\s+async\\s+function\\s+${verb}`).test(route), `route does NOT export ${verb}`)
  }
  for (const mut of ['.insert(', '.update(', '.delete(', '.upsert(']) {
    assert(!route.includes(mut), `route does not call ${mut}`)
  }
  assert(route.includes("from('helper_outputs')"), 'route reads helper_outputs')
  // Server-side auth gate — not callable unauthenticated.
  assert(route.includes('requireHouseApiAuth'), 'route imports the server-side auth helper')
  assert(/requireHouseApiAuth\(request\)/.test(route), 'route calls requireHouseApiAuth(request)')
  assert(/if\s*\(\s*!auth\.ok\s*\)/.test(route), 'route fails closed when auth is not ok')
}

// ═════════════════════════════════════════════════════════════════════════════
// H. Page is read-only visibility (static scan)
// ═════════════════════════════════════════════════════════════════════════════

section('H. Page is read-only visibility')
{
  const page = readSrc('../../../app/(house)/helpers/page.tsx')
  // Boundary language wired in.
  assert(page.includes('HELPER_REVIEW_BOUNDARY_TEXT'), 'page renders boundary text')
  assert(page.includes('HELPER_REVIEW_TITLE'), 'page renders title')
  assert(page.includes('HELPER_REVIEW_EMPTY_PRIMARY'), 'page renders empty-state copy')
  // Read-only data source.
  assert(page.includes('/api/helper-outputs'), 'page reads from the GET data source')
  // Multi-ref provenance + summary label rendering.
  assert(page.includes('renderedProvenance') && page.includes('provenanceSummary'), 'page renders multi-ref provenance')
  assert(page.includes('checked_fields_labelled'), 'page renders relabelled checked fields')
  // No write/mutation controls.
  for (const forbidden of ['Accept', 'Reject', 'Approve', 'Promote', 'Mark reviewed', 'Run helper', 'Bulk']) {
    assert(!page.includes(forbidden), `page has no '${forbidden}' control`)
  }
  for (const mut of ["method: 'POST'", "method: 'PATCH'", "method: 'PUT'", "method: 'DELETE'", '.insert(', '.update(', '.delete(']) {
    assert(!page.includes(mut), `page does not perform ${mut}`)
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
