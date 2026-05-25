-- Phase 36H.3: Expand reflection_jobs for cross-room reflection hooks
--
-- Adds trigger_type = 'cross_room_event' to allowed trigger types.
-- Adds nullable source_metadata jsonb column for structured provenance.
-- Adds nullable reflection_scope column for future shared/house scope.
-- Adds nullable created_by column for provenance tracking.
-- Adds per-impact duplicate prevention index.
--
-- Existing reflection jobs (timeline_keep, concept_approved, etc.) are unaffected.
-- New columns default to NULL for backward compatibility.
--
-- Run in Supabase SQL Editor -> expect "No rows returned".

-- 1. Expand trigger_type constraint to include cross_room_event
ALTER TABLE reflection_jobs DROP CONSTRAINT reflection_jobs_trigger_type_check;
ALTER TABLE reflection_jobs ADD CONSTRAINT reflection_jobs_trigger_type_check
  CHECK (trigger_type IN (
    'timeline_keep', 'concept_approved', 'forgekeeper_accepted',
    'living_state_transition', 'cross_room_event'
  ));

-- 2. Add source metadata column for structured provenance
ALTER TABLE reflection_jobs ADD COLUMN IF NOT EXISTS
  source_metadata jsonb DEFAULT NULL;

-- 3. Add reflection scope (v1: matches presence_id; v2: shared/house)
ALTER TABLE reflection_jobs ADD COLUMN IF NOT EXISTS
  reflection_scope text DEFAULT NULL;

-- 4. Add created_by tracking
ALTER TABLE reflection_jobs ADD COLUMN IF NOT EXISTS
  created_by text DEFAULT NULL;

-- 5. Per-impact duplicate prevention for cross-room reflection jobs
--    One pending cross-room reflection job per presence + source impact.
CREATE UNIQUE INDEX IF NOT EXISTS reflection_jobs_pending_cross_room_impact_unique
  ON reflection_jobs (
    presence_id,
    trigger_type,
    ((source_metadata->>'source_impact_id'))
  )
  WHERE status = 'pending'
    AND trigger_type = 'cross_room_event'
    AND source_metadata ? 'source_impact_id';

COMMENT ON COLUMN reflection_jobs.source_metadata IS
  'Structured source provenance for cross-room reflection jobs. Null for existing trigger types. Schema: { source_surface, source_event_type, source_event_id, source_impact_id?, source_room_id?, authority_label, eligibility_reason }';

COMMENT ON COLUMN reflection_jobs.reflection_scope IS
  'Scope of the reflection job. v1: matches presence_id (ari/eli). v2: may include shared/house.';

COMMENT ON COLUMN reflection_jobs.created_by IS
  'Who created this job. tara = manual UI action. system_candidate / reflection_hook reserved for future automatic systems.';
