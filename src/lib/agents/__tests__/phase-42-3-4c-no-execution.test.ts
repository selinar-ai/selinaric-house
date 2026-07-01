/**
 * Phase 42.3.4c — proves the hand is CLI-only and tightly scoped: no route, no UI apply/
 * rollback control, no daemon/queue/scheduler; scripts are single-plan + double-confirmed;
 * the ONLY House write is the migration's scoped library_items.title RPC update.
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-4c-no-execution.test.ts
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }
// comment-stripped code — docstrings legitimately name the forbidden mechanisms to document their absence
function readCode(rel: string): string { return read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '') }

const apply = 'scripts/agent-remedy-apply.ts'
const rollback = 'scripts/agent-remedy-rollback.ts'
const validate = 'scripts/agent-remedy-apply-validate.ts'

section('CLI scripts: RPC-only (no direct table access), no batch / apply-all / default / latest')
for (const rel of [apply, rollback, validate]) {
  const s = readCode(rel)
  for (const tok of ['.insert(', '.update(', '.delete(', '.upsert(', ".from('", '.from("']) assert(!s.includes(tok), `${rel}: no ${tok}`)
  assert(s.includes('.rpc('), `${rel}: writes/reads only via .rpc()`)
  for (const bad of ['apply-all', 'rollback-all', '--all', 'batch', 'latest', 'foreach', '.map(']) assert(!s.toLowerCase().includes(bad.toLowerCase()), `${rel}: no "${bad}" (single explicit plan only)`)
}

section('apply + rollback require --plan-id AND matching --confirm-plan-id')
for (const rel of [apply, rollback]) {
  const s = readCode(rel)
  assert(s.includes("arg('plan-id')") && s.includes("arg('confirm-plan-id')"), `${rel}: requires --plan-id + --confirm-plan-id`)
  assert(s.includes('confirm !== planId'), `${rel}: refuses unless confirm matches plan id`)
}

section('no daemon / scheduler / queue-consumer / autonomy / LLM in the CLI slice (code)')
for (const rel of [apply, rollback, validate]) {
  const s = readCode(rel).toLowerCase()
  for (const tok of ['qstash', 'schedule', 'cron', 'setinterval', 'queue', 'daemon', 'anthropic', 'openai']) assert(!s.includes(tok), `${rel}: no "${tok}"`)
}

section('no apply / rollback ROUTE exists (CLI-only)')
for (const p of [
  'src/app/api/agents/remedy-plans/[id]/apply/route.ts',
  'src/app/api/agents/remedy-plans/apply/route.ts',
  'src/app/api/agents/remedy-plans/[id]/rollback/route.ts',
  'src/app/api/agents/remedy-plans/rollback/route.ts',
]) assert(!fs.existsSync(p), `no route: ${p}`)

section('UI has NO apply/rollback/execution control')
const page = read('src/app/(house)/agents/page.tsx')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
for (const banned of ['Apply', 'Rollback', 'Execute', 'Fix now', 'Queue', 'Auto-apply', 'Generate plan']) {
  assert(!page.includes(banned), `UI has no "${banned}" control`)
}

section('migration 087: only House write is the scoped library_items.title update')
const sql = read('supabase-migrations/087_agent_remedy_apply_events.sql')
const liUpdates = sql.match(/update public\.library_items[\s\S]*?;/gi) ?? []
assert(liUpdates.length === 2 && liUpdates.every((u) => /set title = /.test(u)), 'exactly two library_items UPDATEs, title only')
assert(!/update\s+public\.(library_item_files|archive_graph_nodes|archive_graph_edges|graph_proposals|helper_outputs)/i.test(sql), 'no other House-surface write')

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
