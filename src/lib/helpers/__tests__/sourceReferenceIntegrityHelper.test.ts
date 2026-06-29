/**
 * Phase 41.17.2 — Source Reference Integrity Helper Tests
 *
 * Run: npx tsx src/lib/helpers/__tests__/sourceReferenceIntegrityHelper.test.ts
 *
 * No LLM call. No API route. No UI. No database. No Supabase. No writes.
 * No authority movement. No network. Pure deterministic helper tests over fixtures.
 */

import * as fs from 'fs'
import * as path from 'path'

import {
  inspectSourceReferenceIntegrity,
  detectSourceReferenceIssues,
  detectMalformedSourceUrl,
  detectItemFilePathWithoutFileRecord,
  detectBrokenFileStorageReferences,
  SOURCE_REFERENCE_INTEGRITY_ISSUE_CODES,
  type SourceRefItemSnapshot,
  type SourceRefFileSnapshot,
} from '../sourceReferenceIntegrityHelper'

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

/** A clean item: a valid https source_url, no claimed file_path, no files. */
function makeItem(o: Partial<SourceRefItemSnapshot> = {}): SourceRefItemSnapshot {
  return {
    id: 'item-1',
    presence_scope: 'house',
    source_url: 'https://example.com/source',
    file_path: null,
    ...o,
  }
}

/** A healthy file: belongs to item-1, has both a file_path and a storage_bucket. */
function makeFile(o: Partial<SourceRefFileSnapshot> = {}): SourceRefFileSnapshot {
  return {
    id: 'file-1',
    library_item_id: 'item-1',
    file_path: 'library/item-1/doc.pdf',
    storage_bucket: 'library-files',
    ...o,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// A. Malformed source URL → source_url_malformed
// ═════════════════════════════════════════════════════════════════════════════

section('A. Malformed source URL')
{
  // Does NOT fire for a valid https URL.
  assert(detectMalformedSourceUrl(makeItem({ source_url: 'https://example.com/x' })) === null, 'valid https URL → no malformed finding')
  assert(detectMalformedSourceUrl(makeItem({ source_url: 'http://example.com/x' })) === null, 'valid http URL → no malformed finding')

  // Does NOT fire when source_url is blank/null (nothing to validate).
  assert(detectMalformedSourceUrl(makeItem({ source_url: null })) === null, 'null source_url → no malformed finding')
  assert(detectMalformedSourceUrl(makeItem({ source_url: '   ' })) === null, 'blank source_url → no malformed finding')

  // Fires for a relative path (not a parseable absolute URL).
  const rel = detectMalformedSourceUrl(makeItem({ source_url: '/docs/source.html' }))
  assert(rel?.issue_code === 'source_url_malformed', 'relative URL → source_url_malformed')
  assert(rel?.suggested_action === 'prepare_review_note', 'suggested_action prepare_review_note')

  // Fires for a bare word and for a non-http(s) scheme.
  assert(detectMalformedSourceUrl(makeItem({ source_url: 'not a url' }))?.issue_code === 'source_url_malformed', 'bare word → source_url_malformed')
  assert(detectMalformedSourceUrl(makeItem({ source_url: 'ftp://example.com/x' }))?.issue_code === 'source_url_malformed', 'non-http(s) scheme → source_url_malformed')

  // The raw URL value is NEVER stored — booleans only.
  const hit = detectMalformedSourceUrl(makeItem({ source_url: 'ftp://secret-host/path' }))
  assert(hit?.observed_state.malformed === true && hit?.observed_state.source_url_present === true, 'observed_state records booleans only')
  assert(!JSON.stringify(hit?.observed_state).includes('secret-host'), 'observed_state never contains the raw source_url value')
}

// ═════════════════════════════════════════════════════════════════════════════
// B. Item claims file_path but has no file record → item_file_path_without_file_record
// ═════════════════════════════════════════════════════════════════════════════

section('B. file_path claimed without a file record')
{
  const claimed = makeItem({ file_path: 'library/item-1/missing.pdf' })

  // Fires: file_path present, zero files.
  const hit = detectItemFilePathWithoutFileRecord(claimed, [])
  assert(hit?.issue_code === 'item_file_path_without_file_record', 'file_path claimed + zero files → item_file_path_without_file_record')
  assert(hit?.suggested_action === 'prepare_review_note', 'suggested_action prepare_review_note')
  assert(hit?.observed_state.attached_file_count === 0, 'observed_state attached_file_count 0')

  // Does NOT fire when a file record exists.
  assert(detectItemFilePathWithoutFileRecord(claimed, [makeFile()]) === null, 'has a file record → no finding')
  // Does NOT fire when no file_path is claimed.
  assert(detectItemFilePathWithoutFileRecord(makeItem({ file_path: null }), []) === null, 'no file_path claimed → no finding')
  assert(detectItemFilePathWithoutFileRecord(makeItem({ file_path: '   ' }), []) === null, 'blank file_path → no finding')
}

// ═════════════════════════════════════════════════════════════════════════════
// C. Broken file storage reference (AGGREGATE) → file_storage_reference_broken
// ═════════════════════════════════════════════════════════════════════════════

section('C. Broken file storage reference (aggregate)')
{
  // Does NOT fire when every file is healthy.
  assert(detectBrokenFileStorageReferences(makeItem(), [makeFile(), makeFile({ id: 'file-2' })]) === null, 'all files healthy → no finding')
  // Does NOT fire with zero files.
  assert(detectBrokenFileStorageReferences(makeItem(), []) === null, 'zero files → no finding')

  // Fires when a file has a blank file_path.
  const blankPath = detectBrokenFileStorageReferences(makeItem(), [makeFile({ file_path: null })])
  assert(blankPath?.issue_code === 'file_storage_reference_broken', 'blank file_path → file_storage_reference_broken')

  // Fires when a file has a blank storage_bucket.
  const blankBucket = detectBrokenFileStorageReferences(makeItem(), [makeFile({ storage_bucket: '   ' })])
  assert(blankBucket?.issue_code === 'file_storage_reference_broken', 'blank storage_bucket → file_storage_reference_broken')

  // AGGREGATION: many broken files → exactly ONE finding, with a count + every id.
  const many = detectBrokenFileStorageReferences(makeItem(), [
    makeFile({ id: 'f1', file_path: null }),
    makeFile({ id: 'f2', storage_bucket: null }),
    makeFile({ id: 'f3' }), // healthy
    makeFile({ id: 'f4', file_path: '', storage_bucket: '' }),
  ])
  assert(many !== null, 'multiple broken files → a finding')
  assert(many?.observed_state.broken_file_count === 3, 'aggregate counts exactly the broken files (3 of 4)')
  assert(JSON.stringify(many?.observed_state.file_ids) === JSON.stringify(['f1', 'f2', 'f4']), 'aggregate lists every broken file id')
  // source_refs = [itemRef, ...each broken fileRef] (4-field dedupe key never collides).
  assert(many?.source_refs[0].source_surface === 'library_item', 'first source_ref is the item')
  assert(many?.source_refs.slice(1).every((r) => r.source_surface === 'library_item_file'), 'remaining source_refs are the broken files')
  assert(many?.source_refs.length === 4, 'one item ref + three broken file refs')
}

// ═════════════════════════════════════════════════════════════════════════════
// D. Clean item — default no output; opt-in no_action
// ═════════════════════════════════════════════════════════════════════════════

section('D. Clean item behaviour')
{
  const none = inspectSourceReferenceIntegrity(makeItem(), [makeFile()])
  assert(none.length === 0, 'clean item yields no output by default')

  const withNoAction = inspectSourceReferenceIntegrity(makeItem(), [makeFile()], { emitNoActionWhenClean: true })
  assert(withNoAction.length === 1, 'clean item with opt-in yields exactly one row')
  assert(withNoAction[0].suggested_action === 'no_action', 'opt-in row is no_action')
  assert((withNoAction[0].suggestion_payload as { issue_code: string }).issue_code === 'no_source_reference_issues_found', 'opt-in clean sentinel issue_code')
  assert(withNoAction[0].source_refs.length >= 1, 'opt-in row has non-empty provenance')
  assert(validateHelperOutputDraft(withNoAction[0]).valid, 'opt-in no_action row passes contract')
}

// ═════════════════════════════════════════════════════════════════════════════
// E. Locked invariants + contract validity on emitted drafts
// ═════════════════════════════════════════════════════════════════════════════

section('E. Locked invariants and contract validity')
{
  // An item with a malformed URL, a claimed file_path, AND a broken attached
  // file. The claimed-file check requires ZERO files and the broken-storage
  // check requires a (broken) file present, so they are mutually exclusive: a
  // file is attached here, so the malformed-URL and broken-storage checks fire
  // (2 drafts), and the claimed-file check correctly does not.
  const drafts = inspectSourceReferenceIntegrity(
    makeItem({ source_url: 'not-a-url', file_path: 'claimed/path.pdf' }),
    [makeFile({ id: 'broken-1', file_path: null })],
    { testOwned: true },
  )
  assert(drafts.length === 2, 'malformed URL + broken storage fire; claimed-file check is mutually exclusive with an attached file')
  for (const d of drafts) {
    assert(d.helper_type === 'source_reference_integrity_helper', 'helper_type is source_reference_integrity_helper')
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
    'phase_doc_missing_phase_metadata', 'item_no_source_material', 'no_documentation_structure_issues_found',
    'file_content_truncated', 'file_flagged_needs_review',
    'phase_doc_incomplete_phase_metadata', 'superseded_item_missing_archive_link',
  ]
  for (const c of SOURCE_REFERENCE_INTEGRITY_ISSUE_CODES) {
    assert(!otherCodes.includes(c), `source-reference code '${c}' is not another helper's code`)
  }
  const drafts = inspectSourceReferenceIntegrity(
    makeItem({ source_url: 'not-a-url', file_path: 'claimed/path.pdf' }),
    [makeFile({ id: 'broken-1', file_path: null })],
  )
  for (const d of drafts) {
    const code = (d.suggestion_payload as { issue_code: string }).issue_code
    assert(!otherCodes.includes(code), `emitted code '${code}' is never another helper's code`)
    assert((SOURCE_REFERENCE_INTEGRITY_ISSUE_CODES as readonly string[]).includes(code), `emitted code '${code}' is an approved source-reference code`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// G. Determinism + payload safety (no raw source_url leaks); file filtering
// ═════════════════════════════════════════════════════════════════════════════

section('G. Determinism and payload safety')
{
  const secretUrl = 'gopher://leak-this-host.example/secret-token-' + 'Z'.repeat(200)
  const item = makeItem({ source_url: secretUrl, file_path: 'claimed/path.pdf' })
  const run1 = inspectSourceReferenceIntegrity(item, [])
  const run2 = inspectSourceReferenceIntegrity(item, [])
  assert(JSON.stringify(run1) === JSON.stringify(run2), 'same input → identical output (deterministic)')

  const serialised = JSON.stringify(run1)
  assert(!serialised.includes(secretUrl), 'no raw source_url leaks into payload')
  assert(!serialised.includes('leak-this-host'), 'no source_url host leaks into payload')
  assert(!serialised.includes('Z'.repeat(50)), 'no large source_url run leaks into payload')

  // Files belonging to OTHER items are ignored (filtered by library_item_id).
  const other = inspectSourceReferenceIntegrity(
    makeItem({ file_path: 'claimed/path.pdf' }),
    [makeFile({ id: 'foreign', library_item_id: 'other-item', file_path: null })],
  )
  // file_path claimed + no OWN files → the claimed-file finding fires; the foreign
  // broken file is NOT counted as a broken-storage finding for this item.
  const codes = other.map((d) => (d.suggestion_payload as { issue_code: string }).issue_code)
  assert(codes.includes('item_file_path_without_file_record'), 'foreign file does not satisfy the claimed-file check')
  assert(!codes.includes('file_storage_reference_broken'), 'foreign broken file is not attributed to this item')
}

// ═════════════════════════════════════════════════════════════════════════════
// H. detectSourceReferenceIssues aggregates the per-check detectors
// ═════════════════════════════════════════════════════════════════════════════

section('H. detectSourceReferenceIssues entry')
{
  const clean = detectSourceReferenceIssues(makeItem(), [makeFile()])
  assert(clean.length === 0, 'clean item → no detected issues')

  // Malformed URL + claimed file_path with NO attached file → the two item-level
  // checks fire (the broken-storage check needs an attached file, absent here).
  const itemLevel = detectSourceReferenceIssues(
    makeItem({ source_url: 'not-a-url', file_path: 'claimed/path.pdf' }),
    [],
  )
  assert(itemLevel.length === 2, 'malformed URL + claimed-file (no record) fire together')
  // Valid URL, no claimed file_path, but a broken attached file → only the
  // file-level broken-storage check fires.
  const fileLevel = detectSourceReferenceIssues(
    makeItem({ source_url: 'https://ok.example', file_path: null }),
    [makeFile({ id: 'b', file_path: null })],
  )
  assert(fileLevel.length === 1 && fileLevel[0].issue_code === 'file_storage_reference_broken', 'broken-storage check fires on its own')
}

// ═════════════════════════════════════════════════════════════════════════════
// I. Source-level purity — no DB / LLM / retrieval / chunk / network imports
// ═════════════════════════════════════════════════════════════════════════════

section('I. Source purity (static scan of the module)')
{
  const src = fs.readFileSync(path.resolve(__dirname, '../sourceReferenceIntegrityHelper.ts'), 'utf-8')
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
