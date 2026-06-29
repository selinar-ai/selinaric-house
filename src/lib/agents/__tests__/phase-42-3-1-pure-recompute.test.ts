/**
 * Phase 42.3.1 — Acceptance Test B: Pure recomputation (T-PURE)
 *
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-1-pure-recompute.test.ts
 *
 * Proves the Health Report reads in-memory source data and produces an ephemeral
 * report only — it stores nothing and does not read/reconcile helper_outputs. Also
 * statically scans the PURE compute chain (kernel + Library inspectors/index/
 * payloads) to prove it imports no Supabase, no client, and no helper_outputs.
 *
 * Pure. No DB, no Supabase, no LLM, no writes.
 */

import * as fs from 'fs'

import { buildLibraryHealthReport } from '../packs/library/index'
import type { LibraryScopeInput } from '../packs/library/payloads'

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

const input: LibraryScopeInput = {
  items: [
    {
      id: 'i1', title: 'A', description: null, tags: [], presence_scope: 'house',
      collection: 'books', item_type: 'book', phase_code: null, phase_number: null,
      phase_label: null, source_url: null, file_path: null, content_text: 'body',
      authority_status: 'library_reference', archive_item_id: null,
    },
  ],
  files: [],
}

section('B. Report is an ephemeral object, deterministic, governance-flagged')
const r1 = buildLibraryHealthReport({ input, scope: { type: 'manual_batch', resolved_count: 1, capped: false }, generatedAt: 'T' })
const r2 = buildLibraryHealthReport({ input, scope: { type: 'manual_batch', resolved_count: 1, capped: false }, generatedAt: 'T' })
assert(typeof r1 === 'object' && Array.isArray(r1.findings), 'returns a report object with findings array')
assert(r1.findings.length >= 1, 'detects at least one finding on the fixture (summary missing / tags missing)')
assert(JSON.stringify(r1) === JSON.stringify(r2), 'same input → identical report (deterministic, no clock/random)')
assert(r1.governance.not_memory && r1.governance.not_evidence && r1.governance.read_only, 'report carries non-authoritative governance flags')
assert(r1.governance.authority_changed === false, 'authority_changed is false')

section('B. Static purity scan of the compute chain (no Supabase / no helper_outputs)')
const pureFiles = [
  'src/lib/agents/kernel/types.ts',
  'src/lib/agents/kernel/registry.ts',
  'src/lib/agents/kernel/report.ts',
  'src/lib/agents/packs/library/payloads.ts',
  'src/lib/agents/packs/library/inspectors.ts',
  'src/lib/agents/packs/library/index.ts',
]
// Forbidden USAGE tokens (quoted table names / client / write ops) — chosen so
// prose comments never false-trigger.
const forbidden = ['@supabase', 'createClient', "'helper_outputs'", '"helper_outputs"',
  '.insert(', '.update(', '.upsert(', '.delete(', '.rpc(']
for (const rel of pureFiles) {
  const src = readSrc(rel)
  for (const tok of forbidden) {
    assert(!src.includes(tok), `${rel} does not contain ${tok}`)
  }
}

console.log(`\n══════════════════════════════════════════`)
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log(`══════════════════════════════════════════`)
if (failed > 0) { console.log('Failures:'); for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
