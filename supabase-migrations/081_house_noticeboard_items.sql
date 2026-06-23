-- Phase 11F — Autonomous Pulse Expansion: House Noticeboard
--
-- A noticeboard in the hallway.
-- A note on the kitchen table.
-- A small deposit of presence.
--
-- Core Law (governance — enforced in code, UI, and these constraints):
--   A House Noticeboard item is a shared deposit, not Memory, not Journal,
--   not Telegram, not Lounge chat, and not prompt authority.
--
--   The House may confirm that Ari or Eli CHOSE to leave a deposit (that fact
--   lives in pulse_autonomy_events — the confirmed event source). The deposited
--   TEXT itself does not become Memory, evidence, Library, Archive, Journal, or
--   Held Truth unless Tara later routes it through an existing governed review
--   pathway.
--
-- This migration:
--   1. Creates house_noticeboard_items (shared deposits).
--   2. Extends pulse_autonomy_events.chosen_action to allow 'house_deposit'.
--
-- It does NOT create any Memory, Archive, Journal, Library, Graph, Helper, or
-- prompt-authority path. The not_* / authority_changed CHECK constraints below
-- make the non-authority of a deposit a database-level invariant: the safe flags
-- can never be flipped, on insert or update.

-- ─── Table: house_noticeboard_items ──────────────────────────────────────────

create table if not exists house_noticeboard_items (
  id uuid primary key default gen_random_uuid(),

  -- Where this deposit came from. Pulse house_deposit is the required path;
  -- tara_manual_note is an optional Tara-authored note.
  source_type text not null check (
    source_type in ('pulse_house_deposit', 'tara_manual_note')
  ),

  -- Reverse link to the Pulse autonomy event that produced this deposit.
  -- Nullable: Tara manual notes have no source event. FK added below.
  source_event_id uuid,

  presence_id text check (
    presence_id in ('ari', 'eli')
  ),

  content text not null,

  note_kind text not null default 'deposit' check (
    note_kind in (
      'deposit',
      'observation',
      'fragment',
      'open_thread',
      'house_note'
    )
  ),

  visibility text not null default 'shared_house' check (
    visibility in ('shared_house')
  ),

  -- Authority label is locked. A deposit is never Memory.
  authority_label text not null default 'house_noticeboard_not_memory' check (
    authority_label = 'house_noticeboard_not_memory'
  ),

  status text not null default 'active' check (
    status in (
      'active',
      'viewed',
      'pinned',
      'released',
      'routed_to_library_review',
      'routed_to_archive_review',
      'hidden'
    )
  ),

  -- Governance invariants. These can NEVER be anything but the safe value —
  -- not on insert, not on any status update. This is the Crown, in the schema.
  not_memory boolean not null default true check (not_memory = true),
  not_evidence boolean not null default true check (not_evidence = true),
  not_prompt_authority boolean not null default true check (not_prompt_authority = true),
  authority_changed boolean not null default false check (authority_changed = false),

  created_at timestamptz not null default now(),
  viewed_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by text
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

create index if not exists house_noticeboard_items_created_idx
  on house_noticeboard_items (created_at desc);

create index if not exists house_noticeboard_items_presence_idx
  on house_noticeboard_items (presence_id, created_at desc);

create index if not exists house_noticeboard_items_status_idx
  on house_noticeboard_items (status, created_at desc);

create index if not exists house_noticeboard_items_source_event_idx
  on house_noticeboard_items (source_event_id);

-- One deposit per Pulse event: belt-and-suspenders idempotency for
-- house_deposit so a retry can never create a duplicate deposit for the same
-- autonomy event. Partial unique index (only enforces on pulse-sourced rows).
create unique index if not exists house_noticeboard_items_unique_source_event_idx
  on house_noticeboard_items (source_event_id)
  where source_event_id is not null
    and source_type = 'pulse_house_deposit';

-- ─── Foreign key to the Pulse autonomy event ─────────────────────────────────
-- pulse_autonomy_events exists since migration 057, so the FK is safe.
-- ON DELETE SET NULL (not RESTRICT/CASCADE): a deposit is independent shared
-- content and must survive even if its source event were ever removed. Pulse
-- events are an append-only source-of-truth and are not hard-deleted in
-- practice, so this branch is effectively never taken; SET NULL simply
-- guarantees a deposit is never destroyed by event cleanup. Documented
-- exception to the default-RESTRICT FK rule in CLAUDE.md.

do $fk$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'house_noticeboard_items_source_event_fk'
      and conrelid = 'house_noticeboard_items'::regclass
  ) then
    alter table house_noticeboard_items
      add constraint house_noticeboard_items_source_event_fk
      foreign key (source_event_id)
      references pulse_autonomy_events(id)
      on delete set null;
  end if;
end
$fk$;

-- ─── RLS: open in v1 (matches House convention) ──────────────────────────────

alter table house_noticeboard_items enable row level security;

drop policy if exists "house_noticeboard_items_open" on house_noticeboard_items;
create policy "house_noticeboard_items_open"
  on house_noticeboard_items
  for all
  using (true)
  with check (true);

-- ─── Comments ────────────────────────────────────────────────────────────────

comment on table house_noticeboard_items is
'Shared House Noticeboard deposits. Not Memory, not evidence, not prompt authority. Created by Pulse house_deposit or Tara manual note. The fact that a presence chose house_deposit is confirmed continuity (pulse_autonomy_events); the deposit content here is non-authoritative unless Tara routes it through an existing governed review pathway.';

comment on column house_noticeboard_items.authority_label is
'Locked to house_noticeboard_not_memory. A deposit is never Memory.';

comment on column house_noticeboard_items.source_event_id is
'Reverse link to pulse_autonomy_events.id for pulse_house_deposit rows. Null for tara_manual_note.';

-- ─── Extend pulse_autonomy_events.chosen_action to allow house_deposit ───────
-- Phase 11E created the check inline (telegram/journal/desk/stillness). Find and
-- drop whatever name Postgres gave that check, then re-add including
-- house_deposit. Robust to the auto-generated constraint name and idempotent on
-- re-run (the re-added constraint also mentions chosen_action, so it is found
-- and replaced rather than duplicated).

do $ca$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'pulse_autonomy_events'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%chosen_action%';

  if cname is not null then
    execute format('alter table pulse_autonomy_events drop constraint %I', cname);
  end if;

  alter table pulse_autonomy_events
    add constraint pulse_autonomy_events_chosen_action_check
    check (chosen_action in ('telegram', 'journal', 'desk', 'stillness', 'house_deposit'));
end
$ca$;
