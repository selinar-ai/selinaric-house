-- Phase 35C — Recent Continuity Significance Preservation
--
-- Adds structured significance metadata to recent_continuity_sessions.
-- anchor_quotes, key_claims, significance_tags preserve the heart of
-- significant moments instead of flattening them into vague summaries.
--
-- dedupe_key enables content-level deduplication at prompt-selection time.
-- updated_at tracks when significance metadata was added/refined.
--
-- One Crown Rule unchanged: Only confirmed Archive Memory (canonical_status = 'canonical')
-- is canonical lived continuity. These fields are ephemeral context enrichment.

ALTER TABLE recent_continuity_sessions
  ADD COLUMN IF NOT EXISTS anchor_quotes jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS key_claims jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS significance_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS selfhood_signals jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS memory_signal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS backfilled_at timestamptz;
