-- Phase 42.4.1 — agent_graph_proposals (DETERMINISTIC graph-structure proposals; NO LLM)
--
-- The kernel's first inferential-adjacent helper — but v1 is fully DETERMINISTIC: it proposes
-- candidate `shared_source` edges between EXISTING APPROVED archive_graph nodes that share
-- source_item_ids. It SUGGESTS structure into a review queue; it never writes graph truth,
-- Memory, or prompt surfaces, and there is NO LLM. Graph suggests structure; graph does not
-- remember; approval is not Memory.
--
-- SUGGEST-ONLY / TRIAGE-ONLY. No approve-to-graph-truth in 42.4.1. Review is open/ack/dismiss.
-- Deny-by-default RLS; all access via execute-only SECURITY DEFINER RPCs. Reads archive_graph
-- READ-ONLY for verification; writes ONLY agent_graph_proposals. No scheduler/daemon/queue.
--
-- Additive; no change to archive_graph_*, graph_proposals, memory_*. New agent-side table.
-- Run via SQL Editor -> paste -> Run. Success = "No rows returned".
--
-- Rollback notes (manual):
--   drop function if exists public.agent_graph_proposals_cleanup_test(uuid);
--   drop function if exists public.agent_graph_proposal_set_review_state(uuid, text, text);
--   drop function if exists public.agent_graph_proposals_list(text, text, boolean);
--   drop function if exists public.agent_graph_proposal_record(uuid, uuid, text[], text, uuid, text, text, boolean);
--   drop function if exists public.agent_graph_proposals_set_updated_at();
--   drop table if exists public.agent_graph_proposals;

-- ─── Table ───────────────────────────────────────────────────────────────────
create table if not exists public.agent_graph_proposals (
  id uuid primary key default gen_random_uuid(),
  target_graph text not null,
  proposal_kind text not null,
  edge_type text not null,
  from_node_id uuid not null,           -- canonical undirected order: from < to (runner-sorted)
  to_node_id uuid not null,
  source_item_ids text[] not null,      -- the shared intersection (the deterministic evidence)
  dedupe_key text not null,
  rule_id text not null,
  run_id uuid not null,
  input_hash text not null,
  rationale text not null,
  proposal_state text not null default 'proposed',
  review_state text not null default 'open',
  reviewed_by text,
  reviewed_at timestamptz,
  -- governance flag-locks
  is_graph_proposal boolean not null default true,
  not_graph_truth boolean not null default true,
  is_llm_generated boolean not null default false,
  not_memory boolean not null default true,
  not_evidence boolean not null default true,
  authority_changed boolean not null default false,
  prompt_eligible boolean not null default false,
  is_queued_work boolean not null default false,
  is_helper_output boolean not null default false,
  test_owned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,

  -- (2) v1 target surface: archive_graph ONLY (never ontology/memory graph)
  constraint agp_target_graph check (target_graph = 'archive_graph'),
  -- (3) v1 proposal kind + edge whitelist
  constraint agp_proposal_kind check (proposal_kind = 'edge'),
  constraint agp_edge_type check (edge_type = 'shared_source'),
  constraint agp_rule_id check (rule_id = 'shared_source_v1'),
  -- (4) canonical undirected pair (implies no self-loop): from < to (uuid byte order)
  constraint agp_canonical_pair check (from_node_id < to_node_id),
  -- (2) DB-verifiable dedupe key: plain canonical string tied to the pair (no pgcrypto)
  constraint agp_dedupe_key_canonical check (
    dedupe_key = 'archive_graph:' || from_node_id::text || ':' || to_node_id::text || ':shared_source'
  ),
  -- (5) non-empty shared source refs
  constraint agp_source_refs_nonempty check (cardinality(source_item_ids) > 0),
  -- provenance is audit data, not decoration: input_hash is sha256-hex; rationale non-blank
  constraint agp_input_hash_format check (input_hash ~ '^[a-f0-9]{64}$'),
  constraint agp_rationale_nonblank check (pg_catalog.btrim(rationale) <> ''),
  -- (11) triage-only lifecycle
  constraint agp_proposal_state check (proposal_state in ('proposed', 'superseded')),
  constraint agp_review_state check (review_state in ('open', 'acknowledged', 'dismissed')),
  -- (10) governance flag-locks
  constraint agp_is_graph_proposal check (is_graph_proposal = true),
  constraint agp_not_graph_truth check (not_graph_truth = true),
  constraint agp_is_llm_generated check (is_llm_generated = false),
  constraint agp_not_memory check (not_memory = true),
  constraint agp_not_evidence check (not_evidence = true),
  constraint agp_authority_changed check (authority_changed = false),
  constraint agp_prompt_eligible check (prompt_eligible = false),
  constraint agp_is_queued_work check (is_queued_work = false),
  constraint agp_is_helper_output check (is_helper_output = false)
);

-- (6) active-only undirected dedupe, isolated by test ownership
create unique index if not exists agent_graph_proposals_active_dedupe_idx
  on public.agent_graph_proposals (dedupe_key, test_owned)
  where proposal_state = 'proposed' and deleted_at is null;

create index if not exists agent_graph_proposals_review_idx
  on public.agent_graph_proposals (target_graph, review_state)
  where deleted_at is null;

-- ─── Deny-by-default RLS ───────────────────────────────────────────────────────
alter table public.agent_graph_proposals enable row level security;
revoke all on table public.agent_graph_proposals from public, anon, authenticated, service_role;

-- ─── updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.agent_graph_proposals_set_updated_at()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin new.updated_at := now(); return new; end;
$$;
revoke all on function public.agent_graph_proposals_set_updated_at() from public, anon, authenticated, service_role;
drop trigger if exists agent_graph_proposals_updated_at on public.agent_graph_proposals;
create trigger agent_graph_proposals_updated_at
  before update on public.agent_graph_proposals
  for each row execute function public.agent_graph_proposals_set_updated_at();

-- ─── RECORD one deterministic proposal (verifies against archive_graph, read-only) ──
-- from/to are runner-sorted (canonical undirected). Returns recorded row, or a skip marker
-- when an existing shared_source edge connects the pair or an active duplicate proposal exists.
create or replace function public.agent_graph_proposal_record(
  p_from_node_id uuid,
  p_to_node_id uuid,
  p_source_item_ids text[],
  p_dedupe_key text,
  p_run_id uuid,
  p_input_hash text,
  p_rationale text,
  p_allow_test_owned boolean default false
)
returns table (id uuid, dedupe_key text, recorded boolean, skip_reason text)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_from_ok boolean;
  v_to_ok boolean;
  v_from_archive text;
  v_to_archive text;
  v_from_sources text[];
  v_to_sources text[];
  v_shared text[];
  v_supplied text[];
  v_new_id uuid;
begin
  -- (2) canonical undirected order enforced at the DB boundary (not trusted from the runner)
  if p_from_node_id = p_to_node_id then raise exception 'SELF_LOOP'; end if;
  if not (p_from_node_id < p_to_node_id) then raise exception 'NON_CANONICAL_PAIR'; end if;
  -- (2) dedupe key must be the verifiable canonical string for THIS pair
  if p_dedupe_key is distinct from ('archive_graph:' || p_from_node_id::text || ':' || p_to_node_id::text || ':shared_source') then
    raise exception 'DEDUPE_KEY_MISMATCH';
  end if;
  if p_source_item_ids is null or cardinality(p_source_item_ids) = 0 then raise exception 'EMPTY_SOURCE_REFS'; end if;
  -- (1) provenance guards — audit data must not be null/blank/malformed
  if p_run_id is null then raise exception 'RUN_ID_REQUIRED'; end if;
  if p_input_hash is null or pg_catalog.btrim(p_input_hash) = '' then raise exception 'INPUT_HASH_REQUIRED'; end if;
  if p_input_hash !~ '^[a-f0-9]{64}$' then raise exception 'INPUT_HASH_INVALID'; end if;
  if p_rationale is null or pg_catalog.btrim(p_rationale) = '' then raise exception 'RATIONALE_REQUIRED'; end if;

  -- both endpoints must exist AND be approved (verification-only read of archive_graph_nodes)
  select (n.approval_status = 'approved'), n.archive_name, n.source_item_ids into v_from_ok, v_from_archive, v_from_sources
    from public.archive_graph_nodes n where n.id = p_from_node_id;
  if not found or v_from_ok is not true then raise exception 'FROM_NODE_NOT_APPROVED_OR_MISSING'; end if;
  select (n.approval_status = 'approved'), n.archive_name, n.source_item_ids into v_to_ok, v_to_archive, v_to_sources
    from public.archive_graph_nodes n where n.id = p_to_node_id;
  if not found or v_to_ok is not true then raise exception 'TO_NODE_NOT_APPROVED_OR_MISSING'; end if;
  if v_from_archive is distinct from v_to_archive then raise exception 'ARCHIVE_MISMATCH'; end if;

  -- (1) DB-boundary source-ref verification: compute the ACTUAL shared intersection from live
  -- node state; require the supplied refs to equal it exactly. The runner may propose, but the
  -- RPC proves the deterministic signal before recording.
  -- (2) exclude null/blank refs from both sides — a proposal is never justified by empty evidence
  select coalesce(array_agg(x order by x), '{}') into v_shared
    from (
      (select f.x from unnest(v_from_sources) as f(x) where f.x is not null and pg_catalog.btrim(f.x) <> '')
      intersect
      (select t.x from unnest(v_to_sources) as t(x) where t.x is not null and pg_catalog.btrim(t.x) <> '')
    ) s(x);
  if cardinality(v_shared) = 0 then raise exception 'SOURCE_REFS_NOT_SHARED'; end if;
  select coalesce(array_agg(distinct y order by y), '{}') into v_supplied
    from unnest(p_source_item_ids) u(y) where u.y is not null and pg_catalog.btrim(u.y) <> '';
  if v_supplied is distinct from v_shared then raise exception 'SOURCE_REFS_MISMATCH'; end if;

  -- skip if a shared_source edge already connects the pair in either direction (any approval_status)
  if exists (
    select 1 from public.archive_graph_edges e
     where e.edge_type = 'shared_source'
       and ((e.from_node_id = p_from_node_id and e.to_node_id = p_to_node_id)
         or (e.from_node_id = p_to_node_id and e.to_node_id = p_from_node_id))
  ) then
    return query select null::uuid, p_dedupe_key, false, 'existing_edge'::text; return;
  end if;

  -- skip if an active proposal already exists for this dedupe key + ownership
  if exists (
    select 1 from public.agent_graph_proposals p
     where p.dedupe_key = p_dedupe_key
       and p.test_owned = coalesce(p_allow_test_owned, false)
       and p.proposal_state = 'proposed' and p.deleted_at is null
  ) then
    return query select null::uuid, p_dedupe_key, false, 'duplicate_proposal'::text; return;
  end if;

  insert into public.agent_graph_proposals (
    target_graph, proposal_kind, edge_type, from_node_id, to_node_id, source_item_ids,
    dedupe_key, rule_id, run_id, input_hash, rationale, test_owned
  ) values (
    'archive_graph', 'edge', 'shared_source', p_from_node_id, p_to_node_id, v_shared,
    p_dedupe_key, 'shared_source_v1', p_run_id, p_input_hash, p_rationale, coalesce(p_allow_test_owned, false)
  )
  returning agent_graph_proposals.id into v_new_id;

  return query select v_new_id, p_dedupe_key, true, null::text;
end;
$$;
revoke all on function public.agent_graph_proposal_record(uuid, uuid, text[], text, uuid, text, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.agent_graph_proposal_record(uuid, uuid, text[], text, uuid, text, text, boolean) to service_role;

-- ─── LIST proposals (read) ────────────────────────────────────────────────────
create or replace function public.agent_graph_proposals_list(
  p_target_graph text,
  p_review_state text,
  p_include_test boolean
)
returns table (
  id uuid, target_graph text, edge_type text, from_node_id uuid, to_node_id uuid,
  source_item_ids text[], rule_id text, run_id uuid, rationale text,
  review_state text, reviewed_by text, reviewed_at timestamptz, created_at timestamptz
)
language sql security definer set search_path = pg_catalog, pg_temp stable
as $$
  select p.id, p.target_graph, p.edge_type, p.from_node_id, p.to_node_id, p.source_item_ids,
         p.rule_id, p.run_id, p.rationale, p.review_state, p.reviewed_by, p.reviewed_at, p.created_at
  from public.agent_graph_proposals p
  where p.deleted_at is null and p.proposal_state = 'proposed'
    and (coalesce(p_include_test, false) = true or p.test_owned = false)
    and (p_target_graph is null or p.target_graph = p_target_graph)
    and (p_review_state is null or p.review_state = p_review_state)
  order by p.created_at asc;
$$;
revoke all on function public.agent_graph_proposals_list(text, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.agent_graph_proposals_list(text, text, boolean) to service_role;

-- ─── SET review state (triage only; no graph-truth write) ─────────────────────
create or replace function public.agent_graph_proposal_set_review_state(
  p_proposal_id uuid,
  p_review_state text
)
returns table (id uuid, review_state text, reviewed_by text, reviewed_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_reviewed_by text := 'tara';   -- (3) server-derived; never caller-supplied
begin
  if p_review_state is null or p_review_state not in ('open', 'acknowledged', 'dismissed') then
    raise exception 'INVALID_REVIEW_STATE';
  end if;
  -- Content is IMMUTABLE after insert. This is the only UPDATE that touches a proposal, and it
  -- sets ONLY the triage fields (review_state / reviewed_by / reviewed_at). It never alters
  -- from/to node, edge_type, source_item_ids, dedupe_key, rule_id, run_id, input_hash,
  -- rationale, target_graph, proposal_kind, or the governance flags.
  return query
  update public.agent_graph_proposals p
     set review_state = p_review_state, reviewed_by = v_reviewed_by, reviewed_at = v_now
   where p.id = p_proposal_id and p.deleted_at is null
  returning p.id, p.review_state, p.reviewed_by, p.reviewed_at;
end;
$$;
revoke all on function public.agent_graph_proposal_set_review_state(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.agent_graph_proposal_set_review_state(uuid, text) to service_role;

-- ─── CLEANUP test-owned proposals (soft-delete; test only) ────────────────────
create or replace function public.agent_graph_proposals_cleanup_test(p_run_id uuid)
returns table (proposals_cleaned integer)
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare v_count integer;
begin
  update public.agent_graph_proposals p
     set deleted_at = now()
   where p.test_owned = true and p.deleted_at is null
     and (p_run_id is null or p.run_id = p_run_id);
  get diagnostics v_count = row_count;
  return query select v_count;
end;
$$;
revoke all on function public.agent_graph_proposals_cleanup_test(uuid) from public, anon, authenticated, service_role;
grant execute on function public.agent_graph_proposals_cleanup_test(uuid) to service_role;
