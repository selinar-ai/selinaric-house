/**
 * Phase 43 (bulk triage) — static guards over the bulk review route + /agents UI.
 * Run: npx tsx src/lib/agents/__tests__/phase-43-bulk-triage.test.ts
 */

import * as fs from 'fs'
import { BULK_REVIEW_MAX_IDS } from '../maintenance/contract'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }
function readCode(rel: string): string { return read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '') }

const route = 'src/app/api/agents/findings/review-state/bulk/route.ts'
const page = 'src/app/(house)/agents/page.tsx'

section('route auth before any DB access; service-role only')
{
  const s = read(route)
  const authIdx = s.indexOf('requireHouseApiAuth(request)')
  const clientIdx = s.indexOf('createClient(')
  const rpcIdx = s.indexOf('.rpc(')
  assert(authIdx >= 0 && authIdx < clientIdx && authIdx < rpcIdx, 'auth precedes createClient and any .rpc()')
  assert(s.includes('!auth.ok') && s.includes('auth.status'), 'returns 401/503 from auth first')
  assert(s.includes('SUPABASE_SERVICE_ROLE_KEY') && !s.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY'), 'service-role only, never anon')
}

section('cap enforced; empty/invalid ids rejected; invalid review state rejected — fail closed')
{
  const s = readCode(route)
  assert(BULK_REVIEW_MAX_IDS === 200, 'contract cap is 200')
  assert(s.includes('BULK_REVIEW_MAX_IDS') && s.includes("'TOO_MANY_IDS'"), 'over-cap requests rejected with 400')
  assert(s.includes("'EMPTY_IDS'"), 'empty id list rejected with 400')
  assert(s.includes("'INVALID_IDS'"), 'non-string/blank ids rejected with 400')
  assert(s.includes('isValidReviewState'), 'review_state validated against the same three verbs')
  const capIdx = s.indexOf('TOO_MANY_IDS'), rpcIdx = s.indexOf('.rpc(')
  assert(capIdx >= 0 && rpcIdx >= 0 && capIdx < rpcIdx, 'all validation happens before any RPC call')
}

section('only the existing single-finding RPC is used; no new SQL surface')
{
  const s = readCode(route)
  assert(s.includes('SET_REVIEW_STATE_RPC'), 'uses the existing agent_finding_set_review_state RPC')
  const rpcCalls = [...s.matchAll(/\.rpc\(\s*([A-Z_a-z]+)/g)].map((m) => m[1])
  assert(rpcCalls.length === 1 && rpcCalls[0] === 'SET_REVIEW_STATE_RPC', 'exactly ONE rpc name is ever called')
  for (const tok of ['.insert(', '.update(', '.delete(', '.upsert(', ".from('", '.from("']) assert(!s.includes(tok), `no direct table access (${tok})`)
  assert(s.includes('REVIEWED_BY') && !s.includes('body.reviewed_by'), 'reviewed_by is the server-derived constant, never client-supplied')
}

section('no forbidden surfaces / no background machinery in the bulk slice')
for (const rel of [route]) {
  const s = readCode(rel).toLowerCase()
  for (const tok of ['helper_outputs', 'agent_graph_proposals', 'graph_proposals', 'memory_nodes', 'memory_edges', 'archive_graph_nodes', 'archive_graph_edges', 'prompt_eligible', 'remedy', 'apply']) {
    assert(!s.includes(tok), `${rel}: no "${tok}"`)
  }
  for (const tok of ['qstash', 'cron', 'scheduler', 'daemon', 'setinterval', 'queue']) assert(!s.includes(tok), `${rel}: no "${tok}"`)
  for (const tok of ['anthropic', 'openai', 'gpt-', 'claude-']) assert(!s.includes(tok), `${rel}: no "${tok}"`)
}

section('partial failure reported honestly')
{
  const s = readCode(route)
  assert(s.includes('failed.push({ id, error: error.message })'), 'per-id failures collected with reasons')
  assert(s.includes('succeeded') && s.includes('failed') && s.includes('requested_count'), 'response reports requested/succeeded/failed')
  assert(s.includes('ok: failed.length === 0'), 'ok is true only when nothing failed')
}

section('UI: submits displayed ids only; confirm shows exact count; same three verbs; client-side fail-closed')
{
  const s = read(page)
  assert(s.includes('const ids = findings.map((f) => f.id)'), 'bulk submits exactly the currently displayed findings')
  assert(/window\.confirm\([^)]*ids\.length/.test(s), 'confirm dialog shows the exact count before sending')
  assert(s.includes('ids.length === 0') && s.includes('ids.length > 200'), 'client fails closed on empty and over-cap')
  assert(s.includes("bulkReview('acknowledged')") && s.includes("bulkReview('dismissed')") && s.includes("bulkReview('open')"), 'bulk verbs are exactly the existing three review states')
  assert(!/bulkReview\('(?!acknowledged|dismissed|open)/.test(s), 'no other bulk verb exists')
  assert(s.includes('currently shown'), 'bulk bar labels its scope as the current filtered view')
  assert(s.includes('FAILED') && s.includes('succeeded'), 'success/failure counts surfaced after completion')
  assert(!s.includes('/api/helpers') || !s.includes('bulk'), 'no helper bulk action in this slice')
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
