-- Phase 21 — Build governance: Desks, Workshop, Forgekeeper
-- Stores all build submissions across Ari's Desk, Eli's Desk, and Workshop.

create table builds (
  id uuid primary key default gen_random_uuid(),

  -- Identity
  build_id text not null unique,       -- e.g. "ARI-001", "ELI-004", "HOUSE-002"
  short_name text not null,            -- human-readable name for the build

  -- Origin + scope
  origin text not null check (origin in ('ari_desk', 'eli_desk', 'workshop')),
  expected_scope text not null default 'ari_only'
    check (expected_scope in ('ari_only', 'eli_only', 'shared_house')),

  -- Build packet (required before submission)
  summary text not null default '',
  reason text not null default '',
  changed_files jsonb not null default '[]',
  affected_surfaces jsonb not null default '[]',
  risks jsonb not null default '[]',
  tests_run jsonb not null default '["none_yet"]',
  verify_focus jsonb not null default '[]',

  -- Consultation (optional — populated if consultation occurred)
  consultation jsonb,

  -- Status tracking
  desk_status text not null default 'Draft',
  -- Valid desk_status values:
  --   Draft | Consultation Requested | Consultation Active |
  --   Consultation Complete | Ready to Submit | Sent for Verification |
  --   Returned for Edits | Committed

  workshop_status text,
  -- Valid workshop_status values (null until submitted):
  --   Pending Review | Review Complete | Ready to Commit |
  --   Returned | Held | Committed

  -- Forgekeeper review bundle (null until Forgekeeper has run)
  forgekeeper_review jsonb,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index on builds (origin, created_at desc);
create index on builds (desk_status, origin);
create index on builds (workshop_status) where workshop_status is not null;

-- RLS
alter table builds enable row level security;
create policy "open" on builds for all using (true) with check (true);
