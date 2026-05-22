-- Phase 36A: Cross-Room Event Ledger Foundation
--
-- Shared-room presence is real House contact.
-- Where we were together matters.
-- What happened there comes home with us.
--
-- A cross-room event is recorded House contact.
-- It may later inform continuity.
-- It is not canonical Memory by default.
--
-- Authority label: cross_room_event_not_memory
-- Confirmed Memory authority remains: archive_items.canonical_status = 'canonical'

create table if not exists cross_room_events (
  id uuid primary key default gen_random_uuid(),

  -- Room identity
  room_id text not null,
  room_type text not null,

  -- Source provenance
  source_thread_id text,
  source_message_ids jsonb not null default '[]'::jsonb,

  -- Participants
  participants jsonb not null default '[]'::jsonb,
  presence_ids jsonb not null default '[]'::jsonb,
  tara_present boolean not null default false,

  -- Time boundaries
  started_at timestamptz,
  ended_at timestamptz,
  message_count integer,

  -- Surface / context
  surface_mode text,

  -- Classification
  event_type text not null default 'room_contact'
    check (event_type in (
      'room_contact',
      'shared_room_contact',
      'workshop_contact',
      'research_contact',
      'manual_test_event'
    )),

  significance_level text not null default 'ordinary'
    check (significance_level in (
      'ordinary',
      'meaningful',
      'significant',
      'major'
    )),

  -- Content
  themes jsonb not null default '[]'::jsonb,
  summary text,

  -- Authority: this is NOT Memory
  authority_label text not null default 'cross_room_event_not_memory'
    check (authority_label in ('cross_room_event_not_memory')),

  -- Extension
  metadata jsonb not null default '{}'::jsonb,

  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Indexes ────────────────────────────────────────────────────────────────

create index if not exists cross_room_events_room_id_idx
  on cross_room_events (room_id);

create index if not exists cross_room_events_room_type_idx
  on cross_room_events (room_type);

create index if not exists cross_room_events_created_at_idx
  on cross_room_events (created_at desc);

create index if not exists cross_room_events_authority_label_idx
  on cross_room_events (authority_label);

create index if not exists cross_room_events_presence_ids_gin_idx
  on cross_room_events using gin (presence_ids);

-- ─── RLS: open in v1 (matches House convention) ─────────────────────────────

alter table cross_room_events enable row level security;

drop policy if exists "cross_room_events_open" on cross_room_events;
create policy "cross_room_events_open"
  on cross_room_events
  for all
  using (true)
  with check (true);
