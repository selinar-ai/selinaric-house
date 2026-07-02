/**
 * Phase 42.4.2a — static guards over migration 089 (not applied) + 088 deterministic preservation.
 * Run: npx tsx src/lib/agents/__tests__/phase-42-4-2a-migration-guards.test.ts
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }

const rel = 'supabase-migrations/089_agent_graph_proposals_llm_fixture.sql'
if (!fs.existsSync(rel)) { console.log(`✗ not found: ${rel}`); process.exit(1) }
const sql = fs.readFileSync(rel, 'utf8').replace(/--[^\n]*/g, '')

section('additive/typed ALTER; no House graph/memory/prompt write; no new table; no select *')
assert(/alter table public\.agent_graph_proposals add column if not exists/.test(sql), 'ALTERs agent_graph_proposals (add LLM columns)')
assert(!/create table/i.test(sql), 'no new table created')
assert(!/(insert into|update|delete from)\s+public\.(archive_graph_nodes|archive_graph_edges|graph_proposals|memory_nodes|memory_edges)/i.test(sql), 'no write to House graph/memory')
assert(!sql.includes('select *'), 'no select *')
assert(!/execute\s+format|execute\s+'/i.test(sql), 'no dynamic SQL')

section('new LLM columns; NO raw prompt column')
for (const c of ['model_id text', 'model_settings jsonb', 'confidence numeric', 'prompt_version text', 'generation_mode text']) {
  assert(sql.includes(c), `column: ${c}`)
}
assert(!/raw_prompt|prompt_text|full_prompt/i.test(sql), 'no raw prompt column')

section('class-specific CHECK: deterministic branch unchanged; LLM branch fixture-only + typed')
// Ari final patch: idempotent — drop agp_class_typed before re-adding (rerun-safe)
assert(/drop constraint if exists agp_class_typed[\s\S]*add constraint agp_class_typed check/.test(sql), 'agp_class_typed is dropped-if-exists before being added')
assert(/is_llm_generated = false[\s\S]*edge_type = 'shared_source'[\s\S]*rule_id = 'shared_source_v1'[\s\S]*model_id is null[\s\S]*confidence is null/.test(sql), 'deterministic branch preserves 42.4.1 (shared_source, no provenance)')
assert(/is_llm_generated = true[\s\S]*edge_type in \('contrasts_with', 'precedes', 'extends'\)[\s\S]*rule_id = 'llm_edge_v1'/.test(sql), 'LLM branch requires whitelist + llm_edge_v1')
assert(/btrim\(model_id\) <> ''[\s\S]*btrim\(prompt_version\) <> ''/.test(sql), 'LLM branch requires non-blank model_id + prompt_version')
// Ari patch 1: fixture-only structural — 'live' must NOT be allowed in the 42.4.2a CHECK
assert(/generation_mode = 'fixture'/.test(sql) && !/generation_mode in \([^)]*'live'/.test(sql), "LLM branch CHECK pins generation_mode='fixture' (no 'live')")
// Ari patch 2: LLM rows must be test_owned at the table boundary
assert(/is_llm_generated = true[\s\S]*generation_mode = 'fixture'[\s\S]*test_owned = true/.test(sql), 'LLM branch CHECK requires test_owned = true')
// Ari patch 3: confidence floor 0.7 enforced by the table CHECK, not just the RPC
assert(/is_llm_generated = true[\s\S]*confidence is not null and confidence >= 0\.7 and confidence <= 1/.test(sql), 'LLM branch CHECK enforces confidence floor 0.7')
// Ari patch 4: model_settings provenance shape (non-null JSON object) at the table CHECK
assert(/is_llm_generated = true[\s\S]*model_settings is not null and pg_catalog\.jsonb_typeof\(model_settings\) = 'object'/.test(sql), 'LLM branch CHECK requires JSON-object model_settings')

section('generalised dedupe (backward-compatible with shared_source)')
assert(/dedupe_key = 'archive_graph:' \|\| from_node_id::text \|\| ':' \|\| to_node_id::text \|\| ':' \|\| edge_type/.test(sql), 'dedupe key includes edge_type')
assert(/drop constraint if exists agp_edge_type[\s\S]*drop constraint if exists agp_rule_id[\s\S]*drop constraint if exists agp_is_llm_generated[\s\S]*drop constraint if exists agp_dedupe_key_canonical/.test(sql), 'drops the 4 pinned 42.4.1 CHECKs before replacing them')

section('LLM-record RPC: fixture-only + DB-boundary guards')
for (const g of ['LIVE_NOT_AUTHORISED', 'SELF_LOOP', 'NON_CANONICAL_PAIR', 'EDGE_NOT_WHITELISTED',
  'MODEL_ID_REQUIRED', 'PROMPT_VERSION_REQUIRED', 'MODEL_SETTINGS_REQUIRED', 'INPUT_HASH_INVALID', 'RATIONALE_REQUIRED', 'RUN_ID_REQUIRED',
  'CONFIDENCE_INVALID', 'CONFIDENCE_TOO_LOW', 'SOURCE_REFS_REQUIRED',
  'FROM_NODE_NOT_APPROVED_OR_MISSING', 'TO_NODE_NOT_APPROVED_OR_MISSING', 'ARCHIVE_MISMATCH', 'SOURCE_REF_OUT_OF_SCOPE',
  'existing_edge', 'duplicate_proposal']) {
  assert(sql.includes(g), `LLM-record guard: ${g}`)
}
assert(/coalesce\(p_generation_mode, 'fixture'\) <> 'fixture'/.test(sql), 'fixture-only enforced (live rejected)')
assert(/if p_confidence < 0\.7 then raise exception 'CONFIDENCE_TOO_LOW'/.test(sql), 'confidence floor 0.7')
assert(/not \(v_supplied <@ v_union\)/.test(sql), 'source refs must be subset of endpoint evidence union')
assert(/values \([\s\S]*true, p_model_id[\s\S]*'fixture', true\s*\)/.test(sql), 'inserts is_llm_generated=true, generation_mode fixture, test_owned=true')

section('42P13 retry-safety: list RPC dropped before redefinition; grants restored; shape widened')
// Postgres refuses CREATE OR REPLACE when RETURNS TABLE changes — 088's list fn must be dropped first
{
  const dropIdx = sql.indexOf('drop function if exists public.agent_graph_proposals_list(text, text, boolean)')
  const createIdx = sql.indexOf('create or replace function public.agent_graph_proposals_list(')
  assert(dropIdx >= 0 && createIdx >= 0 && dropIdx < createIdx, 'list RPC is dropped-if-exists BEFORE its redefinition')
  const revokeIdx = sql.indexOf('revoke all on function public.agent_graph_proposals_list(text, text, boolean)')
  const grantIdx = sql.indexOf('grant execute on function public.agent_graph_proposals_list(text, text, boolean) to service_role')
  assert(revokeIdx > createIdx && grantIdx > createIdx, 'list RPC grants are reapplied AFTER recreation')
}
assert(/returns table \([\s\S]*is_llm_generated boolean, confidence numeric, model_id text, generation_mode text/.test(sql), 'recreated list return shape includes the LLM fixture fields')
// only the return-shape-changed list fn is ever dropped — no unrelated function drops
{
  const dropped = [...sql.matchAll(/drop function if exists public\.(\w+)/g)].map((m) => m[1])
  assert(dropped.length === 1 && dropped[0] === 'agent_graph_proposals_list', 'no unrelated functions are dropped')
}

section('deny-by-default RLS unchanged; execute-only RPCs')
assert(sql.includes('grant execute on function public.agent_graph_llm_proposal_record'), 'LLM-record RPC granted to service_role')
assert(sql.includes('revoke all on function public.agent_graph_llm_proposal_record'), 'LLM-record RPC revoked from others')
assert(!sql.split('\n').some((l) => /\bgrant\b/i.test(l) && /\bon table\b/i.test(l)), 'no GRANT ... on table')

section('deterministic (42.4.1) record RPC is NOT modified by 089')
assert(!/create or replace function public\.agent_graph_proposal_record/.test(sql), '089 does not touch the deterministic record RPC')

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
