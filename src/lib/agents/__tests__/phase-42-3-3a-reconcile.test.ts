/**
 * Phase 42.3.3a — reconciliation guard (pure)
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-3a-reconcile.test.ts
 */

import { reconcileAllowed } from '../persistence/reconcile'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }

assert(reconcileAllowed({ scope_type: 'whole_graph', scope_fingerprint: 'whole_graph', capped: false }) === true, 'allowed: whole_graph, not capped')
assert(reconcileAllowed({ scope_type: 'collection', scope_fingerprint: 'development_documentation', capped: false }) === true, 'allowed: collection with ref')
assert(reconcileAllowed({ scope_type: 'whole_graph', scope_fingerprint: 'whole_graph', capped: true }) === false, 'capped run NEVER reconciles')
assert(reconcileAllowed({ scope_type: 'collection', scope_fingerprint: '', capped: false }) === false, 'empty fingerprint blocks reconcile')
assert(reconcileAllowed({ scope_type: 'manual_batch', scope_fingerprint: 'development_documentation', capped: false }) === false, 'manual_batch without batch: hash is blocked')
assert(reconcileAllowed({ scope_type: 'manual_batch', scope_fingerprint: 'batch:deadbeef', capped: false }) === true, 'manual_batch WITH batch: hash is allowed')
assert(reconcileAllowed({ scope_type: 'manual_batch', scope_fingerprint: 'batch:deadbeef', capped: true }) === false, 'manual_batch capped still blocked')

console.log(`\n══════════════════════════════════════════`)
console.log(`  Passed: ${passed}\n  Failed: ${failed}`)
console.log(`══════════════════════════════════════════`)
if (failed > 0) { for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
