/**
 * Phase 42.3.3b — static route-auth + posture guards.
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-3b-route-auth.test.ts
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }

const routes = [
  'src/app/api/agents/findings/route.ts',
  'src/app/api/agents/runs/route.ts',
  'src/app/api/agents/findings/[id]/review-state/route.ts',
]

section('auth required, and checked BEFORE any DB call')
for (const rel of routes) {
  const src = read(rel)
  assert(src.includes('requireHouseApiAuth'), `${rel}: uses requireHouseApiAuth (Tara-only House auth)`)
  const authIdx = src.indexOf('requireHouseApiAuth(request)')
  const clientIdx = src.indexOf('createClient(')
  const rpcIdx = src.indexOf('.rpc(')
  assert(authIdx >= 0 && (clientIdx < 0 || authIdx < clientIdx), `${rel}: auth checked before createClient`)
  assert(authIdx >= 0 && (rpcIdx < 0 || authIdx < rpcIdx), `${rel}: auth checked before any .rpc()`)
  assert(src.includes('!auth.ok') && src.includes('auth.status'), `${rel}: returns 401/503 from the auth result before proceeding`)
}

section('service role is server-side only; never the anon key')
for (const rel of routes) {
  const src = read(rel)
  assert(src.includes('SUPABASE_SERVICE_ROLE_KEY'), `${rel}: uses the service-role key (server-side)`)
  assert(!src.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY'), `${rel}: does not fall back to the anon key`)
}

section('GET routes hardcode p_include_test:false (client cannot request test-owned)')
assert(read('src/app/api/agents/findings/route.ts').includes('p_include_test: false'), 'findings route: p_include_test:false')
assert(read('src/app/api/agents/runs/route.ts').includes('p_include_test: false'), 'runs route: p_include_test:false')

section('review-state route: reviewed_by server-derived, review_state validated')
const rs = read('src/app/api/agents/findings/[id]/review-state/route.ts')
assert(rs.includes('p_reviewed_by: REVIEWED_BY'), 'reviewed_by is the server-derived constant')
assert(!/p_reviewed_by:\s*(body|requested|request)/.test(rs), 'reviewed_by is never taken from the client body')
assert(rs.includes('isValidReviewState'), 'review_state validated before the RPC')

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
