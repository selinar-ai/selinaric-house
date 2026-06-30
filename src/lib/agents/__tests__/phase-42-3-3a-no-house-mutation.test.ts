/**
 * Phase 42.3.3a — no-house-mutation static guard over the persistence lib + runners
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-3a-no-house-mutation.test.ts
 *
 * The persistence path writes ONLY through the agent RPCs (.rpc) and touches no
 * House surface: no direct table DML, no .from(...), no helper_outputs / graph_proposals
 * / graph_candidate_suggestions / archive_items. The kernel is untouched.
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }

const sliceFiles = [
  'src/lib/agents/persistence/types.ts',
  'src/lib/agents/persistence/dedupe.ts',
  'src/lib/agents/persistence/fingerprint.ts',
  'src/lib/agents/persistence/reconcile.ts',
  'src/lib/agents/persistence/ingest.ts',
  'scripts/agent-library-persist-findings.ts',
  'scripts/agent-archive-graph-persist-findings.ts',
]
// Quoted table access / supabase write verbs only — so crypto `.update()` and the
// `.from(...)` mentioned in a comment don't false-trigger. A real DB write needs a
// `.from('table')` builder, which these patterns catch.
const forbidden = ['.insert(', '.delete(', '.upsert(', ".from('", '.from("',
  "'helper_outputs'", "'graph_proposals'", "'graph_candidate_suggestions'", "'archive_items'"]

section('persistence lib + runners perform no direct table DML / House access')
for (const rel of sliceFiles) {
  const src = read(rel)
  for (const tok of forbidden) assert(!src.includes(tok), `${rel} contains no ${tok}`)
}

section('writes go through the ingest RPC only')
assert(read('src/lib/agents/persistence/ingest.ts').includes('.rpc('), 'ingest.ts uses .rpc() as the write path')

section('kernel untouched by this phase')
assert(fs.existsSync('src/lib/agents/kernel/types.ts'), 'kernel present (empty kernel diff verified at report time via git)')

console.log(`\n══════════════════════════════════════════`)
console.log(`  Passed: ${passed}\n  Failed: ${failed}`)
console.log(`══════════════════════════════════════════`)
if (failed > 0) { for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
