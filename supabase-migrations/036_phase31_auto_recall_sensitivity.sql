-- Phase 31 — Controlled Recall Integration
-- Adds exclude_elevated_sensitivity toggle to archive_auto_recall_settings.
--
-- Purpose: Auto-recall should not inject elevated sensitivity items
-- (sacred, sensitive, technical) into chat context by default.
-- This is a safety gate — not a Memory authority change.
-- canonical_status remains the single Memory authority.
-- This toggle only controls whether elevated canonical Memory may enter auto-recall.
--
-- Default: true (exclude elevated items from auto-recall).
-- Tara may opt-in elevated items per presence by setting to false.

ALTER TABLE archive_auto_recall_settings
  ADD COLUMN IF NOT EXISTS exclude_elevated_sensitivity BOOLEAN NOT NULL DEFAULT true;
