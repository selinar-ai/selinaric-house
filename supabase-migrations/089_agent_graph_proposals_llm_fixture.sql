-- Phase 42.4.2a — extend agent_graph_proposals for LLM-class proposals (FIXTURE-ONLY; NO live LLM)
--
-- The kernel's first LLM-in-the-loop threshold — but 42.4.2a builds only the CAGE: a typed,
-- class-specific extension of agent_graph_proposals + a fixture-only LLM-record RPC. The LLM's
-- output is untrusted until deterministic validators pass. NO provider call, NO SDK, NO live rows.
--
-- Deterministic (42.4.1) rows are UNCHANGED. LLM rows are separately, more-strictly constrained
-- (whitelist + provenance + confidence + source-ref-in-endpoint-evidence + generation_mode).
-- Suggest-only: no graph truth, no Memory, no prompt eligibility. Target: archive_graph ONLY.
--
-- Additive/typed ALTER. No change to archive_graph_*, graph_proposals, memory_*. No new table.
-- Run via SQL Editor -> paste -> Run. Success = "No rows returned".
--
-- Rollback notes (manual): drop the LLM-record fn, restore the four pinned CHECKs, drop the
-- five added columns/CHECKs. (agent_graph_proposals is empty in production, so ALTERs are safe.)

-- ─── New LLM-class columns (nullable; deterministic rows leave them NULL) ──────
alter table public.agent_graph_proposals add column if not exists model_id text;
alter table public.agent_graph_proposals add column if not exists model_settings jsonb;
alter table public.agent_graph_proposals add column if not exists confidence numeric;
alter table public.agent_graph_proposals add column if not exists prompt_version text;
alter table public.agent_graph_proposals add column if not exists generation_mode text;

-- ─── Replace the pinned 42.4.1 CHECKs with class-specific ones ────────────────
alter table public.agent_graph_proposals drop constraint if exists agp_edge_type;
alter table public.agent_graph_proposals drop constraint if exists agp_rule_id;
alter table public.agent_graph_proposals drop constraint if exists agp_is_llm_generated;
alter table public.agent_graph_proposals drop constraint if exists agp_dedupe_key_canonical;

-- deterministic rows behave EXACTLY as 42.4.1; LLM rows (42.4.2a) are structurally FIXTURE-ONLY:
-- generation_mode='fixture' + test_owned + JSON-object model_settings + confidence floor 0.7.
-- 'live' is NOT permitted here — 42.4.2b introduces it through its own migration/gate.
-- Idempotent: drop first so a rerun after a partial SQL Editor run does not fail on re-add.
alter table public.agent_graph_proposals drop constraint if exists agp_class_typed;
alter table public.agent_graph_proposals add constraint agp_class_typed check (
  (is_llm_generated = false
     and edge_type = 'shared_source' and rule_id = 'shared_source_v1'
     and model_id is null and model_settings is null and confidence is null
     and prompt_version is null and generation_mode is null)
  or
  (is_llm_generated = true
     and edge_type in ('contrasts_with', 'precedes', 'extends')
     and rule_id = 'llm_edge_v1'
     and pg_catalog.btrim(model_id) <> ''
     and pg_catalog.btrim(prompt_version) <> ''
     and model_settings is not null and pg_catalog.jsonb_typeof(model_settings) = 'object'
     and confidence is not null and confidence >= 0.7 and confidence <= 1
     and generation_mode = 'fixture'
     and test_owned = true)
);
-- dedupe key generalised to include edge_type (backward-compatible: shared_source rows unchanged)
alter table public.agent_graph_proposals add constraint agp_dedupe_key_canonical check (
  dedupe_key = 'archive_graph:' || from_node_id::text || ':' || to_node_id::text || ':' || edge_type
);

-- ─── LIST RPC — extend the return with LLM-class fields (superset; back-compatible) ──
-- Postgres cannot CREATE OR REPLACE a function whose RETURNS TABLE shape changes (42P13):
-- the 088 version must be dropped first, then recreated and its grants reapplied below.
drop function if exists public.agent_graph_proposals_list(text, text, boolean);
create or replace function public.agent_graph_proposals_list(
  p_target_graph text,
  p_review_state text,
  p_include_test boolean
)
returns table (
  id uuid, target_graph text, edge_type text, from_node_id uuid, to_node_id uuid,
  source_item_ids text[], rule_id text, run_id uuid, rationale text,
  is_llm_generated boolean, confidence numeric, model_id text, generation_mode text,
  review_state text, reviewed_by text, reviewed_at timestamptz, created_at timestamptz
)
language sql security definer set search_path = pg_catalog, pg_temp stable
as $$
  select p.id, p.target_graph, p.edge_type, p.from_node_id, p.to_node_id, p.source_item_ids,
         p.rule_id, p.run_id, p.rationale, p.is_llm_generated, p.confidence, p.model_id, p.generation_mode,
         p.review_state, p.reviewed_by, p.reviewed_at, p.created_at
  from public.agent_graph_proposals p
  where p.deleted_at is null and p.proposal_state = 'proposed'
    and (coalesce(p_include_test, false) = true or p.test_owned = false)
    and (p_target_graph is null or p.target_graph = p_target_graph)
    and (p_review_state is null or p.review_state = p_review_state)
  order by p.created_at asc;
$$;
revoke all on function public.agent_graph_proposals_list(text, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.agent_graph_proposals_list(text, text, boolean) to service_role;

-- ─── LLM-record RPC (FIXTURE-ONLY in 42.4.2a) — the DB-boundary post-gate ─────
-- The LLM's output is untrusted; this RPC re-verifies everything against live DB state before
-- recording an agent-side proposal. NO graph truth, NO Memory, NO prompt surface written.
create or replace function public.agent_graph_llm_proposal_record(
  p_from_node_id uuid,
  p_to_node_id uuid,
  p_edge_type text,
  p_source_item_ids text[],
  p_confidence numeric,
  p_rationale text,
  p_model_id text,
  p_prompt_version text,
  p_model_settings jsonb,
  p_input_hash text,
  p_run_id uuid,
  p_generation_mode text default 'fixture'
)
returns table (id uuid, dedupe_key text, recorded boolean, skip_reason text)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_dedupe text;
  v_from_ok boolean; v_to_ok boolean;
  v_from_archive text; v_to_archive text;
  v_union text[];
  v_supplied text[];
  v_new_id uuid;
begin
  -- 42.4.2a is fixture-only; a live row is not authorised until 42.4.2b
  if coalesce(p_generation_mode, 'fixture') <> 'fixture' then raise exception 'LIVE_NOT_AUTHORISED'; end if;
  -- canonical undirected pair
  if p_from_node_id = p_to_node_id then raise exception 'SELF_LOOP'; end if;
  if not (p_from_node_id < p_to_node_id) then raise exception 'NON_CANONICAL_PAIR'; end if;
  -- edge whitelist (LLM v1)
  if p_edge_type not in ('contrasts_with', 'precedes', 'extends') then raise exception 'EDGE_NOT_WHITELISTED'; end if;
  -- provenance guards
  if p_model_id is null or pg_catalog.btrim(p_model_id) = '' then raise exception 'MODEL_ID_REQUIRED'; end if;
  if p_prompt_version is null or pg_catalog.btrim(p_prompt_version) = '' then raise exception 'PROMPT_VERSION_REQUIRED'; end if;
  if p_model_settings is null or pg_catalog.jsonb_typeof(p_model_settings) <> 'object' then raise exception 'MODEL_SETTINGS_REQUIRED'; end if;
  if p_input_hash is null or p_input_hash !~ '^[a-f0-9]{64}$' then raise exception 'INPUT_HASH_INVALID'; end if;
  if p_rationale is null or pg_catalog.btrim(p_rationale) = '' then raise exception 'RATIONALE_REQUIRED'; end if;
  if p_run_id is null then raise exception 'RUN_ID_REQUIRED'; end if;
  -- confidence gate (soft evidence, still a hard floor)
  if p_confidence is null or p_confidence < 0 or p_confidence > 1 then raise exception 'CONFIDENCE_INVALID'; end if;
  if p_confidence < 0.7 then raise exception 'CONFIDENCE_TOO_LOW'; end if;
  -- source refs present + non-blank
  if p_source_item_ids is null or cardinality(p_source_item_ids) = 0 then raise exception 'SOURCE_REFS_REQUIRED'; end if;

  -- both endpoints exist + approved + same archive (verification-only read)
  select (n.approval_status = 'approved'), n.archive_name into v_from_ok, v_from_archive
    from public.archive_graph_nodes n where n.id = p_from_node_id;
  if not found or v_from_ok is not true then raise exception 'FROM_NODE_NOT_APPROVED_OR_MISSING'; end if;
  select (n.approval_status = 'approved'), n.archive_name into v_to_ok, v_to_archive
    from public.archive_graph_nodes n where n.id = p_to_node_id;
  if not found or v_to_ok is not true then raise exception 'TO_NODE_NOT_APPROVED_OR_MISSING'; end if;
  if v_from_archive is distinct from v_to_archive then raise exception 'ARCHIVE_MISMATCH'; end if;

  -- source refs must all lie within the UNION of the two endpoints' source_item_ids (in-scope evidence)
  select coalesce(array_agg(distinct x order by x), '{}') into v_union
    from (
      (select f.x from public.archive_graph_nodes m, unnest(m.source_item_ids) as f(x) where m.id = p_from_node_id and f.x is not null and pg_catalog.btrim(f.x) <> '')
      union
      (select t.x from public.archive_graph_nodes m, unnest(m.source_item_ids) as t(x) where m.id = p_to_node_id and t.x is not null and pg_catalog.btrim(t.x) <> '')
    ) u(x);
  select coalesce(array_agg(distinct y order by y), '{}') into v_supplied
    from unnest(p_source_item_ids) s(y) where s.y is not null and pg_catalog.btrim(s.y) <> '';
  if cardinality(v_supplied) = 0 then raise exception 'SOURCE_REFS_REQUIRED'; end if;
  if not (v_supplied <@ v_union) then raise exception 'SOURCE_REF_OUT_OF_SCOPE'; end if;

  v_dedupe := 'archive_graph:' || p_from_node_id::text || ':' || p_to_node_id::text || ':' || p_edge_type;

  -- skip if an edge of this type already connects the pair (either direction, any approval_status)
  if exists (
    select 1 from public.archive_graph_edges e
     where e.edge_type = p_edge_type
       and ((e.from_node_id = p_from_node_id and e.to_node_id = p_to_node_id)
         or (e.from_node_id = p_to_node_id and e.to_node_id = p_from_node_id))
  ) then
    return query select null::uuid, v_dedupe, false, 'existing_edge'::text; return;
  end if;
  -- skip active duplicate proposal (unified dedupe space)
  if exists (
    select 1 from public.agent_graph_proposals p
     where p.dedupe_key = v_dedupe and p.test_owned = true
       and p.proposal_state = 'proposed' and p.deleted_at is null
  ) then
    return query select null::uuid, v_dedupe, false, 'duplicate_proposal'::text; return;
  end if;

  insert into public.agent_graph_proposals (
    target_graph, proposal_kind, edge_type, from_node_id, to_node_id, source_item_ids,
    dedupe_key, rule_id, run_id, input_hash, rationale,
    is_llm_generated, model_id, model_settings, confidence, prompt_version, generation_mode, test_owned
  ) values (
    'archive_graph', 'edge', p_edge_type, p_from_node_id, p_to_node_id, v_supplied,
    v_dedupe, 'llm_edge_v1', p_run_id, p_input_hash, p_rationale,
    true, p_model_id, p_model_settings, p_confidence, p_prompt_version, 'fixture', true
  )
  returning agent_graph_proposals.id into v_new_id;

  return query select v_new_id, v_dedupe, true, null::text;
end;
$$;
revoke all on function public.agent_graph_llm_proposal_record(uuid, uuid, text, text[], numeric, text, text, text, jsonb, text, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.agent_graph_llm_proposal_record(uuid, uuid, text, text[], numeric, text, text, text, jsonb, text, uuid, text) to service_role;
