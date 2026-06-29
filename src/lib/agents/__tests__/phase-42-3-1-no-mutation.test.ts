/**
 * Phase 42.3.1 — No-mutation static guard (T-NO-MUT)
 *
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-1-no-mutation.test.ts
 *
 * Statically scans EVERY slice file (kernel + Library pack + read-only data layer
 * + manual runner) and asserts it contains no write operation, no rpc, no
 * helper_outputs access, and no real-deposit path. Also confirms the slice added
 * no migration/SQL file.
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
  'src/lib/agents/kernel/types.ts',
  'src/lib/agents/kernel/registry.ts',
  'src/lib/agents/kernel/report.ts',
  'src/lib/agents/packs/library/payloads.ts',
  'src/lib/agents/packs/library/inspectors.ts',
  'src/lib/agents/packs/library/index.ts',
  'src/lib/agents/packs/library/readonly-data.ts',
  'scripts/agent-library-health-report.ts',
]

// Write / mutation tokens (dotted-paren forms so prose never false-triggers).
const writeTokens = ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(']
// helper_outputs access (quoted table name) + real-deposit path.
const depositTokens = ["'helper_outputs'", '"helper_outputs"', '--deposit-real']

section('No write / mutation calls anywhere in the slice')
for (const rel of sliceFiles) {
  const src = readSrc(rel)
  for (const tok of [...writeTokens, ...depositTokens]) {
    assert(!src.includes(tok), `${rel} contains no ${tok}`)
  }
}

section('Slice adds no migration / SQL file')
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
const agentFiles = walk('src/lib/agents')
assert(agentFiles.length > 0, 'agents slice files exist')
assert(agentFiles.every((f) => !f.endsWith('.sql')), 'no .sql file inside the agents slice')
assert(readSrc('scripts/agent-library-health-report.ts').length > 0 && !fs.existsSync('scripts/agent-library-health-report.sql'),
  'runner is TypeScript, not SQL')

console.log(`\n══════════════════════════════════════════`)
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log(`══════════════════════════════════════════`)
if (failed > 0) { console.log('Failures:'); for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
