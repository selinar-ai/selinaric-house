/**
 * Phase 42.3.4a — proves the build is EXECUTION-INCAPABLE: no apply/approval/rollback/
 * worker, no House-surface write, no approval/apply UI controls, no apply route.
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-4a-no-execution.test.ts
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }

const newFiles = [
  'src/lib/agents/packs/library/remedy.ts',
  'src/app/api/agents/remedy-plans/route.ts',
  'src/lib/agents/maintenance/contract.ts',
  'src/app/(house)/agents/page.tsx',
]

section('no House-surface write / direct table access in the new code')
// Direct-access patterns only. (Table NAMES appear as plan-field string VALUES in the pure
// builder — e.g. target_table: 'library_items' — which is data, not access; so we scan for
// the access patterns themselves, not bare table-name strings.)
const forbidden = ['.insert(', '.update(', '.delete(', '.upsert(', ".from('", '.from("']
for (const rel of newFiles) {
  const src = read(rel)
  for (const tok of forbidden) assert(!src.includes(tok), `${rel}: no ${tok}`)
}

section('remedy.ts is a PURE builder — no DB, no apply/execute capability')
const remedy = read('src/lib/agents/packs/library/remedy.ts')
assert(!remedy.includes('@supabase/supabase-js') && !remedy.includes('.rpc('), 'remedy.ts has no Supabase / RPC')
assert(!/function\s+\w*(apply|execute|run)\s*\(/i.test(remedy), 'remedy.ts has no apply/execute/run function')

section('no apply / approval / rollback route or worker exists')
for (const p of [
  'src/app/api/agents/remedy-plans/apply/route.ts',
  'src/app/api/agents/remedy-plans/[id]/apply/route.ts',
  'src/app/api/agents/findings/[id]/apply/route.ts',
  'src/app/api/agents/remedy-plans/[id]/approve/route.ts',
  'src/app/api/agents/remedy-plans/[id]/rollback/route.ts',
]) {
  assert(!fs.existsSync(p), `no route: ${p}`)
}

section('remedy-plans read route is auth-gated, service-role, read-only, test excluded')
const route = read('src/app/api/agents/remedy-plans/route.ts')
const authIdx = route.indexOf('requireHouseApiAuth(request)')
assert(authIdx >= 0 && (route.indexOf('.rpc(') < 0 || authIdx < route.indexOf('.rpc(')), 'auth checked before any .rpc()')
assert(route.includes('SUPABASE_SERVICE_ROLE_KEY') && !route.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY'), 'service-role only, never anon')
assert(route.includes('p_include_test: false'), 'p_include_test:false hardcoded')
assert(!/export async function (POST|PUT|PATCH|DELETE)/.test(route), 'read-only route — GET only, no write verbs')

section('UI exposes NO approval/apply controls (comment-stripped scan)')
const page = read('src/app/(house)/agents/page.tsx')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
for (const forbiddenLabel of ['Approve', 'Apply', 'Execute', 'Authorise', 'Rollback', 'Remedy now', 'Queue']) {
  assert(!page.includes(forbiddenLabel), `UI has no "${forbiddenLabel}" control`)
}
assert(page.includes('Acknowledge') && page.includes('Dismiss') && page.includes('Reopen'), 'only Acknowledge/Dismiss/Reopen remain')
assert(page.includes('Proposed remedy (read-only)'), 'remedy plan shown read-only')

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
