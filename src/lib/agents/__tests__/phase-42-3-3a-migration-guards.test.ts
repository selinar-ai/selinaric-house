/**
 * Phase 42.3.3a — static guards over migration 083 (the SQL is not applied)
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-3a-migration-guards.test.ts
 *
 * Asserts the migration's posture: deny-by-default, RPC-only writes, narrow ingest
 * update targets (no review/identity/flag columns), test_owned-isolated active dedupe,
 * SECURITY DEFINER + fixed search_path + execute-only grants, and no hard deletes.
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }

const rel = 'supabase-migrations/083_agent_findings_store.sql'
if (!fs.existsSync(rel)) { console.log(`✗ migration not found: ${rel}`); process.exit(1) }
const sql = fs.readFileSync(rel, 'utf8')

section('active dedupe isolated by test_owned')
assert(sql.includes('(domain, dedupe_key, test_owned)') && sql.includes('where deleted_at is null'),
  'partial unique index is (domain, dedupe_key, test_owned) where deleted_at is null')

section('domain/target_table pairing — no cross-domain leakage')
assert(sql.includes('af_domain_target_table_pair'), 'domain/target-table pairing constraint exists')
assert(/domain\s*=\s*'library'\s+and\s+target_table\s+in\s*\(\s*'library_items',\s*'library_item_files'\s*\)/i.test(sql),
  'library findings restricted to Library surfaces')
assert(/domain\s*=\s*'archive_graph'\s+and\s+target_table\s+in\s*\(\s*'archive_graph_nodes',\s*'archive_graph_edges'\s*\)/i.test(sql),
  'archive_graph findings restricted to Archive Graph surfaces')
assert(sql.includes('revoke all on function public.agent_findings_set_updated_at() from public, anon, authenticated, service_role'),
  'trigger helper execute revoked from all roles')

section('deny-by-default + RPC-only writes')
assert(sql.includes('enable row level security'), 'RLS enabled')
assert(sql.includes('revoke all on table agent_runs from public, anon, authenticated, service_role'), 'agent_runs deny-by-default')
assert(sql.includes('revoke all on table agent_findings from public, anon, authenticated, service_role'), 'agent_findings deny-by-default')
assert(!sql.includes('grant insert on table') && !sql.includes('grant update on table') && !sql.includes('grant select on table'),
  'NO direct table DML/SELECT grants (writes only via RPC)')
assert(sql.includes('grant execute on function public.agent_record_findings(jsonb, jsonb, boolean) to service_role'), 'ingest RPC execute granted to service_role')
assert(sql.includes('grant execute on function public.agent_findings_cleanup_test_run(uuid) to service_role'), 'cleanup RPC execute granted to service_role')

section('functions are SECURITY DEFINER with fixed search_path + execute revoked from non-service roles')
assert((sql.match(/security definer/g) ?? []).length >= 2, 'both RPCs are SECURITY DEFINER')
assert((sql.match(/set search_path = pg_catalog, pg_temp/g) ?? []).length >= 2, 'fixed search_path on functions')
assert(sql.includes('revoke all on function public.agent_record_findings(jsonb, jsonb, boolean) from public, anon, authenticated, service_role'), 'ingest RPC execute revoked from public/anon/authenticated/service_role before grant')
assert(sql.includes('revoke all on function public.agent_findings_cleanup_test_run(uuid) from public, anon, authenticated, service_role'), 'cleanup RPC execute revoked likewise')

section('ingest DO UPDATE touches only allowed observation fields')
const i = sql.indexOf('do update set')
const seg = sql.slice(i, sql.indexOf(';', i))
assert(i > 0, 'ingest has a DO UPDATE clause')
assert(seg.includes('last_seen_run_id') && seg.includes("detection_status = 'active'"), 'DO UPDATE refreshes last_seen_run_id + detection_status')
for (const forbidden of ['review_state', 'reviewed_by', 'reviewed_at', 'first_seen_run_id', 'dedupe_key', 'capability_id', 'issue_code', 'target_table', 'target_id', 'not_memory', 'not_evidence', 'not_authority', 'authority_changed', 'prompt_eligible', 'is_queued_work', 'is_proposal', 'is_helper_output']) {
  assert(!seg.includes(forbidden), `DO UPDATE never targets ${forbidden}`)
}

section('reconcile + cleanup are narrow; no hard delete')
assert(sql.includes("set detection_status = 'not_redetected'"), 'reconcile sets only detection_status')
assert(sql.includes('set deleted_at = now()'), 'cleanup soft-deletes via deleted_at')
assert(!/delete\s+from\s+public\.agent_/i.test(sql), 'no hard DELETE FROM agent_* anywhere')
assert(sql.includes("if v_test is distinct from true then") || sql.includes("RUN_NOT_TEST_OWNED"), 'cleanup guards test_owned only')

console.log(`\n══════════════════════════════════════════`)
console.log(`  Passed: ${passed}\n  Failed: ${failed}`)
console.log(`══════════════════════════════════════════`)
if (failed > 0) { for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
