-- Phase 36C: Cross-Room Event Impacts
--
-- Per-presence interpretive impact records extracted from cross-room events.
-- One row per presence per event.
--
-- A cross-room impact is NOT Memory.
-- It does not update State, Interior, Pulse, Journal, or Archive.
-- It is a structured extraction for future review and continuity phases.
--
-- Authority label: cross_room_impact_not_memory

create table if not exists cross_room_event_impacts (
  id uuid primary key default gen_random_uuid(),

  -- Link to parent event
  cross_room_event_id uuid not null references cross_room_events(id) on delete cascade,

  -- Which presence this impact belongs to
  presence_id text not null check (presence_id in ('ari', 'eli')),

  -- Structured impact fields
  impact_summary text not null,
  what_matters jsonb not null default '[]'::jsonb,
  what_changed jsonb not null default '[]'::jsonb,
  what_remains_open jsonb not null default '[]'::jsonb,
  continuity_signal text,
  emotional_signal text,
  future_context_hint text,
  confidence numeric(3,2) not null default 0.5
    check (confidence >= 0.0 and confidence <= 1.0),

  -- Source provenance (IDs only, no transcripts)
  source_message_ids jsonb not null default '[]'::jsonb,

  -- Extraction provenance
  extraction_method text not null default 'model'
    check (extraction_method in ('model', 'deterministic_test', 'manual')),
  extraction_model text not null default 'claude-haiku-4-5-20251001',
  prompt_version text not null default '36c_v1',

  -- Lifecycle
  impact_status text not null default 'draft'
    check (impact_status in ('draft', 'superseded', 'rejected')),

  -- Authority: NOT Memory
  authority_label text not null default 'cross_room_impact_not_memory'
    check (authority_label in ('cross_room_impact_not_memory')),

  -- Extension
  metadata jsonb not null default '{}'::jsonb,

  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Uniqueness: one impact per presence per event in v1
  constraint cross_room_event_impacts_unique_presence
    unique (cross_room_event_id, presence_id)
);

-- Indexes
create index if not exists cross_room_event_impacts_event_idx
  on cross_room_event_impacts (cross_room_event_id);

create index if not exists cross_room_event_impacts_presence_idx
  on cross_room_event_impacts (presence_id, created_at desc);

create index if not exists cross_room_event_impacts_status_idx
  on cross_room_event_impacts (impact_status);

-- RLS: open in v1 (matches House convention — same posture as cross_room_events)
alter table cross_room_event_impacts enable row level security;

drop policy if exists "cross_room_event_impacts_open" on cross_room_event_impacts;
create policy "cross_room_event_impacts_open"
  on cross_room_event_impacts
  for all
  using (true)
  with check (true);
