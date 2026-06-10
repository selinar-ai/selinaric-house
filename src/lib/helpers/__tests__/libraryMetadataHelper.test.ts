/**
 * Phase 41.3 — Library Metadata Helper Tests
 *
 * Run: npx tsx src/lib/helpers/__tests__/libraryMetadataHelper.test.ts
 *
 * No LLM call. No API route. No UI. No database. No Supabase. No writes.
 * No authority movement. Pure deterministic helper tests over fixtures.
 */

import * as fs from 'fs'
import * as path from 'path'

import {
  inspectLibraryItem,
  detectItemIssues,
  detectFileIssues,
  type LibraryItemSnapshot,
  type LibraryItemFileSnapshot,
} from '../libraryMetadataHelper'

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

function makeItem(o: Partial<LibraryItemSnapshot> = {}): LibraryItemSnapshot {
  return {
    id: 'item-1',
    title: 'A Perfectly Good Library Item Title',
    description: 'A clear, present summary of this item.',
    tags: ['phase-41', 'helpers'],
    presence_scope: 'house',
    collection: 'development_documentation',
    item_type: 'design_brief',
    ...o,
  }
}

function makeFile(o: Partial<LibraryItemFileSnapshot> = {}): LibraryItemFileSnapshot {
  return {
    id: 'file-1',
    library_item_id: 'item-1',
    file_name: 'doc.docx',
    file_type: 'docx',
    extraction_status: 'extracted',
    extracted_text: 'Some extracted body text exists here.',
    extraction_char_count: 37,
    ...o,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// A. Missing summary → add_summary, contract-valid, safe flags
// ═════════════════════════════════════════════════════════════════════════════

section('A. Missing summary')
{
  const drafts = inspectLibraryItem(makeItem({ description: null }))
  const summary = drafts.find((d) => d.suggested_action === 'add_summary')
  assert(!!summary, 'produces an add_summary draft')
  assert(summary!.helper_type === 'library_metadata_helper', 'helper_type is library_metadata_helper')
  assert(summary!.source_refs.length >= 1, 'non-empty source_refs')
  assert(summary!.source_refs[0].source_surface === 'library_item', 'source surface is library_item')
  assert(summary!.not_memory === true, 'not_memory true')
  assert(summary!.not_evidence === true, 'not_evidence true')
  assert(summary!.prompt_eligible === false, 'prompt_eligible false')
  assert(summary!.authority_changed === false, 'authority_changed false')
  assert(summary!.human_review_required === true, 'human_review_required true')
  assert(summary!.review_routed === false, 'review_routed false')
  assert(summary!.output_status === 'deterministic_check', 'output_status deterministic_check')
  assert(validateHelperOutputDraft(summary!).valid, 'draft passes the 41.1 contract')
}

// ═════════════════════════════════════════════════════════════════════════════
// B. Missing file extraction → flag_missing_attachment_text / check_extraction_status
// ═════════════════════════════════════════════════════════════════════════════

section('B. Missing file extraction')
{
  // empty/failed/unsupported → flag_missing_attachment_text
  for (const status of ['empty', 'failed', 'unsupported']) {
    const issues = detectFileIssues(makeItem(), makeFile({ extraction_status: status, extracted_text: null, extraction_char_count: 0 }))
    assert(issues.some((i) => i.suggested_action === 'flag_missing_attachment_text'), `${status} → flag_missing_attachment_text`)
  }
  // extracted but empty text → flag_missing_attachment_text
  const emptyText = detectFileIssues(makeItem(), makeFile({ extraction_status: 'extracted', extracted_text: '   ', extraction_char_count: 0 }))
  assert(emptyText.some((i) => i.suggested_action === 'flag_missing_attachment_text'), 'extracted-but-empty → flag_missing_attachment_text')
  // not_started / processing → check_extraction_status
  for (const status of ['not_started', 'processing']) {
    const issues = detectFileIssues(makeItem(), makeFile({ extraction_status: status }))
    assert(issues.some((i) => i.suggested_action === 'check_extraction_status'), `${status} → check_extraction_status`)
  }
  // The full inspect path carries both file + item provenance for a file issue.
  const drafts = inspectLibraryItem(makeItem(), [makeFile({ extraction_status: 'empty', extracted_text: null, extraction_char_count: 0 })])
  const fileDraft = drafts.find((d) => d.suggested_action === 'flag_missing_attachment_text')
  assert(!!fileDraft, 'inspect produces a file extraction draft')
  const surfaces = fileDraft!.source_refs.map((r) => r.source_surface)
  assert(surfaces.includes('library_item_file') && surfaces.includes('library_item'), 'file draft provenance includes file + item')
  assert(validateHelperOutputDraft(fileDraft!).valid, 'file draft passes contract')
}

// ═════════════════════════════════════════════════════════════════════════════
// C. Clean item — default no output; opt-in no_action
// ═════════════════════════════════════════════════════════════════════════════

section('C. Clean item behaviour (documented)')
{
  // DOCUMENTED DESIGN: a clean item produces NO output by default (quiet ledger).
  const none = inspectLibraryItem(makeItem(), [makeFile()])
  assert(none.length === 0, 'clean item yields no output by default')

  // Opt-in: one no_action deterministic_check row, with non-empty provenance.
  const withNoAction = inspectLibraryItem(makeItem(), [makeFile()], { emitNoActionWhenClean: true })
  assert(withNoAction.length === 1, 'clean item with opt-in yields exactly one row')
  assert(withNoAction[0].suggested_action === 'no_action', 'opt-in row is no_action')
  assert(withNoAction[0].output_status === 'deterministic_check', 'opt-in row is deterministic_check')
  assert(withNoAction[0].source_refs.length >= 1, 'opt-in no_action row has non-empty source_refs')
  assert(validateHelperOutputDraft(withNoAction[0]).valid, 'opt-in no_action row passes contract')
}

// ═════════════════════════════════════════════════════════════════════════════
// D. Weak title → normalise_title
// ═════════════════════════════════════════════════════════════════════════════

section('D. Weak title')
{
  for (const t of ['', '  ', 'Untitled', 'document', 'ab']) {
    const issues = detectItemIssues(makeItem({ title: t }))
    assert(issues.some((i) => i.suggested_action === 'normalise_title'), `title '${t}' → normalise_title`)
  }
  // A good title produces no title issue.
  const good = detectItemIssues(makeItem({ title: 'Phase 41 Helper Architecture' }))
  assert(!good.some((i) => i.issue_code === 'item_title_weak'), 'good title → no title issue')
}

// ═════════════════════════════════════════════════════════════════════════════
// E. Only allowed actions / surfaces are ever emitted
// ═════════════════════════════════════════════════════════════════════════════

section('E. Allowed actions and surfaces only')
{
  // An item that trips every check, plus a bad file.
  const drafts = inspectLibraryItem(
    makeItem({ title: '', description: null, tags: [] }),
    [makeFile({ extraction_status: 'failed', extracted_text: null, extraction_char_count: 0 })],
    { testOwned: true },
  )
  assert(drafts.length === 4, 'four issues detected (title, summary, tags, file)')
  for (const d of drafts) {
    assert(!isForbiddenSuggestedAction(d.suggested_action), `action '${d.suggested_action}' is not forbidden`)
    for (const ref of d.source_refs) {
      assert(!isForbiddenSourceSurface(ref.source_surface as HelperSourceSurface), `surface '${ref.source_surface}' is not forbidden`)
      assert(ref.source_surface === 'library_item' || ref.source_surface === 'library_item_file', `surface '${ref.source_surface}' is a library surface`)
    }
    assert(validateHelperOutputDraft(d).valid, `draft (${d.suggested_action}) passes contract`)
    assert(d.test_owned === true, 'testOwned option propagates')
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// F. Structural impossibilities — review_routed, reviewed_by, helper_output
// ═════════════════════════════════════════════════════════════════════════════

section('F. Structural impossibilities')
{
  const drafts = inspectLibraryItem(makeItem({ description: null }))
  for (const d of drafts) {
    assert(d.review_routed === false, 'helper never sets review_routed true')
    assert(!('reviewed_by' in d), 'helper never sets reviewed_by')
    // C1: helper never cites a helper_output as provenance.
    assert(!d.source_refs.some((r) => r.source_surface === 'helper_output'), 'no helper_output provenance')
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// G. Determinism + payload safety (no raw body text)
// ═════════════════════════════════════════════════════════════════════════════

section('G. Determinism and payload safety')
{
  const longBody = 'X'.repeat(5000)
  const item = makeItem({ title: '', description: null, tags: [] })
  const files = [makeFile({ extraction_status: 'extracted', extracted_text: longBody, extraction_char_count: 5000 })]
  // (extracted text present here, so the file is clean; item still has 3 issues.)
  const run1 = inspectLibraryItem(item, files, { testOwned: true })
  const run2 = inspectLibraryItem(item, files, { testOwned: true })
  assert(JSON.stringify(run1) === JSON.stringify(run2), 'same input → identical output (deterministic)')

  const serialised = JSON.stringify(run1)
  assert(!serialised.includes(longBody), 'no raw extracted body text leaks into payload')
  assert(!serialised.includes('X'.repeat(300)), 'no large text run leaks into payload')
}

// ═════════════════════════════════════════════════════════════════════════════
// H. Source-level purity — no DB / LLM / retrieval / chunk imports
// ═════════════════════════════════════════════════════════════════════════════

section('H. Source purity (static scan of the module)')
{
  const src = fs.readFileSync(path.resolve(__dirname, '../libraryMetadataHelper.ts'), 'utf-8')
  // Scan CODE only — strip block/line comments so the boundary docstring
  // (which legitimately names library_chunks, embeddings, Supabase, etc. to say
  // it does NOT touch them) cannot false-positive the purity check.
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

// ═════════════════════════════════════════════════════════════════════════════
// I. File-scope guard — files for other items are ignored
// ═════════════════════════════════════════════════════════════════════════════

section('I. File scope guard')
{
  const drafts = inspectLibraryItem(
    makeItem(),
    [makeFile({ id: 'file-x', library_item_id: 'other-item', extraction_status: 'failed', extracted_text: null, extraction_char_count: 0 })],
  )
  assert(drafts.length === 0, 'files belonging to other items are not inspected')
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
