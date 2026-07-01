/**
 * Phase 42.3.4c — static guards over migration 087 (not applied). THE HAND.
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-4c-migration-guards.test.ts
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }

const rel = 'supabase-migrations/087_agent_remedy_apply_events.sql'
if (!fs.existsSync(rel)) { console.log(`✗ not found: ${rel}`); process.exit(1) }
const sql = fs.readFileSync(rel, 'utf8').replace(/--[^\n]*/g, '')
// the CREATE TABLE block (columns + table constraints), for column-level assertions
const tableBlock = sql.slice(sql.indexOf('create table if not exists public.agent_remedy_apply_events'), sql.indexOf('create index'))

section('additive; no select *; no dynamic SQL')
assert(/create table if not exists public\.agent_remedy_apply_events/.test(sql), 'creates agent_remedy_apply_events')
assert(!/alter table public\.agent_remedy_(plans|approval_events)/i.test(sql), 'does NOT alter agent_remedy_plans / approval_events')
assert(!sql.includes('select *'), 'no select *')
assert(!/execute\s+format|execute\s+'/i.test(sql), 'no dynamic SQL')

section('real-only append-only: no test_owned / deleted_at / updated_at columns')
for (const col of ['test_owned', 'deleted_at', 'updated_at']) assert(!tableBlock.includes(col), `table has no ${col} column`)
assert(!/update\s+public\.agent_remedy_apply_events/i.test(sql), 'apply-events table is never UPDATEd')
assert(!/delete\s+from/i.test(sql), 'no DELETE anywhere')
assert(!/function public\.\w*cleanup/i.test(sql), 'no cleanup RPC')

section('event_sequence identity + unique; outcome vocab {applied,rolled_back}; NO failed')
assert(/event_sequence bigint generated always as identity/.test(sql), 'event_sequence identity')
assert(/unique \(event_sequence\)/.test(sql), 'unique(event_sequence)')
assert(/outcome in \('applied', 'rolled_back'\)/.test(sql), 'outcome vocab applied/rolled_back only')
assert(!/'failed'/.test(sql), "no 'failed' outcome")

section('provenance CHECK')
assert(/outcome = 'applied' and approval_event_id is not null and reverses_apply_event_id is null/.test(sql), 'applied ⇒ approval set & reverses null')
assert(/outcome = 'rolled_back' and reverses_apply_event_id is not null and approval_event_id is null/.test(sql), 'rolled_back ⇒ reverses set & approval null')

section('flag-locks + JSON-string checks + acted_by non-blank')
for (const lock of ['is_apply_event = true', 'house_source_write = true', 'authority_changed = false',
  'not_memory = true', 'not_evidence = true', 'is_graph_proposal = false', 'is_helper_output = false',
  'prompt_eligible = false', 'is_queued_work = false']) {
  assert(sql.includes(lock), `flag-lock: ${lock}`)
}
assert(/jsonb_typeof\(before_value\) = 'string'/.test(sql) && /jsonb_typeof\(after_value\) = 'string'/.test(sql) && /jsonb_typeof\(verified_current_value\) = 'string'/.test(sql), 'before/after/verified are JSON strings')
assert(/pg_catalog\.btrim\(acted_by\) <> ''/.test(sql), 'acted_by non-blank')

section('FKs')
assert(/foreign key \(remedy_plan_id\) references public\.agent_remedy_plans \(id\)/.test(sql), 'FK → agent_remedy_plans(id)')
assert(/foreign key \(approval_event_id\) references public\.agent_remedy_approval_events \(id\)/.test(sql), 'FK → agent_remedy_approval_events(id)')
assert(/foreign key \(reverses_apply_event_id\) references public\.agent_remedy_apply_events \(id\)/.test(sql), 'self-FK → agent_remedy_apply_events(id)')

section('deny-by-default RLS; execute-only RPCs; no table grants')
assert(/enable row level security/.test(sql), 'RLS enabled')
assert(!sql.split('\n').some((l) => /\bgrant\b/i.test(l) && /\bon table\b/i.test(l)), 'no GRANT ... on table')
for (const fn of ['agent_remedy_apply(uuid)', 'agent_remedy_rollback(uuid)', 'agent_remedy_apply_validate(uuid)', 'agent_remedy_apply_events_list(uuid)']) {
  assert(sql.includes(`grant execute on function public.${fn} to service_role`), `execute→service_role: ${fn}`)
  assert(sql.includes(`revoke all on function public.${fn} from public, anon, authenticated, service_role`), `revoked from others: ${fn}`)
}
assert((sql.match(/security definer/g) ?? []).length >= 4, 'all four functions SECURITY DEFINER')
assert((sql.match(/set search_path = pg_catalog, pg_temp/g) ?? []).length >= 4, 'fixed search_path x4')

section('EXACT House write: only library_items.title, single-row conditional, exactly twice (apply + rollback)')
const liUpdates = sql.match(/update public\.library_items[\s\S]*?;/gi) ?? []
assert(liUpdates.length === 2, `exactly two library_items UPDATEs (apply + rollback); found ${liUpdates.length}`)
for (const u of liUpdates) {
  assert(/set title = /.test(u), 'sets only title')
  assert(/where li\.id::text = v_tid and li\.title = /.test(u), 'conditional single-row (id + current title)')
}
assert(!/update\s+public\.(library_item_files|archive_graph_nodes|archive_graph_edges|graph_proposals|helper_outputs|memory_|room_|sessions)/i.test(sql), 'no other House-surface write')

section('apply RPC guards + acted_by hardcoded + FOR UPDATE before status derivation')
for (const e of ['TEST_OWNED_NO_WRITE', 'NOT_APPROVED', 'ALREADY_APPLIED', 'CURRENT_DRIFT', 'PROPOSED_DRIFT', 'WRITE_CONFLICT']) {
  assert(sql.includes(e), `apply guard: ${e}`)
}
assert(/v_acted_by text := 'tara'/.test(sql), "acted_by hardcoded 'tara'")
assert(sql.indexOf('for update') >= 0 && sql.indexOf('for update') < sql.indexOf('order by e.event_sequence desc'), 'plan locked FOR UPDATE before deriving approval/apply status')

section('rollback RPC guards + restore before_value')
for (const e of ['NOT_APPLIED', 'ROLLBACK_DRIFT', 'ROLLBACK_WRITE_CONFLICT']) assert(sql.includes(e), `rollback guard: ${e}`)
assert(/set title = \(v_applied_before #>> '\{\}'\)/.test(sql), 'rollback restores the applied before_value')

section('validate RPC is read-only (stable, no insert/update, returns ready/reason)')
const vfn = sql.slice(sql.indexOf('function public.agent_remedy_apply_validate'), sql.indexOf('function public.agent_remedy_apply_events_list'))
assert(/\bstable\b/.test(vfn), 'validate is STABLE')
assert(!/insert into|update public\./i.test(vfn), 'validate writes nothing (no insert/update)')
assert(/returns table \(ready boolean, reason text/.test(sql), 'validate returns a validation result')

section('no scheduler / queue-consumer / daemon mechanism')
// (specific mechanisms only — 'queue' would collide with the legit is_queued_work flag-lock)
assert(!/qstash|pg_cron|scheduler|daemon/i.test(sql), 'no qstash/pg_cron/scheduler/daemon in SQL')

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
