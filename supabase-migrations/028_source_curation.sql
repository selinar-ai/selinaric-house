-- Phase 27D — Source curation workflow: add 'skipped' status to archive_sources
-- Tara can mark a source conversation as skipped (not archive-worthy) without deleting it.
-- Run in Supabase SQL Editor. Success = "No rows returned"

alter table archive_sources
  drop constraint if exists archive_sources_review_status_check;

alter table archive_sources
  add constraint archive_sources_review_status_check
  check (review_status in ('pending', 'reviewed', 'extracted', 'skipped'));
