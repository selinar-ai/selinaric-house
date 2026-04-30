-- Phase 28B — Recall event logging and feedback capture
-- archive_recall_events: one row per recall trigger (session + query + results metadata)
-- archive_recall_feedback: per-entry and overall ratings, last-click-wins upsert via partial unique indexes

-- ── archive_recall_events ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS archive_recall_events (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_id       TEXT        NOT NULL CHECK (presence_id IN ('ari', 'eli')),
  session_id        TEXT,
  query             TEXT        NOT NULL,
  normalised_query  TEXT        NOT NULL,
  match_quality     TEXT        NOT NULL CHECK (match_quality IN ('strong', 'medium', 'weak', 'none')),
  entries_returned  INT         NOT NULL DEFAULT 0,
  entry_ids         UUID[]      NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_archive_recall_events_presence    ON archive_recall_events (presence_id);
CREATE INDEX idx_archive_recall_events_created_at  ON archive_recall_events (created_at DESC);
CREATE INDEX idx_archive_recall_events_session     ON archive_recall_events (session_id)
  WHERE session_id IS NOT NULL;

ALTER TABLE archive_recall_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_recall_events" ON archive_recall_events
  FOR ALL USING (true) WITH CHECK (true);

-- ── archive_recall_feedback ──────────────────────────────────────────────────
-- When archive_item_id IS NULL → overall session feedback for the recall
-- When archive_item_id IS NOT NULL → per-entry feedback

CREATE TABLE IF NOT EXISTS archive_recall_feedback (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recall_event_id  UUID        NOT NULL REFERENCES archive_recall_events(id) ON DELETE CASCADE,
  archive_item_id  UUID        REFERENCES archive_items(id) ON DELETE SET NULL,
  rating           TEXT        NOT NULL CHECK (rating IN ('helpful', 'not_helpful')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique indexes for upsert conflict resolution:
--   One per-entry row per event (archive_item_id IS NOT NULL)
CREATE UNIQUE INDEX idx_recall_feedback_entry
  ON archive_recall_feedback (recall_event_id, archive_item_id)
  WHERE archive_item_id IS NOT NULL;

--   One overall row per event (archive_item_id IS NULL)
CREATE UNIQUE INDEX idx_recall_feedback_overall
  ON archive_recall_feedback (recall_event_id)
  WHERE archive_item_id IS NULL;

CREATE INDEX idx_recall_feedback_event ON archive_recall_feedback (recall_event_id);
CREATE INDEX idx_recall_feedback_item  ON archive_recall_feedback (archive_item_id)
  WHERE archive_item_id IS NOT NULL;

ALTER TABLE archive_recall_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_recall_feedback" ON archive_recall_feedback
  FOR ALL USING (true) WITH CHECK (true);
