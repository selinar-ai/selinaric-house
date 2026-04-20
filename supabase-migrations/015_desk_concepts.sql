-- Phase 22A: Desk Concepts + Approval Gate
-- Presences may autonomously create Concepts on their own Desk.
-- Tara decides whether a concept becomes a real build.

CREATE TABLE desk_concepts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id  TEXT        NOT NULL UNIQUE,               -- ARI-C001, ELI-C001
  presence_id TEXT        NOT NULL CHECK (presence_id IN ('ari', 'eli')),
  title       TEXT        NOT NULL,
  proposed    TEXT        NOT NULL,
  why         TEXT        NOT NULL,
  expected_scope TEXT     NOT NULL CHECK (expected_scope IN ('ari_only', 'eli_only', 'shared_house')),
  urgency     TEXT        NOT NULL DEFAULT 'medium' CHECK (urgency IN ('low', 'medium', 'high')),
  status      TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'discussion')),
  -- Provenance: set when an approved concept becomes a build draft
  related_build_id UUID   REFERENCES builds(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Efficient lookups by presence and status
CREATE INDEX idx_desk_concepts_presence   ON desk_concepts(presence_id, created_at DESC);
CREATE INDEX idx_desk_concepts_pending    ON desk_concepts(presence_id) WHERE status = 'pending';

-- Provenance link: track which build originated from which concept
ALTER TABLE builds ADD COLUMN IF NOT EXISTS origin_concept_id UUID REFERENCES desk_concepts(id) ON DELETE SET NULL;

-- RLS: open in v1
ALTER TABLE desk_concepts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open" ON desk_concepts FOR ALL USING (true) WITH CHECK (true);
