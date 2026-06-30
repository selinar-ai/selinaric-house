/**
 * Phase 42.3.4b — static route-auth + posture guards for the approval route + read merge.
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-4b-route-auth.test.ts
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }

const approval = 'src/app/api/agents/remedy-plans/[id]/approval/route.ts'

section('approval route: auth before DB, service-role only, decided_by never client')
const a = read(approval)
const authIdx = a.indexOf('requireHouseApiAuth(request)')
const clientIdx = a.indexOf('createClient(')
const rpcIdx = a.indexOf('.rpc(')
assert(authIdx >= 0 && (clientIdx < 0 || authIdx < clientIdx), 'auth checked before createClient')
assert(authIdx >= 0 && (rpcIdx < 0 || authIdx < rpcIdx), 'auth checked before any .rpc()')
assert(a.includes('!auth.ok') && a.includes('auth.status'), 'returns 401/503 from auth before proceeding')
assert(a.includes('SUPABASE_SERVICE_ROLE_KEY') && !a.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY'), 'service-role only, never anon')
assert(a.includes('isValidDecision'), 'decision validated before the RPC')
assert(!a.includes('p_decided_by'), 'route never sends the p_decided_by RPC param (server-derived in the RPC)')
assert(a.includes('p_allow_test_owned: false'), 'normal route passes p_allow_test_owned:false (no test-owned via UI)')
assert(!/export async function (GET|PUT|PATCH|DELETE)/.test(a), 'POST-only route')

section('approval route is NOT an apply/execute/rollback path (code, not comments)')
const aCode = a.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').toLowerCase()
for (const tok of ['apply', 'execute', 'rollback', 'worker', 'scheduler', 'qstash']) {
  assert(!aCode.includes(tok), `approval route code contains no "${tok}"`)
}

section('remedy-plans read route merges derived approval status server-side')
const r = read('src/app/api/agents/remedy-plans/route.ts')
assert(r.includes('APPROVALS_LIST_RPC') && r.includes('deriveApprovalStatus'), 'read route derives approval status from events')
assert(r.includes('p_include_test: false'), 'read route excludes test-owned')

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
