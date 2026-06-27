/**
 * Phase 41.17.1 — Library Documentation Helper Tests
 *
 * Run: npx tsx src/lib/helpers/__tests__/libraryDocumentationHelper.test.ts
 *
 * No LLM call. No API route. No UI. No database. No Supabase. No writes.
 * No authority movement. Pure deterministic helper tests over fixtures.
 */

import * as fs from 'fs'
import * as path from 'path'

import {
  inspectLibraryDocumentation,
  detectPhaseMetadataIssue,
  detectSourceMaterialIssue,
  LIBRARY_DOCUMENTATION_ISSUE_CODES,
  type LibraryDocItemSnapshot,
  type LibraryDocFileSnapshot,
} from '../libraryDocumentationHelper'

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

/** A clean dev-documentation item: has phase metadata AND inline content. */
function makeItem(o: Partial<LibraryDocItemSnapshot> = {}): LibraryDocItemSnapshot {
  return {
    id: 'item-1',
    collection: 'development_documentation',
    presence_scope: 'house',
    phase_code: 'P41',
    phase_number: 17,
    phase_label: 'Phase 41.17',
    file_path: null,
    source_url: null,
    content_text: 'A clear, present body of inline content for this item.',
    ...o,
  }
}

function makeFile(o: Partial<LibraryDocFileSnapshot> = {}): LibraryDocFileSnapshot {
  return { id: 'file-1', library_item_id: 'item-1', ...o }
}

// ═════════════════════════════════════════════════════════════════════════════
// A. Phase metadata gap → phase_doc_missing_phase_metadata
// ═════════════════════════════════════════════════════════════════════════════

section('A. Phase metadata gap')
{
  // Fires: dev-doc, all three phase fields empty.
  const hit = detectPhaseMetadataIssue(makeItem({ phase_code: null, phase_number: null, phase_label: null }))
  assert(hit?.issue_code === 'phase_doc_missing_phase_metadata', 'dev-doc with no phase metadata → phase_doc_missing_phase_metadata')
  assert(hit?.suggested_action === 'prepare_review_note', 'suggested_action prepare_review_note')

  // Does NOT fire when collection is not development_documentation.
  assert(detectPhaseMetadataIssue(makeItem({ collection: 'books', phase_code: null, phase_number: null, phase_label: null })) === null, 'non dev-doc collection → no phase issue')

  // Does NOT fire when ANY phase field is present.
  assert(detectPhaseMetadataIssue(makeItem({ phase_code: null, phase_number: null, phase_label: 'Phase X' })) === null, 'phase_label present → no phase issue')
  assert(detectPhaseMetadataIssue(makeItem({ phase_code: 'P9', phase_number: null, phase_label: null })) === null, 'phase_code present → no phase issue')
  assert(detectPhaseMetadataIssue(makeItem({ phase_code: null, phase_number: 9, phase_label: null })) === null, 'phase_number present → no phase issue')
}

// ═════════════════════════════════════════════════════════════════════════════
// B. Source material gap → item_no_source_material
// ═════════════════════════════════════════════════════════════════════════════

section('B. Source material gap')
{
  const bare = makeItem({ file_path: null, source_url: null, content_text: null })

  // Fires: no file_path, no source_url, no content_text, zero files.
  const hit = detectSourceMaterialIssue(bare, 0)
  assert(hit?.issue_code === 'item_no_source_material', 'no source material + zero files → item_no_source_material')
  assert(hit?.suggested_action === 'prepare_review_note', 'suggested_action prepare_review_note')

  // Does NOT fire when an attached file exists.
  assert(detectSourceMaterialIssue(bare, 1) === null, 'has attached file → no source-material issue')
  // Does NOT fire when any single source is present.
  assert(detectSourceMaterialIssue(makeItem({ file_path: '/x.docx', source_url: null, content_text: null }), 0) === null, 'file_path present → no issue')
  assert(detectSourceMaterialIssue(makeItem({ file_path: null, source_url: 'https://x', content_text: null }), 0) === null, 'source_url present → no issue')
  assert(detectSourceMaterialIssue(makeItem({ file_path: null, source_url: null, content_text: 'hi' }), 0) === null, 'content_text present → no issue')
}

// ═════════════════════════════════════════════════════════════════════════════
// C. Clean item — default no output; opt-in no_action
// ═════════════════════════════════════════════════════════════════════════════

section('C. Clean item behaviour')
{
  const none = inspectLibraryDocumentation(makeItem(), [makeFile()])
  assert(none.length === 0, 'clean item yields no output by default')

  const withNoAction = inspectLibraryDocumentation(makeItem(), [makeFile()], { emitNoActionWhenClean: true })
  assert(withNoAction.length === 1, 'clean item with opt-in yields exactly one row')
  assert(withNoAction[0].suggested_action === 'no_action', 'opt-in row is no_action')
  assert(withNoAction[0].source_refs.length >= 1, 'opt-in row has non-empty provenance')
  assert(validateHelperOutputDraft(withNoAction[0]).valid, 'opt-in no_action row passes contract')
}

// ═════════════════════════════════════════════════════════════════════════════
// D. Locked invariants + contract validity on emitted drafts
// ═════════════════════════════════════════════════════════════════════════════

section('D. Locked invariants and contract validity')
{
  // An item that trips BOTH checks → 2 drafts.
  const drafts = inspectLibraryDocumentation(
    makeItem({ phase_code: null, phase_number: null, phase_label: null, file_path: null, source_url: null, content_text: null }),
    [],
    { testOwned: true },
  )
  assert(drafts.length === 2, 'two structural gaps detected (phase metadata + no source material)')
  for (const d of drafts) {
    assert(d.helper_type === 'library_documentation_helper', 'helper_type is library_documentation_helper')
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
// E. No overlap with the metadata helper's issue codes
// ═════════════════════════════════════════════════════════════════════════════

section('E. No metadata-helper issue-code overlap')
{
  const metadataCodes = [
    'item_title_weak', 'item_summary_missing', 'item_tags_missing',
    'file_extraction_not_run', 'file_extracted_but_empty', 'file_extraction_no_text',
    'no_issues_found',
  ]
  for (const c of LIBRARY_DOCUMENTATION_ISSUE_CODES) {
    assert(!metadataCodes.includes(c), `documentation code '${c}' is not a metadata-helper code`)
  }
  // The documentation helper inspects fields the metadata helper owns (title/
  // summary/tags/extraction) NOT AT ALL — even a fixture with those gaps yields
  // only documentation-structure findings.
  const drafts = inspectLibraryDocumentation(
    makeItem({ phase_code: null, phase_number: null, phase_label: null, file_path: null, source_url: null, content_text: null }),
    [],
  )
  for (const d of drafts) {
    const code = (d.suggestion_payload as { issue_code: string }).issue_code
    assert(!metadataCodes.includes(code), `emitted code '${code}' is never a metadata-helper code`)
    assert((LIBRARY_DOCUMENTATION_ISSUE_CODES as readonly string[]).includes(code), `emitted code '${code}' is an approved documentation code`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// F. Determinism + payload safety (no body text leaks)
// ═════════════════════════════════════════════════════════════════════════════

section('F. Determinism and payload safety')
{
  const longBody = 'Z'.repeat(5000)
  // Phase gap present, but content_text present (so the source check is clean and
  // the long body is in scope for a leak check via the item snapshot).
  const item = makeItem({ phase_code: null, phase_number: null, phase_label: null, content_text: longBody })
  const run1 = inspectLibraryDocumentation(item, [])
  const run2 = inspectLibraryDocumentation(item, [])
  assert(JSON.stringify(run1) === JSON.stringify(run2), 'same input → identical output (deterministic)')

  const serialised = JSON.stringify(run1)
  assert(!serialised.includes(longBody), 'no raw content_text leaks into payload')
  assert(!serialised.includes('Z'.repeat(300)), 'no large text run leaks into payload')
}

// ═════════════════════════════════════════════════════════════════════════════
// G. Source-level purity — no DB / LLM / retrieval / chunk imports
// ═════════════════════════════════════════════════════════════════════════════

section('G. Source purity (static scan of the module)')
{
  const src = fs.readFileSync(path.resolve(__dirname, '../libraryDocumentationHelper.ts'), 'utf-8')
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
