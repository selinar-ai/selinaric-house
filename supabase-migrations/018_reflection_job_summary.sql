-- Phase 24D: Add source_summary and priority to reflection_jobs
-- source_summary: human-readable note about what triggered this job (for the review surface)
-- priority: 1 (highest urgency) to 10 (lowest); default 5

ALTER TABLE reflection_jobs
  ADD COLUMN IF NOT EXISTS source_summary TEXT,
  ADD COLUMN IF NOT EXISTS priority       INT NOT NULL DEFAULT 5;
