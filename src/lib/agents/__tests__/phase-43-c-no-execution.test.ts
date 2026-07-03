/**
 * Phase 43.C — no-execution guards over the v2 slice: the proposer represents, never acts;
 * no live LLM / provider SDK / scheduler / queue / autonomy; apply trigger stays CLI-only.
 * Run: npx tsx src/lib/agents/__tests__/phase-43-c-no-execution.test.ts
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }
function readCode(rel: string): string { return read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '') }

const slice = [
  'src/lib/agents/packs/library/remedy.ts',
  'scripts/agent-remedy-propose.ts',
]

section('NO provider SDK / model endpoint / LLM call anywhere in the v2 slice')
for (const rel of slice) {
  const s = readCode(rel).toLowerCase()
  for (const tok of ['@anthropic', 'anthropic', '@openai', 'openai', 'chat.completions', 'messages.create', 'api.openai.com', 'api.anthropic.com', 'gpt-', 'claude-', 'embedding']) {
    assert(!s.includes(tok), `${rel}: no "${tok}"`)
  }
  assert(!/fetch\((["'`])https?:\/\//.test(readCode(rel)), `${rel}: no fetch to an external endpoint`)
}

section('builders stay pure — no DB / no I/O in remedy.ts')
{
  const s = readCode('src/lib/agents/packs/library/remedy.ts')
  for (const tok of ['.rpc(', '.from(', 'createClient', 'process.env', 'readFileSync', 'fetch(']) {
    assert(!s.includes(tok), `remedy.ts: no ${tok}`)
  }
}

section('proposer: representation only — records via the ONE governed RPC; reads read-only')
{
  const s = readCode('scripts/agent-remedy-propose.ts')
  for (const tok of ['.insert(', '.update(', '.delete(', '.upsert(']) assert(!s.includes(tok), `proposer: no ${tok}`)
  const rpcNames = [...s.matchAll(/\.rpc\('([\w_]+)'/g)].map((m) => m[1])
  assert(rpcNames.every((n) => n === 'agent_remedy_plan_record' || n === 'agent_findings_list'), `proposer RPCs are exactly {agent_findings_list, agent_remedy_plan_record} (saw: ${[...new Set(rpcNames)].join(', ')})`)
  for (const tok of ['agent_remedy_apply', 'agent_remedy_rollback', 'agent_remedy_approval_record']) {
    assert(!s.includes(tok), `proposer can NEVER approve or apply: no ${tok}`)
  }
  assert(s.includes("hasFlag('confirm-remedy-propose')"), 'proposer requires --confirm-remedy-propose')
  assert(s.includes('no real run may be unbounded'), 'proposer requires --max-plans for real runs')
  assert(s.includes('candidates.length > maxPlans'), 'cap refuses BEFORE recording (no silent truncation)')
  assert(s.includes("arg('action')"), 'explicit --action required (no whole-library default)')
  for (const tok of ['qstash', 'cron', 'scheduler', 'daemon', 'setinterval']) assert(!s.toLowerCase().includes(tok), `proposer: no "${tok}"`)
}

section('the Hand trigger is unchanged: CLI-only, no new routes, no UI apply')
assert(!fs.existsSync('src/app/api/agents/remedy-plans/record'), 'no plan-record route exists')
assert(!fs.existsSync('src/app/api/agents/remedy-plans/apply'), 'no apply route exists')
{
  const page = readCode('src/app/(house)/agents/page.tsx')
  for (const banned of ['Apply', 'Execute', 'Rollback', 'Run remedy', 'Propose plan']) {
    assert(!page.includes(`>${banned}<`) && !page.includes(`label="${banned}"`), `/agents has no "${banned}" control`)
  }
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
