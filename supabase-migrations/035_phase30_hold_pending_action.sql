-- Phase 30 — Recall Governance & Promotion
-- Adds 'hold_pending' to the archive_memory_events action CHECK constraint.
-- hold_pending records an explicit decision to defer — Tara chose to keep the
-- item in its current state rather than confirm or reject.
-- from_status = to_status (no canonical_status transition occurs).
-- reason is optional — stored in the existing reason column.
--
-- canonical_status remains the single Memory authority.
-- hold_pending does not affect recall, embedding, or graph eligibility.

-- Drop and recreate the CHECK constraint to include hold_pending.
alter table archive_memory_events
  drop constraint if exists archive_memory_events_action_check;

alter table archive_memory_events
  add constraint archive_memory_events_action_check
  check (action in (
    'mark_candidate',
    'confirm_memory',
    'reject_memory',
    'demote_memory',
    'restore_candidate',
    'hold_pending'
  ));
