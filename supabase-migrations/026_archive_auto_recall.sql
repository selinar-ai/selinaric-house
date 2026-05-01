-- Phase 28D — Safe Auto-Recall Trial
-- Two changes:
--   1. New table: archive_auto_recall_settings — per-presence on/off trial switch
--   2. Add recall_mode + auto_reason columns to archive_recall_events (idempotent)
--
-- Defaults:
--   Both presences start with mode = 'off'. Tara must explicitly enable trial.
--   Existing recall events default to 'manual' via column default — no backfill needed.
--
-- Safety caps enforced in API layer, not schema (simpler):
--   max_entries: 1–2 only
--   min_match_quality: 'strong' only in Phase 28D


-- ── archive_auto_recall_settings ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS archive_auto_recall_settings (
  presence_id        TEXT         PRIMARY KEY CHECK (presence_id IN ('ari', 'eli')),
  mode               TEXT         NOT NULL DEFAULT 'off' CHECK (mode IN ('off', 'trial')),
  max_entries        INT          NOT NULL DEFAULT 1,
  min_match_quality  TEXT         NOT NULL DEFAULT 'strong' CHECK (min_match_quality IN ('strong')),
  context_cap        INT          NOT NULL DEFAULT 3000,
  updated_by         TEXT         NOT NULL DEFAULT 'tara',
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Seed rows: both presences default to off
INSERT INTO archive_auto_recall_settings (presence_id, mode)
VALUES ('ari', 'off'), ('eli', 'off')
ON CONFLICT (presence_id) DO NOTHING;

ALTER TABLE archive_auto_recall_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open_auto_recall_settings" ON archive_auto_recall_settings
  FOR ALL USING (true) WITH CHECK (true);


-- ── archive_recall_events — add recall_mode and auto_reason ──────────────────
-- Idempotent: uses ADD COLUMN IF NOT EXISTS
-- Existing rows default to 'manual' via column default — no backfill needed.

ALTER TABLE archive_recall_events
  ADD COLUMN IF NOT EXISTS recall_mode TEXT NOT NULL DEFAULT 'manual'
    CHECK (recall_mode IN ('manual', 'auto')),
  ADD COLUMN IF NOT EXISTS auto_reason TEXT;
