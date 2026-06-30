/**
 * Phase 42.3.3a — dedupe key + scope fingerprint (pure)
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-3a-dedupe-fingerprint.test.ts
 */

import { computeDedupeKey } from '../persistence/dedupe'
import { computeScopeFingerprint } from '../persistence/fingerprint'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }

section('dedupe key — deterministic, sensitive to each component')
const k = computeDedupeKey('library', 'library.metadata', 'item_tags_missing', 'library_items', 'abc')
assert(/^[0-9a-f]{64}$/.test(k), 'dedupe key is a 64-char sha256 hex')
assert(k === computeDedupeKey('library', 'library.metadata', 'item_tags_missing', 'library_items', 'abc'), 'deterministic')
assert(k !== computeDedupeKey('library', 'library.metadata', 'item_tags_missing', 'library_items', 'xyz'), 'changes with target_id')
assert(k !== computeDedupeKey('archive_graph', 'library.metadata', 'item_tags_missing', 'library_items', 'abc'), 'changes with domain')

section('scope fingerprint')
assert(computeScopeFingerprint({ scope_type: 'whole_graph' }) === 'whole_graph', 'whole_graph → stable token')
assert(computeScopeFingerprint({ scope_type: 'whole_library' }) === 'whole_library', 'whole_library → stable token')
assert(computeScopeFingerprint({ scope_type: 'items_with_files' }) === 'items_with_files', 'items_with_files → stable token')
assert(computeScopeFingerprint({ scope_type: 'collection', scope_ref: 'Development_Documentation' }) === 'development_documentation', 'collection → normalized ref')
assert(computeScopeFingerprint({ scope_type: 'archive', scope_ref: 'house' }) === 'house', 'archive → ref')
const b1 = computeScopeFingerprint({ scope_type: 'manual_batch', item_ids: ['b', 'a'] })
const b2 = computeScopeFingerprint({ scope_type: 'manual_batch', item_ids: ['a', 'b'] })
assert(b1.startsWith('batch:') && b1.length > 'batch:'.length, 'manual_batch → batch:<hash>')
assert(b1 === b2, 'manual_batch fingerprint is order-independent (sorted)')
assert(b1 !== computeScopeFingerprint({ scope_type: 'manual_batch', item_ids: ['a', 'b', 'c'] }), 'different batch → different fingerprint')

console.log(`\n══════════════════════════════════════════`)
console.log(`  Passed: ${passed}\n  Failed: ${failed}`)
console.log(`══════════════════════════════════════════`)
if (failed > 0) { for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
