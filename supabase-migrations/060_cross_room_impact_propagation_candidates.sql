-- Phase 36D: Cross-Room Impact Propagation Candidates
--
-- Governed gate between cross_room_event_impacts and State / Interior.
-- Candidates propose future continuity changes. They do not apply them.
--
-- A propagation candidate is NOT Memory.
-- It is NOT applied State.
-- It is NOT written Interior.
-- It does not trigger Pulse, Journal, Archive, or prompt carryforward.
--
-- Authority label: impact_propagation_candidate_not_memory

create table if not exists cross_room_impact_propagation_candidates (
  id uuid primary key default gen_random_uuid(),

  -- Link to parent event and impact
  cross_room_event_id uuid not null references cross_room_events(id) on delete cascade,
  cross_room_impact_id uuid not null references cross_room_event_impacts(id) on delete cascade,

  -- Which presence this candidate targets
  target_presence_id text not null check (target_presence_id in ('ari', 'eli')),

  -- Candidate classification
  candidate_type text not null
    check (candidate_type in ('state_candidate', 'interior_candidate')),

  candidate_status text not null default 'pending'
    check (candidate_status in ('pending', 'approved', 'rejected', 'superseded')),

  -- Authority: NOT Memory, NOT applied State/Interior
  authority_label text not null default 'impact_propagation_candidate_not_memory'
    check (authority_label in ('impact_propagation_candidate_not_memory')),

  -- Proposal content
  candidate_summary text not null,
  proposed_state_patch jsonb,
  proposed_interior_note jsonb,
  rationale text,

  -- Source provenance (IDs only, no transcripts)
  source_message_ids jsonb not null default '[]'::jsonb,
  source_impact_snapshot jsonb not null default '{}'::jsonb,

  -- Generation confidence
  confidence numeric(3,2) not null default 0.5
    check (confidence >= 0.0 and confidence <= 1.0),

  -- Generation provenance
  generation_method text not null default 'model'
    check (generation_method in ('model', 'deterministic_test', 'manual')),
  generation_model text,
  prompt_version text not null default '36d_v1',

  -- Review fields (not used in 36D v1, reserved for future phases)
  review_notes text,
  reviewed_by text,
  reviewed_at timestamptz,

  -- Extension
  metadata jsonb not null default '{}'::jsonb,

  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Uniqueness: one state_candidate and one interior_candidate per impact
  constraint propagation_candidates_unique_type
    unique (cross_room_impact_id, candidate_type)
);

-- Indexes
create index if not exists prop_candidates_impact_idx
  on cross_room_impact_propagation_candidates (cross_room_impact_id);

create index if not exists prop_candidates_event_idx
  on cross_room_impact_propagation_candidates (cross_room_event_id);

create index if not exists prop_candidates_presence_idx
  on cross_room_impact_propagation_candidates (target_presence_id, created_at desc);

create index if not exists prop_candidates_status_idx
  on cross_room_impact_propagation_candidates (candidate_status);

-- RLS: open in v1 (matches House convention — same posture as cross_room_events, cross_room_event_impacts)
alter table cross_room_impact_propagation_candidates enable row level security;

drop policy if exists "prop_candidates_open" on cross_room_impact_propagation_candidates;
create policy "prop_candidates_open"
  on cross_room_impact_propagation_candidates
  for all
  using (true)
  with check (true);
