-- Phase 22B.1 — Build archive: soft-delete support for duplicate/stale builds
-- Adds archive metadata columns to builds.
-- Archived builds are excluded from all active/history API responses by default.
-- Build history events preserve the full audit trail.

ALTER TABLE builds
  ADD COLUMN archived_at  timestamptz,
  ADD COLUMN archived_reason text;

-- Index for efficient "exclude archived" filtering
CREATE INDEX ON builds (desk_status) WHERE desk_status = 'Archived';

-- Comment on status transitions
-- When a build is archived:
--   desk_status    → 'Archived'
--   archived_at    → timestamp of archival
--   archived_reason → optional note (e.g. "Duplicate of ARI-004")
--   workshop_status → unchanged (preserve audit trail, excluded by API filters)
