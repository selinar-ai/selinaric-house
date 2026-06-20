-- Phase 42.2.1 — helper_apply_events (append-only apply audit) + record RPC + read
--
-- The APPLY audit: what a delegated executor actually did. Distinct from the
-- 41.14 review trace (workflow movement) and from helper_work_orders (intent /
-- state). One immutable row per apply attempt and per rollback. An apply event
-- records labour performed; it is never Memory, evidence, or prompt authority.
--
-- Posture mirrors helper_review_events (077): append-only via a BEFORE
-- UPDATE/DELETE trigger; RLS enabled with 0 policies; service_role INSERT-only;
-- a narrow SECURITY DEFINER read (mirrors 078); writes happen only through the
-- security-definer record RPC called by the server-side delegate route.

create table helper_apply_events (
  id uuid primary key default gen_random_uuid(),

  work_order_id  uuid not null,         -- soft link to helper_work_orders
  action_type    text not null,
  target_surface text not null,
  target_id      uuid not null,

  before_snapshot jsonb not null,
  after_snapshot  jsonb,
  result          text not null,
  error_text      text,
  actor           text not null,

  -- Locked echoes — an apply event is never authority.
  not_memory           boolean not null default true,
  not_evidence         boolean not null default true,
  not_prompt_authority boolean not null default true,

  created_at timestamptz not null default now(),

  constraint hae_action_vocab  check (action_type in ('retry_extraction')),
  constraint hae_surface_vocab check (target_surface in ('library_item_file')),
  constraint hae_result_vocab  check (result in ('applied', 'failed', 'rolled_back')),
  constraint hae_actor_vocab   check (actor in ('tara', 'system')),
  constraint hae_not_memory_locked    check (not_memory = true),
  constraint hae_not_evidence_locked  check (not_evidence = true),
  constraint hae_not_prompt_locked    check (not_prompt_authority = true)
);

create index helper_apply_events_wo_idx on helper_apply_events (work_order_id);

-- ─── Append-only: no UPDATE, no DELETE (audit is immutable) ───────────────────
create or replace function helper_apply_events_no_update_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'helper_apply_events is append-only (no % allowed)', tg_op;
end;
$$;

create trigger helper_apply_events_immutable
before update or delete on helper_apply_events
for each row execute function helper_apply_events_no_update_delete();

alter table helper_apply_events enable row level security;
revoke all on table helper_apply_events from public;
revoke all on table helper_apply_events from anon;
revoke all on table helper_apply_events from authenticated;
revoke all on table helper_apply_events from service_role;
grant insert on table helper_apply_events to service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- record RPC — atomically advance the work order AND append one apply event.
-- This is the "one server transaction" for the audit. Transition-guarded.
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function public.helper_apply_record(
  p_work_order_id uuid,
  p_new_status    text,
  p_action_type   text,
  p_target_surface text,
  p_target_id     uuid,
  p_before        jsonb,
  p_after         jsonb,
  p_result        text,
  p_error         text,
  p_actor         text
)
returns public.helper_apply_events
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  cur public.helper_work_orders%rowtype;
  ev  public.helper_apply_events%rowtype;
begin
  select * into cur from public.helper_work_orders where id = p_work_order_id for update;
  if not found then
    raise exception 'WORK_ORDER_NOT_FOUND';
  end if;
  if cur.deleted_at is not null then
    raise exception 'WORK_ORDER_DELETED';
  end if;

  -- Drift guards: the apply event may not diverge from its work order, and the
  -- recorded result must match the new status.
  if p_action_type is distinct from cur.action_type then
    raise exception 'APPLY_EVENT_ACTION_MISMATCH';
  end if;
  if p_target_surface is distinct from cur.target_surface then
    raise exception 'APPLY_EVENT_TARGET_MISMATCH';
  end if;
  if p_target_id is distinct from cur.target_id then
    raise exception 'APPLY_EVENT_TARGET_MISMATCH';
  end if;
  if p_result is distinct from p_new_status then
    raise exception 'APPLY_EVENT_RESULT_STATUS_MISMATCH';
  end if;

  -- Allowed transitions only.
  if not (
    (cur.status = 'approved' and p_new_status in ('applied', 'failed')) or
    (cur.status = 'applied'  and p_new_status = 'rolled_back')
  ) then
    raise exception 'INVALID_WORK_ORDER_TRANSITION from % to %', cur.status, p_new_status;
  end if;

  update public.helper_work_orders
     set status = p_new_status,
         applied_at = case when p_new_status = 'applied' then now() else applied_at end
   where id = p_work_order_id;

  insert into public.helper_apply_events (
    work_order_id, action_type, target_surface, target_id,
    before_snapshot, after_snapshot, result, error_text, actor
  ) values (
    p_work_order_id, p_action_type, p_target_surface, p_target_id,
    p_before, p_after, p_result, p_error, p_actor
  ) returning * into ev;

  return ev;
end;
$$;

revoke all on function public.helper_apply_record(uuid, text, text, text, uuid, jsonb, jsonb, text, text, text) from public;
revoke all on function public.helper_apply_record(uuid, text, text, text, uuid, jsonb, jsonb, text, text, text) from anon;
revoke all on function public.helper_apply_record(uuid, text, text, text, uuid, jsonb, jsonb, text, text, text) from authenticated;
revoke all on function public.helper_apply_record(uuid, text, text, text, uuid, jsonb, jsonb, text, text, text) from service_role;
grant execute on function public.helper_apply_record(uuid, text, text, text, uuid, jsonb, jsonb, text, text, text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Narrow definer read — safe apply-trace summaries for a set of work orders.
-- Mirrors 078: schema-qualified, tight search_path, deterministic order,
-- null/empty-safe, execute to service_role only, no broad table SELECT.
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function public.helper_apply_events_for_work_orders(p_work_order_ids uuid[])
returns table (
  id uuid,
  work_order_id uuid,
  action_type text,
  target_surface text,
  target_id uuid,
  before_snapshot jsonb,
  after_snapshot jsonb,
  result text,
  error_text text,
  actor text,
  created_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, pg_temp
stable
as $$
  select e.id, e.work_order_id, e.action_type, e.target_surface, e.target_id,
         e.before_snapshot, e.after_snapshot, e.result, e.error_text, e.actor, e.created_at
  from public.helper_apply_events e
  where p_work_order_ids is not null
    and cardinality(p_work_order_ids) >= 1
    and e.work_order_id = any (p_work_order_ids)
  order by e.created_at asc, e.id asc;
$$;

revoke all on function public.helper_apply_events_for_work_orders(uuid[]) from public;
revoke all on function public.helper_apply_events_for_work_orders(uuid[]) from anon;
revoke all on function public.helper_apply_events_for_work_orders(uuid[]) from authenticated;
revoke all on function public.helper_apply_events_for_work_orders(uuid[]) from service_role;
grant execute on function public.helper_apply_events_for_work_orders(uuid[]) to service_role;
