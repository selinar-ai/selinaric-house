/**
 * Phase 42.4.2a — proves the FIXTURE CAGE has no provider SDK / model call / graph-truth / Memory /
 * prompt write / scheduler. Updated for Phase 43.B (= 42.4.2b): the live model is admitted as a
 * proposal SOURCE, but ONLY in src/lib/agents/graph_proposals/llm_live.ts (the one provider-call
 * module) and its CLI runner — both OUTSIDE this cage slice. The fixture cage (llm_postgate.ts +
 * the fixture runner) stays model-free; shared contract.ts may now NAME the live model id as a
 * governed constant but must never CALL a model or import an SDK.
 * Run: npx tsx src/lib/agents/__tests__/phase-42-4-2a-no-execution.test.ts
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
  'src/lib/agents/graph_proposals/llm_postgate.ts',
  'scripts/agent-graph-llm-fixture.ts',
]

// The fixture cage EXECUTION surfaces (post-gate + fixture runner) stay fully model-free — no
// provider SDK, no model call, not even a model-id string. (contract.ts is checked separately
// below: 43.B lets it NAME the live model, but it still must never CALL one.)
const executionSlice = ['src/lib/agents/graph_proposals/llm_postgate.ts', 'scripts/agent-graph-llm-fixture.ts']
section('NO provider SDK / model endpoint / LLM call in the fixture cage (post-gate + fixture runner)')
for (const rel of executionSlice) {
  const s = readCode(rel).toLowerCase()
  for (const tok of ['@anthropic', 'anthropic', '@openai', 'openai', 'chat.completions', 'responses.create', 'messages.create', 'api.openai.com', 'api.anthropic.com', 'gpt-', 'claude-', 'embedding']) {
    assert(!s.includes(tok), `${rel}: no "${tok}"`)
  }
  assert(!/fetch\((["'`])https?:\/\//.test(readCode(rel)), `${rel}: no fetch to an external model endpoint`)
}

section('contract.ts (43.B): may NAME the live model constant, but never CALLS a model or imports an SDK')
{
  const c = readCode('src/lib/agents/graph_proposals/contract.ts').toLowerCase()
  for (const tok of ['@anthropic', '@openai', 'new anthropic', 'messages.create', 'chat.completions', 'responses.create', 'api.anthropic.com', 'api.openai.com', 'fetch(']) {
    assert(!c.includes(tok), `contract.ts: no "${tok}" (constants only — names the model, never calls it)`)
  }
}

section('post-gate is pure — no DB / no I/O')
const pg = readCode('src/lib/agents/graph_proposals/llm_postgate.ts')
for (const tok of ['.rpc(', '.from(', 'createClient', 'process.env', 'readFileSync']) assert(!pg.includes(tok), `llm_postgate: no ${tok}`)

section('fixture runner: RPC-only writes, reads archive_graph read-only, requires fixture path')
const runner = readCode('scripts/agent-graph-llm-fixture.ts')
for (const tok of ['.insert(', '.update(', '.delete(', '.upsert(']) assert(!runner.includes(tok), `runner: no ${tok}`)
assert(runner.includes('.rpc(') && runner.includes("arg('archive-name')") && runner.includes("arg('fixture')"), 'runner records via RPC + requires --archive-name + --fixture')
assert(runner.includes("p_generation_mode: 'fixture'"), 'runner records fixture provenance only')
for (const tok of ['qstash', 'schedule', 'cron', 'setinterval', 'daemon']) assert(!runner.toLowerCase().includes(tok), `runner: no "${tok}"`)

section('no graph-truth / Memory / prompt write in the slice')
for (const rel of slice) {
  const s = readCode(rel)
  for (const t of ["'archive_graph_edges'", "'memory_nodes'", "'memory_edges'", "'graph_proposals'"]) {
    if (!rel.endsWith('agent-graph-llm-fixture.ts')) assert(!s.includes(t), `${rel}: no reference to ${t}`)
  }
}

section('089 migration writes no graph truth / Memory / prompt')
const mig = read('supabase-migrations/089_agent_graph_proposals_llm_fixture.sql')
assert(!/(insert into|update|delete from)\s+public\.(archive_graph_nodes|archive_graph_edges|graph_proposals|memory_nodes|memory_edges)/i.test(mig), 'no House graph/memory write')
// ('canonical' alone excluded — it collides with the agp_dedupe_key_canonical constraint NAME)
assert(!/prompt_eligible\s*=\s*true|canonical_status|is_memory/i.test(mig), 'no prompt-eligibility / memory / canonical-status mutation')

section('UI unchanged: /agents triage stays; no LLM/apply/promote controls added')
const page = readCode('src/app/(house)/agents/page.tsx')
for (const banned of ['Run LLM', 'Generate with LLM', 'Approve to graph', 'Promote', 'Add edge', 'Make Memory', 'Apply']) {
  assert(!page.includes(banned), `UI has no "${banned}" control`)
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
