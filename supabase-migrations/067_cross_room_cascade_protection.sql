-- Phase 36J — Cross-Room Cascade Protection
--
-- Problem: The cross-room event chain uses ON DELETE CASCADE throughout:
--   cross_room_events
--     → cross_room_event_impacts (CASCADE)
--       → cross_room_impact_propagation_candidates (CASCADE from both events + impacts)
--         → cross_room_prompt_carryforwards (CASCADE from events + impacts + candidates)
--
-- Deleting one cross_room_events row silently destroys the ENTIRE chain.
-- This is the same structural pattern that caused the Phase 36I incident.
--
-- This migration:
--   1. Replaces all ON DELETE CASCADE with ON DELETE RESTRICT
--   2. Adds deleted_at soft-delete column to cross_room_events
--   3. Adds test_owned flag to cross_room_events
--
-- Run in Supabase SQL Editor. Paste entire file → Run.
-- Expected result: "Success. No rows returned"


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. cross_room_event_impacts → cross_room_events: CASCADE → RESTRICT
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE cross_room_event_impacts
  DROP CONSTRAINT IF EXISTS cross_room_event_impacts_cross_room_event_id_fkey;

ALTER TABLE cross_room_event_impacts
  ADD CONSTRAINT cross_room_event_impacts_cross_room_event_id_fkey
  FOREIGN KEY (cross_room_event_id) REFERENCES cross_room_events(id) ON DELETE RESTRICT;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. cross_room_impact_propagation_candidates → cross_room_events: CASCADE → RESTRICT
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE cross_room_impact_propagation_candidates
  DROP CONSTRAINT IF EXISTS cross_room_impact_propagation_candidates_cross_room_event_id_fkey;

ALTER TABLE cross_room_impact_propagation_candidates
  ADD CONSTRAINT cross_room_impact_propagation_candidates_cross_room_event_id_fkey
  FOREIGN KEY (cross_room_event_id) REFERENCES cross_room_events(id) ON DELETE RESTRICT;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. cross_room_impact_propagation_candidates → cross_room_event_impacts: CASCADE → RESTRICT
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE cross_room_impact_propagation_candidates
  DROP CONSTRAINT IF EXISTS cross_room_impact_propagation_candidates_cross_room_impact_id_fkey;

ALTER TABLE cross_room_impact_propagation_candidates
  ADD CONSTRAINT cross_room_impact_propagation_candidates_cross_room_impact_id_fkey
  FOREIGN KEY (cross_room_impact_id) REFERENCES cross_room_event_impacts(id) ON DELETE RESTRICT;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. cross_room_prompt_carryforwards → cross_room_events: CASCADE → RESTRICT
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE cross_room_prompt_carryforwards
  DROP CONSTRAINT IF EXISTS cross_room_prompt_carryforwards_cross_room_event_id_fkey;

ALTER TABLE cross_room_prompt_carryforwards
  ADD CONSTRAINT cross_room_prompt_carryforwards_cross_room_event_id_fkey
  FOREIGN KEY (cross_room_event_id) REFERENCES cross_room_events(id) ON DELETE RESTRICT;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. cross_room_prompt_carryforwards → cross_room_event_impacts: CASCADE → RESTRICT
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE cross_room_prompt_carryforwards
  DROP CONSTRAINT IF EXISTS cross_room_prompt_carryforwards_cross_room_impact_id_fkey;

ALTER TABLE cross_room_prompt_carryforwards
  ADD CONSTRAINT cross_room_prompt_carryforwards_cross_room_impact_id_fkey
  FOREIGN KEY (cross_room_impact_id) REFERENCES cross_room_event_impacts(id) ON DELETE RESTRICT;


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. cross_room_prompt_carryforwards → propagation_candidates: CASCADE → RESTRICT
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE cross_room_prompt_carryforwards
  DROP CONSTRAINT IF EXISTS cross_room_prompt_carryforwards_propagation_candidate_id_fkey;

ALTER TABLE cross_room_prompt_carryforwards
  ADD CONSTRAINT cross_room_prompt_carryforwards_propagation_candidate_id_fkey
  FOREIGN KEY (propagation_candidate_id) REFERENCES cross_room_impact_propagation_candidates(id) ON DELETE RESTRICT;


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Soft-delete column on cross_room_events
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE cross_room_events
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN cross_room_events.deleted_at IS
  'Soft-delete timestamp. NULL = live. Set = archived/recoverable. Added Phase 36J.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Test-owned flag on cross_room_events
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE cross_room_events
  ADD COLUMN IF NOT EXISTS test_owned boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN cross_room_events.test_owned IS
  'True = created by automated validation. Safe to clean up. False = production event. Added Phase 36J.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Soft-delete column on presence_journal (enables deleteJournalEntry soft-delete)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE presence_journal
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN presence_journal.deleted_at IS
  'Soft-delete timestamp. NULL = live. Set = archived/recoverable. Added Phase 36J.';


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES — Run after migration to confirm
-- ═══════════════════════════════════════════════════════════════════════════

-- V1: All FKs on cross_room_event_impacts should be RESTRICT
-- SELECT tc.constraint_name, rc.delete_rule
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.referential_constraints rc
--   ON tc.constraint_name = rc.constraint_name
-- WHERE tc.table_name = 'cross_room_event_impacts'
--   AND tc.constraint_type = 'FOREIGN KEY';
-- Expected: delete_rule = RESTRICT

-- V2: All FKs on cross_room_impact_propagation_candidates should be RESTRICT
-- SELECT tc.constraint_name, rc.delete_rule
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.referential_constraints rc
--   ON tc.constraint_name = rc.constraint_name
-- WHERE tc.table_name = 'cross_room_impact_propagation_candidates'
--   AND tc.constraint_type = 'FOREIGN KEY';
-- Expected: all rows show delete_rule = RESTRICT

-- V3: All FKs on cross_room_prompt_carryforwards should be RESTRICT
-- SELECT tc.constraint_name, rc.delete_rule
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.referential_constraints rc
--   ON tc.constraint_name = rc.constraint_name
-- WHERE tc.table_name = 'cross_room_prompt_carryforwards'
--   AND tc.constraint_type = 'FOREIGN KEY';
-- Expected: all rows show delete_rule = RESTRICT

-- V4: deleted_at and test_owned columns exist on cross_room_events
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'cross_room_events'
--   AND column_name IN ('deleted_at', 'test_owned');
-- Expected: 2 rows

-- V5: deleted_at column exists on presence_journal
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'presence_journal'
--   AND column_name = 'deleted_at';
-- Expected: 1 row
