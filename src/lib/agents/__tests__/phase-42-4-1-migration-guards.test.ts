/**
 * Phase 42.4.1 — static guards over migration 088 (not applied).
 * Run: npx tsx src/lib/agents/__tests__/phase-42-4-1-migration-guards.test.ts
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }

const rel = 'supabase-migrations/088_agent_graph_proposals.sql'
if (!fs.existsSync(rel)) { console.log(`✗ not found: ${rel}`); process.exit(1) }
const sql = fs.readFileSync(rel, 'utf8').replace(/--[^\n]*/g, '')

section('additive; no graph-truth / Memory / House-proposal write; no select *; no dynamic SQL')
assert(/create table if not exists public\.agent_graph_proposals/.test(sql), 'creates agent_graph_proposals')
assert(!/(insert into|update|delete from)\s+public\.(archive_graph_nodes|archive_graph_edges|graph_proposals|memory_nodes|memory_edges)/i.test(sql), 'no write to archive_graph / graph_proposals / memory')
assert(!/alter table public\.(archive_graph|graph_proposals|memory)/i.test(sql), 'no alter of House graph/memory tables')
assert(!sql.includes('select *'), 'no select *')
assert(!/execute\s+format|execute\s+'/i.test(sql), 'no dynamic SQL')
// no LLM provider/call ('llm' alone excluded — it collides with the honest is_llm_generated=false flag)
assert(!/anthropic|openai|\bgpt\b|create_embedding|call_llm/i.test(sql), 'no LLM provider/call reference')

section('v1 whitelist: target/kind/edge/rule pinned')
assert(/target_graph = 'archive_graph'/.test(sql), "target_graph = 'archive_graph'")
assert(/proposal_kind = 'edge'/.test(sql), "proposal_kind = 'edge'")
assert(/edge_type = 'shared_source'/.test(sql), "edge_type = 'shared_source'")
assert(/rule_id = 'shared_source_v1'/.test(sql), "rule_id = 'shared_source_v1'")

section('structural constraints')
assert(/from_node_id < to_node_id/.test(sql), 'canonical pair CHECK (from < to — implies no self-loop)')
assert(/dedupe_key = 'archive_graph:' \|\| from_node_id::text \|\| ':' \|\| to_node_id::text \|\| ':shared_source'/.test(sql), 'DB-verifiable canonical dedupe_key CHECK')
assert(/cardinality\(source_item_ids\) > 0/.test(sql), 'non-empty source_item_ids CHECK')
assert(/proposal_state in \('proposed', 'superseded'\)/.test(sql), 'proposal_state vocab')
assert(/review_state in \('open', 'acknowledged', 'dismissed'\)/.test(sql), 'triage-only review_state vocab (no approve/promote)')
// no promote/authorise/crown lifecycle states ('approved' is excluded — it's the archive node
// approval_status value the record RPC READS, not a proposal lifecycle state).
assert(!/'promoted'|'authorised'|'crowned'/i.test(sql), 'no promote/authorise/crown states')

section('governance flag-locks')
for (const lock of ['is_graph_proposal = true', 'not_graph_truth = true', 'is_llm_generated = false',
  'not_memory = true', 'not_evidence = true', 'authority_changed = false', 'prompt_eligible = false',
  'is_queued_work = false', 'is_helper_output = false']) {
  assert(sql.includes(lock), `flag-lock: ${lock}`)
}

section('active undirected dedupe index')
assert(/unique index[\s\S]*agent_graph_proposals \(dedupe_key, test_owned\)[\s\S]*where proposal_state = 'proposed' and deleted_at is null/.test(sql), 'active dedupe unique index (dedupe_key, test_owned)')

section('deny-by-default RLS; execute-only RPCs; no table grants')
assert(/enable row level security/.test(sql), 'RLS enabled')
assert(!sql.split('\n').some((l) => /\bgrant\b/i.test(l) && /\bon table\b/i.test(l)), 'no GRANT ... on table')
for (const fn of ['agent_graph_proposal_record(uuid, uuid, text[], text, uuid, text, text, boolean)',
  'agent_graph_proposals_list(text, text, boolean)',
  'agent_graph_proposal_set_review_state(uuid, text)',
  'agent_graph_proposals_cleanup_test(uuid)']) {
  assert(sql.includes(`grant execute on function public.${fn} to service_role`), `execute→service_role: ${fn.split('(')[0]}`)
  assert(sql.includes(`revoke all on function public.${fn} from public, anon, authenticated, service_role`), `revoked: ${fn.split('(')[0]}`)
}
assert((sql.match(/security definer/g) ?? []).length >= 5, 'all functions SECURITY DEFINER (5: trigger + 4 RPCs)')
assert((sql.match(/set search_path = pg_catalog, pg_temp/g) ?? []).length >= 5, 'fixed search_path')

section('provenance guards (audit data, not decoration)')
assert(/input_hash ~ '\^\[a-f0-9\]\{64\}\$'/.test(sql), 'table CHECK: input_hash is sha256 hex')
assert(/pg_catalog\.btrim\(rationale\) <> ''/.test(sql), 'table CHECK: rationale non-blank')
for (const g of ['RUN_ID_REQUIRED', 'INPUT_HASH_REQUIRED', 'INPUT_HASH_INVALID', 'RATIONALE_REQUIRED']) {
  assert(sql.includes(g), `record RPC provenance guard: ${g}`)
}

section('null/blank source refs excluded from the DB-computed intersection')
// 3 null/blank filters: from-side + to-side of the intersect, and supplied-ref normalisation
assert((sql.match(/is not null and pg_catalog\.btrim\(/g) ?? []).length >= 3, 'both intersection sides + supplied refs filter null/blank')
assert(/where u\.y is not null and pg_catalog\.btrim\(u\.y\) <> ''/.test(sql), 'supplied refs normalisation excludes null/blank')

section('updated_at trigger is idempotent')
assert(/drop trigger if exists agent_graph_proposals_updated_at on public\.agent_graph_proposals/.test(sql), 'drop trigger if exists before create')

section('record RPC: canonical + dedupe + DB-boundary source-ref verification; skips')
for (const g of ['SELF_LOOP', 'NON_CANONICAL_PAIR', 'DEDUPE_KEY_MISMATCH', 'EMPTY_SOURCE_REFS',
  'FROM_NODE_NOT_APPROVED_OR_MISSING', 'TO_NODE_NOT_APPROVED_OR_MISSING', 'ARCHIVE_MISMATCH',
  'SOURCE_REFS_NOT_SHARED', 'SOURCE_REFS_MISMATCH', 'existing_edge', 'duplicate_proposal']) {
  assert(sql.includes(g), `record RPC guard: ${g}`)
}
assert(/from public\.archive_graph_nodes n where n\.id =/.test(sql), 'reads archive_graph_nodes (verification)')
assert(/approval_status = 'approved'/.test(sql), 'requires approved endpoints')
assert(/unnest\(v_from_sources\)[\s\S]*intersect[\s\S]*unnest\(v_to_sources\)/.test(sql), 'computes the ACTUAL shared-source intersection at the DB boundary')
assert(/if not \(p_from_node_id < p_to_node_id\)/.test(sql), 'enforces canonical undirected order in the RPC')
assert(/'archive_graph:' \|\| p_from_node_id::text \|\| ':' \|\| p_to_node_id::text \|\| ':shared_source'/.test(sql), 'verifies dedupe key against the pair')

section('reviewed_by server-derived + proposal content is immutable')
assert(/v_reviewed_by text := 'tara'/.test(sql), "set-review reviewed_by hardcoded 'tara'")
assert(!/p_reviewed_by/.test(sql), 'no caller-supplied p_reviewed_by param')
// inspect each UPDATE's SET clause (between `set` and `where`) — none may assign a content column
const contentCols = ['from_node_id', 'to_node_id', 'edge_type', 'source_item_ids', 'dedupe_key', 'rule_id', 'run_id', 'input_hash', 'rationale', 'target_graph', 'proposal_kind']
const setClauses = [...sql.matchAll(/update\b[\s\S]*?\bset\b([\s\S]*?)\bwhere\b/gi)].map((m) => m[1])
assert(setClauses.length >= 2, 'found the UPDATE set-clauses (triage + cleanup)')
let immutableOk = true
for (const clause of setClauses) for (const col of contentCols) if (new RegExp(`\\b${col}\\b\\s*=`).test(clause)) immutableOk = false
assert(immutableOk, 'no UPDATE SET clause assigns an immutable content column (only review fields / deleted_at)')

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
