-- Phase 29B patch — archive_graph_extraction_events audit fields
--
-- The original migration 032 used triggered_at but omitted created_at.
-- first_error is already present (no change needed).
--
-- This migration:
--   1. Adds created_at timestamptz not null default now()
--   2. Backfills created_at = triggered_at for existing rows
--      so audit queries ordered by created_at reflect real event time.
--
-- Run via: Supabase Dashboard → SQL Editor → paste → Run
-- Success = "No rows returned"

alter table archive_graph_extraction_events
  add column if not exists created_at timestamptz not null default now();

-- Backfill existing rows: set created_at to triggered_at (original event time)
update archive_graph_extraction_events
  set created_at = triggered_at;
