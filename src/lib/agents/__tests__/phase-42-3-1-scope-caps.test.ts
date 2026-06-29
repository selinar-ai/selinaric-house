/**
 * Phase 42.3.1 — Scope caps (T-CAP) + surface guard (T-SCOPE)
 *
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-1-scope-caps.test.ts
 *
 * T-CAP : applyScopeCaps truncates over-cap scopes and DECLARES it (never silent).
 * T-SCOPE: the inspectors and read-only data layer read ONLY library_items /
 *          library_item_files — never archive / graph / memory / held_truths /
 *          recent_continuity / helper_outputs.
 *
 * Pure. No DB, no Supabase, no LLM, no writes.
 */

import * as fs from 'fs'

import { applyScopeCaps } from '../packs/library/readonly-data'
import { MAX_ITEMS_PER_REPORT, MAX_FILES_SCANNED } from '../packs/library/payloads'
import type { LibraryFileRecord, LibraryItemRecord } from '../packs/library/payloads'

let passed = 0
let failed = 0
const failures: string[] = []
function assert(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}
function section(name: string) { console.log(`\n── ${name} ──`) }
function readSrc(rel: string): string {
  if (!fs.existsSync(rel)) throw new Error(`expected source file not found (run from repo root): ${rel}`)
  return fs.readFileSync(rel, 'utf8')
}

function mkItem(id: string): LibraryItemRecord {
  return {
    id, title: 'T', description: 'd', tags: ['t'], presence_scope: 'house',
    collection: 'books', item_type: 'book', phase_code: null, phase_number: null,
    phase_label: null, source_url: null, file_path: null, content_text: 'b',
    authority_status: 'library_reference', archive_item_id: null,
  }
}
function mkFile(id: string, itemId: string): LibraryFileRecord {
  return {
    id, library_item_id: itemId, file_name: 'f', file_type: 'pdf', file_path: '/f',
    storage_bucket: 'library-files', extraction_status: 'extracted',
    extraction_char_count: 5, extraction_truncated: false, needs_review: false,
  }
}

section('T-CAP — over-cap items truncate and declare')
const manyItems = Array.from({ length: MAX_ITEMS_PER_REPORT + 1 }, (_, i) => mkItem(`i${i}`))
const capped = applyScopeCaps(manyItems, [], { type: 'whole_library' })
assert(capped.input.items.length === MAX_ITEMS_PER_REPORT, `items truncated to ${MAX_ITEMS_PER_REPORT}`)
assert(capped.scope.capped === true, 'scope.capped is true')
assert((capped.scope.cap_reason ?? '').includes('items capped'), 'cap_reason explains the item truncation')
assert(capped.scope.resolved_count === MAX_ITEMS_PER_REPORT, 'resolved_count reflects the cap')

section('T-CAP — under-cap is not flagged')
const fewItems = Array.from({ length: 5 }, (_, i) => mkItem(`s${i}`))
const small = applyScopeCaps(fewItems, [], { type: 'collection', collection: 'books' })
assert(small.scope.capped === false, 'small scope is not capped')
assert(small.scope.cap_reason === undefined, 'no cap_reason when under cap')
assert(small.scope.resolved_count === 5, 'resolved_count is exact')

section('T-CAP — over-cap files truncate and declare')
const items100 = Array.from({ length: 100 }, (_, i) => mkItem(`k${i}`))
const files600 = Array.from({ length: MAX_FILES_SCANNED + 100 }, (_, i) => mkFile(`f${i}`, `k${i % 100}`))
const fileCapped = applyScopeCaps(items100, files600, { type: 'whole_library' })
assert(fileCapped.input.files.length === MAX_FILES_SCANNED, `files truncated to ${MAX_FILES_SCANNED}`)
assert(fileCapped.scope.capped === true, 'scope.capped true on file overflow')
assert((fileCapped.scope.cap_reason ?? '').includes('files capped'), 'cap_reason explains the file truncation')

section('T-CAP — files are scoped to resolved items only')
const orphanFiles = [mkFile('of', 'not-in-scope')]
const scoped = applyScopeCaps([mkItem('only')], orphanFiles, { type: 'item', itemId: 'only' })
assert(scoped.input.files.length === 0, 'files for out-of-scope items are dropped')

section('T-SCOPE — inspectors & data layer read only Library surfaces')
const surfaceFiles = [
  'src/lib/agents/packs/library/inspectors.ts',
  'src/lib/agents/packs/library/readonly-data.ts',
]
const forbiddenTables = ["'archive_", "'graph_", "'memory_", "'held_truths'", "'recent_continuity", "'helper_outputs'", "'helper_work_orders'", "'helper_apply_events'"]
for (const rel of surfaceFiles) {
  const src = readSrc(rel)
  for (const tok of forbiddenTables) {
    assert(!src.includes(tok), `${rel} does not query ${tok}`)
  }
}
const dataSrc = readSrc('src/lib/agents/packs/library/readonly-data.ts')
assert(dataSrc.includes('.select('), 'read-only data layer uses .select()')
assert(dataSrc.includes("'library_items'"), 'read-only data layer reads library_items')
assert(dataSrc.includes("'library_item_files'"), 'read-only data layer reads library_item_files')

console.log(`\n══════════════════════════════════════════`)
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log(`══════════════════════════════════════════`)
if (failed > 0) { console.log('Failures:'); for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
