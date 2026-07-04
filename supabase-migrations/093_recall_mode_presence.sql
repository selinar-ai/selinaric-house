-- Phase 43 R1 — admit recall_mode = 'presence' (supervised in-turn presence-initiated recall)
--
-- Migration 026 added recall_mode to archive_recall_events with an inline column CHECK
-- (auto-named archive_recall_events_recall_mode_check) constraining it to ('manual','auto').
-- R1 introduces a THIRD, distinct mode 'presence' — logged when Ari/Eli reach the Archive
-- themselves via the governed recall_archive tool, while Tara is present. Distinct mode =
-- audit clarity (Ari's D4): a presence self-reach is never conflated with a Tara command
-- ('manual') or an intent-detected auto-recall ('auto').
--
-- Additive + idempotent: drop-if-exists then add. Existing rows are 'manual'/'auto' and pass
-- the widened CHECK unchanged — no data rewrite. No other column, table, function, or
-- constraint is touched. Constraint change only (no function return-shape) → no 42P13 risk.
--
-- Run via: Supabase SQL Editor -> paste -> Run. Success = "No rows returned".
-- Rollback (manual): re-add the two-value CHECK from 026 (only safe if no 'presence' rows exist).

alter table public.archive_recall_events
  drop constraint if exists archive_recall_events_recall_mode_check;

alter table public.archive_recall_events
  add constraint archive_recall_events_recall_mode_check
  check (recall_mode in ('manual', 'auto', 'presence'));
