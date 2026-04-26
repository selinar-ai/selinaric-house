-- Phase 22B: build_history audit log + implementation_notes + concept provenance
-- Run in Supabase SQL Editor → expect "No rows returned".

-- ─── build_history ─────────────────────────────────────────────────────────────
-- Explicit event log for each build's state transitions.
-- Every status change, consultation step, and review outcome is recorded here.

create table build_history (
  id                    uuid        primary key default gen_random_uuid(),
  build_id              uuid        not null references builds(id) on delete cascade,
  event_type            text        not null,
  -- Valid event_type values:
  --   created | updated | consultation_requested | consultation_responded |
  --   consultation_declined | consultation_closed | marked_ready |
  --   sent_for_verification | forgekeeper_complete | approved | returned |
  --   held | reopened | committed
  prev_desk_status      text,
  next_desk_status      text,
  prev_workshop_status  text,
  next_workshop_status  text,
  actor                 text        not null default 'system',
  -- Valid actor values: tara | ari | eli | forgekeeper | system
  note                  text,
  created_at            timestamptz not null default now()
);

create index build_history_build_idx
  on build_history (build_id, created_at asc);

alter table build_history enable row level security;
create policy "open" on build_history for all using (true) with check (true);

-- ─── builds additions ──────────────────────────────────────────────────────────

-- Human-readable concept ID (e.g. ARI-C001) for display without a JOIN.
-- Set when a build is created from an approved concept.
alter table builds
  add column if not exists origin_concept_short_id text;

-- Implementation notes: optional free-text field for the build author.
alter table builds
  add column if not exists implementation_notes text not null default '';
