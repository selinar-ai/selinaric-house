/**
 * Phase 42.3.2 — No-mutation static guard (T-NO-MUT)
 *
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-2-no-mutation.test.ts
 *
 * Statically scans every archive_graph pack file + the runner and asserts no write
 * operation, no rpc, no proposal/candidate access, no helper_outputs, no real-
 * deposit path, and no migration/SQL file. (approval_status is read — there is no
 * write call of any kind, which is what this guard proves.)
 *
 * Pure. No DB, no Supabase, no LLM, no writes.
 */

import * as fs from 'fs'
import * as path from 'path'

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

const sliceFiles = [
  'src/lib/agents/packs/archive_graph/payloads.ts',
  'src/lib/agents/packs/archive_graph/inspectors.ts',
  'src/lib/agents/packs/archive_graph/index.ts',
  'src/lib/agents/packs/archive_graph/readonly-data.ts',
  'scripts/agent-archive-graph-health-report.ts',
]

const writeTokens = ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(']
const forbiddenAccess = ["'helper_outputs'", '"helper_outputs"', "'graph_proposals'", "'graph_candidate_suggestions'", "'archive_items'", '--deposit-real']

section('No write/mutation calls and no forbidden-surface access')
for (const rel of sliceFiles) {
  const src = readSrc(rel)
  for (const tok of [...writeTokens, ...forbiddenAccess]) {
    assert(!src.includes(tok), `${rel} contains no ${tok}`)
  }
}

section('Kernel is untouched by this pack (no kernel file under the pack)')
function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}
const packFiles = walk('src/lib/agents/packs/archive_graph')
assert(packFiles.length > 0, 'archive_graph pack files exist')
assert(packFiles.every((f) => !f.endsWith('.sql')), 'no .sql file inside the pack')

console.log(`\n══════════════════════════════════════════`)
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log(`══════════════════════════════════════════`)
if (failed > 0) { console.log('Failures:'); for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
