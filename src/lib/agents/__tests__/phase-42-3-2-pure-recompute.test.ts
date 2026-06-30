/**
 * Phase 42.3.2 — Acceptance Test B: Pure recomputation (T-PURE)
 *
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-2-pure-recompute.test.ts
 *
 * The archive_graph report reads in-memory graph data and produces an ephemeral
 * report only — stores nothing, touches no forbidden surface. Statically scans the
 * pure compute chain (payloads + inspectors + index) to prove no Supabase, no
 * client, no helper_outputs, no graph_proposals/candidate suggestions, no archive_items.
 *
 * Pure. No DB, no Supabase, no LLM, no writes.
 */

import * as fs from 'fs'

import { buildArchiveGraphHealthReport } from '../packs/archive_graph/index'
import type { ArchiveGraphScopeInput } from '../packs/archive_graph/payloads'

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

const input: ArchiveGraphScopeInput = {
  nodes: [
    { id: 'n1', archive_name: 'house', label: 'A', node_type: 'concept', approval_status: 'approved', source_item_ids: [] },
  ],
  edges: [],
}

section('B. ephemeral, deterministic, governance-flagged')
const r1 = buildArchiveGraphHealthReport({ input, scope: { type: 'whole_graph', resolved_count: 1, capped: false }, generatedAt: 'T' })
const r2 = buildArchiveGraphHealthReport({ input, scope: { type: 'whole_graph', resolved_count: 1, capped: false }, generatedAt: 'T' })
assert(typeof r1 === 'object' && Array.isArray(r1.findings), 'returns a report object with findings array')
assert(r1.findings.length >= 1, 'detects at least one finding on the fixture (node missing provenance)')
assert(JSON.stringify(r1) === JSON.stringify(r2), 'same input → identical report (deterministic)')
assert(r1.governance.not_memory && r1.governance.read_only && r1.governance.authority_changed === false, 'non-authoritative governance flags present')

section('B. static purity scan of the compute chain')
const pureFiles = [
  'src/lib/agents/packs/archive_graph/payloads.ts',
  'src/lib/agents/packs/archive_graph/inspectors.ts',
  'src/lib/agents/packs/archive_graph/index.ts',
]
const forbidden = ['@supabase', 'createClient', "'helper_outputs'", '"helper_outputs"',
  "'graph_proposals'", "'graph_candidate_suggestions'", "'archive_items'",
  '.insert(', '.update(', '.upsert(', '.delete(', '.rpc(']
for (const rel of pureFiles) {
  const src = readSrc(rel)
  for (const tok of forbidden) assert(!src.includes(tok), `${rel} does not contain ${tok}`)
}

console.log(`\n══════════════════════════════════════════`)
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log(`══════════════════════════════════════════`)
if (failed > 0) { console.log('Failures:'); for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
