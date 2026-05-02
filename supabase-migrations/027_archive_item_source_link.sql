-- Phase 28E — Source traceability: link archive_items back to archive_sources
-- Adds source_id FK so approved Archive Entries know which source conversation they came from.
--
-- Migration is idempotent: add column if not exists.
-- Existing entries: source_id = null (honest — no backfill in v1).
-- New entries approved from drafts: approval path now passes source_id from the draft.
--
-- Run in Supabase SQL Editor. Success = "No rows returned"

alter table archive_items
  add column if not exists source_id uuid references archive_sources(id);

-- Index for efficient source → items lookup
create index if not exists idx_archive_items_source_id
  on archive_items (source_id)
  where source_id is not null;
