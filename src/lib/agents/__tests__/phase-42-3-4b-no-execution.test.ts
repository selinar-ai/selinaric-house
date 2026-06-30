/**
 * Phase 42.3.4b — proves the approval slice is EXECUTION-INCAPABLE: an authority surface,
 * not an execution surface. No apply/rollback/worker/scheduler/queue; no House-surface write;
 * UI exposes Approve/Reject/Revoke but no execution control.
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-4b-no-execution.test.ts
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }

const newFiles = [
  'src/app/api/agents/remedy-plans/[id]/approval/route.ts',
  'src/app/api/agents/remedy-plans/route.ts',
  'src/lib/agents/maintenance/contract.ts',
  'src/app/(house)/agents/page.tsx',
]

section('no House-surface write / direct table access in the slice')
const forbidden = ['.insert(', '.update(', '.delete(', '.upsert(', ".from('", '.from("']
for (const rel of newFiles) {
  const src = read(rel)
  for (const tok of forbidden) assert(!src.includes(tok), `${rel}: no ${tok}`)
}

section('no apply / rollback / worker route exists')
for (const p of [
  'src/app/api/agents/remedy-plans/[id]/apply/route.ts',
  'src/app/api/agents/remedy-plans/apply/route.ts',
  'src/app/api/agents/remedy-plans/[id]/rollback/route.ts',
  'src/app/api/agents/findings/[id]/apply/route.ts',
]) {
  assert(!fs.existsSync(p), `no route: ${p}`)
}

section('UI: Approve/Reject/Revoke allowed; execution controls forbidden')
const page = read('src/app/(house)/agents/page.tsx')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
for (const allowed of ['Approve', 'Reject', 'Revoke']) assert(page.includes(allowed), `has ${allowed} control`)
for (const banned of ['Apply', 'Execute', 'Rollback', 'Queue', 'Auto-apply', 'Fix now', 'Generate plan']) {
  assert(!page.includes(banned), `UI has no "${banned}" control`)
}
assert(page.includes('Approval status'), 'shows derived approval status')

section('migration 086 adds no apply/rollback/worker capability')
const sql = read('supabase-migrations/086_agent_remedy_approval_events.sql')
assert(!/function public\.\w*(apply|rollback|worker|queue|schedule)/i.test(sql), 'no apply/rollback/worker/queue/schedule function')
assert(!/(insert into|update|delete from)\s+public\.(library_items|library_item_files|archive_graph_nodes|archive_graph_edges|graph_proposals|helper_outputs)/i.test(sql), 'no House source-surface write')

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
