-- Phase 27E — Archive Item Edit Events
-- Audit table for content/metadata edits on archive entries.
-- Separate from archive_memory_events (canonical_status transitions)
-- and archive_eligibility_events (routing-flag batch changes).
-- Edits are text/metadata refinements, not Memory status changes.

create table if not exists archive_item_edit_events (
  id              uuid        primary key default gen_random_uuid(),
  archive_item_id uuid        not null references archive_items(id) on delete cascade,
  changed_fields  text[]      not null,     -- e.g. ARRAY['title', 'raw_content']
  before_values   jsonb       not null,     -- { "title": "old title", ... }
  after_values    jsonb       not null,     -- { "title": "new title", ... }
  edit_reason     text,                     -- optional reason/note from editor
  created_by      text        not null default 'tara',
  created_at      timestamptz not null default now()
);

create index if not exists archive_item_edit_events_item_idx
  on archive_item_edit_events (archive_item_id, created_at desc);

create index if not exists archive_item_edit_events_created_idx
  on archive_item_edit_events (created_at desc);

-- RLS — matches permissive pattern used by all other archive tables
alter table archive_item_edit_events enable row level security;

drop policy if exists "archive_item_edit_events_open" on archive_item_edit_events;

create policy "archive_item_edit_events_open"
  on archive_item_edit_events
  for all
  using (true)
  with check (true);
