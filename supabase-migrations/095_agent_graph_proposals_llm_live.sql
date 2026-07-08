-- Phase 43.B (= 42.4.2b) — admit LLM-class generation_mode='live' behind the proven cage.
--
-- 42.4.2a built the cage FIXTURE-ONLY. 43.B admits a LIVE model as a proposal SOURCE — but the
-- rows it produces remain SUGGEST-ONLY and structurally TEST-OWNED. A real (test_owned=false) live
-- row stays impossible until a further micro-gate. The live model is just another untrusted
-- producer of the array; the deterministic post-gate (llm_postgate.ts) + this RPC re-verify
-- everything before a row can exist. No graph truth, no Memory, no prompt eligibility. Target:
-- archive_graph ONLY. Suggest-only. Whitelist unchanged (contrasts_with/precedes/extends).
--
-- Two changes only:
--   1. agp_class_typed LLM branch: generation_mode in ('fixture','live') — KEEP test_owned=true.
--   2. agent_graph_llm_proposal_record: accept p_generation_mode='live' ONLY with explicit
--      p_live_authorized=true (else LIVE_NOT_AUTHORISED); still insert test_owned=true.
--
-- Adding p_live_authorized changes the function signature, so the 089 function is dropped first,
-- recreated, and its grant reapplied. Deterministic 42.4.1 rows and 42.4.2a fixture behaviour are
-- unchanged. Run via SQL Editor -> paste -> Run. Success = "No rows returned".
--
-- Rollback notes (manual): restore the 089 agp_class_typed (generation_mode='fixture'), drop this
-- function and recreate the 089 12-arg version. agent_graph_proposals holds only test-owned rows.

-- ─── agp_class_typed: admit 'live' for LLM rows; test_owned=true still REQUIRED ────
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
     and generation_mode in ('fixture', 'live')
     and test_owned = true)
);

-- ─── LLM-record RPC — now accepts 'live' behind explicit authorisation ────────────
-- Drop the 089 12-arg signature first (signature change on adding p_live_authorized).
drop function if exists public.agent_graph_llm_proposal_record(
  uuid, uuid, text, text[], numeric, text, text, text, jsonb, text, uuid, text);

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
  p_generation_mode text default 'fixture',
  p_live_authorized boolean default false
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
  v_mode text := coalesce(p_generation_mode, 'fixture');
begin
  -- generation-mode gate: fixture always allowed; live ONLY with explicit authorisation;
  -- any other mode is refused. 43.B keeps rows test_owned regardless of mode.
  if v_mode = 'live' then
    if not coalesce(p_live_authorized, false) then raise exception 'LIVE_NOT_AUTHORISED'; end if;
  elsif v_mode <> 'fixture' then
    raise exception 'LIVE_NOT_AUTHORISED';
  end if;
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

  -- record: is_llm_generated=true, generation_mode = fixture|live, test_owned = true ALWAYS.
  insert into public.agent_graph_proposals (
    target_graph, proposal_kind, edge_type, from_node_id, to_node_id, source_item_ids,
    dedupe_key, rule_id, run_id, input_hash, rationale,
    is_llm_generated, model_id, model_settings, confidence, prompt_version, generation_mode, test_owned
  ) values (
    'archive_graph', 'edge', p_edge_type, p_from_node_id, p_to_node_id, v_supplied,
    v_dedupe, 'llm_edge_v1', p_run_id, p_input_hash, p_rationale,
    true, p_model_id, p_model_settings, p_confidence, p_prompt_version, v_mode, true
  )
  returning agent_graph_proposals.id into v_new_id;

  return query select v_new_id, v_dedupe, true, null::text;
end;
$$;
revoke all on function public.agent_graph_llm_proposal_record(uuid, uuid, text, text[], numeric, text, text, text, jsonb, text, uuid, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.agent_graph_llm_proposal_record(uuid, uuid, text, text[], numeric, text, text, text, jsonb, text, uuid, text, boolean) to service_role;
