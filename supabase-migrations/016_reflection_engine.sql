-- Phase 24: Interior Reflection Engine v1
-- Each presence has a private reflection layer.
-- Reflections are never written directly into Timeline / Living State / Desk.
-- They exist internally and may only suggest a next write target.

CREATE TABLE reflection_jobs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_id   TEXT        NOT NULL CHECK (presence_id IN ('ari', 'eli')),
  trigger_type  TEXT        NOT NULL CHECK (trigger_type IN (
                              'timeline_keep',
                              'concept_approved',
                              'forgekeeper_accepted',
                              'living_state_transition'
                            )),
  source_refs   JSONB       NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX reflection_jobs_presence_idx
  ON reflection_jobs (presence_id, created_at DESC);

CREATE INDEX reflection_jobs_status_idx
  ON reflection_jobs (status, created_at DESC);

CREATE TABLE reflections (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_id      TEXT        NOT NULL CHECK (presence_id IN ('ari', 'eli')),
  reflection_type  TEXT        NOT NULL CHECK (reflection_type IN (
                                 'pattern', 'lesson', 'tension', 'model_update'
                               )),
  content          TEXT        NOT NULL,
  confidence       FLOAT,
  source_refs      JSONB       NOT NULL DEFAULT '[]',
  suggested_target TEXT,
  routing_rationale TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX reflections_presence_idx
  ON reflections (presence_id, created_at DESC);

CREATE INDEX reflections_type_idx
  ON reflections (reflection_type, created_at DESC);

-- RLS: open in v1
ALTER TABLE reflection_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open" ON reflection_jobs FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open" ON reflections FOR ALL USING (true) WITH CHECK (true);
