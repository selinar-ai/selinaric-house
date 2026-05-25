-- Phase 36I — Lounge Recent Continuity metadata columns
--
-- Adds nullable source metadata to recent_continuity_sessions so
-- Lounge-derived summaries can be distinguished from room-derived ones.
--
-- Existing rows remain untouched (all new columns are nullable).
-- Convention: source_surface IS NULL → legacy room-derived row.

ALTER TABLE recent_continuity_sessions
  ADD COLUMN IF NOT EXISTS source_surface text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source_thread_id uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS involved_presences text[] DEFAULT NULL;

-- Optional index for filtered queries by source surface
CREATE INDEX IF NOT EXISTS idx_recent_continuity_source_surface
  ON recent_continuity_sessions (source_surface, presence_id, status, session_end DESC);
