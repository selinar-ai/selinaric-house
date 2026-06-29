/**
 * Phase 41.17.2 — Library Content-Health Helper Tests
 *
 * Run: npx tsx src/lib/helpers/__tests__/libraryContentHealthHelper.test.ts
 *
 * No LLM call. No API route. No UI. No database. No Supabase. No writes.
 * No authority movement. Pure deterministic helper tests over fixtures.
 */

import * as fs from 'fs'
import * as path from 'path'

import {
  inspectLibraryContentHealth,
  detectContentHealthIssues,
  detectTruncatedFiles,
  detectNeedsReviewFiles,
  LIBRARY_CONTENT_HEALTH_ISSUE_CODES,
  type ContentHealthItemSnapshot,
  type ContentHealthFileSnapshot,
} from '../libraryContentHealthHelper'

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

/** A clean item (no health issues by itself — files drive everything). */
function makeItem(o: Partial<ContentHealthItemSnapshot> = {}): ContentHealthItemSnapshot {
  return {
    id: 'item-1',
    presence_scope: 'house',
    ...o,
  }
}

/** A clean, fully-extracted, non-truncated, non-flagged file. */
function makeFile(o: Partial<ContentHealthFileSnapshot> = {}): ContentHealthFileSnapshot {
  return {
    id: 'file-1',
    library_item_id: 'item-1',
    extraction_status: 'extracted',
    extraction_truncated: false,
    needs_review: false,
    ...o,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// A. Truncated extraction → file_content_truncated
// ═════════════════════════════════════════════════════════════════════════════

section('A. Truncated extraction gap')
{
  // Fires: extracted AND truncated.
  const hit = detectTruncatedFiles(makeItem(), [makeFile({ extraction_truncated: true })])
  assert(hit?.issue_code === 'file_content_truncated', 'extracted + truncated file → file_content_truncated')
  assert(hit?.suggested_action === 'prepare_review_note', 'suggested_action prepare_review_note')
  assert((hit?.observed_state.truncated_file_count as number) === 1, 'observed truncated_file_count is 1')
  assert(Array.isArray(hit?.observed_state.file_ids) && (hit?.observed_state.file_ids as string[])[0] === 'file-1', 'observed file_ids lists the truncated file')

  // Does NOT fire when truncated but not yet extracted (status guards it).
  assert(detectTruncatedFiles(makeItem(), [makeFile({ extraction_status: 'pending', extraction_truncated: true })]) === null, 'truncated but not extracted → no truncation issue')
  // Does NOT fire when extracted but not truncated.
  assert(detectTruncatedFiles(makeItem(), [makeFile({ extraction_truncated: false })]) === null, 'extracted but not truncated → no truncation issue')
  // Does NOT fire when the truncated file belongs to another item.
  assert(detectTruncatedFiles(makeItem(), [makeFile({ library_item_id: 'other', extraction_truncated: true })]) === null, 'truncated file of another item → no truncation issue')
  // Does NOT fire with zero files.
  assert(detectTruncatedFiles(makeItem(), []) === null, 'no files → no truncation issue')
}

// ═════════════════════════════════════════════════════════════════════════════
// B. needs_review flag → file_flagged_needs_review
// ═════════════════════════════════════════════════════════════════════════════

section('B. needs_review gap')
{
  // Fires: a file flagged needs_review.
  const hit = detectNeedsReviewFiles(makeItem(), [makeFile({ needs_review: true })])
  assert(hit?.issue_code === 'file_flagged_needs_review', 'needs_review file → file_flagged_needs_review')
  assert(hit?.suggested_action === 'prepare_review_note', 'suggested_action prepare_review_note')
  assert((hit?.observed_state.needs_review_file_count as number) === 1, 'observed needs_review_file_count is 1')
  assert(Array.isArray(hit?.observed_state.file_ids) && (hit?.observed_state.file_ids as string[])[0] === 'file-1', 'observed file_ids lists the flagged file')

  // Does NOT fire when not flagged.
  assert(detectNeedsReviewFiles(makeItem(), [makeFile({ needs_review: false })]) === null, 'not flagged → no needs_review issue')
  // Does NOT fire when the flagged file belongs to another item.
  assert(detectNeedsReviewFiles(makeItem(), [makeFile({ library_item_id: 'other', needs_review: true })]) === null, 'flagged file of another item → no needs_review issue')
  // Does NOT fire with zero files.
  assert(detectNeedsReviewFiles(makeItem(), []) === null, 'no files → no needs_review issue')
}

// ═════════════════════════════════════════════════════════════════════════════
// C. Aggregation — many truncated files under one item → exactly ONE draft
// ═════════════════════════════════════════════════════════════════════════════

section('C. Aggregation (at most one finding per issue_code per item)')
{
  const files = [
    makeFile({ id: 'file-a', extraction_truncated: true }),
    makeFile({ id: 'file-b', extraction_truncated: true }),
    makeFile({ id: 'file-c', extraction_truncated: true }),
  ]
  const drafts = inspectLibraryContentHealth(makeItem(), files)
  const truncationDrafts = drafts.filter((d) => (d.suggestion_payload as { issue_code: string }).issue_code === 'file_content_truncated')
  assert(truncationDrafts.length === 1, 'three truncated files under one item → exactly ONE file_content_truncated draft')

  const observed = (truncationDrafts[0].suggestion_payload as { observed_state: Record<string, unknown> }).observed_state
  assert((observed.truncated_file_count as number) === 3, 'aggregate count reflects all three files')
  assert((observed.file_ids as string[]).length === 3, 'aggregate file_ids lists all three files')

  // source_refs = [itemRef, ...each truncated fileRef]
  const refs = truncationDrafts[0].source_refs
  assert(refs[0].source_surface === 'library_item' && refs[0].source_id === 'item-1', 'first source_ref is the item')
  assert(refs.filter((r) => r.source_surface === 'library_item_file').length === 3, 'one file source_ref per truncated file')

  // Same aggregation for needs_review.
  const reviewFiles = [
    makeFile({ id: 'file-x', needs_review: true }),
    makeFile({ id: 'file-y', needs_review: true }),
  ]
  const reviewDrafts = inspectLibraryContentHealth(makeItem(), reviewFiles).filter((d) => (d.suggestion_payload as { issue_code: string }).issue_code === 'file_flagged_needs_review')
  assert(reviewDrafts.length === 1, 'two needs_review files under one item → exactly ONE file_flagged_needs_review draft')
  assert(((reviewDrafts[0].suggestion_payload as { observed_state: Record<string, unknown> }).observed_state.needs_review_file_count as number) === 2, 'aggregate needs_review count is 2')

  // The 4-field dedupe key surface — at most one issue_code per item means no
  // intra-run collision. detectContentHealthIssues returns ≤1 per code.
  const issues = detectContentHealthIssues(makeItem(), [...files, ...reviewFiles])
  const codes = issues.map((i) => i.issue_code)
  assert(new Set(codes).size === codes.length, 'no duplicate issue_code within a single item run')
}

// ═════════════════════════════════════════════════════════════════════════════
// D. Clean item — default no output; opt-in no_action
// ═════════════════════════════════════════════════════════════════════════════

section('D. Clean item behaviour')
{
  const none = inspectLibraryContentHealth(makeItem(), [makeFile()])
  assert(none.length === 0, 'clean item yields no output by default')

  const withNoAction = inspectLibraryContentHealth(makeItem(), [makeFile()], { emitNoActionWhenClean: true })
  assert(withNoAction.length === 1, 'clean item with opt-in yields exactly one row')
  assert(withNoAction[0].suggested_action === 'no_action', 'opt-in row is no_action')
  assert((withNoAction[0].suggestion_payload as { issue_code: string }).issue_code === 'no_content_health_issues_found', 'opt-in row carries the clean sentinel code')
  assert(withNoAction[0].source_refs.length >= 1, 'opt-in row has non-empty provenance')
  assert(validateHelperOutputDraft(withNoAction[0]).valid, 'opt-in no_action row passes contract')
}

// ═════════════════════════════════════════════════════════════════════════════
// E. Locked invariants + contract validity on emitted drafts
// ═════════════════════════════════════════════════════════════════════════════

section('E. Locked invariants and contract validity')
{
  // An item with both a truncated file AND a needs_review file → 2 drafts.
  const drafts = inspectLibraryContentHealth(
    makeItem(),
    [
      makeFile({ id: 'file-trunc', extraction_truncated: true }),
      makeFile({ id: 'file-flag', needs_review: true }),
    ],
    { testOwned: true },
  )
  assert(drafts.length === 2, 'two content-health gaps detected (truncated + needs_review)')
  for (const d of drafts) {
    assert(d.helper_type === 'library_content_health_helper', 'helper_type is library_content_health_helper')
    assert(d.not_memory === true && d.not_evidence === true, 'not_memory / not_evidence true')
    assert(d.prompt_eligible === false && d.authority_changed === false, 'prompt_eligible / authority_changed false')
    assert(d.human_review_required === true && d.review_routed === false, 'human_review_required true, review_routed false')
    assert(d.output_status === 'deterministic_check', 'inert deterministic_check status')
    assert(d.confidence_label === 'structural', 'structural confidence')
    assert(d.created_by === 'system_candidate', 'created_by system_candidate')
    assert(d.test_owned === true, 'testOwned option propagates')
    assert(d.source_refs.every((r) => r.source_surface === 'library_item' || r.source_surface === 'library_item_file'), 'provenance is library_item / library_item_file only')
    assert(validateHelperOutputDraft(d).valid, `draft (${d.suggested_action}) passes contract`)
    assert(!isForbiddenSuggestedAction(d.suggested_action), 'action is not forbidden')
    for (const ref of d.source_refs) {
      assert(!isForbiddenSourceSurface(ref.source_surface as HelperSourceSurface), 'surface is not forbidden')
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// F. No overlap with the other helpers' issue codes
// ═════════════════════════════════════════════════════════════════════════════

section('F. No issue-code overlap with the other helpers')
{
  const otherCodes = [
    'item_title_weak', 'item_summary_missing', 'item_tags_missing',
    'file_extraction_not_run', 'file_extracted_but_empty', 'file_extraction_no_text',
    'no_issues_found',
    'phase_doc_missing_phase_metadata', 'item_no_source_material',
    'no_documentation_structure_issues_found',
    'source_url_malformed', 'item_file_path_without_file_record', 'file_storage_reference_broken',
    'phase_doc_incomplete_phase_metadata', 'superseded_item_missing_archive_link',
  ]
  for (const c of LIBRARY_CONTENT_HEALTH_ISSUE_CODES) {
    assert(!otherCodes.includes(c), `content-health code '${c}' is not another helper's code`)
  }
  // The content-health helper never emits a code owned by another helper.
  const drafts = inspectLibraryContentHealth(
    makeItem(),
    [
      makeFile({ id: 'file-trunc', extraction_truncated: true }),
      makeFile({ id: 'file-flag', needs_review: true }),
    ],
  )
  for (const d of drafts) {
    const code = (d.suggestion_payload as { issue_code: string }).issue_code
    assert(!otherCodes.includes(code), `emitted code '${code}' is never another helper's code`)
    assert((LIBRARY_CONTENT_HEALTH_ISSUE_CODES as readonly string[]).includes(code), `emitted code '${code}' is an approved content-health code`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// G. Determinism + payload safety (no body text — metadata only)
// ═════════════════════════════════════════════════════════════════════════════

section('G. Determinism and payload safety')
{
  const files = [
    makeFile({ id: 'file-1', extraction_truncated: true }),
    makeFile({ id: 'file-2', needs_review: true }),
  ]
  const run1 = inspectLibraryContentHealth(makeItem(), files)
  const run2 = inspectLibraryContentHealth(makeItem(), files)
  assert(JSON.stringify(run1) === JSON.stringify(run2), 'same input → identical output (deterministic)')

  // The helper never receives or emits extracted_text — payload is metadata only.
  const serialised = JSON.stringify(run1)
  assert(!serialised.includes('extracted_text'), 'no extracted_text reference leaks into payload')
}

// ═════════════════════════════════════════════════════════════════════════════
// H. Source-level purity — no DB / LLM / retrieval / chunk / content imports
// ═════════════════════════════════════════════════════════════════════════════

section('H. Source purity (static scan of the module)')
{
  const src = fs.readFileSync(path.resolve(__dirname, '../libraryContentHealthHelper.ts'), 'utf-8')
  // Scan CODE only — strip block/line comments so the boundary docstring (which
  // legitimately names Supabase, fetch, helper_output, extracted_text, etc. to say
  // it does NOT touch them) cannot false-positive the purity check.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
  const banned = [
    'supabase', 'createClient', '@anthropic', 'anthropic', 'openai',
    'fetch(', 'library_chunks', 'embedding', 'await ', 'helper_output', 'extracted_text',
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
