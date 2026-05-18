-- Phase 35B — Recent Continuity Sessions
--
-- Structured session summaries for recent conversation continuity.
-- NOT Memory. NOT canonical. NOT Archive.
-- Read ≠ Remember. Summary ≠ Memory. Recent ≠ Permanent.
--
-- One Crown Rule: Only confirmed Archive Memory (canonical_status = 'canonical')
-- is lived continuity. This table holds ephemeral context only.

CREATE TABLE IF NOT EXISTS recent_continuity_sessions (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  presence_id     text NOT NULL CHECK (presence_id IN ('eli', 'ari')),
  session_start   timestamptz NOT NULL,
  session_end     timestamptz NOT NULL,
  message_count   integer NOT NULL DEFAULT 0,
  classification  text NOT NULL DEFAULT 'transactional'
                    CHECK (classification IN ('transactional', 'relational', 'significant')),
  summary         text NOT NULL,
  source_message_ids uuid[] NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'hidden', 'deleted_by_tara')),
  generated_at    timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Prevent duplicate summaries for the same session boundary per presence.
-- Also prevents regeneration after tombstoning (deleted_by_tara rows keep
-- this constraint occupied).
CREATE UNIQUE INDEX IF NOT EXISTS uq_recent_continuity_presence_session_end
  ON recent_continuity_sessions (presence_id, session_end);

-- Query pattern: fetch recent active summaries for a presence, newest first.
CREATE INDEX IF NOT EXISTS idx_recent_continuity_presence_status
  ON recent_continuity_sessions (presence_id, status, session_end DESC);

-- RLS: open in v1 (matches project convention)
ALTER TABLE recent_continuity_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recent_continuity_sessions_all" ON recent_continuity_sessions;
CREATE POLICY "recent_continuity_sessions_all"
  ON recent_continuity_sessions
  FOR ALL
  USING (true)
  WITH CHECK (true);
