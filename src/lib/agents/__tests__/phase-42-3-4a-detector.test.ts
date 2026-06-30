/**
 * Phase 42.3.4a — item_title_untrimmed detector (pure, via the Library report builder).
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-4a-detector.test.ts
 */

import { buildLibraryHealthReport } from '../packs/library/index'
import type { LibraryItemRecord, LibraryScopeInput } from '../packs/library/payloads'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }

function item(over: Partial<LibraryItemRecord>): LibraryItemRecord {
  return {
    id: 'i1', title: 'Clean Title', description: 'd', tags: ['t'], presence_scope: 'shared',
    collection: 'development_documentation', item_type: 'doc', phase_code: '42', phase_number: 42,
    phase_label: 'Phase 42', source_url: null, file_path: null, content_text: 'x',
    authority_status: 'active', archive_item_id: null, ...over,
  }
}
function untrimmedCodes(items: LibraryItemRecord[]): string[] {
  const input: LibraryScopeInput = { items, files: [] }
  const report = buildLibraryHealthReport({ input, scope: { type: 'manual_batch', resolved_count: items.length, capped: false }, generatedAt: 'T' })
  return report.findings.filter((f) => f.issue_code === 'item_title_untrimmed').map((f) => f.target_ref.id)
}

console.log('\n── fires only for surrounding ASCII-space (v1 byte-exact with btrim(x, \' \')) ──')
assert(untrimmedCodes([item({ id: 'a', title: '  spaced  ' })]).includes('a'), 'surrounding ASCII spaces → fires')
assert(untrimmedCodes([item({ id: 'b', title: 'trailing ' })]).includes('b'), 'trailing space → fires')
assert(untrimmedCodes([item({ id: 'c', title: 'clean' })]).length === 0, 'already-normal → no finding')
assert(untrimmedCodes([item({ id: 'd', title: '   ' })]).length === 0, 'all-space (trim empty) → no finding')
assert(untrimmedCodes([item({ id: 'e', title: '' })]).length === 0, 'empty title → no finding')
assert(untrimmedCodes([item({ id: 'f', title: 'a b c' })]).length === 0, 'internal spaces only → no finding')
assert(untrimmedCodes([item({ id: 'g', title: '\tTitle\t' })]).length === 0, 'tab-surrounded → NO finding in v1')
assert(untrimmedCodes([item({ id: 'h', title: '\nTitle\n' })]).length === 0, 'newline-surrounded → NO finding in v1')

console.log('\n── deterministic + raw title never echoed ──')
const a = untrimmedCodes([item({ id: 'x', title: ' z ' })])
const b = untrimmedCodes([item({ id: 'x', title: ' z ' })])
assert(JSON.stringify(a) === JSON.stringify(b), 'same input → same output (deterministic)')
const input: LibraryScopeInput = { items: [item({ id: 'x', title: ' secret ' })], files: [] }
const report = buildLibraryHealthReport({ input, scope: { type: 'manual_batch', resolved_count: 1, capped: false }, generatedAt: 'T' })
const finding = report.findings.find((f) => f.issue_code === 'item_title_untrimmed')!
assert(!JSON.stringify(finding.payload.observed_state).includes('secret'), 'raw title value is never stored in observed_state')

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
