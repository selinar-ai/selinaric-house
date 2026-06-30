/**
 * Phase 42.3.3b — no-house-mutation static guard (routes + UI + smoke + contract).
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-3b-no-house-mutation.test.ts
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }

const files = [
  'src/app/api/agents/findings/route.ts',
  'src/app/api/agents/runs/route.ts',
  'src/app/api/agents/findings/[id]/review-state/route.ts',
  'src/app/(house)/agents/page.tsx',
  'scripts/agent-maintenance-smoke.ts',
  'src/lib/agents/maintenance/contract.ts',
]
// Direct table access / write verbs / House source surfaces — none may appear.
const forbidden = ['.insert(', '.update(', '.delete(', '.upsert(', ".from('", '.from("',
  "'library_items'", "'library_item_files'", "'archive_graph_nodes'", "'archive_graph_edges'",
  "'graph_proposals'", "'helper_outputs'"]

section('no direct table DML / House-surface access anywhere in the slice')
for (const rel of files) {
  const src = read(rel)
  for (const tok of forbidden) assert(!src.includes(tok), `${rel} contains no ${tok}`)
}

section('writes/reads flow only through the governed RPCs')
assert(read('src/app/api/agents/findings/[id]/review-state/route.ts').includes('.rpc('), 'review-state route writes via .rpc()')
assert(read('src/app/api/agents/findings/route.ts').includes('.rpc('), 'findings route reads via .rpc()')

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
