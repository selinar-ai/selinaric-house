-- Phase 30B — Archive Eligibility Events
-- Dedicated audit table for routing-flag changes (eligible_for_recall, etc.).
-- Separate from archive_memory_events which tracks canonical_status transitions.
-- Eligibility flags are routing flags, not truth flags.

create table if not exists archive_eligibility_events (
  id              uuid        primary key default gen_random_uuid(),
  event_type      text        not null check (event_type in (
    'recall_backfill',
    'recall_toggle',
    'embedding_backfill',
    'graph_backfill'
  )),
  items_affected  int         not null default 0,
  items_scanned   int         not null default 0,
  breakdown       jsonb,                        -- { by_archive, by_owner, by_visibility, by_sensitivity, by_category }
  sample_titles   text[],                       -- up to 10 affected entry titles for audit trail
  created_by      text        not null default 'tara',
  created_at      timestamptz not null default now()
);

create index if not exists archive_eligibility_events_created_idx
  on archive_eligibility_events (created_at desc);

-- RLS — matches permissive pattern used by all other archive tables
alter table archive_eligibility_events enable row level security;

drop policy if exists "archive_eligibility_events_open" on archive_eligibility_events;

create policy "archive_eligibility_events_open"
  on archive_eligibility_events
  for all
  using (true)
  with check (true);
