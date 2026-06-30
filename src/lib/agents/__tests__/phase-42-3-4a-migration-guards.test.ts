/**
 * Phase 42.3.4a — static guards over migration 085 (not applied).
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-4a-migration-guards.test.ts
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }

const rel = 'supabase-migrations/085_agent_remedy_plans.sql'
if (!fs.existsSync(rel)) { console.log(`✗ not found: ${rel}`); process.exit(1) }
// Strip SQL line-comments — guards inspect executable SQL, not the doc header.
const sql = fs.readFileSync(rel, 'utf8').replace(/--[^\n]*/g, '')

section('additive; no change to agent_findings; no select *; no dynamic SQL')
assert(/create table if not exists public\.agent_remedy_plans/.test(sql), 'creates agent_remedy_plans')
assert(!/alter table public\.agent_findings/i.test(sql), 'does NOT alter agent_findings')
assert(!sql.includes('select *'), 'no select *')
assert(!/execute\s+format|execute\s+'/i.test(sql), 'no dynamic SQL')

section('(1) exact v1 positive whitelist — only library_title_trim')
assert(/domain = 'library'/.test(sql) && /action_type = 'library_title_trim'/.test(sql) &&
  /target_table = 'library_items'/.test(sql) && /target_field = 'title'/.test(sql), 'whitelist CHECK pins domain/action/table/field')

section('(2) single-column FK to agent_findings(id)')
assert(/foreign key \(finding_id\) references public\.agent_findings \(id\)/.test(sql), 'finding_id FK → agent_findings(id)')

section('(7) lifecycle proposed/superseded ONLY — no approval/apply states')
assert(/plan_state in \('proposed', 'superseded'\)/.test(sql), 'plan_state vocab is proposed/superseded')
// No approval/apply lifecycle state may exist. ('queued' is intentionally excluded here —
// it collides with the legitimate is_queued_work governance flag-lock, which is = false.)
for (const forbidden of ['approved', 'applied', 'rejected', 'authorised', 'rolled_back', 'ready_to_apply', 'failed']) {
  assert(!sql.includes(forbidden), `no '${forbidden}' state/column anywhere`)
}
assert(!/'queued'/.test(sql), "no 'queued' as a plan_state value")

section('(4) value constraints (DB-level)')
assert(/jsonb_typeof\(current_value\) = 'string'/.test(sql) && /jsonb_typeof\(proposed_value\) = 'string'/.test(sql), 'both values must be JSON strings')
assert(/= pg_catalog\.btrim\(current_value #>> '\{\}', ' '\)/.test(sql), "proposed must equal btrim(current, ' ') — ASCII-space only")
assert(/\(proposed_value #>> '\{\}'\) <> ''/.test(sql), 'proposed must be non-empty')
assert(/current_value is distinct from proposed_value/.test(sql), 'values must differ')

section('(amendment 2) deterministic_reason blank guard')
assert(/check \(pg_catalog\.btrim\(deterministic_reason\) <> ''\)/.test(sql), 'DB CHECK: deterministic_reason not blank')
assert(sql.includes("p_deterministic_reason is null or pg_catalog.btrim(p_deterministic_reason) = ''") && sql.includes('DETERMINISTIC_REASON_BLANK'),
  'RPC rejects null/blank deterministic_reason')

section('(6) governance flag-locks')
for (const lock of ['not_memory = true', 'not_evidence = true', 'not_authority = true',
  'authority_changed = false', 'prompt_eligible = false', 'is_queued_work = false',
  'is_graph_proposal = false', 'is_helper_output = false', 'is_apply_instruction = false']) {
  assert(sql.includes(lock), `flag-lock: ${lock}`)
}

section('(5) active-only proposed uniqueness')
assert(/unique index[\s\S]*agent_remedy_plans \(finding_id, action_type, test_owned\)[\s\S]*where deleted_at is null and plan_state = 'proposed'/.test(sql),
  'partial unique index (finding_id, action_type, test_owned) where deleted_at is null and proposed')

section('record RPC verifies the finding (domain/issue_code/target)')
assert(sql.includes("v_domain <> 'library'") && sql.includes("v_issue_code <> 'item_title_untrimmed'") &&
  sql.includes("v_target_table <> 'library_items'") && sql.includes('v_target_id <> p_target_id'),
  'record RPC checks domain, issue_code, target_table, target_id')

section('record RPC verifies current_value against the ACTUAL target row (read-only)')
assert(/select li\.title\s+into v_actual_title[\s\S]*from public\.library_items/.test(sql), 'reads actual title from public.library_items')
assert(!/(insert into|update|delete from)\s+public\.library_items/i.test(sql), 'never insert/update/delete library_items (read-only verification)')
assert(sql.includes('TARGET_ROW_NOT_FOUND'), 'missing target row is rejected')
assert(sql.includes('CURRENT_VALUE_MISMATCH'), 'current_value mismatch vs actual title is rejected')
assert(/\(p_proposed_value #>> '\{\}'\) <> pg_catalog\.btrim\(v_actual_title, ' '\)/.test(sql), 'proposed must equal btrim(actual title, \' \')')
assert(sql.includes('PROPOSED_NOT_TRIM_OF_TARGET'), 'proposed-not-trim-of-actual is rejected')

section('(8) RPC scope — record / list / cleanup only; deny-by-default')
for (const fn of ['agent_remedy_plan_record', 'agent_remedy_plans_list', 'agent_remedy_plans_cleanup_test']) {
  assert(sql.includes(`create or replace function public.${fn}`), `defines ${fn}`)
}
assert((sql.match(/security definer/g) ?? []).length >= 3, 'all functions SECURITY DEFINER')
assert((sql.match(/set search_path = pg_catalog, pg_temp/g) ?? []).length >= 3, 'fixed search_path')
assert(!sql.split('\n').some((l) => /\bgrant\b/i.test(l) && /\bon table\b/i.test(l)), 'no GRANT ... on table (no direct table DML grants)')
// No apply / approve / rollback FUNCTION may exist
assert(!/function public\.\w*(apply|approve|rollback|authoris)/i.test(sql), 'no apply/approve/rollback/authorise function')
// No approved/applied columns
assert(!sql.includes('approved') && !sql.includes('applied'), 'no approved/applied columns')

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
