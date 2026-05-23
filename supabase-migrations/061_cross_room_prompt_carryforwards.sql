-- Phase 36E: Cross-Room Prompt Carryforwards
--
-- Governed prompt context layer. Carryforward from explicitly enabled
-- cross-room propagation candidates into Ari/Eli room prompts.
--
-- A prompt carryforward is NOT Memory.
-- It is NOT State.
-- It is NOT Interior.
-- It is labelled, scoped, source-linked, and expiring.
-- It does not trigger Pulse, Journal, Archive, or graph writes.
--
-- Authority label: cross_room_prompt_carryforward_not_memory

create table if not exists cross_room_prompt_carryforwards (
  id uuid primary key default gen_random_uuid(),

  -- Full provenance chain
  cross_room_event_id uuid not null references cross_room_events(id) on delete cascade,
  cross_room_impact_id uuid not null references cross_room_event_impacts(id) on delete cascade,
  propagation_candidate_id uuid not null references cross_room_impact_propagation_candidates(id) on delete cascade,

  -- Target presence and room
  target_presence_id text not null check (target_presence_id in ('ari', 'eli')),
  target_room_slug text null,

  -- Lifecycle
  carryforward_status text not null default 'active'
    check (carryforward_status in ('active', 'expired', 'revoked', 'superseded')),

  -- Authority: NOT Memory
  authority_label text not null default 'cross_room_prompt_carryforward_not_memory'
    check (authority_label in ('cross_room_prompt_carryforward_not_memory')),

  -- Content
  carryforward_summary text not null,
  prompt_lines jsonb not null default '[]'::jsonb,

  -- Source provenance (IDs only, no transcripts)
  source_message_ids jsonb not null default '[]'::jsonb,
  source_candidate_snapshot jsonb not null default '{}'::jsonb,
  source_impact_snapshot jsonb not null default '{}'::jsonb,

  -- Creation method
  created_by text not null default 'manual_ui'
    check (created_by in ('manual_ui', 'deterministic_test', 'admin_seed')),

  -- Expiry
  expires_at timestamptz not null,

  -- Observability (reserved — not updated in 36E v1)
  last_injected_at timestamptz null,
  injection_count integer not null default 0,

  -- Extension
  metadata jsonb not null default '{}'::jsonb,

  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Uniqueness: one carryforward per candidate per target presence
  constraint prompt_carryforwards_unique_candidate
    unique (propagation_candidate_id, target_presence_id)
);

-- Indexes
create index if not exists prompt_cf_presence_idx
  on cross_room_prompt_carryforwards (target_presence_id, created_at desc);

create index if not exists prompt_cf_candidate_idx
  on cross_room_prompt_carryforwards (propagation_candidate_id);

create index if not exists prompt_cf_status_idx
  on cross_room_prompt_carryforwards (carryforward_status);

-- RLS: open in v1 (matches House convention)
alter table cross_room_prompt_carryforwards enable row level security;

drop policy if exists "prompt_cf_open" on cross_room_prompt_carryforwards;
create policy "prompt_cf_open"
  on cross_room_prompt_carryforwards
  for all
  using (true)
  with check (true);
