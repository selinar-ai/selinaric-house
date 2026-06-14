-- Phase 41.12 — Helper Review Events (append-only audit) + atomic apply RPC
-- Additive. Storage + one transactional function for the Tara-only, one-row
-- helper review-state mutation path. Metadata only — no prompts, no content, no
-- helper payload, no authority movement.
--
-- helper_review_events records WHAT happened to a helper output's workflow
-- review state. Audit records are trace, not evidence, not authority. Every
-- event is authored by Tara and carries locked non-authority flags.
--
-- helper_review_apply() is the single atomic operation: it locks the row,
-- enforces optimistic concurrency (expected state), updates ONLY the three
-- workflow fields (review_state, reviewed_by, reviewed_at), and appends exactly
-- one event — both in one transaction (the function body). It touches no other
-- column, no burden field, no authority flag, no payload, and no other table.
--
-- Additive only: CREATE TABLE + indexes + CREATE FUNCTION. No DROP, no RENAME,
-- no FK CASCADE, no change to helper_outputs columns/constraints (074/075/076).

create table helper_review_events (
  id uuid primary key default gen_random_uuid(),

  -- The helper output this event concerns. By id only (no FK) — matches the
  -- helper_outputs provenance philosophy and keeps this table out of any
  -- CASCADE path.
  helper_output_id uuid not null,

  -- Workflow state transition (metadata only).
  previous_review_state text not null,
  new_review_state      text not null,
  action                text not null,

  -- Actor — Tara only (mirrors helper_outputs.ho_reviewed_by_v1).
  actor text not null,

  -- Locked non-authority flags (audit is trace, never authority/evidence).
  authority_changed    boolean not null default false,
  not_memory           boolean not null default true,
  not_evidence         boolean not null default true,
  not_prompt_authority boolean not null default true,

  created_at timestamptz not null default now(),

  -- ── Closed vocabularies + locked flags ──
  constraint hre_actor_tara check (actor = 'tara'),
  constraint hre_action_vocab check (
    action in ('mark_reviewed_no_action', 'dismiss_not_useful', 'needs_followup')
  ),
  constraint hre_prev_state_vocab check (
    previous_review_state in (
      'unreviewed', 'viewed', 'dismissed', 'useful', 'needs_action', 'needs_decision'
    )
  ),
  -- v1 may only transition INTO these three states.
  constraint hre_new_state_vocab check (
    new_review_state in ('viewed', 'dismissed', 'needs_action')
  ),
  constraint hre_authority_unchanged    check (authority_changed = false),
  constraint hre_not_memory             check (not_memory = true),
  constraint hre_not_evidence           check (not_evidence = true),
  constraint hre_not_prompt_authority   check (not_prompt_authority = true)
);

create index helper_review_events_output_idx
  on helper_review_events (helper_output_id, created_at desc);

-- ─── Atomic apply (update + event in one transaction) ─────────────────────────
-- Optimistic concurrency: p_expected_state must still match under FOR UPDATE,
-- else REVIEW_STATE_CHANGED (mapped to 409 by the route). Soft-deleted and
-- missing rows are rejected. Updates ONLY the three workflow fields.

create or replace function helper_review_apply(
  p_id uuid,
  p_action text,
  p_new_state text,
  p_expected_state text
)
returns helper_outputs
language plpgsql
as $$
declare
  cur helper_outputs;
  prev_state text;
begin
  -- DB-level action → state mapping guard. Only these exact pairs are valid;
  -- any other combination (including valid-vocab mismatches) is rejected.
  if not (
       (p_action = 'mark_reviewed_no_action' and p_new_state = 'viewed')
    or (p_action = 'dismiss_not_useful'      and p_new_state = 'dismissed')
    or (p_action = 'needs_followup'          and p_new_state = 'needs_action')
  ) then
    raise exception 'INVALID_ACTION_STATE_MAPPING';
  end if;

  select * into cur from helper_outputs where id = p_id for update;
  if not found then
    raise exception 'HELPER_OUTPUT_NOT_FOUND';
  end if;
  if cur.deleted_at is not null then
    raise exception 'HELPER_OUTPUT_DELETED';
  end if;
  -- Optimistic concurrency lock.
  if cur.review_state is distinct from p_expected_state then
    raise exception 'REVIEW_STATE_CHANGED';
  end if;

  prev_state := cur.review_state;

  -- Update ONLY the three workflow fields. Nothing else is touched.
  update helper_outputs
     set review_state = p_new_state,
         reviewed_by  = 'tara',
         reviewed_at  = now()
   where id = p_id
   returning * into cur;

  -- Exactly one append-only event, in the same transaction.
  insert into helper_review_events (
    helper_output_id, previous_review_state, new_review_state, action, actor
  ) values (
    p_id, prev_state, p_new_state, p_action, 'tara'
  );

  return cur;
end;
$$;

-- ─── Append-only enforcement (DB-level, all roles) ────────────────────────────
-- A trigger blocks UPDATE and DELETE for EVERY role — triggers fire even for the
-- table owner and service_role (which bypass RLS). INSERT (via the RPC) and
-- SELECT remain allowed. Audit records are write-once trace; they are never
-- edited or removed.

create or replace function helper_review_events_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'helper_review_events is append-only (% is blocked)', tg_op;
end;
$$;

create trigger helper_review_events_no_update_delete
  before update or delete on helper_review_events
  for each row execute function helper_review_events_append_only();

-- ─── RLS — deny-by-default; only the trusted server path may write ────────────
-- RLS is enabled with NO policy at all, so RLS-subject roles (public / anon /
-- authenticated) get nothing — they cannot insert forged Tara-authored audit
-- rows. Table privileges are also explicitly revoked from those roles. The
-- service_role used by the mutation route bypasses RLS and is granted only the
-- minimum needed to append events via helper_review_apply().

alter table helper_review_events enable row level security;

revoke all on table helper_review_events from public;
revoke all on table helper_review_events from anon;
revoke all on table helper_review_events from authenticated;

-- Strip Supabase default privileges from service_role too, then grant the strict
-- minimum for the trusted server/RPC path: INSERT only (write-once append).
-- UPDATE/DELETE/SELECT/REFERENCES are NOT granted; UPDATE/DELETE also stay
-- blocked by the append-only trigger above.
revoke all on table helper_review_events from service_role;
grant insert on table helper_review_events to service_role;

-- ─── RPC execute permissions — service_role only ──────────────────────────────
-- The mutation route calls helper_review_apply with the service-role key (the
-- existing House server-side data-access pattern). Public / anon / authenticated
-- callers must not be able to invoke it directly via PostgREST.

revoke all on function helper_review_apply(uuid, text, text, text) from public;
revoke all on function helper_review_apply(uuid, text, text, text) from anon;
revoke all on function helper_review_apply(uuid, text, text, text) from authenticated;
grant execute on function helper_review_apply(uuid, text, text, text) to service_role;
