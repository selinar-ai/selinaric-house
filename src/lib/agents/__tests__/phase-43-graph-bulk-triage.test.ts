/**
 * Phase 43 (graph bulk triage + legibility) — static guards over the proposal bulk route,
 * the label-enriched GET route, and the /agents proposals UI.
 * Run: npx tsx src/lib/agents/__tests__/phase-43-graph-bulk-triage.test.ts
 */

import * as fs from 'fs'
import { GRAPH_BULK_REVIEW_MAX_IDS } from '../graph_proposals/contract'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }
function readCode(rel: string): string { return read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '') }

const bulk = 'src/app/api/agents/graph-proposals/review-state/bulk/route.ts'
const list = 'src/app/api/agents/graph-proposals/route.ts'
const page = 'src/app/(house)/agents/page.tsx'

section('bulk route: auth before DB; service-role only')
{
  const s = read(bulk)
  const authIdx = s.indexOf('requireHouseApiAuth(request)')
  const clientIdx = s.indexOf('createClient(')
  const rpcIdx = s.indexOf('.rpc(')
  assert(authIdx >= 0 && authIdx < clientIdx && authIdx < rpcIdx, 'auth precedes createClient and any .rpc()')
  assert(s.includes('!auth.ok') && s.includes('auth.status'), 'returns 401/503 from auth first')
  assert(s.includes('SUPABASE_SERVICE_ROLE_KEY') && !s.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY'), 'service-role only, never anon')
}

section('bulk route: cap / empty / invalid / DUPLICATE / mismatched-count fail closed, before any RPC')
{
  const s = readCode(bulk)
  assert(GRAPH_BULK_REVIEW_MAX_IDS === 200, 'contract cap is 200')
  for (const code of ['INVALID_REVIEW_STATE', 'INVALID_IDS', 'EMPTY_IDS', 'DUPLICATE_IDS', 'TOO_MANY_IDS', 'COUNT_MISMATCH']) {
    assert(s.includes(`'${code}'`), `rejects with ${code}`)
  }
  assert(s.includes('new Set(ids).size !== ids.length'), 'duplicates rejected explicitly (not silently deduped)')
  assert(s.includes('expected !== ids.length'), 'declared expected_count must equal payload size')
  const lastGuard = s.indexOf('COUNT_MISMATCH'), rpcIdx = s.indexOf('.rpc(')
  assert(lastGuard >= 0 && rpcIdx >= 0 && lastGuard < rpcIdx, 'all validation happens before any RPC call')
}

section('bulk route: only the existing single-proposal RPC; no direct table access; no reviewed_by from client')
{
  const s = readCode(bulk)
  assert(s.includes('GRAPH_PROPOSAL_SET_REVIEW_RPC'), 'uses the existing agent_graph_proposal_set_review_state RPC')
  const rpcCalls = [...s.matchAll(/\.rpc\(\s*([A-Z_a-z]+)/g)].map((m) => m[1])
  assert(rpcCalls.length === 1 && rpcCalls[0] === 'GRAPH_PROPOSAL_SET_REVIEW_RPC', 'exactly ONE rpc name is ever called')
  for (const tok of ['.insert(', '.update(', '.delete(', '.upsert(', ".from('", '.from("']) assert(!s.includes(tok), `no direct table access (${tok})`)
  assert(!s.includes('p_reviewed_by'), 'route never sends reviewed_by (server-derived inside the RPC)')
  assert(s.includes('failed.push({ id, error: error.message })') && s.includes('ok: failed.length === 0'), 'partial failure reported honestly per id')
}

section('bulk route: no forbidden surfaces / no background machinery / no graph-truth path')
{
  const s = readCode(bulk).toLowerCase()
  for (const tok of ['archive_graph_edges', 'archive_graph_nodes', 'memory_nodes', 'memory_edges', 'helper_outputs', 'prompt_eligible', 'approve', 'promote', 'apply']) {
    assert(!s.includes(tok), `bulk route: no "${tok}"`)
  }
  for (const tok of ['qstash', 'cron', 'scheduler', 'daemon', 'setinterval', 'queue']) assert(!s.includes(tok), `bulk route: no "${tok}"`)
  for (const tok of ['anthropic', 'openai', 'gpt-', 'claude-']) assert(!s.includes(tok), `bulk route: no "${tok}"`)
}

section('legibility GET: read-only; labels fail soft; GET-only')
{
  const s = read(list)
  assert(!/export async function (POST|PUT|PATCH|DELETE)/.test(s), 'list route remains GET-only')
  assert(s.includes("select('id, label')"), 'label enrichment reads id+label only')
  const code = readCode(list)
  for (const tok of ['.insert(', '.update(', '.delete(', '.upsert(']) assert(!code.includes(tok), `list route: no ${tok}`)
  assert(code.includes('catch') && code.includes('labels = {}'), 'label read failure degrades gracefully (listing never blocked)')
  assert(code.includes('p_include_test: false'), 'production view still excludes test-owned')
}

section('UI: labels primary with short-id fallback; bulk submits displayed ids + declared count; three verbs only')
{
  const s = read(page)
  assert(s.includes('nodeLabels[g.from_node_id] ?? g.from_node_id.slice(0, 8)'), 'missing label falls back to short id (fail soft)')
  assert(s.includes('const ids = graphProposals.map((g) => g.id)'), 'bulk submits exactly the displayed proposals')
  assert(s.includes('expected_count: ids.length'), 'UI declares the exact count it is showing')
  assert(/window\.confirm\([^)]*ids\.length[^)]*proposal/.test(s), 'confirm dialog shows the exact proposal count')
  assert(s.includes("bulkReviewProposals('acknowledged')") && s.includes("bulkReviewProposals('dismissed')") && s.includes("bulkReviewProposals('open')"), 'proposal bulk verbs are exactly the three review states')
  assert(!/bulkReviewProposals\('(?!acknowledged|dismissed|open)/.test(s), 'no other proposal bulk verb exists')
  for (const banned of ['Approve to graph', 'Promote', 'Add edge', 'Make Memory', 'Apply']) {
    assert(!s.includes(`label="${banned}"`), `UI has no "${banned}" control`)
  }
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
