-- Phase 29D idempotency patch — track processed archive item IDs per extraction event
--
-- Problem: "already_extracted" preview count was derived solely from
--   archive_graph_nodes.source_item_ids. Items sent to Claude that produced
--   zero graph candidates were not recorded anywhere, so they were re-selected
--   on every subsequent run.
--
-- Fix: add processed_archive_item_ids text[] to archive_graph_extraction_events.
--   Populated with every archive item ID sent to Claude in that run, regardless
--   of whether any nodes/edges were generated for it.
--
--   Preview and extraction exclusion now union:
--     (a) item IDs in archive_graph_nodes.source_item_ids  (existing nodes)
--     (b) item IDs in archive_graph_extraction_events.processed_archive_item_ids
--
-- Backfill: existing events are backfilled from their nodes' source_item_ids
--   (best effort — items that produced no candidates cannot be recovered
--    retrospectively; future runs will be fully accurate).
--
-- Run via: Supabase Dashboard → SQL Editor → paste → Run
-- Success = "No rows returned"

alter table archive_graph_extraction_events
  add column if not exists processed_archive_item_ids text[] not null default '{}';

-- Backfill existing events: collect the union of source_item_ids from all nodes
-- that were created by each event. Items that produced no candidates will remain
-- missing from this column for historical events — this is the known limitation
-- of a retrospective backfill.
update archive_graph_extraction_events e
set processed_archive_item_ids = (
  select coalesce(array_agg(distinct sid), '{}')
  from archive_graph_nodes n
  cross join lateral unnest(n.source_item_ids) as sid
  where n.extraction_event_id = e.id
)
where exists (
  select 1 from archive_graph_nodes n where n.extraction_event_id = e.id
);
