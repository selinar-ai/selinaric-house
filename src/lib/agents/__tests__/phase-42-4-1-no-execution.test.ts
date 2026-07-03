/**
 * Phase 42.4.1 — proves the slice is deterministic + suggest-only: no LLM, no graph-truth /
 * Memory write, no scheduler/queue/daemon, CLI is single-archive, UI is triage-only.
 * Run: npx tsx src/lib/agents/__tests__/phase-42-4-1-no-execution.test.ts
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }
function readCode(rel: string): string { return read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '') }

const slice = [
  'src/lib/agents/graph_proposals/contract.ts',
  'src/lib/agents/graph_proposals/detect.ts',
  'scripts/agent-graph-propose.ts',
  'src/app/api/agents/graph-proposals/route.ts',
  'src/app/api/agents/graph-proposals/[id]/review-state/route.ts',
]

section('NO LLM provider/call anywhere in the slice')
// ('llm' alone excluded — the shared contract.ts legitimately names 42.4.2a LLM CONSTANTS
//  (llm_edge_v1, GRAPH_LLM_PROPOSAL_RECORD_RPC); 42.4.1 still makes no provider/LLM CALL.)
for (const rel of slice) {
  const s = readCode(rel).toLowerCase()
  for (const tok of ['anthropic', 'openai', 'gpt-', 'chat.completions', 'embedding', 'api.openai.com', 'api.anthropic.com']) assert(!s.includes(tok), `${rel}: no "${tok}"`)
}

section('no graph-truth / Memory / House-proposal write in the slice')
for (const rel of slice) {
  const s = readCode(rel)
  // ('.update(' excluded — collides with crypto hash.update() in detect.ts; a supabase write
  //  requires .from('table').update(), and direct table access is caught by the checks below.)
  for (const tok of ['.insert(', '.delete(', '.upsert(']) assert(!s.includes(tok), `${rel}: no ${tok}`)
  for (const t of ["'archive_graph_edges'", "'archive_graph_nodes'", "'graph_proposals'", "'memory_nodes'", "'memory_edges'"]) {
    // reads of archive_graph_nodes/edges are allowed only in the runner (read-only .select())
    // and — Phase 43 legibility, Ari-authorised — the list route's read-only label lookup
    // ('archive_graph_nodes' only; write-verb absence is asserted separately above).
    const sanctionedLabelRead = rel === 'src/app/api/agents/graph-proposals/route.ts' && t === "'archive_graph_nodes'"
    if (rel !== 'scripts/agent-graph-propose.ts' && !sanctionedLabelRead) assert(!s.includes(t), `${rel}: does not reference House graph/memory table ${t}`)
  }
}

section('runner: reads archive_graph read-only, records via RPC, single explicit archive')
const runner = readCode('scripts/agent-graph-propose.ts')
assert(runner.includes(".from('archive_graph_nodes')") && runner.includes('.select('), 'runner reads archive_graph_nodes (read-only)')
assert(runner.includes('.rpc('), 'runner records via .rpc()')
assert(runner.includes("arg('archive-name')"), 'runner requires --archive-name')
assert(runner.includes(".eq('archive_name'"), 'runner scopes the read to the explicit archive (no whole-graph)')
// ('approve' excluded — collides with reading .eq('approval_status','approved') archive nodes)
for (const bad of ['apply-all', '--all', 'promote']) assert(!runner.toLowerCase().includes(bad), `runner: no "${bad}"`)

section('no scheduler / daemon / queue / autonomy in the slice')
for (const rel of slice) {
  const s = readCode(rel).toLowerCase()
  for (const tok of ['qstash', 'schedule', 'cron', 'setinterval', 'daemon', 'queue']) assert(!s.includes(tok), `${rel}: no "${tok}"`)
}

section('UI: graph section is triage-only; no graph-truth mutation controls')
const page = readCode('src/app/(house)/agents/page.tsx')
assert(page.includes('Graph proposals') && page.includes('reviewProposal'), 'graph proposals section present, triage via reviewProposal')
// ('graph truth' excluded — it appears in the honest "not graph truth" disclaimer copy)
for (const banned of ['Add edge', 'Add to graph', 'Promote', 'Make Memory', 'Run LLM', 'Approve to graph']) {
  assert(!page.includes(banned), `UI has no "${banned}" control`)
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
