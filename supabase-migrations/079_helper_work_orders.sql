-- Phase 42.2.1 — helper_work_orders
--
-- A delegated-labour WORK ORDER: a proposed/approved bounded action that a
-- governed executor performs on Tara's approval. This is a Library OPERATION
-- authorisation, NOT authority: a work order never becomes Memory, evidence,
-- prompt authority, Graph truth, or Archive truth, and the executor can only
-- ever touch the one whitelisted surface for its action_type.
--
-- Not append-only (status moves proposed → approved → applied/failed →
-- rolled_back / rejected), but transitions are written ONLY by the server-side
-- delegate route running as service_role — never by anon/authenticated, never by
-- a free browser PATCH. Soft-delete only (deleted_at); never hard-deleted.
--
-- First slice opens exactly ONE action_type: 'retry_extraction' (Tier 3,
-- operational, no content authorship), targeting exactly one library_item_file.

create table helper_work_orders (
  id uuid primary key default gen_random_uuid(),

  -- Soft link to the helper output that proposed this (no FK — mirrors
  -- helper_review_events; helper_outputs is sealed).
  helper_output_id uuid not null,

  action_type    text not null,
  target_surface text not null,
  target_id      uuid not null,
  tier           int  not null,

  status         text not null default 'proposed',

  -- The proposed bounded action (for retry_extraction: just the action marker).
  proposed_change jsonb not null default '{}'::jsonb,
  -- Tara's edit before apply — unused in 42.2.1 (Tier 2 tags, a later slice).
  edited_change   jsonb,

  approved_by text,

  -- ── Locked invariants — a delegated Library op never moves authority ──
  not_memory        boolean not null default true,
  not_evidence      boolean not null default true,
  prompt_eligible   boolean not null default false,
  authority_changed boolean not null default false,

  test_owned boolean not null default false,
  created_at  timestamptz not null default now(),
  approved_at timestamptz,
  applied_at  timestamptz,
  deleted_at  timestamptz,

  -- ── Closed vocabularies (first slice: retry_extraction only) ──
  constraint hwo_action_vocab  check (action_type in ('retry_extraction')),
  constraint hwo_surface_vocab check (target_surface in ('library_item_file')),
  constraint hwo_status_vocab  check (status in ('proposed', 'approved', 'applied', 'failed', 'rejected', 'rolled_back')),
  constraint hwo_tier_vocab    check (tier in (2, 3)),
  constraint hwo_approved_by   check (approved_by is null or approved_by = 'tara'),

  -- ── Locked-invariant CHECKs (the DB backstop) ──
  constraint hwo_not_memory_locked        check (not_memory = true),
  constraint hwo_not_evidence_locked      check (not_evidence = true),
  constraint hwo_prompt_ineligible_locked check (prompt_eligible = false),
  constraint hwo_authority_unchanged_lock check (authority_changed = false)
);

create index helper_work_orders_output_idx on helper_work_orders (helper_output_id);
create index helper_work_orders_target_idx on helper_work_orders (target_surface, target_id);

-- Server-side only. No public/anon/authenticated table access; the browser never
-- touches this table — it goes through the auth-gated delegate route, which runs
-- as service_role.
--
-- service_role gets SELECT + INSERT only (the route reads and lazily inserts an
-- already-approved work order). It is NOT granted direct UPDATE: every status
-- transition (applied / failed / rolled_back) goes through the governed,
-- security-definer helper_apply_record RPC, which owns the table and updates it
-- atomically alongside the append-only apply event. A broad UPDATE grant would
-- let the route drift status without an audit row — so it is withheld.
alter table helper_work_orders enable row level security;
revoke all on table helper_work_orders from public;
revoke all on table helper_work_orders from anon;
revoke all on table helper_work_orders from authenticated;
revoke all on table helper_work_orders from service_role;
grant select, insert on table helper_work_orders to service_role;
