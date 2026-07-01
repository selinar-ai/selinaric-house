/**
 * Phase 42.4.1 — static route-auth + posture guards for the graph-proposal routes.
 * Run: npx tsx src/lib/agents/__tests__/phase-42-4-1-route-auth.test.ts
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }

const list = 'src/app/api/agents/graph-proposals/route.ts'
const review = 'src/app/api/agents/graph-proposals/[id]/review-state/route.ts'

section('auth before DB; service-role only (both routes)')
for (const rel of [list, review]) {
  const s = read(rel)
  const authIdx = s.indexOf('requireHouseApiAuth(request)')
  const clientIdx = s.indexOf('createClient(')
  const rpcIdx = s.indexOf('.rpc(')
  assert(authIdx >= 0 && (clientIdx < 0 || authIdx < clientIdx), `${rel}: auth before createClient`)
  assert(authIdx >= 0 && (rpcIdx < 0 || authIdx < rpcIdx), `${rel}: auth before any .rpc()`)
  assert(s.includes('!auth.ok') && s.includes('auth.status'), `${rel}: returns 401/503 from auth first`)
  assert(s.includes('SUPABASE_SERVICE_ROLE_KEY') && !s.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY'), `${rel}: service-role only, never anon`)
  // routes write/read ONLY via governed RPCs — no direct table access
  for (const tok of ['.insert(', '.update(', '.delete(', '.upsert(', ".from('", '.from("']) assert(!s.includes(tok), `${rel}: no direct table access (${tok})`)
}

section('list route: production excludes test-owned; archive_graph target')
const l = read(list)
assert(l.includes('p_include_test: false'), 'list: p_include_test:false hardcoded')
assert(l.includes('GRAPH_PROPOSAL_TARGET'), 'list: scoped to archive_graph target')
assert(!/export async function (POST|PUT|PATCH|DELETE)/.test(l), 'list is GET-only')

section('review route: triage-only; reviewed_by server-derived; not from client')
const r = read(review)
assert(r.includes('isValidGraphReviewState'), 'review_state validated (open/acknowledged/dismissed)')
assert(!r.includes('p_reviewed_by'), 'route never sends reviewed_by (server-derived inside the RPC)')
// comment-strip first — the docstring honestly says "NOT approve-to-graph-truth"
const rCode = r.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/review-state|review_state|reviewState/gi, '')
assert(!/approve|promote|apply|add_edge|graph_truth/i.test(rCode), 'review route code has no approve/promote/apply/graph-truth path')

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
