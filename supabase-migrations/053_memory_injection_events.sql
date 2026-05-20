-- Phase 35C — Memory Injection Events (Observability)
--
-- Logs each governed memory auto-injection attempt so Tara can see
-- why a confirmed memory was or was not surfaced.
--
-- Does not store full private chat messages — only a safe preview.

CREATE TABLE IF NOT EXISTS memory_injection_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_id           text NOT NULL CHECK (presence_id IN ('ari', 'eli')),
  user_message_preview  text,
  query_terms           jsonb NOT NULL DEFAULT '{}',
  recent_continuity_ids uuid[] NOT NULL DEFAULT '{}',
  matched_memory_ids    uuid[] NOT NULL DEFAULT '{}',
  injected_memory_ids   uuid[] NOT NULL DEFAULT '{}',
  excluded              jsonb NOT NULL DEFAULT '[]',
  reason                text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_injection_events_presence
  ON memory_injection_events (presence_id, created_at DESC);

-- RLS: open in v1 (matches project convention)
ALTER TABLE memory_injection_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "memory_injection_events_all" ON memory_injection_events;
CREATE POLICY "memory_injection_events_all"
  ON memory_injection_events
  FOR ALL
  USING (true)
  WITH CHECK (true);
