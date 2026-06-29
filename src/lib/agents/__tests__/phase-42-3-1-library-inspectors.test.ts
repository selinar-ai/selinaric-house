/**
 * Phase 42.3.1 — Library inspectors (T-INSP)
 *
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-1-library-inspectors.test.ts
 *
 * Each inspector emits the EXACT shipped issue codes, in the generic envelope,
 * with Library specifics only inside the payload. Clean sentinels are never
 * emitted. Deterministic.
 *
 * Pure. No DB, no Supabase, no LLM, no writes.
 */

import { buildLibraryHealthReport } from '../packs/library/index'
import type { LibraryFindingPayload, LibraryItemRecord, LibraryScopeInput } from '../packs/library/payloads'

let passed = 0
let failed = 0
const failures: string[] = []
function assert(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}
function section(name: string) { console.log(`\n── ${name} ──`) }

function item(over: Partial<LibraryItemRecord> & { id: string }): LibraryItemRecord {
  // Spread overrides over defaults so an explicit `null` (e.g. description: null)
  // is honoured — `?? default` would wrongly coerce null back to the default.
  const base: LibraryItemRecord = {
    id: over.id, title: 'Good Title', description: 'desc', tags: ['t'],
    presence_scope: 'house', collection: 'books', item_type: 'book',
    phase_code: null, phase_number: null, phase_label: null, source_url: null,
    file_path: null, content_text: 'body', authority_status: 'library_reference',
    archive_item_id: null,
  }
  return { ...base, ...over }
}

const input: LibraryScopeInput = {
  items: [
    // metadata: weak title + (desc/tags ok)
    item({ id: 'titleweak', title: '' }),
    // metadata: summary + tags missing
    item({ id: 'metagaps', description: null, tags: [] }),
    // documentation: dev-doc all-null phase metadata (content present → no source-material)
    item({ id: 'docnull', collection: 'development_documentation' }),
    // doc_completeness: dev-doc PARTIAL phase metadata
    item({ id: 'docpartial', collection: 'development_documentation', phase_code: '7A' }),
    // documentation: no source material at all
    item({ id: 'nosrc', content_text: null }),
    // source_integrity: malformed url
    item({ id: 'badurl', source_url: 'not a url' }),
    // source_integrity: claims file_path but has no file record
    item({ id: 'pathnofile', file_path: '/somewhere/x.pdf' }),
    // doc_completeness: superseded with no archive link
    item({ id: 'superseded', authority_status: 'superseded' }),
    // content_health + metadata file states (files below)
    item({ id: 'withfiles' }),
  ],
  files: [
    // content_health: truncated
    { id: 'f_trunc', library_item_id: 'withfiles', file_name: 'a.pdf', file_type: 'pdf', file_path: '/a.pdf', storage_bucket: 'library-files', extraction_status: 'extracted', extraction_char_count: 10, extraction_truncated: true, needs_review: false },
    // content_health: needs_review
    { id: 'f_nr', library_item_id: 'withfiles', file_name: 'b.pdf', file_type: 'pdf', file_path: '/b.pdf', storage_bucket: 'library-files', extraction_status: 'extracted', extraction_char_count: 10, extraction_truncated: false, needs_review: true },
    // metadata: extraction not run
    { id: 'f_notrun', library_item_id: 'withfiles', file_name: 'c.pdf', file_type: 'pdf', file_path: '/c.pdf', storage_bucket: 'library-files', extraction_status: 'not_started', extraction_char_count: null, extraction_truncated: false, needs_review: false },
    // metadata: extracted but empty (status extracted, 0 chars)
    { id: 'f_empty', library_item_id: 'withfiles', file_name: 'd.pdf', file_type: 'pdf', file_path: '/d.pdf', storage_bucket: 'library-files', extraction_status: 'extracted', extraction_char_count: 0, extraction_truncated: false, needs_review: false },
    // metadata: failed → no text
    { id: 'f_failed', library_item_id: 'withfiles', file_name: 'e.pdf', file_type: 'pdf', file_path: '/e.pdf', storage_bucket: 'library-files', extraction_status: 'failed', extraction_char_count: null, extraction_truncated: false, needs_review: false },
  ],
}

const report = buildLibraryHealthReport({ input, scope: { type: 'manual_batch', resolved_count: input.items.length, capped: false }, generatedAt: 'T' })
const codes = new Set(report.findings.map((f) => f.issue_code))

section('Each shipped issue code is produced')
const expected = [
  'item_title_weak', 'item_summary_missing', 'item_tags_missing',
  'file_extraction_not_run', 'file_extracted_but_empty', 'file_extraction_no_text',
  'phase_doc_missing_phase_metadata', 'item_no_source_material',
  'file_content_truncated', 'file_flagged_needs_review',
  'source_url_malformed', 'item_file_path_without_file_record',
  'phase_doc_incomplete_phase_metadata', 'superseded_item_missing_archive_link',
]
for (const c of expected) assert(codes.has(c), `emits ${c}`)

section('Clean sentinels are never findings')
for (const f of report.findings) {
  assert(!f.issue_code.startsWith('no_'), `finding ${f.issue_code} is not a sentinel`)
}

section('Generic envelope; Library specifics only in payload')
const sample = report.findings[0]
const envelopeKeys = Object.keys(sample).sort().join(',')
assert(
  envelopeKeys === ['capability_id', 'domain', 'issue_code', 'payload', 'review_burden', 'severity', 'summary', 'target_ref'].join(','),
  'finding has exactly the generic envelope keys',
)
const payload = sample.payload as LibraryFindingPayload
assert(typeof payload.source_helper === 'string', 'payload carries source_helper (Library-specific)')
assert(Array.isArray(payload.checked_fields), 'payload carries checked_fields')
assert('phase_code' in sample === false, 'no Library field (phase_code) leaks onto the envelope')

section('Capability ids are namespaced and disjoint across inspectors')
const caps = new Set(report.findings.map((f) => f.capability_id))
assert([...caps].every((c) => c.startsWith('library.')), 'all capability ids are library.*')

section('Determinism')
const again = buildLibraryHealthReport({ input, scope: { type: 'manual_batch', resolved_count: input.items.length, capped: false }, generatedAt: 'T' })
assert(JSON.stringify(report) === JSON.stringify(again), 'same input → identical report')

console.log(`\n══════════════════════════════════════════`)
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log(`  Findings: ${report.findings.length}  Codes: ${[...codes].sort().join(', ')}`)
console.log(`══════════════════════════════════════════`)
if (failed > 0) { console.log('Failures:'); for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
