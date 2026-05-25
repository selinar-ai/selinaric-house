-- Phase 36H.2: Expand journal_jobs for cross-room journal invitations
--
-- Adds reason = 'cross_room_invite' to the allowed reason values.
-- Adds nullable source_metadata jsonb column for structured provenance.
--
-- Existing no_entry_today and manual_invite jobs are unaffected.
-- source_metadata will be NULL for those existing reasons.
--
-- Run in Supabase SQL Editor -> expect "No rows returned".

-- 1. Expand reason constraint to allow cross_room_invite
ALTER TABLE journal_jobs DROP CONSTRAINT journal_jobs_reason_check;
ALTER TABLE journal_jobs ADD CONSTRAINT journal_jobs_reason_check
  CHECK (reason IN ('no_entry_today', 'manual_invite', 'cross_room_invite'));

-- 2. Add source metadata column for structured provenance
ALTER TABLE journal_jobs ADD COLUMN IF NOT EXISTS
  source_metadata jsonb DEFAULT NULL;

COMMENT ON COLUMN journal_jobs.source_metadata IS
  'Structured source provenance for source-linked invitations. Null for no_entry_today and manual_invite. Schema: { source_surface, source_event_type, source_event_id, source_impact_id?, source_room_id?, authority_label, eligibility_reason }';
