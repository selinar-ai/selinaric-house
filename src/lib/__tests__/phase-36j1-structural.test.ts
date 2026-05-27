/**
 * Phase 36J.1 Structural Tests — Export Pagination Fix
 *
 * Static/structural validation that the emergency house export script
 * properly paginates and cannot silently truncate protected tables.
 *
 * Run: npx tsx src/lib/__tests__/phase-36j1-structural.test.ts
 *
 * These tests verify code structure only — no Supabase calls, no data writes.
 */

import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..', '..', '..')

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  ✗ ${label}`)
  }
}

function section(name: string) {
  console.log(`\n── ${name} ──`)
}

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8')
}

const exportScript = readFile('scripts/emergency-house-export.mjs')

// ═══════════════════════════════════════════════════════
// 1. Pagination loop exists and advances beyond first page
// ═══════════════════════════════════════════════════════
section('1. Pagination loop')

assert(
  exportScript.includes('while (true)'),
  'Export uses a while(true) pagination loop'
)

assert(
  exportScript.includes('PAGE_SIZE'),
  'Export defines and uses PAGE_SIZE constant'
)

assert(
  /const PAGE_SIZE = 1000/.test(exportScript),
  'PAGE_SIZE is 1000'
)

assert(
  exportScript.includes('pagesFetched * PAGE_SIZE'),
  'Offset advances by pagesFetched * PAGE_SIZE each iteration'
)

assert(
  exportScript.includes('rows.length < PAGE_SIZE'),
  'Loop breaks when a page returns fewer rows than PAGE_SIZE'
)

// ═══════════════════════════════════════════════════════
// 2. Exported row count is compared to expected count
// ═══════════════════════════════════════════════════════
section('2. Row count comparison')

assert(
  exportScript.includes('expectedRows') && exportScript.includes('exportedRows'),
  'Script tracks expectedRows and exportedRows per table'
)

assert(
  exportScript.includes("allRows.length === expectedRows") ||
  exportScript.includes('allRows.length === result.expectedRows'),
  'Script compares exported count to expected count'
)

assert(
  exportScript.includes("Prefer: 'count=exact'") || exportScript.includes("Prefer: \"count=exact\""),
  'Script requests exact count via Prefer header'
)

assert(
  exportScript.includes('content-range'),
  'Script reads Content-Range header for total count'
)

// ═══════════════════════════════════════════════════════
// 3. Category A incomplete causes failure
// ═══════════════════════════════════════════════════════
section('3. Category A failure on incomplete')

assert(
  exportScript.includes('incompleteACount'),
  'Script tracks incompleteACount separately'
)

assert(
  exportScript.includes("incompleteACount > 0") &&
  exportScript.includes('process.exit(1)'),
  'Script exits 1 when Category A tables are incomplete'
)

assert(
  exportScript.includes('EXPORT INCOMPLETE'),
  'Script prints EXPORT INCOMPLETE when not all tables are complete'
)

assert(
  exportScript.includes('EXPORT COMPLETE'),
  'Script prints EXPORT COMPLETE when all tables succeed'
)

// ═══════════════════════════════════════════════════════
// 4. No silent truncation — old limit=10000 pattern removed
// ═══════════════════════════════════════════════════════
section('4. No silent truncation')

assert(
  !exportScript.includes('limit=10000'),
  'Old limit=10000 query parameter is removed'
)

assert(
  !exportScript.includes('fetchTable('),
  'Old single-fetch fetchTable function is removed'
)

assert(
  exportScript.includes('fetchTablePaginated'),
  'New fetchTablePaginated function exists'
)

// ═══════════════════════════════════════════════════════
// 5. Manifest includes pagination metadata
// ═══════════════════════════════════════════════════════
section('5. Manifest pagination metadata')

assert(
  exportScript.includes('pagesFetched') && exportScript.includes('pageSize'),
  'Per-table manifest includes pagesFetched and pageSize'
)

assert(
  exportScript.includes("complete:") || exportScript.includes("complete ="),
  'Per-table manifest includes complete status'
)

assert(
  exportScript.includes("truncated:") || exportScript.includes("truncated ="),
  'Per-table manifest includes truncated status'
)

assert(
  exportScript.includes('scriptVersion'),
  'Export manifest includes scriptVersion'
)

assert(
  exportScript.includes("'36J.1'") || exportScript.includes('"36J.1"'),
  'Script version is 36J.1'
)

// ═══════════════════════════════════════════════════════
// 6. Script has no DB write/delete calls
// ═══════════════════════════════════════════════════════
section('6. Read-only safety')

assert(
  !exportScript.includes('.insert('),
  'Script contains no .insert() calls'
)

assert(
  !exportScript.includes('.update('),
  'Script contains no .update() calls'
)

assert(
  !exportScript.includes('.delete('),
  'Script contains no .delete() calls'
)

assert(
  !exportScript.includes('.upsert('),
  'Script contains no .upsert() calls'
)

assert(
  !exportScript.includes('method: \'POST\'') && !exportScript.includes('method: "POST"'),
  'Script makes no POST requests'
)

assert(
  !exportScript.includes('method: \'PUT\'') && !exportScript.includes('method: "PUT"') &&
  !exportScript.includes('method: \'PATCH\'') && !exportScript.includes('method: "PATCH"') &&
  !exportScript.includes('method: \'DELETE\'') && !exportScript.includes('method: "DELETE"'),
  'Script makes no PUT/PATCH/DELETE requests'
)

assert(
  exportScript.includes('Script performed no database writes') &&
  exportScript.includes('Script performed no deletes'),
  'Script prints read-only confirmation on success'
)

// ═══════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════')
console.log(`  Phase 36J.1 Structural Tests`)
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log('═══════════════════════════════════════════════════════')

if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) {
    console.log(`  ✗ ${f}`)
  }
  process.exit(1)
} else {
  console.log('\n✅ All structural tests passed.\n')
  process.exit(0)
}
