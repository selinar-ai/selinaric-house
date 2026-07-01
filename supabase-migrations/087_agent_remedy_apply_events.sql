-- Phase 42.3.4c — agent_remedy_apply_events (THE HAND: the kernel's first House-source write)
--
-- The apply/rollback RPCs below are the ONLY place in the entire kernel that writes to a
-- House source surface (`library_items.title`, one row, one field, `library_title_trim` only).
-- Each writes exactly one conditional single row and records ONE append-only audit event
-- flagged `house_source_write=true`. `agent_remedy_apply_events` is REAL-ONLY: apply/rollback
-- hard-refuse `test_owned` plans, so no test event can ever exist — hence no `test_owned`
-- column, no `deleted_at`, no cleanup RPC, no UPDATE path, no DELETE. Truly append-only.
--
-- Trigger is CLI-ONLY (scripts/agent-remedy-apply.ts / -rollback.ts). NO route, NO UI apply
-- button, NO daemon, NO worker loop, NO scheduler, NO queue, NO batch, NO apply-all, NO LLM.
-- Approval-time revalidation (42.3.4b) is NOT sufficient; apply revalidates again here.
--
-- Additive. No change to agent_remedy_plans / agent_remedy_approval_events (sibling table).
-- The apply/rollback RPCs are SECURITY DEFINER (owned by the migration role), so they hold
-- the UPDATE privilege on library_items and bypass its (open) RLS — the write is confined to
-- the hard-scoped, conditional single-row statement inside each function.
--
-- BEFORE APPLYING THIS MIGRATION: run `node scripts/scan-dangerous-ops.mjs`.
-- Run via: Supabase SQL Editor -> paste -> Run. Success = "No rows returned".
--
-- Rollback notes (manual):
--   drop function if exists public.agent_remedy_apply_events_list(uuid);
--   drop function if exists public.agent_remedy_apply_validate(uuid);
--   drop function if exists public.agent_remedy_rollback(uuid);
--   drop function if exists public.agent_remedy_apply(uuid);
--   drop table if exists public.agent_remedy_apply_events;

-- ─── Table (real-only, append-only) ───────────────────────────────────────────
create table if not exists public.agent_remedy_apply_events (
  id uuid primary key default gen_random_uuid(),
  event_sequence bigint generated always as identity,
  remedy_plan_id uuid not null,
  approval_event_id uuid,            -- applied only (the approved event that authorised it)
  reverses_apply_event_id uuid,      -- rolled_back only (the applied event it reverses)
  outcome text not null,
  before_value jsonb not null,       -- title before this op
  after_value jsonb not null,        -- title after this op
  verified_current_value jsonb not null,  -- actual title read immediately before the write
  acted_by text not null,            -- RPC-hardcoded 'tara'
  is_apply_event boolean not null default true,
  house_source_write boolean not null default true,  -- honest: a House source surface WAS written
  authority_changed boolean not null default false,  -- title is descriptive, not a House authority field
  not_memory boolean not null default true,
  not_evidence boolean not null default true,
  is_graph_proposal boolean not null default false,
  is_helper_output boolean not null default false,
  prompt_eligible boolean not null default false,
  is_queued_work boolean not null default false,
  created_at timestamptz not null default now(),

  constraint aae_event_sequence_unique unique (event_sequence),
  constraint aae_outcome_vocab check (outcome in ('applied', 'rolled_back')),
  constraint aae_values_are_strings check (
    jsonb_typeof(before_value) = 'string'
    and jsonb_typeof(after_value) = 'string'
    and jsonb_typeof(verified_current_value) = 'string'
  ),
  constraint aae_acted_by_nonblank check (pg_catalog.btrim(acted_by) <> ''),
  constraint aae_is_apply_event check (is_apply_event = true),
  constraint aae_house_source_write check (house_source_write = true),
  constraint aae_authority_changed check (authority_changed = false),
  constraint aae_not_memory check (not_memory = true),
  constraint aae_not_evidence check (not_evidence = true),
  constraint aae_is_graph_proposal check (is_graph_proposal = false),
  constraint aae_is_helper_output check (is_helper_output = false),
  constraint aae_prompt_eligible check (prompt_eligible = false),
  constraint aae_is_queued_work check (is_queued_work = false),
  -- provenance: applied ⇒ approval_event_id set & reverses null; rolled_back ⇒ reverses set & approval null
  constraint aae_provenance check (
    (outcome = 'applied' and approval_event_id is not null and reverses_apply_event_id is null)
    or (outcome = 'rolled_back' and reverses_apply_event_id is not null and approval_event_id is null)
  ),
  constraint aae_plan_fk foreign key (remedy_plan_id) references public.agent_remedy_plans (id),
  constraint aae_approval_fk foreign key (approval_event_id) references public.agent_remedy_approval_events (id),
  constraint aae_reverses_fk foreign key (reverses_apply_event_id) references public.agent_remedy_apply_events (id)
);

create index if not exists agent_remedy_apply_events_plan_idx
  on public.agent_remedy_apply_events (remedy_plan_id, event_sequence);

-- ─── Deny-by-default RLS ───────────────────────────────────────────────────────
alter table public.agent_remedy_apply_events enable row level security;
revoke all on table public.agent_remedy_apply_events from public, anon, authenticated, service_role;
-- No policies, no direct table DML grants. All access via the SECURITY DEFINER RPCs below.

-- ─── APPLY (the ONLY House-write path) ────────────────────────────────────────
create or replace function public.agent_remedy_apply(p_remedy_plan_id uuid)
returns table (
  id uuid,
  event_sequence bigint,
  remedy_plan_id uuid,
  outcome text,
  before_value jsonb,
  after_value jsonb,
  acted_by text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_acted_by text := 'tara';   -- server-derived; never client-supplied
  v_plan_state text;
  v_action text;
  v_ttable text;
  v_tfield text;
  v_tid text;
  v_curr jsonb;
  v_prop jsonb;
  v_plan_test boolean;
  v_plan_deleted timestamptz;
  v_approval_status text;
  v_approval_event_id uuid;
  v_apply_status text;
  v_actual_title text;
  v_rows integer;
begin
  -- (1) lock the plan row FOR UPDATE (serialise before deriving status)
  select r.plan_state, r.action_type, r.target_table, r.target_field, r.target_id,
         r.current_value, r.proposed_value, r.test_owned, r.deleted_at
    into v_plan_state, v_action, v_ttable, v_tfield, v_tid, v_curr, v_prop, v_plan_test, v_plan_deleted
    from public.agent_remedy_plans r where r.id = p_remedy_plan_id
    for update;
  if not found or v_plan_deleted is not null then
    raise exception 'PLAN_NOT_FOUND_OR_DELETED';
  end if;
  -- (2) a test-owned plan may NEVER write a House source surface
  if v_plan_test = true then
    raise exception 'TEST_OWNED_NO_WRITE';
  end if;
  -- (3) eligibility / exact v1 whitelist
  if v_plan_state <> 'proposed' then
    raise exception 'PLAN_NOT_PROPOSED';
  end if;
  if v_action <> 'library_title_trim' or v_ttable <> 'library_items' or v_tfield <> 'title' then
    raise exception 'PLAN_NOT_ELIGIBLE';
  end if;
  -- (4) derive current approval status (latest by event_sequence); capture the approved event
  select e.decision, e.id into v_approval_status, v_approval_event_id
    from public.agent_remedy_approval_events e
   where e.remedy_plan_id = p_remedy_plan_id and e.deleted_at is null
   order by e.event_sequence desc
   limit 1;
  if coalesce(v_approval_status, 'none') <> 'approved' then
    raise exception 'NOT_APPROVED';
  end if;
  -- (5) derive current apply status (latest by event_sequence); refuse if already applied
  select a.outcome into v_apply_status
    from public.agent_remedy_apply_events a
   where a.remedy_plan_id = p_remedy_plan_id
   order by a.event_sequence desc
   limit 1;
  if v_apply_status = 'applied' then
    raise exception 'ALREADY_APPLIED';
  end if;
  -- (6) apply-time revalidation vs reality
  select li.title into v_actual_title
    from public.library_items li where li.id::text = v_tid;
  if not found then
    raise exception 'TARGET_ROW_NOT_FOUND';
  end if;
  if (v_curr #>> '{}') is distinct from v_actual_title then
    raise exception 'CURRENT_DRIFT';
  end if;
  if (v_prop #>> '{}') <> pg_catalog.btrim(v_actual_title, ' ') then
    raise exception 'PROPOSED_DRIFT';
  end if;
  -- (7) THE WRITE — conditional single row (optimistic concurrency on the current title)
  update public.library_items li
     set title = (v_prop #>> '{}')
   where li.id::text = v_tid and li.title = v_actual_title;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'WRITE_CONFLICT';
  end if;
  -- (8) record the apply event (append-only) in the SAME transaction
  return query
  insert into public.agent_remedy_apply_events (
    remedy_plan_id, approval_event_id, reverses_apply_event_id, outcome,
    before_value, after_value, verified_current_value, acted_by, house_source_write
  ) values (
    p_remedy_plan_id, v_approval_event_id, null, 'applied',
    to_jsonb(v_actual_title), v_prop, to_jsonb(v_actual_title), v_acted_by, true
  )
  returning
    agent_remedy_apply_events.id, agent_remedy_apply_events.event_sequence,
    agent_remedy_apply_events.remedy_plan_id, agent_remedy_apply_events.outcome,
    agent_remedy_apply_events.before_value, agent_remedy_apply_events.after_value,
    agent_remedy_apply_events.acted_by, agent_remedy_apply_events.created_at;
end;
$$;
revoke all on function public.agent_remedy_apply(uuid) from public, anon, authenticated, service_role;
grant execute on function public.agent_remedy_apply(uuid) to service_role;

-- ─── ROLLBACK (restores the exact prior value) ────────────────────────────────
create or replace function public.agent_remedy_rollback(p_remedy_plan_id uuid)
returns table (
  id uuid,
  event_sequence bigint,
  remedy_plan_id uuid,
  outcome text,
  before_value jsonb,
  after_value jsonb,
  acted_by text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_acted_by text := 'tara';
  v_tid text;
  v_plan_test boolean;
  v_plan_deleted timestamptz;
  v_apply_status text;
  v_applied_event_id uuid;
  v_applied_after jsonb;
  v_applied_before jsonb;
  v_actual_title text;
  v_rows integer;
begin
  -- (1) lock the plan row FOR UPDATE
  select r.target_id, r.test_owned, r.deleted_at
    into v_tid, v_plan_test, v_plan_deleted
    from public.agent_remedy_plans r where r.id = p_remedy_plan_id
    for update;
  if not found or v_plan_deleted is not null then
    raise exception 'PLAN_NOT_FOUND_OR_DELETED';
  end if;
  if v_plan_test = true then
    raise exception 'TEST_OWNED_NO_WRITE';
  end if;
  -- (2) latest apply status must be 'applied'; identify the applied event to reverse
  select a.id, a.outcome, a.after_value, a.before_value
    into v_applied_event_id, v_apply_status, v_applied_after, v_applied_before
    from public.agent_remedy_apply_events a
   where a.remedy_plan_id = p_remedy_plan_id
   order by a.event_sequence desc
   limit 1;
  if coalesce(v_apply_status, 'none') <> 'applied' then
    raise exception 'NOT_APPLIED';
  end if;
  -- (3) rollback-time revalidation: current title must equal the applied after_value
  select li.title into v_actual_title
    from public.library_items li where li.id::text = v_tid;
  if not found then
    raise exception 'TARGET_ROW_NOT_FOUND';
  end if;
  if v_actual_title is distinct from (v_applied_after #>> '{}') then
    raise exception 'ROLLBACK_DRIFT';
  end if;
  -- (4) restore the exact before_value — conditional single row
  update public.library_items li
     set title = (v_applied_before #>> '{}')
   where li.id::text = v_tid and li.title = v_actual_title;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'ROLLBACK_WRITE_CONFLICT';
  end if;
  -- (5) record the rollback event referencing the applied event it reverses
  return query
  insert into public.agent_remedy_apply_events (
    remedy_plan_id, approval_event_id, reverses_apply_event_id, outcome,
    before_value, after_value, verified_current_value, acted_by, house_source_write
  ) values (
    p_remedy_plan_id, null, v_applied_event_id, 'rolled_back',
    v_applied_after, v_applied_before, to_jsonb(v_actual_title), v_acted_by, true
  )
  returning
    agent_remedy_apply_events.id, agent_remedy_apply_events.event_sequence,
    agent_remedy_apply_events.remedy_plan_id, agent_remedy_apply_events.outcome,
    agent_remedy_apply_events.before_value, agent_remedy_apply_events.after_value,
    agent_remedy_apply_events.acted_by, agent_remedy_apply_events.created_at;
end;
$$;
revoke all on function public.agent_remedy_rollback(uuid) from public, anon, authenticated, service_role;
grant execute on function public.agent_remedy_rollback(uuid) to service_role;

-- ─── VALIDATE APPLY READINESS (preflight; READ-ONLY; writes nothing) ──────────
-- Runs the apply-time revalidation checks and RETURNS the result. Records no event,
-- performs no library_items update, sets no house_source_write, reserves/queues nothing.
create or replace function public.agent_remedy_apply_validate(p_remedy_plan_id uuid)
returns table (ready boolean, reason text, current_value jsonb, proposed_value jsonb)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
stable
as $$
declare
  v_plan_state text;
  v_action text;
  v_ttable text;
  v_tfield text;
  v_tid text;
  v_curr jsonb;
  v_prop jsonb;
  v_plan_test boolean;
  v_plan_deleted timestamptz;
  v_approval_status text;
  v_apply_status text;
  v_actual_title text;
begin
  select r.plan_state, r.action_type, r.target_table, r.target_field, r.target_id,
         r.current_value, r.proposed_value, r.test_owned, r.deleted_at
    into v_plan_state, v_action, v_ttable, v_tfield, v_tid, v_curr, v_prop, v_plan_test, v_plan_deleted
    from public.agent_remedy_plans r where r.id = p_remedy_plan_id;
  if not found or v_plan_deleted is not null then
    return query select false, 'PLAN_NOT_FOUND_OR_DELETED'::text, null::jsonb, null::jsonb; return;
  end if;
  if v_plan_test = true then
    return query select false, 'TEST_OWNED_NO_WRITE'::text, null::jsonb, null::jsonb; return;
  end if;
  if v_plan_state <> 'proposed' then
    return query select false, 'PLAN_NOT_PROPOSED'::text, v_curr, v_prop; return;
  end if;
  if v_action <> 'library_title_trim' or v_ttable <> 'library_items' or v_tfield <> 'title' then
    return query select false, 'PLAN_NOT_ELIGIBLE'::text, v_curr, v_prop; return;
  end if;
  select e.decision into v_approval_status
    from public.agent_remedy_approval_events e
   where e.remedy_plan_id = p_remedy_plan_id and e.deleted_at is null
   order by e.event_sequence desc limit 1;
  if coalesce(v_approval_status, 'none') <> 'approved' then
    return query select false, 'NOT_APPROVED'::text, v_curr, v_prop; return;
  end if;
  select a.outcome into v_apply_status
    from public.agent_remedy_apply_events a
   where a.remedy_plan_id = p_remedy_plan_id
   order by a.event_sequence desc limit 1;
  if v_apply_status = 'applied' then
    return query select false, 'ALREADY_APPLIED'::text, v_curr, v_prop; return;
  end if;
  select li.title into v_actual_title
    from public.library_items li where li.id::text = v_tid;
  if not found then
    return query select false, 'TARGET_ROW_NOT_FOUND'::text, v_curr, v_prop; return;
  end if;
  if (v_curr #>> '{}') is distinct from v_actual_title then
    return query select false, 'CURRENT_DRIFT'::text, v_curr, v_prop; return;
  end if;
  if (v_prop #>> '{}') <> pg_catalog.btrim(v_actual_title, ' ') then
    return query select false, 'PROPOSED_DRIFT'::text, v_curr, v_prop; return;
  end if;
  return query select true, 'READY'::text, v_curr, v_prop;
end;
$$;
revoke all on function public.agent_remedy_apply_validate(uuid) from public, anon, authenticated, service_role;
grant execute on function public.agent_remedy_apply_validate(uuid) to service_role;

-- ─── LIST apply events (read; for CLI verification + first-real-apply) ─────────
create or replace function public.agent_remedy_apply_events_list(p_remedy_plan_id uuid)
returns table (
  id uuid,
  event_sequence bigint,
  remedy_plan_id uuid,
  approval_event_id uuid,
  reverses_apply_event_id uuid,
  outcome text,
  before_value jsonb,
  after_value jsonb,
  acted_by text,
  created_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, pg_temp
stable
as $$
  select a.id, a.event_sequence, a.remedy_plan_id, a.approval_event_id, a.reverses_apply_event_id,
         a.outcome, a.before_value, a.after_value, a.acted_by, a.created_at
  from public.agent_remedy_apply_events a
  where (p_remedy_plan_id is null or a.remedy_plan_id = p_remedy_plan_id)
  order by a.event_sequence asc;
$$;
revoke all on function public.agent_remedy_apply_events_list(uuid) from public, anon, authenticated, service_role;
grant execute on function public.agent_remedy_apply_events_list(uuid) to service_role;
