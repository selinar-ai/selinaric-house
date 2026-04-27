-- Phase 18A — Presence journal authorship columns
--
-- Tracks who wrote each entry and how it was generated.
-- Existing rows (legacy/system) will have NULL for all three columns.
-- authored_by = NULL means the entry was system-generated (pre-18A).
--
-- Run in Supabase SQL Editor → expect "No rows returned".

ALTER TABLE presence_journal
  ADD COLUMN IF NOT EXISTS authored_by    text  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source         text  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS journal_job_id uuid  DEFAULT NULL;

COMMENT ON COLUMN presence_journal.authored_by    IS 'ari | eli | null (legacy / system-generated)';
COMMENT ON COLUMN presence_journal.source         IS 'pulse_triggered | presence_generated_from_job | null (legacy)';
COMMENT ON COLUMN presence_journal.journal_job_id IS 'ID of the journal_jobs row that triggered this entry, if any';
