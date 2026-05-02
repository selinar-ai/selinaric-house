-- Phase 29A — Memory Promotion & Curation Assurance
-- NO new column on archive_items.
-- canonical_status remains the single Memory authority:
--   canonical_candidate = Memory candidate
--   canonical           = Memory (recall-eligible)
--   archive_only        = Rejected for Memory / archive-only
--   needs_review        = Demoted from Memory (returned to curation queue)
--
-- This migration only adds the audit event table.
-- audit rows capture from_status / to_status as canonical_status values.

-- ─── Audit table ──────────────────────────────────────────────────────────────

create table if not exists archive_memory_events (
  id              uuid        primary key default gen_random_uuid(),
  archive_item_id uuid        not null references archive_items(id) on delete cascade,
  from_status     text,                    -- canonical_status before change
  to_status       text        not null,    -- canonical_status after change
  action          text        not null check (action in (
    'mark_candidate',
    'confirm_memory',
    'reject_memory',
    'demote_memory',
    'restore_candidate'
  )),
  reason          text,
  created_by      text        not null default 'tara',
  created_at      timestamptz not null default now()
);

create index if not exists archive_memory_events_item_idx
  on archive_memory_events (archive_item_id, created_at desc);

create index if not exists archive_memory_events_created_idx
  on archive_memory_events (created_at desc);

-- ─── RLS — matches permissive pattern used by all other archive tables ────────

alter table archive_memory_events enable row level security;

drop policy if exists "archive_memory_events_open" on archive_memory_events;

create policy "archive_memory_events_open"
  on archive_memory_events
  for all
  using (true)
  with check (true);
