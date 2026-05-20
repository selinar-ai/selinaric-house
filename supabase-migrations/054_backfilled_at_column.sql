-- Phase 35C supplement — add backfilled_at tracking column
-- Original migration 052 was run before this column was added.

ALTER TABLE recent_continuity_sessions
  ADD COLUMN IF NOT EXISTS backfilled_at timestamptz;
