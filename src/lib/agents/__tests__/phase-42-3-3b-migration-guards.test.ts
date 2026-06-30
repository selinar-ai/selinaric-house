/**
 * Phase 42.3.3b — static guards over migration 084 (not applied).
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-3b-migration-guards.test.ts
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }

const rel = 'supabase-migrations/084_agent_findings_review.sql'
if (!fs.existsSync(rel)) { console.log(`✗ not found: ${rel}`); process.exit(1) }
// Strip SQL line-comments first — guards must inspect executable SQL, not the doc header.
const sql = fs.readFileSync(rel, 'utf8').replace(/--[^\n]*/g, '')

section('additive functions only — no table changes / no table grants')
assert(!/create\s+table/i.test(sql), 'no CREATE TABLE')
assert(!/alter\s+table/i.test(sql), 'no ALTER TABLE')
assert(!sql.includes('on table'), 'no direct table grants (only function grants)')

section('SECURITY DEFINER + fixed search_path on all three functions')
assert((sql.match(/security definer/g) ?? []).length >= 3, 'three SECURITY DEFINER functions')
assert((sql.match(/set search_path = pg_catalog, pg_temp/g) ?? []).length >= 3, 'fixed search_path x3')

section('schema-qualified tables; no select *; no dynamic SQL')
assert(sql.includes('public.agent_findings') && sql.includes('public.agent_runs'), 'tables schema-qualified')
assert(!/from\s+agent_(findings|runs)\b/i.test(sql), 'no unqualified table references')
assert(!sql.includes('select *'), 'no select *')
assert(!/execute\s+format|execute\s+'/i.test(sql), 'no dynamic SQL')

section('execute-only to service_role; revoked from others')
for (const fn of ['agent_findings_list(text, text, text, boolean)', 'agent_runs_list(text, boolean)', 'agent_finding_set_review_state(uuid, text, text)']) {
  assert(sql.includes(`grant execute on function public.${fn} to service_role`), `execute→service_role: ${fn}`)
  assert(sql.includes(`revoke all on function public.${fn} from public, anon, authenticated, service_role`), `revoked from non-service roles: ${fn}`)
}

section('reads filter deleted_at IS NULL and default test_owned=false')
assert(sql.includes('f.deleted_at is null') && sql.includes('r.deleted_at is null'), 'reads filter deleted_at IS NULL')
assert((sql.match(/test_owned = false/g) ?? []).length >= 2, 'reads default test_owned=false')

section('review-state UPDATE touches only review fields; no hard delete')
const i = sql.indexOf('set review_state')
const seg = sql.slice(i, sql.indexOf('where', i))
assert(i > 0, 'review-state UPDATE present')
assert(seg.includes('review_state') && seg.includes('reviewed_by') && seg.includes('reviewed_at'), 'sets the three review fields')
for (const forbidden of ['detection_status', 'payload', 'dedupe_key', 'domain', 'target_table', 'target_id', 'first_seen_run_id', 'last_seen_run_id', 'test_owned', 'deleted_at', 'not_memory', 'is_proposal', 'is_helper_output', 'authority_changed', 'prompt_eligible']) {
  assert(!seg.includes(forbidden), `UPDATE never targets ${forbidden}`)
}
assert(!/delete\s+from\s+public\.agent_/i.test(sql), 'no hard DELETE FROM agent_*')
assert(sql.includes("p_review_state not in ('open', 'acknowledged', 'dismissed')"), 'review_state validated against the allowed set')
assert(sql.includes('p_review_state is null'), 'null review_state explicitly rejected (NOT IN does not catch NULL)')
assert(sql.includes("pg_catalog.btrim(p_reviewed_by) = ''") && sql.includes('INVALID_REVIEWED_BY'), 'reviewed_by null/blank rejected at the RPC boundary')

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
