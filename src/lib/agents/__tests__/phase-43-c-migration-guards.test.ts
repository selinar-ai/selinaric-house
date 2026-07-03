/**
 * Phase 43.C — static guards over migration 090 (not applied) + 42P13 posture + dispatch safety.
 * Run: npx tsx src/lib/agents/__tests__/phase-43-c-migration-guards.test.ts
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }
function stripComments(sql: string): string { return sql.replace(/--[^\n]*/g, '') }

const migRaw = read('supabase-migrations/090_agent_remedy_whitelist_v2.sql')
const mig = stripComments(migRaw)
const m085 = stripComments(read('supabase-migrations/085_agent_remedy_plans.sql'))
const m087 = stripComments(read('supabase-migrations/087_agent_remedy_apply_events.sql'))

section('42P13 posture: no function is dropped; every redefined return shape is byte-equal to the shipped one')
assert(!/drop\s+function/i.test(mig), '090 contains NO drop function (all shapes unchanged)')
function returnsBlock(sql: string, fn: string): string | null {
  const re = new RegExp(`create (?:or replace )?function public\\.${fn}\\([\\s\\S]*?returns table \\(([\\s\\S]*?)\\)\\s*\\n`, 'm')
  const m = re.exec(sql)
  return m ? m[1].replace(/\s+/g, ' ').trim() : null
}
for (const [fn, shipped] of [
  ['agent_remedy_plan_record', m085],
  ['agent_remedy_apply', m087],
  ['agent_remedy_rollback', m087],
  ['agent_remedy_apply_validate', m087],
] as const) {
  const a = returnsBlock(mig, fn), b = returnsBlock(shipped, fn)
  assert(a !== null && b !== null && a === b, `${fn}: RETURNS shape identical to the shipped definition`)
}

section('idempotent drops before adds')
for (const c of ['arp_v1_action_whitelist', 'arp_values_are_strings', 'arp_proposed_is_trim', 'arp_proposed_nonempty', 'arp_class_typed', 'aae_values_are_strings', 'aae_values_json_scalar']) {
  assert(mig.includes(`drop constraint if exists ${c}`), `drop constraint if exists ${c}`)
}
{
  const dropIdx = mig.indexOf('drop constraint if exists arp_class_typed')
  const addIdx = mig.indexOf('add constraint arp_class_typed check')
  assert(dropIdx >= 0 && addIdx >= 0 && dropIdx < addIdx, 'arp_class_typed dropped before added')
  const d2 = mig.indexOf('drop constraint if exists aae_values_json_scalar')
  const a2 = mig.indexOf('add constraint aae_values_json_scalar check')
  assert(d2 >= 0 && a2 >= 0 && d2 < a2, 'aae_values_json_scalar dropped before added')
}
// ONLY the five intended arp_/aae_ constraints are ever dropped — flag locks and the rest stay
{
  const dropped = [...mig.matchAll(/drop constraint if exists (\w+)/g)].map((m) => m[1])
  const allowed = new Set(['arp_v1_action_whitelist', 'arp_values_are_strings', 'arp_proposed_is_trim', 'arp_proposed_nonempty', 'arp_class_typed', 'aae_values_are_strings', 'aae_values_json_scalar'])
  assert(dropped.every((d) => allowed.has(d)), 'no unrelated constraint (flag locks, vocab, uniqueness) is dropped')
}

section('class-typed whitelist: v1 preserved; A1 hardened current; A2 clear-to-JSON-null')
assert(/action_type = 'library_title_trim' and target_field = 'title'[\s\S]*?btrim\(current_value #>> '\{\}', ' '\)[\s\S]*?<> ''/.test(mig), 'v1 title_trim branch preserved (btrim relation + nonempty)')
assert(/action_type = 'library_phase_label_backfill' and target_field = 'phase_label'[\s\S]*?jsonb_typeof\(current_value\) = 'null'[\s\S]*?or \(jsonb_typeof\(current_value\) = 'string' and pg_catalog\.btrim\(current_value #>> '\{\}'\) = ''\)/.test(mig), 'A1 CHECK hardened: prior label admissible ONLY as JSON null or blank JSON string')
assert(/action_type = 'library_source_url_clear_non_url' and target_field = 'source_url'[\s\S]*?jsonb_typeof\(proposed_value\) = 'null'/.test(mig), 'A2 CHECK: proposed value must be JSON null')
assert(/aae_values_json_scalar check \([\s\S]*?in \('string', 'null'\)/.test(mig), 'apply-event values may be string OR JSON null (A1 before / A2 after)')

section('record RPC: action derived server-side; per-action error codes; observed-title provenance')
assert(!/p_action/.test(mig), 'callers cannot choose an action (no p_action parameter)')
for (const [code, issue] of [["'library_title_trim'", "'item_title_untrimmed'"], ["'library_phase_label_backfill'", "'phase_doc_incomplete_phase_metadata'"], ["'library_source_url_clear_non_url'", "'source_url_malformed'"]]) {
  assert(mig.includes(issue) && mig.includes(code), `issue_code ${issue} maps to ${code}`)
}
for (const code of ['FINDING_NOT_FOUND_OR_DELETED', 'FINDING_NOT_ELIGIBLE', 'TARGET_MISMATCH', 'DETERMINISTIC_REASON_BLANK', 'TARGET_ROW_NOT_FOUND',
  'CURRENT_VALUE_MISMATCH', 'PROPOSED_NOT_TRIM_OF_TARGET', 'PROPOSED_EMPTY', 'NO_CHANGE',
  'COLLECTION_NOT_ELIGIBLE', 'PHASE_CODE_OR_NUMBER_MISSING', 'LABEL_ALREADY_PRESENT', 'TITLE_NOT_CONVENTIONAL', 'PROPOSED_NOT_DERIVED_FROM_TITLE', 'REASON_MISSING_OBSERVED_TITLE',
  'PROPOSED_NOT_NULL', 'URL_NOT_MALFORMED']) {
  assert(mig.includes(`'${code}'`), `record/apply guard present: ${code}`)
}
assert(/position\(v_actual_title in p_deterministic_reason\) = 0/.test(mig), 'A1 observed-title provenance is ENFORCED (reason must contain the live title)')

section('parse rule + URL twin: regex-free first-em-dash rule; single SQL twin predicate')
assert(!/regexp_match/.test(mig), 'no regexp_match — the label rule is the regex-free first-em-dash rule')
assert((mig.match(/position\('—' in v_actual_title\)/g) ?? []).length >= 3, 'first-em-dash rule used in record + apply + validate')
assert((mig.match(/like 'Phase %'/g) ?? []).length >= 3, "'Phase ' prefix required in record + apply + validate")
assert((mig.match(/~\* '\^https\?:\/\/\\S\+\$'/g) ?? []).length >= 3, 'ONE SQL URL-twin predicate, used consistently (record + apply + validate)')

section('apply/rollback: static dispatch only; SET clauses confined to the three whitelisted columns')
assert(!/execute\s+format|execute\s+'/i.test(mig), 'no dynamic SQL / EXECUTE')
{
  const updates = [...mig.matchAll(/update public\.(\w+)(?:\s+\w+)?\s+set\s+(\w+)\s*=/g)].map((m) => `${m[1]}.${m[2]}`)
  const allowed = new Set(['library_items.title', 'library_items.phase_label', 'library_items.source_url', 'agent_remedy_plans.plan_state'])
  assert(updates.length > 0 && updates.every((u) => allowed.has(u)), `every UPDATE SET is whitelisted (${[...new Set(updates)].join(', ')})`)
  for (const denied of ['authority_status', 'derived_canonical_status', 'archive_item_id', 'canonical_status', 'prompt_eligible', 'tags', 'description', 'deleted_at']) {
    assert(!updates.some((u) => u.endsWith(`.${denied}`)), `denied column never in a SET clause: ${denied}`)
  }
}
assert(/set source_url = null/.test(mig), 'A2 apply writes NULL (the clear) — nothing else')
assert(mig.includes("v_acted_by text := 'tara'"), "acted_by remains server-derived 'tara'")
for (const g of ['TEST_OWNED_NO_WRITE', 'NOT_APPROVED', 'ALREADY_APPLIED', 'CURRENT_DRIFT', 'PROPOSED_DRIFT', 'WRITE_CONFLICT', 'NOT_APPLIED', 'ROLLBACK_DRIFT', 'ROLLBACK_WRITE_CONFLICT']) {
  assert(mig.includes(`'${g}'`), `hand guard retained: ${g}`)
}
assert(/for update/.test(mig), 'FOR UPDATE serialisation retained')

section('grants/revokes reapplied for every redefined function')
for (const fn of ['agent_remedy_plan_record', 'agent_remedy_apply(uuid)', 'agent_remedy_rollback(uuid)', 'agent_remedy_apply_validate(uuid)']) {
  assert(mig.includes(`revoke all on function public.${fn}`), `revoke reapplied: ${fn}`)
  assert(mig.includes(`grant execute on function public.${fn}`), `grant reapplied: ${fn}`)
}

section('surface discipline: no new table; no House surfaces beyond library_items; no scheduler/LLM')
assert(!/create table/i.test(mig), 'no new table')
for (const tok of ['memory_nodes', 'memory_edges', 'archive_graph_nodes', 'archive_graph_edges', "public.graph_proposals", 'helper_outputs', 'archive_items']) {
  assert(!mig.toLowerCase().includes(tok), `no reference to ${tok}`)
}
for (const tok of ['qstash', 'cron', 'scheduler', 'daemon']) assert(!mig.toLowerCase().includes(tok), `no "${tok}"`)
for (const tok of ['anthropic', 'openai', 'gpt-', 'claude-']) assert(!mig.toLowerCase().includes(tok), `no "${tok}"`)

section('091 patch: SQL-NULL arguments normalise to JSON null; record RPC only; shape unchanged')
{
  const m091 = stripComments(read('supabase-migrations/091_agent_remedy_record_null_normalisation.sql'))
  assert(m091.includes("coalesce(p_current_value, 'null'::jsonb)") && m091.includes("coalesce(p_proposed_value, 'null'::jsonb)"), '091 normalises both value args at entry (PostgREST cannot send jsonb null)')
  assert(!/drop\s+function/i.test(m091), '091 drops nothing (42P13-safe)')
  const a = returnsBlock(m091, 'agent_remedy_plan_record'), b = returnsBlock(m085, 'agent_remedy_plan_record')
  assert(a !== null && a === b, '091 record RPC RETURNS shape identical to shipped')
  assert(!/create or replace function public\.agent_remedy_(apply|rollback|apply_validate)/.test(m091), '091 touches ONLY the record RPC')
  for (const code of ['REASON_MISSING_OBSERVED_TITLE', 'PROPOSED_NOT_NULL', 'URL_NOT_MALFORMED', 'TITLE_NOT_CONVENTIONAL', 'PROPOSED_NOT_DERIVED_FROM_TITLE', 'COLLECTION_NOT_ELIGIBLE', 'LABEL_ALREADY_PRESENT']) {
    assert(m091.includes(`'${code}'`), `091 keeps guard: ${code}`)
  }
  assert(m091.includes('revoke all on function public.agent_remedy_plan_record') && m091.includes('grant execute on function public.agent_remedy_plan_record'), '091 reapplies grants')
  const updates = [...m091.matchAll(/update public\.(\w+)(?:\s+\w+)?\s+set\s+(\w+)\s*=/g)].map((m) => `${m[1]}.${m[2]}`)
  assert(updates.every((u) => u === 'agent_remedy_plans.plan_state'), '091 writes nothing but the supersede plan_state')
}

section('092 patch: approval RPC class-aware; snapshot CHECK admits JSON null; nothing else touched')
{
  const m086 = stripComments(read('supabase-migrations/086_agent_remedy_approval_events.sql'))
  const m092 = stripComments(read('supabase-migrations/092_agent_remedy_approval_v2_revalidation.sql'))
  // 42P13 lesson #2: the shipped signature carries a parameter DEFAULT, which CREATE OR
  // REPLACE cannot change — so 092 MUST drop-first, and must drop ONLY this one function.
  {
    const drops = [...m092.matchAll(/drop function if exists public\.([\w.]+)\(([^)]*)\)/gi)]
    assert(drops.length === 1 && drops[0][1] === 'agent_remedy_approval_record' && drops[0][2].replace(/\s+/g, ' ') === 'uuid, text, text, boolean', '092 drops EXACTLY agent_remedy_approval_record(uuid, text, text, boolean) and nothing else')
    const dropIdx = m092.indexOf('drop function if exists public.agent_remedy_approval_record')
    const createIdx = m092.search(/create (or replace )?function public\.agent_remedy_approval_record/)
    assert(dropIdx >= 0 && createIdx >= 0 && dropIdx < createIdx, 'drop-before-recreate ordering holds')
    const revokeIdx = m092.indexOf('revoke all on function public.agent_remedy_approval_record')
    const grantIdx = m092.indexOf('grant execute on function public.agent_remedy_approval_record')
    assert(revokeIdx > createIdx && grantIdx > createIdx, 'grants/revokes reapplied AFTER recreation')
  }
  assert(/p_allow_test_owned boolean default false/.test(m092), 'recreation preserves the 086 parameter default (calling contract unchanged)')
  const a = returnsBlock(m092, 'agent_remedy_approval_record'), b = returnsBlock(m086, 'agent_remedy_approval_record')
  assert(a !== null && a === b, '092 approval RPC RETURNS shape identical to shipped 086')
  assert(!/create or replace function public\.agent_remedy_(plan_record|apply|rollback|apply_validate|approvals_list|approval_events_cleanup_test)/.test(m092), '092 redefines ONLY agent_remedy_approval_record')
  {
    const dropIdx = m092.indexOf('drop constraint if exists arae_snapshots_by_decision')
    const addIdx = m092.indexOf('add constraint arae_snapshots_by_decision check')
    assert(dropIdx >= 0 && addIdx >= 0 && dropIdx < addIdx, 'snapshot CHECK dropped-if-exists before re-add')
    const dropped = [...m092.matchAll(/drop constraint if exists (\w+)/g)].map((m) => m[1])
    assert(dropped.length === 1 && dropped[0] === 'arae_snapshots_by_decision', '092 drops ONLY the snapshot CHECK')
  }
  assert(/decision = 'approved'[\s\S]*?jsonb_typeof\(verified_current_value\) in \('string', 'null'\)[\s\S]*?jsonb_typeof\(verified_proposed_value\) in \('string', 'null'\)/.test(m092), 'approved snapshots: JSON string OR JSON null — scalar only, nothing looser')
  assert(/decision <> 'approved'[\s\S]*?verified_current_value is null[\s\S]*?verified_proposed_value is null/.test(m092), 'non-approved snapshots remain SQL NULL exactly as before')
  // class-aware approved revalidation: all three action branches present
  for (const branch of ["v_action = 'library_title_trim'", "v_action = 'library_phase_label_backfill'", "'library_source_url_clear_non_url'"]) {
    assert(m092.includes(branch), `approval revalidation branch present: ${branch}`)
  }
  assert(/if \(v_curr #>> '\{\}'\) is distinct from v_actual_title then[\s\S]*?STALE_PLAN_CURRENT_DRIFT[\s\S]*?btrim\(v_actual_title, ' '\)/.test(m092), 'title-trim branch preserved byte-faithfully')
  assert(m092.includes("position('—' in v_actual_title)") && m092.includes("like 'Phase %'"), 'A1 approval recomputes the label with the same first-em-dash rule')
  assert(m092.includes("~* '^https?://\\S+$'") || m092.includes(String.raw`~* '^https?://\S+$'`), 'A2 approval reuses the same SQL URL twin')
  for (const kept of ['for update', "v_decided_by text := 'tara'", 'TEST_OWNED_NOT_ALLOWED', 'REVOKE_NOT_APPROVED', 'ALREADY_APPROVED', 'REVOKE_REQUIRED', 'STALE_PLAN_CURRENT_DRIFT', 'STALE_PLAN_PROPOSED_DRIFT']) {
    assert(m092.includes(kept), `092 keeps: ${kept}`)
  }
  const updates = [...m092.matchAll(/update public\.(\w+)(?:\s+\w+)?\s+set\s+(\w+)\s*=/g)].map((m) => `${m[1]}.${m[2]}`)
  assert(updates.length === 0, 'approval mutates NO rows beyond the append-only event insert')
  assert(!/execute\s+format|execute\s+'/i.test(m092), 'no dynamic SQL / EXECUTE')
  assert(m092.includes('revoke all on function public.agent_remedy_approval_record') && m092.includes('grant execute on function public.agent_remedy_approval_record'), 'grants/revokes restored')
}

section('five-RPC accounting: EVERY plan-value-reading RPC has class-aware v2 dispatch')
{
  // The lesson of the approve-click halt: record/approval/validate/apply/rollback = FIVE.
  const m091 = stripComments(read('supabase-migrations/091_agent_remedy_record_null_normalisation.sql'))
  const m092 = stripComments(read('supabase-migrations/092_agent_remedy_approval_v2_revalidation.sql'))
  const live = { record: m091, apply: mig, rollback: mig, validate: mig, approval: m092 }
  for (const [name, src] of Object.entries(live)) {
    assert(src.includes("'library_phase_label_backfill'") && src.includes("'library_source_url_clear_non_url'"), `${name}: dispatches all v2 actions`)
  }
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
