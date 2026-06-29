/**
 * Phase 41.17.2 — Documentation Completeness Helper Tests
 *
 * Run: npx tsx src/lib/helpers/__tests__/documentationCompletenessHelper.test.ts
 *
 * No LLM call. No API route. No UI. No database. No Supabase. No writes.
 * No authority movement. Pure deterministic helper tests over fixtures.
 */

import * as fs from 'fs'
import * as path from 'path'

import {
  inspectDocumentationCompleteness,
  detectPhaseMetadataIncompleteIssue,
  detectSupersededLinkIssue,
  DOCUMENTATION_COMPLETENESS_ISSUE_CODES,
  type DocCompletenessItemSnapshot,
} from '../documentationCompletenessHelper'

import {
  validateHelperOutputDraft,
  isForbiddenSuggestedAction,
  isForbiddenSourceSurface,
  type HelperSourceSurface,
} from '../helperContract'

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

/** A clean dev-documentation item: complete phase metadata, active, no archive need. */
function makeItem(o: Partial<DocCompletenessItemSnapshot> = {}): DocCompletenessItemSnapshot {
  return {
    id: 'item-1',
    presence_scope: 'house',
    collection: 'development_documentation',
    phase_code: 'P41',
    phase_number: 17,
    phase_label: 'Phase 41.17',
    authority_status: 'active',
    archive_item_id: null,
    ...o,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// A. Partial phase metadata → phase_doc_incomplete_phase_metadata
// ═════════════════════════════════════════════════════════════════════════════

section('A. Partial phase metadata gap')
{
  // Does NOT fire when ALL THREE phase fields are missing (documentation helper's case).
  assert(detectPhaseMetadataIncompleteIssue(makeItem({ phase_code: null, phase_number: null, phase_label: null })) === null, 'all-null phase metadata → NO incomplete finding (that is the documentation helper)')

  // Does NOT fire when ALL THREE phase fields are present.
  assert(detectPhaseMetadataIncompleteIssue(makeItem({ phase_code: 'P9', phase_number: 9, phase_label: 'Phase 9' })) === null, 'all-present phase metadata → NO incomplete finding')

  // Fires: exactly ONE present (two missing).
  const oneHit = detectPhaseMetadataIncompleteIssue(makeItem({ phase_code: 'P9', phase_number: null, phase_label: null }))
  assert(oneHit?.issue_code === 'phase_doc_incomplete_phase_metadata', 'exactly one phase field present → phase_doc_incomplete_phase_metadata')
  assert(oneHit?.suggested_action === 'prepare_review_note', 'suggested_action prepare_review_note')

  // Fires: TWO present, one missing.
  const twoHit = detectPhaseMetadataIncompleteIssue(makeItem({ phase_code: 'P9', phase_number: 9, phase_label: null }))
  assert(twoHit?.issue_code === 'phase_doc_incomplete_phase_metadata', 'two phase fields present, one missing → phase_doc_incomplete_phase_metadata')

  // Fires for each single-present variant (code / number / label).
  assert(detectPhaseMetadataIncompleteIssue(makeItem({ phase_code: null, phase_number: 9, phase_label: null }))?.issue_code === 'phase_doc_incomplete_phase_metadata', 'only phase_number present → incomplete finding')
  assert(detectPhaseMetadataIncompleteIssue(makeItem({ phase_code: null, phase_number: null, phase_label: 'Phase X' }))?.issue_code === 'phase_doc_incomplete_phase_metadata', 'only phase_label present → incomplete finding')

  // Does NOT fire when collection is not development_documentation, even if partial.
  assert(detectPhaseMetadataIncompleteIssue(makeItem({ collection: 'books', phase_code: 'P9', phase_number: null, phase_label: null })) === null, 'non dev-doc collection with partial metadata → NO finding')

  // Blank (whitespace) phase_code / phase_label count as missing.
  assert(detectPhaseMetadataIncompleteIssue(makeItem({ phase_code: '   ', phase_number: 9, phase_label: '   ' }))?.issue_code === 'phase_doc_incomplete_phase_metadata', 'whitespace code/label treated as missing → number-only is partial')
}

// ═════════════════════════════════════════════════════════════════════════════
// B. Superseded item missing archive link → superseded_item_missing_archive_link
// ═════════════════════════════════════════════════════════════════════════════

section('B. Superseded item missing archive link')
{
  // Fires: superseded + no archive_item_id.
  const hit = detectSupersededLinkIssue(makeItem({ authority_status: 'superseded', archive_item_id: null }))
  assert(hit?.issue_code === 'superseded_item_missing_archive_link', 'superseded + null archive_item_id → superseded_item_missing_archive_link')
  assert(hit?.suggested_action === 'prepare_review_note', 'suggested_action prepare_review_note')

  // Does NOT fire when an archive link is present.
  assert(detectSupersededLinkIssue(makeItem({ authority_status: 'superseded', archive_item_id: 'arch-1' })) === null, 'superseded with archive_item_id present → no finding')

  // Does NOT fire when status is not superseded.
  assert(detectSupersededLinkIssue(makeItem({ authority_status: 'active', archive_item_id: null })) === null, 'active status → no superseded-link finding')

  // Blank (whitespace) archive_item_id counts as missing.
  assert(detectSupersededLinkIssue(makeItem({ authority_status: 'superseded', archive_item_id: '   ' }))?.issue_code === 'superseded_item_missing_archive_link', 'whitespace archive_item_id treated as missing → finding')
}

// ═════════════════════════════════════════════════════════════════════════════
// C. Clean item — default no output; opt-in no_action
// ═════════════════════════════════════════════════════════════════════════════

section('C. Clean item behaviour')
{
  const none = inspectDocumentationCompleteness(makeItem())
  assert(none.length === 0, 'clean item yields no output by default')

  const withNoAction = inspectDocumentationCompleteness(makeItem(), { emitNoActionWhenClean: true })
  assert(withNoAction.length === 1, 'clean item with opt-in yields exactly one row')
  assert(withNoAction[0].suggested_action === 'no_action', 'opt-in row is no_action')
  assert(withNoAction[0].source_refs.length >= 1, 'opt-in row has non-empty provenance')
  assert(validateHelperOutputDraft(withNoAction[0]).valid, 'opt-in no_action row passes contract')
  assert((withNoAction[0].suggestion_payload as { issue_code: string }).issue_code === 'no_documentation_completeness_issues_found', 'opt-in clean sentinel issue_code')
}

// ═════════════════════════════════════════════════════════════════════════════
// D. Locked invariants + contract validity on emitted drafts
// ═════════════════════════════════════════════════════════════════════════════

section('D. Locked invariants and contract validity')
{
  // An item that trips BOTH checks → 2 drafts (partial phase metadata + superseded no link).
  const drafts = inspectDocumentationCompleteness(
    makeItem({ phase_code: 'P9', phase_number: null, phase_label: null, authority_status: 'superseded', archive_item_id: null }),
    { testOwned: true },
  )
  assert(drafts.length === 2, 'two completeness gaps detected (partial phase metadata + superseded no link)')
  for (const d of drafts) {
    assert(d.helper_type === 'documentation_completeness_helper', 'helper_type is documentation_completeness_helper')
    assert(d.not_memory === true && d.not_evidence === true, 'not_memory / not_evidence true')
    assert(d.prompt_eligible === false && d.authority_changed === false, 'prompt_eligible / authority_changed false')
    assert(d.human_review_required === true && d.review_routed === false, 'human_review_required true, review_routed false')
    assert(d.output_status === 'deterministic_check', 'inert deterministic_check status')
    assert(d.confidence_label === 'structural', 'structural confidence')
    assert(d.created_by === 'system_candidate', 'created_by system_candidate')
    assert(d.test_owned === true, 'testOwned option propagates')
    assert(d.source_refs.every((r) => r.source_surface === 'library_item'), 'provenance is library_item only')
    assert(validateHelperOutputDraft(d).valid, `draft (${d.suggested_action}) passes contract`)
    assert(!isForbiddenSuggestedAction(d.suggested_action), 'action is not forbidden')
    for (const ref of d.source_refs) {
      assert(!isForbiddenSourceSurface(ref.source_surface as HelperSourceSurface), 'surface is not forbidden')
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// E. No overlap with the other helpers' issue codes
// ═════════════════════════════════════════════════════════════════════════════

section('E. No issue-code overlap with sibling helpers')
{
  const otherCodes = [
    'item_title_weak', 'item_summary_missing', 'item_tags_missing',
    'file_extraction_not_run', 'file_extracted_but_empty', 'file_extraction_no_text',
    'no_issues_found',
    'phase_doc_missing_phase_metadata', 'item_no_source_material',
    'no_documentation_structure_issues_found',
    'file_content_truncated', 'file_flagged_needs_review',
    'source_url_malformed', 'item_file_path_without_file_record', 'file_storage_reference_broken',
  ]
  for (const c of DOCUMENTATION_COMPLETENESS_ISSUE_CODES) {
    assert(!otherCodes.includes(c), `completeness code '${c}' is not a sibling-helper code`)
  }
  // Especially: this helper must NOT reuse the documentation helper's all-null code.
  assert(!(DOCUMENTATION_COMPLETENESS_ISSUE_CODES as readonly string[]).includes('phase_doc_missing_phase_metadata'), 'does not reuse phase_doc_missing_phase_metadata')

  // Even a fixture that trips both checks emits only approved completeness codes.
  const drafts = inspectDocumentationCompleteness(
    makeItem({ phase_code: 'P9', phase_number: null, phase_label: null, authority_status: 'superseded', archive_item_id: null }),
  )
  for (const d of drafts) {
    const code = (d.suggestion_payload as { issue_code: string }).issue_code
    assert(!otherCodes.includes(code), `emitted code '${code}' is never a sibling-helper code`)
    assert((DOCUMENTATION_COMPLETENESS_ISSUE_CODES as readonly string[]).includes(code), `emitted code '${code}' is an approved completeness code`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// F. Determinism + payload safety
// ═════════════════════════════════════════════════════════════════════════════

section('F. Determinism and payload safety')
{
  const item = makeItem({ phase_code: 'P9', phase_number: null, phase_label: null, authority_status: 'superseded', archive_item_id: null })
  const run1 = inspectDocumentationCompleteness(item)
  const run2 = inspectDocumentationCompleteness(item)
  assert(JSON.stringify(run1) === JSON.stringify(run2), 'same input → identical output (deterministic)')
}

// ═════════════════════════════════════════════════════════════════════════════
// G. Source-level purity — no DB / LLM / retrieval / chunk imports
// ═════════════════════════════════════════════════════════════════════════════

section('G. Source purity (static scan of the module)')
{
  const src = fs.readFileSync(path.resolve(__dirname, '../documentationCompletenessHelper.ts'), 'utf-8')
  // Scan CODE only — strip block/line comments so the boundary docstring (which
  // legitimately names Supabase, fetch, helper_output, etc. to say it does NOT
  // touch them) cannot false-positive the purity check.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
  const banned = [
    'supabase', 'createClient', '@anthropic', 'anthropic', 'openai',
    'fetch(', 'library_chunks', 'embedding', 'await ', 'helper_output',
  ]
  for (const term of banned) {
    assert(!codeOnly.includes(term), `module code does not reference '${term}'`)
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
