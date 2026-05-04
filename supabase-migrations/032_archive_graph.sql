-- Phase 29B — Archive Graph Memory Extraction
--
-- Three new tables:
--   archive_graph_extraction_events — audit log for each extraction run
--   archive_graph_nodes             — proposed concept/person/phase/rule_or_law/ritual/thread nodes
--   archive_graph_edges             — proposed relationships between nodes
--
-- Laws:
--   Graph extracts. Graph proposes. Graph does not decide.
--   No canonical_status changes during extraction.
--   No archive_memory_events writes during extraction.
--   Candidates require Tara approval (approval_status: pending → approved | rejected).
--   Edge approval blocked if either endpoint node is rejected.
--
-- Corpus (v1):
--   archive_items WHERE canonical_status IN ('canonical','canonical_candidate')
--   AND deleted_at IS NULL
--   eligible_for_graph column exists (added earlier) but NOT used as filter.
--
-- Node types (v1): concept | person | phase | rule_or_law | ritual | thread
-- Edge types (v1): anchors | shaped_by | contrasts_with | precedes | extends
--
-- Dedup key: (node_type, normalized_label, archive_name) — UNIQUE constraint
-- normalized_label = lower(trim(label))
--
-- Cost cap: max 20 items/run enforced in server logic (not SQL).
--
-- RLS: open in v1 (using (true) with check (true))
--
-- Run via: Supabase Dashboard → SQL Editor → paste → Run
-- Success = "No rows returned"

-- ─── archive_graph_extraction_events ─────────────────────────────────────────

create table if not exists archive_graph_extraction_events (
  id                  uuid        primary key default gen_random_uuid(),
  archive_name        text        not null,
  confirmed_sensitive boolean     not null default false,
  items_processed     int         not null default 0,
  nodes_proposed      int         not null default 0,
  edges_proposed      int         not null default 0,
  errors              int         not null default 0,
  first_error         text,
  status              text        not null default 'complete',
  triggered_at        timestamptz not null default now()
);

alter table archive_graph_extraction_events enable row level security;

create policy "open_read_graph_extraction_events"
  on archive_graph_extraction_events for select
  using (true);

create policy "open_insert_graph_extraction_events"
  on archive_graph_extraction_events for insert
  with check (true);

create policy "open_update_graph_extraction_events"
  on archive_graph_extraction_events for update
  using (true) with check (true);

-- ─── archive_graph_nodes ─────────────────────────────────────────────────────

create table if not exists archive_graph_nodes (
  id                    uuid        primary key default gen_random_uuid(),
  archive_name          text        not null,
  label                 text        not null,
  normalized_label      text        not null,
  node_type             text        not null,
  description           text,
  source_item_ids       text[]      not null default '{}',
  approval_status       text        not null default 'pending',
  reviewed_at           timestamptz,
  extraction_event_id   uuid        not null references archive_graph_extraction_events(id),
  created_at            timestamptz not null default now(),

  -- Dedup: same concept in the same archive cannot exist twice
  unique (node_type, normalized_label, archive_name)
);

alter table archive_graph_nodes enable row level security;

create policy "open_read_graph_nodes"
  on archive_graph_nodes for select
  using (true);

create policy "open_insert_graph_nodes"
  on archive_graph_nodes for insert
  with check (true);

create policy "open_update_graph_nodes"
  on archive_graph_nodes for update
  using (true) with check (true);

create index if not exists idx_graph_nodes_archive_name
  on archive_graph_nodes (archive_name);

create index if not exists idx_graph_nodes_approval_status
  on archive_graph_nodes (approval_status);

create index if not exists idx_graph_nodes_node_type
  on archive_graph_nodes (node_type);

-- ─── archive_graph_edges ─────────────────────────────────────────────────────

create table if not exists archive_graph_edges (
  id                    uuid        primary key default gen_random_uuid(),
  archive_name          text        not null,
  from_node_id          uuid        not null references archive_graph_nodes(id),
  to_node_id            uuid        not null references archive_graph_nodes(id),
  edge_type             text        not null,
  description           text,
  source_item_ids       text[]      not null default '{}',
  approval_status       text        not null default 'pending',
  reviewed_at           timestamptz,
  extraction_event_id   uuid        not null references archive_graph_extraction_events(id),
  created_at            timestamptz not null default now()
);

alter table archive_graph_edges enable row level security;

create policy "open_read_graph_edges"
  on archive_graph_edges for select
  using (true);

create policy "open_insert_graph_edges"
  on archive_graph_edges for insert
  with check (true);

create policy "open_update_graph_edges"
  on archive_graph_edges for update
  using (true) with check (true);

create index if not exists idx_graph_edges_archive_name
  on archive_graph_edges (archive_name);

create index if not exists idx_graph_edges_from_node_id
  on archive_graph_edges (from_node_id);

create index if not exists idx_graph_edges_to_node_id
  on archive_graph_edges (to_node_id);

create index if not exists idx_graph_edges_approval_status
  on archive_graph_edges (approval_status);
