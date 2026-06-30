-- Phase 42.3.4a — agent_remedy_plans (remedy REPRESENTATION only; EXECUTION-INCAPABLE)
--
-- The first step toward the kernel's first hand. A remedy plan is a deterministic,
-- declarative description of ONE whitelisted change + its exact recorded inverse. It is
-- NEVER an apply instruction and NEVER applied here. This migration adds NO apply RPC,
-- NO approval RPC, NO rollback RPC, NO worker — and the table physically cannot record
-- an approval or an apply (no such columns or states exist).
--
-- Additive. No change to agent_findings. Sibling table only.
--
-- v1 is hard-whitelisted to a single action: trim surrounding whitespace from
-- library_items.title. Nothing else is representable.
--
-- Run via: Supabase SQL Editor -> paste -> Run. Success = "No rows returned".
--
-- Rollback notes (manual):
--   drop function if exists public.agent_remedy_plans_cleanup_test(uuid);
--   drop function if exists public.agent_remedy_plans_list(uuid, boolean);
--   drop function if exists public.agent_remedy_plan_record(uuid, text, jsonb, jsonb, text, boolean);
--   drop function if exists public.agent_remedy_plans_set_updated_at();
--   drop table if exists public.agent_remedy_plans;

-- ─── Table ───────────────────────────────────────────────────────────────────
create table if not exists public.agent_remedy_plans (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null,
  domain text not null,
  action_type text not null,
  target_table text not null,
  target_id text not null,
  target_field text not null,
  current_value jsonb not null,      -- exact prior value (the recorded inverse)
  proposed_value jsonb not null,     -- exact deterministic new value
  deterministic_reason text not null,
  plan_state text not null default 'proposed',
  -- governance flag-locks: a remedy plan is representation, never authority or an act
  not_memory boolean not null default true,
  not_evidence boolean not null default true,
  not_authority boolean not null default true,
  authority_changed boolean not null default false,
  prompt_eligible boolean not null default false,
  is_queued_work boolean not null default false,
  is_graph_proposal boolean not null default false,
  is_helper_output boolean not null default false,
  is_apply_instruction boolean not null default false,
  test_owned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,

  -- (amendment 1) EXACT v1 positive whitelist — only library_title_trim is representable
  constraint arp_v1_action_whitelist check (
    domain = 'library'
    and action_type = 'library_title_trim'
    and target_table = 'library_items'
    and target_field = 'title'
  ),
  -- single-column FK to the durable finding (agent_findings has no unique(id,domain);
  -- domain/issue_code/target consistency is enforced by the record RPC, which is stricter
  -- than a composite FK — it also verifies issue_code and target_id).
  constraint arp_finding_fk foreign key (finding_id) references public.agent_findings (id),
  -- (amendment 7) lifecycle states — proposed / superseded ONLY
  constraint arp_plan_state_vocab check (plan_state in ('proposed', 'superseded')),
  -- (amendment 4) value constraints (DB-level)
  constraint arp_values_are_strings check (
    jsonb_typeof(current_value) = 'string' and jsonb_typeof(proposed_value) = 'string'
  ),
  -- v1 trim is surrounding ASCII-SPACE only — btrim(x, ' ') is byte-exact with the
  -- shared trimSurroundingSpaces() helper used by the detector and builder.
  constraint arp_proposed_is_trim check (
    (proposed_value #>> '{}') = pg_catalog.btrim(current_value #>> '{}', ' ')
  ),
  constraint arp_proposed_nonempty check ((proposed_value #>> '{}') <> ''),
  constraint arp_values_differ check (current_value is distinct from proposed_value),
  -- (amendment 2) deterministic_reason must never be null or blank
  constraint arp_reason_nonblank check (pg_catalog.btrim(deterministic_reason) <> ''),
  -- (amendment 6) governance flag-locks (CHECK-locked to the safe constants)
  constraint arp_not_memory_locked check (not_memory = true),
  constraint arp_not_evidence_locked check (not_evidence = true),
  constraint arp_not_authority_locked check (not_authority = true),
  constraint arp_authority_changed_locked check (authority_changed = false),
  constraint arp_prompt_eligible_locked check (prompt_eligible = false),
  constraint arp_is_queued_work_locked check (is_queued_work = false),
  constraint arp_is_graph_proposal_locked check (is_graph_proposal = false),
  constraint arp_is_helper_output_locked check (is_helper_output = false),
  constraint arp_is_apply_instruction_locked check (is_apply_instruction = false)
);

-- (amendment 5) active-only uniqueness: at most one active PROPOSED plan per
-- finding/action/test-ownership. Superseded or soft-deleted rows never block a new one.
create unique index if not exists agent_remedy_plans_active_proposed_idx
  on public.agent_remedy_plans (finding_id, action_type, test_owned)
  where deleted_at is null and plan_state = 'proposed';

-- ─── Deny-by-default RLS ───────────────────────────────────────────────────────
alter table public.agent_remedy_plans enable row level security;
revoke all on table public.agent_remedy_plans from public, anon, authenticated, service_role;
-- No policies, no direct table DML grants. All access is via the SECURITY DEFINER RPCs below.

-- ─── updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.agent_remedy_plans_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.agent_remedy_plans_set_updated_at() from public, anon, authenticated, service_role;

create trigger agent_remedy_plans_updated_at
  before update on public.agent_remedy_plans
  for each row execute function public.agent_remedy_plans_set_updated_at();

-- ─── RECORD a remedy plan (the ONLY write; NOT an apply) ──────────────────────
-- (amendments 2 & 3) verifies the finding exists, is not deleted, and is the expected
-- library / item_title_untrimmed / library_items finding whose target_id matches.
-- Supersedes any prior active proposed plan for the same finding/action/test-ownership,
-- then inserts the new proposed plan. Records NOTHING about approval or apply.
create or replace function public.agent_remedy_plan_record(
  p_finding_id uuid,
  p_target_id text,
  p_current_value jsonb,
  p_proposed_value jsonb,
  p_deterministic_reason text,
  p_test_owned boolean
)
returns table (
  id uuid,
  finding_id uuid,
  action_type text,
  target_table text,
  target_field text,
  plan_state text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_domain text;
  v_issue_code text;
  v_target_table text;
  v_target_id text;
  v_deleted_at timestamptz;
  v_actual_title text;
begin
  -- (1) finding exists and is not deleted
  select f.domain, f.issue_code, f.target_table, f.target_id, f.deleted_at
    into v_domain, v_issue_code, v_target_table, v_target_id, v_deleted_at
    from public.agent_findings f where f.id = p_finding_id;
  if not found or v_deleted_at is not null then
    raise exception 'FINDING_NOT_FOUND_OR_DELETED';
  end if;
  -- (2) finding is the eligible library / item_title_untrimmed / library_items finding
  if v_domain <> 'library'
     or v_issue_code <> 'item_title_untrimmed'
     or v_target_table <> 'library_items' then
    raise exception 'FINDING_NOT_ELIGIBLE';
  end if;
  -- (3) the plan targets the same row the finding points to
  if v_target_id <> p_target_id then
    raise exception 'TARGET_MISMATCH';
  end if;
  -- (4) both supplied values are JSON strings
  if jsonb_typeof(p_current_value) <> 'string' or jsonb_typeof(p_proposed_value) <> 'string' then
    raise exception 'VALUES_MUST_BE_STRINGS';
  end if;
  -- (5) deterministic_reason is present
  if p_deterministic_reason is null or pg_catalog.btrim(p_deterministic_reason) = '' then
    raise exception 'DETERMINISTIC_REASON_BLANK';
  end if;
  -- (6) read the ACTUAL target row title — VERIFICATION ONLY (read, never write). This
  --     makes the recorded inverse trustworthy at the DB boundary, not caller-supplied.
  select li.title into v_actual_title
    from public.library_items li
   where li.id::text = p_target_id;
  if not found then
    raise exception 'TARGET_ROW_NOT_FOUND';
  end if;
  -- (7) the supplied current_value must equal the actual stored title (the true inverse)
  if (p_current_value #>> '{}') is distinct from v_actual_title then
    raise exception 'CURRENT_VALUE_MISMATCH';
  end if;
  -- (8) proposed must be the ASCII-space trim of the ACTUAL title
  if (p_proposed_value #>> '{}') <> pg_catalog.btrim(v_actual_title, ' ') then
    raise exception 'PROPOSED_NOT_TRIM_OF_TARGET';
  end if;
  -- (9) never propose an empty title
  if (p_proposed_value #>> '{}') = '' then
    raise exception 'PROPOSED_EMPTY';
  end if;
  -- (10) a change must actually exist (the actual title had surrounding ASCII spaces)
  if (p_proposed_value #>> '{}') = v_actual_title then
    raise exception 'NO_CHANGE';
  end if;

  -- supersede any prior active proposed plan for this finding/action/test-ownership
  update public.agent_remedy_plans r
     set plan_state = 'superseded'
   where r.finding_id = p_finding_id
     and r.action_type = 'library_title_trim'
     and r.test_owned = coalesce(p_test_owned, false)
     and r.plan_state = 'proposed'
     and r.deleted_at is null;

  return query
  insert into public.agent_remedy_plans (
    finding_id, domain, action_type, target_table, target_id, target_field,
    current_value, proposed_value, deterministic_reason, plan_state, test_owned
  ) values (
    p_finding_id, 'library', 'library_title_trim', 'library_items', p_target_id, 'title',
    p_current_value, p_proposed_value, p_deterministic_reason, 'proposed', coalesce(p_test_owned, false)
  )
  returning agent_remedy_plans.id, agent_remedy_plans.finding_id, agent_remedy_plans.action_type,
            agent_remedy_plans.target_table, agent_remedy_plans.target_field, agent_remedy_plans.plan_state;
end;
$$;
revoke all on function public.agent_remedy_plan_record(uuid, text, jsonb, jsonb, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.agent_remedy_plan_record(uuid, text, jsonb, jsonb, text, boolean) to service_role;

-- ─── LIST remedy plans (read) ─────────────────────────────────────────────────
create or replace function public.agent_remedy_plans_list(
  p_finding_id uuid,
  p_include_test boolean
)
returns table (
  id uuid,
  finding_id uuid,
  domain text,
  action_type text,
  target_table text,
  target_id text,
  target_field text,
  current_value jsonb,
  proposed_value jsonb,
  deterministic_reason text,
  plan_state text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, pg_temp
stable
as $$
  select
    r.id, r.finding_id, r.domain, r.action_type, r.target_table, r.target_id, r.target_field,
    r.current_value, r.proposed_value, r.deterministic_reason, r.plan_state, r.created_at, r.updated_at
  from public.agent_remedy_plans r
  where r.deleted_at is null
    and r.plan_state = 'proposed'
    and (coalesce(p_include_test, false) = true or r.test_owned = false)
    and (p_finding_id is null or r.finding_id = p_finding_id)
  order by r.created_at asc;
$$;
revoke all on function public.agent_remedy_plans_list(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.agent_remedy_plans_list(uuid, boolean) to service_role;

-- ─── CLEANUP test-owned remedy plans (soft-delete; test only) ─────────────────
create or replace function public.agent_remedy_plans_cleanup_test(p_finding_id uuid)
returns table (plans_cleaned integer)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_count integer;
begin
  update public.agent_remedy_plans r
     set deleted_at = now()
   where r.test_owned = true
     and r.deleted_at is null
     and (p_finding_id is null or r.finding_id = p_finding_id);
  get diagnostics v_count = row_count;
  return query select v_count;
end;
$$;
revoke all on function public.agent_remedy_plans_cleanup_test(uuid) from public, anon, authenticated, service_role;
grant execute on function public.agent_remedy_plans_cleanup_test(uuid) to service_role;
