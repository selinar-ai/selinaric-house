/**
 * Gate A1 — bulk graph-eligibility surface: pure validator tests + static guards.
 * Run: npx tsx src/lib/agents/__tests__/phase-43-a1-bulk-eligibility.test.ts
 */

import * as fs from 'fs'
import { validateBulkEligibilityPayload, GRAPH_ELIGIBILITY_BULK_MAX } from '../../graph-eligibility'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }
function readCode(rel: string): string { return read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '') }

const BULK = 'src/app/api/archives/graph-eligibility/bulk/route.ts'
const LIST = 'src/app/api/archives/graph-eligibility/route.ts'
const PAGE = 'src/app/(house)/archives/graph-eligibility/page.tsx'

section('validator: every payload defect fails closed (pure)')
{
  const good = { ids: ['a', 'b'], action: 'mark', expected_count: 2 }
  assert(validateBulkEligibilityPayload(good).ok === true, 'valid mark payload accepted')
  assert(validateBulkEligibilityPayload({ ...good, action: 'unmark' }).ok === true, 'valid unmark payload accepted')
  const cases: [string, unknown, string][] = [
    ['bad action', { ...good, action: 'approve' }, 'INVALID_ACTION'],
    ['missing action', { ids: ['a'], expected_count: 1 }, 'INVALID_ACTION'],
    ['non-array ids', { ...good, ids: 'a' }, 'INVALID_IDS'],
    ['blank id', { ...good, ids: ['a', '  '] }, 'INVALID_IDS'],
    ['empty ids', { ...good, ids: [], expected_count: 0 }, 'EMPTY_IDS'],
    ['duplicate ids', { ...good, ids: ['a', 'a'] }, 'DUPLICATE_IDS'],
    ['over cap', { ...good, ids: Array.from({ length: GRAPH_ELIGIBILITY_BULK_MAX + 1 }, (_, i) => `id${i}`), expected_count: GRAPH_ELIGIBILITY_BULK_MAX + 1 }, 'TOO_MANY_IDS'],
    ['count mismatch', { ...good, expected_count: 3 }, 'COUNT_MISMATCH'],
    ['missing count', { ids: ['a'], action: 'mark' }, 'COUNT_MISMATCH'],
    ['null body', null, 'INVALID_ACTION'],
  ]
  for (const [label, body, want] of cases) {
    const r = validateBulkEligibilityPayload(body)
    assert(!r.ok && r.code === want, `${label} → ${want}`)
  }
  assert(GRAPH_ELIGIBILITY_BULK_MAX === 100, 'cap is 100')
}

section('bulk route: auth before parsing/validation/DB; shared validator; service-role only')
{
  const s = read(BULK)
  const authIdx = s.indexOf('requireHouseApiAuth(request)')
  const jsonIdx = s.indexOf('await request.json()')
  const validIdx = s.indexOf('validateBulkEligibilityPayload(body)') // the CALL, not the import
  const dbIdx = s.indexOf(".from('archive_items')")
  assert(authIdx >= 0 && authIdx < jsonIdx && authIdx < validIdx && authIdx < dbIdx, 'auth precedes body parsing, validation, and DB')
  assert(validIdx < dbIdx, 'payload validation precedes any DB access')
  assert(s.includes('SUPABASE_SERVICE_ROLE_KEY') && !s.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY'), 'service-role only')
}

section('bulk route: canonical-only, per-id honesty, SET confined to eligible_for_graph')
{
  const s = readCode(BULK)
  assert(s.includes("reason: 'not_canonical'"), 'mark refuses non-canonical per id')
  assert(s.includes('already_marked (stale payload)') && s.includes('already_unmarked (stale payload)'), 'stale per-id states refused honestly')
  assert(s.includes("reason: 'not_found'") && s.includes("reason: 'deleted'"), 'missing/deleted refused per id')
  const updates = [...s.matchAll(/\.update\(\{([\s\S]*?)\}\)/g)].map((m) => m[1].trim())
  assert(updates.length === 1 && /^eligible_for_graph:\s*marking$/.test(updates[0]), `THE one UPDATE sets ONLY eligible_for_graph (saw: ${JSON.stringify(updates)})`)
  assert(s.includes("reason: 'write_conflict'"), 'partial write reported honestly')
}

section('bulk route: unmark downstream checks — all three reference surfaces, fail-closed per id')
{
  const s = readCode(BULK)
  assert(s.includes("from('graph_proposal_sources')"), 'checks graph proposal sources')
  assert(s.includes("from('graph_candidate_suggestions')") && s.includes('target_archive_item_id') && s.includes('deduplicated_evidence_sources'), 'checks candidate suggestions (target + evidence)')
  assert(s.includes("from('archive_graph_nodes')") && s.includes('source_item_ids'), 'checks archive_graph node sources')
  assert(s.includes('downstream_reference:'), 'referenced items refused with the honest reason')
}

section('bulk route: audit event — full required shape')
{
  const s = read(BULK)
  for (const tok of ["'graph_eligibility_mark'", "'graph_eligibility_unmark'", 'items_affected', 'items_scanned',
    'item_ids: ids', 'success_ids', 'failed', 'expected_count', 'cap: GRAPH_ELIGIBILITY_BULK_MAX',
    'sample_titles', "created_by: 'tara'", "from('archive_eligibility_events')"]) {
    assert(s.includes(tok), `audit carries ${tok}`)
  }
}

section('marking triggers NOTHING downstream — no extraction, proposals, approval, LLM, scheduler')
for (const rel of [BULK, LIST, PAGE]) {
  const s = readCode(rel).toLowerCase()
  for (const tok of ['rungraphextractionlogic', 'createcandidatesuggestion', 'createproposal', 'creategrainproposals',
    'anthropic', 'openai', 'approval_status', 'approved_graph', 'memory_nodes', 'prompt_eligible',
    'qstash', 'cron', 'scheduler', 'daemon', 'setinterval']) {
    assert(!s.includes(tok), `${rel}: no "${tok}"`)
  }
}

section('list route: read-only, canonical-only, auth-first, GET-only')
{
  const s = read(LIST)
  const authIdx = s.indexOf('requireHouseApiAuth(request)')
  const dbIdx = s.indexOf(".from('archive_items')")
  assert(authIdx >= 0 && authIdx < dbIdx, 'auth precedes DB')
  assert(s.includes(".eq('canonical_status', 'canonical')"), 'canonical-only listing (only canonical can be marked)')
  assert(!/export async function (POST|PUT|PATCH|DELETE)/.test(s), 'GET-only')
  for (const tok of ['.update(', '.insert(', '.delete(', '.upsert(']) assert(!s.includes(tok), `list route: no ${tok}`)
}

section('UI: submits only selected ids + declared exact count; confirm; two actions only')
{
  const s = read(PAGE)
  assert(s.includes('const ids = [...selected]'), 'submits exactly the selected set')
  assert(s.includes('expected_count: ids.length'), 'declares the exact count')
  assert(/window\.confirm\(`\$\{verb\}: \$\{ids\.length\}/.test(s), 'confirm shows the exact count')
  assert(s.includes("bulk('mark')") && s.includes("bulk('unmark')") && !/bulk\('(?!mark|unmark)/.test(s), 'actions are exactly mark/unmark')
  assert(s.includes('exceeds the cap'), 'client fails closed over cap')
  assert(s.includes('triggers nothing'), 'the surface states its own inertness to the human')
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
