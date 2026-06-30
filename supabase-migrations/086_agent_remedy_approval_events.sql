-- Phase 42.3.4b — agent_remedy_approval_events (Tara APPROVAL AUTHORITY EVENTS; append-only; STILL NOT HANDS)
--
-- Tara's approval of a remedy plan is an AUTHORITY EVENT, recorded append-only and kept
-- separate from the remedy representation (agent_remedy_plans is NOT given an approval
-- lifecycle). Current approval status is DERIVED from the event stream (latest by
-- event_sequence). Approval means "authorised for future apply consideration" — it does
-- NOT apply, queue, schedule, or guarantee anything will ever run. This migration adds NO
-- apply RPC, NO apply route, NO apply worker, NO rollback RPC, NO scheduler, NO queue.
--
-- Additive. No change to agent_remedy_plans. Sibling table only.
--
-- Run via: Supabase SQL Editor -> paste -> Run. Success = "No rows returned".
--
-- Rollback notes (manual):
--   drop function if exists public.agent_remedy_approval_events_cleanup_test(uuid);
--   drop function if exists public.agent_remedy_approvals_list(uuid, boolean);
--   drop function if exists public.agent_remedy_approval_record(uuid, text, text, boolean);
--   drop table if exists public.agent_remedy_approval_events;

-- ─── Table (append-only) ───────────────────────────────────────────────────────
create table if not exists public.agent_remedy_approval_events (
  id uuid primary key default gen_random_uuid(),
  event_sequence bigint generated always as identity,   -- deterministic ordering
  remedy_plan_id uuid not null,
  decision text not null,
  decided_by text not null,                              -- RPC-hardcoded 'tara'; never client-supplied
  decision_reason text,                                  -- optional in v1
  verified_current_value jsonb,                          -- approved: actual title at decision; else null
  verified_proposed_value jsonb,                         -- approved: btrim(actual,' '); else null
  -- governance flag-locks: an APPROVAL is an authority DECISION, but moves NO House authority field
  is_authority_event boolean not null default true,
  authority_changed boolean not null default false,
  not_memory boolean not null default true,
  not_evidence boolean not null default true,
  is_graph_proposal boolean not null default false,
  is_helper_output boolean not null default false,
  is_apply_instruction boolean not null default false,
  is_queued_work boolean not null default false,
  prompt_eligible boolean not null default false,
  test_owned boolean not null default false,             -- derived from parent plan; never client-supplied
  created_at timestamptz not null default now(),
  deleted_at timestamptz,                                -- test cleanup only

  constraint arae_event_sequence_unique unique (event_sequence),
  constraint arae_decision_vocab check (decision in ('approved', 'rejected', 'revoked')),
  constraint arae_decided_by_nonblank check (pg_catalog.btrim(decided_by) <> ''),
  constraint arae_reason_nonblank check (decision_reason is null or pg_catalog.btrim(decision_reason) <> ''),
  -- approved => both snapshots present AND JSON strings; non-approved => both null
  constraint arae_snapshots_by_decision check (
    (decision = 'approved'
       and jsonb_typeof(verified_current_value) = 'string'
       and jsonb_typeof(verified_proposed_value) = 'string')
    or (decision <> 'approved'
       and verified_current_value is null
       and verified_proposed_value is null)
  ),
  constraint arae_is_authority_event check (is_authority_event = true),
  constraint arae_authority_changed check (authority_changed = false),
  constraint arae_not_memory check (not_memory = true),
  constraint arae_not_evidence check (not_evidence = true),
  constraint arae_is_graph_proposal check (is_graph_proposal = false),
  constraint arae_is_helper_output check (is_helper_output = false),
  constraint arae_is_apply_instruction check (is_apply_instruction = false),
  constraint arae_is_queued_work check (is_queued_work = false),
  constraint arae_prompt_eligible check (prompt_eligible = false),
  constraint arae_plan_fk foreign key (remedy_plan_id) references public.agent_remedy_plans (id)
);

create index if not exists agent_remedy_approval_events_plan_idx
  on public.agent_remedy_approval_events (remedy_plan_id, event_sequence)
  where deleted_at is null;

-- ─── Deny-by-default RLS ───────────────────────────────────────────────────────
alter table public.agent_remedy_approval_events enable row level security;
revoke all on table public.agent_remedy_approval_events from public, anon, authenticated, service_role;
-- No policies, no direct table DML grants. All access via the SECURITY DEFINER RPCs below.

-- ─── RECORD an approval authority event (the ONLY write; NOT an apply) ─────────
create or replace function public.agent_remedy_approval_record(
  p_remedy_plan_id uuid,
  p_decision text,
  p_decision_reason text,
  p_allow_test_owned boolean default false
)
returns table (
  id uuid,
  event_sequence bigint,
  remedy_plan_id uuid,
  decision text,
  decided_by text,
  created_at timestamptz,
  derived_status text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_decided_by text := 'tara';   -- server-derived; never client-supplied
  v_plan_state text;
  v_action text;
  v_ttable text;
  v_tfield text;
  v_tid text;
  v_curr jsonb;
  v_prop jsonb;
  v_plan_test boolean;
  v_plan_deleted timestamptz;
  v_actual_title text;
  v_current_status text;
  v_vc jsonb := null;
  v_vp jsonb := null;
begin
  if p_decision is null or p_decision not in ('approved', 'rejected', 'revoked') then
    raise exception 'INVALID_DECISION';
  end if;
  if p_decision_reason is not null and pg_catalog.btrim(p_decision_reason) = '' then
    raise exception 'DECISION_REASON_BLANK';
  end if;

  -- load the remedy plan WITH a transaction-scoped row lock (FOR UPDATE). This serialises
  -- concurrent approval decisions for the same plan: a second request blocks until the first
  -- commits, then re-reads the latest event so the transition guards below are race-safe (no
  -- double-approve from a double-click/race). The lock is on the AGENT-side plan row only —
  -- it mutates no House source surface and adds no mutable approval columns.
  select r.plan_state, r.action_type, r.target_table, r.target_field, r.target_id,
         r.current_value, r.proposed_value, r.test_owned, r.deleted_at
    into v_plan_state, v_action, v_ttable, v_tfield, v_tid,
         v_curr, v_prop, v_plan_test, v_plan_deleted
    from public.agent_remedy_plans r where r.id = p_remedy_plan_id
    for update;
  if not found or v_plan_deleted is not null then
    raise exception 'PLAN_NOT_FOUND_OR_DELETED';
  end if;

  -- structural test-owned gate: normal route passes false; only the smoke may pass true
  if v_plan_test = true and coalesce(p_allow_test_owned, false) = false then
    raise exception 'TEST_OWNED_NOT_ALLOWED';
  end if;

  -- derive current status: latest event by event_sequence (non-deleted)
  select e.decision into v_current_status
    from public.agent_remedy_approval_events e
   where e.remedy_plan_id = p_remedy_plan_id and e.deleted_at is null
   order by e.event_sequence desc
   limit 1;
  v_current_status := coalesce(v_current_status, 'none');

  -- transition guards
  if p_decision = 'revoked' and v_current_status <> 'approved' then
    raise exception 'REVOKE_NOT_APPROVED';
  end if;
  if p_decision = 'approved' and v_current_status = 'approved' then
    raise exception 'ALREADY_APPROVED';
  end if;
  if p_decision = 'rejected' and v_current_status = 'approved' then
    raise exception 'REVOKE_REQUIRED';
  end if;

  -- approve: re-verify against reality (drift). reject/revoke do NOT revalidate drift.
  if p_decision = 'approved' then
    if v_plan_state <> 'proposed' then
      raise exception 'PLAN_NOT_PROPOSED';
    end if;
    if v_action <> 'library_title_trim' or v_ttable <> 'library_items' or v_tfield <> 'title' then
      raise exception 'PLAN_NOT_ELIGIBLE';
    end if;
    select li.title into v_actual_title
      from public.library_items li
     where li.id::text = v_tid;
    if not found then
      raise exception 'TARGET_ROW_NOT_FOUND';
    end if;
    if (v_curr #>> '{}') is distinct from v_actual_title then
      raise exception 'STALE_PLAN_CURRENT_DRIFT';
    end if;
    if (v_prop #>> '{}') <> pg_catalog.btrim(v_actual_title, ' ') then
      raise exception 'STALE_PLAN_PROPOSED_DRIFT';
    end if;
    v_vc := to_jsonb(v_actual_title);
    v_vp := to_jsonb(pg_catalog.btrim(v_actual_title, ' '));
  end if;

  -- append the authority event (this becomes the latest → derived status = p_decision)
  return query
  insert into public.agent_remedy_approval_events (
    remedy_plan_id, decision, decided_by, decision_reason,
    verified_current_value, verified_proposed_value, test_owned
  ) values (
    p_remedy_plan_id, p_decision, v_decided_by, p_decision_reason,
    v_vc, v_vp, v_plan_test
  )
  returning
    agent_remedy_approval_events.id,
    agent_remedy_approval_events.event_sequence,
    agent_remedy_approval_events.remedy_plan_id,
    agent_remedy_approval_events.decision,
    agent_remedy_approval_events.decided_by,
    agent_remedy_approval_events.created_at,
    agent_remedy_approval_events.decision;   -- derived_status (newest event = current)
end;
$$;
revoke all on function public.agent_remedy_approval_record(uuid, text, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.agent_remedy_approval_record(uuid, text, text, boolean) to service_role;

-- ─── LIST approval events (read) ──────────────────────────────────────────────
create or replace function public.agent_remedy_approvals_list(
  p_remedy_plan_id uuid,
  p_include_test boolean
)
returns table (
  id uuid,
  event_sequence bigint,
  remedy_plan_id uuid,
  decision text,
  decided_by text,
  decision_reason text,
  verified_current_value jsonb,
  verified_proposed_value jsonb,
  created_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, pg_temp
stable
as $$
  select e.id, e.event_sequence, e.remedy_plan_id, e.decision, e.decided_by, e.decision_reason,
         e.verified_current_value, e.verified_proposed_value, e.created_at
  from public.agent_remedy_approval_events e
  where e.deleted_at is null
    and (coalesce(p_include_test, false) = true or e.test_owned = false)
    and (p_remedy_plan_id is null or e.remedy_plan_id = p_remedy_plan_id)
  order by e.event_sequence asc;
$$;
revoke all on function public.agent_remedy_approvals_list(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.agent_remedy_approvals_list(uuid, boolean) to service_role;

-- ─── CLEANUP test-owned approval events (soft-delete; test only) ──────────────
create or replace function public.agent_remedy_approval_events_cleanup_test(p_remedy_plan_id uuid)
returns table (events_cleaned integer)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_count integer;
begin
  update public.agent_remedy_approval_events e
     set deleted_at = now()
   where e.test_owned = true
     and e.deleted_at is null
     and (p_remedy_plan_id is null or e.remedy_plan_id = p_remedy_plan_id);
  get diagnostics v_count = row_count;
  return query select v_count;
end;
$$;
revoke all on function public.agent_remedy_approval_events_cleanup_test(uuid) from public, anon, authenticated, service_role;
grant execute on function public.agent_remedy_approval_events_cleanup_test(uuid) to service_role;
