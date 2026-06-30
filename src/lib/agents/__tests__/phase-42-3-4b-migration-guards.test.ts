/**
 * Phase 42.3.4b — static guards over migration 086 (not applied).
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-4b-migration-guards.test.ts
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }

const rel = 'supabase-migrations/086_agent_remedy_approval_events.sql'
if (!fs.existsSync(rel)) { console.log(`✗ not found: ${rel}`); process.exit(1) }
const sql = fs.readFileSync(rel, 'utf8').replace(/--[^\n]*/g, '')

section('additive; no select *; no dynamic SQL; no change to agent_remedy_plans')
assert(/create table if not exists public\.agent_remedy_approval_events/.test(sql), 'creates agent_remedy_approval_events')
assert(!/alter table public\.agent_remedy_plans/i.test(sql), 'does NOT alter agent_remedy_plans')
assert(!sql.includes('select *'), 'no select *')
assert(!/execute\s+format|execute\s+'/i.test(sql), 'no dynamic SQL')

section('deterministic ordering — identity + unique')
assert(/event_sequence bigint generated always as identity/.test(sql), 'event_sequence is generated-always-as-identity')
assert(/unique \(event_sequence\)/.test(sql), 'unique(event_sequence)')

section('decision vocab + decided_by + reason')
assert(/decision in \('approved', 'rejected', 'revoked'\)/.test(sql), 'decision vocab approved/rejected/revoked')
assert(/pg_catalog\.btrim\(decided_by\) <> ''/.test(sql), 'decided_by non-blank CHECK')
assert(/decision_reason is null or pg_catalog\.btrim\(decision_reason\) <> ''/.test(sql), 'reason non-blank-if-present CHECK')

section('snapshot CHECK — approved has JSON-string snapshots; non-approved null')
assert(/decision = 'approved'[\s\S]*jsonb_typeof\(verified_current_value\) = 'string'[\s\S]*jsonb_typeof\(verified_proposed_value\) = 'string'/.test(sql), 'approved ⇒ both snapshots are JSON strings')
assert(/decision <> 'approved'[\s\S]*verified_current_value is null[\s\S]*verified_proposed_value is null/.test(sql), 'non-approved ⇒ both snapshots null')

section('governance flag-locks (incl. is_authority_event=true)')
for (const lock of ['is_authority_event = true', 'authority_changed = false', 'not_memory = true', 'not_evidence = true',
  'is_graph_proposal = false', 'is_helper_output = false', 'is_apply_instruction = false', 'is_queued_work = false', 'prompt_eligible = false']) {
  assert(sql.includes(lock), `flag-lock: ${lock}`)
}

section('FK to agent_remedy_plans(id)')
assert(/foreign key \(remedy_plan_id\) references public\.agent_remedy_plans \(id\)/.test(sql), 'remedy_plan_id FK → agent_remedy_plans(id)')

section('append-only — deny-by-default; no general grants; no hard delete; no real-event update')
assert(/enable row level security/.test(sql), 'RLS enabled')
assert(!sql.split('\n').some((l) => /\bgrant\b/i.test(l) && /\bon table\b/i.test(l)), 'no GRANT ... on table (no direct table DML grants)')
assert(!/delete\s+from\s+public\.agent_remedy_approval_events/i.test(sql), 'no hard DELETE FROM the events table')
// the ONLY update permitted is the test cleanup setting deleted_at on test_owned rows
const updates = sql.match(/update public\.agent_remedy_approval_events[\s\S]*?;/gi) ?? []
assert(updates.length === 1, 'exactly one UPDATE statement (the test cleanup)')
assert(updates[0].includes('set deleted_at = now()') && updates[0].includes('test_owned = true'), 'the only UPDATE soft-deletes test_owned only')

section('RPC scope — record / list / cleanup only; deny-by-default; NO apply/rollback')
for (const fn of ['agent_remedy_approval_record', 'agent_remedy_approvals_list', 'agent_remedy_approval_events_cleanup_test']) {
  assert(sql.includes(`create or replace function public.${fn}`), `defines ${fn}`)
}
assert((sql.match(/security definer/g) ?? []).length >= 3, 'all functions SECURITY DEFINER')
assert((sql.match(/set search_path = pg_catalog, pg_temp/g) ?? []).length >= 3, 'fixed search_path')
assert(!/function public\.\w*(apply|rollback|worker|queue|schedule)/i.test(sql), 'no apply/rollback/worker/queue/schedule function')

section('record RPC — decided_by hardcoded; test-owned gate; transitions; approve drift')
assert(/v_decided_by text := 'tara'/.test(sql), "decided_by hardcoded 'tara' (never client-supplied)")
// race-safety: the plan is loaded FOR UPDATE, and the lock precedes status derivation
assert(/from public\.agent_remedy_plans r where r\.id = p_remedy_plan_id\s+for update/i.test(sql), 'record RPC loads the plan FOR UPDATE (serialises concurrent decisions)')
assert(sql.indexOf('for update') >= 0 && sql.indexOf('for update') < sql.indexOf('into v_current_status'), 'plan lock acquired before deriving current status')
assert(sql.includes('TEST_OWNED_NOT_ALLOWED') && /v_plan_test = true and coalesce\(p_allow_test_owned, false\) = false/.test(sql), 'structural test-owned gate')
assert(sql.includes('REVOKE_NOT_APPROVED') && sql.includes('ALREADY_APPROVED') && sql.includes('REVOKE_REQUIRED'), 'transition guards present')
assert(sql.includes('STALE_PLAN_CURRENT_DRIFT') && sql.includes('STALE_PLAN_PROPOSED_DRIFT') && sql.includes('TARGET_ROW_NOT_FOUND'), 'approve drift revalidation present')
assert(/from public\.library_items li[\s\S]*where li\.id::text = v_tid/.test(sql), 'reads actual library_items.title (verification only)')
assert(!/(insert into|update|delete from)\s+public\.library_items/i.test(sql), 'never writes library_items')

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
