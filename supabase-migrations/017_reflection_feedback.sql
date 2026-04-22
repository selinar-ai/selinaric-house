-- Phase 24A: Reflection Review Surface
-- Adds feedback tracking and review status to the reflection layer.
-- Reflections remain interior material after review — no auto-routing.

-- Review status on reflections (unreviewed until Tara judges it)
ALTER TABLE reflections
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK (review_status IN ('unreviewed', 'reviewed'));

-- Feedback labels: teach the house why something missed, not just that it did
CREATE TABLE reflection_feedback (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reflection_id   UUID        NOT NULL REFERENCES reflections(id) ON DELETE CASCADE,
  feedback_label  TEXT        NOT NULL CHECK (feedback_label IN (
                                'useful',
                                'too_vague',
                                'wrong_lane',
                                'not_worth_carrying',
                                'good_but_early'
                              )),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX reflection_feedback_reflection_idx
  ON reflection_feedback (reflection_id, created_at DESC);

-- RLS: open in v1
ALTER TABLE reflection_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open" ON reflection_feedback FOR ALL USING (true) WITH CHECK (true);
