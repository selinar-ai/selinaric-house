-- Phase 37B — Graph Proposal Pipeline tables
-- Schema-only. No data writes. No backfill.
--
-- The graph may reveal relationship.
-- The graph may propose meaning.
-- The graph does not crown truth.
--
-- These tables hold pending proposals, not approved graph truth.
-- Proposal is not approval. Approval is not Memory.
-- Graph authority is not Memory authority.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. graph_proposals — pending graph node/edge proposals
-- ═══════════════════════════════════════════════════════════════════════════════

create table graph_proposals (
  id uuid primary key default gen_random_uuid(),

  proposal_type text not null check (proposal_type in ('node', 'edge')),

  status text not null default 'pending_review' check (status in (
    'pending_review',
    'approved_graph',
    'rejected',
    'needs_more_evidence',
    'workspace_only',
    'superseded'
  )),

  presence_scope text not null check (presence_scope in (
    'ari', 'eli', 'shared', 'house', 'none'
  )),

  authority_status text not null check (authority_status in (
    'canonical_supported', 'candidate', 'held_truth', 'archive_supported',
    'library_reference', 'inferred', 'workspace_only', 'rejected', 'superseded'
  )),

  node_type text,
  edge_type text,

  proposed_label text not null,
  proposed_summary text,
  proposed_payload jsonb not null default '{}'::jsonb,

  confidence numeric not null default 0.5 check (confidence >= 0 and confidence <= 1),
  salience numeric not null default 0.5 check (salience >= 0 and salience <= 1),

  reason text not null,
  safe_wording text,
  prompt_eligible boolean not null default false,

  primary_source_type text not null,
  primary_source_id text not null,

  dedupe_key text not null,

  proposed_by text not null default 'graph_pipeline' check (proposed_by in (
    'tara', 'ari', 'eli', 'system_candidate', 'graph_pipeline'
  )),

  generation_model text,
  generation_version text not null default '37B',

  deleted_at timestamptz default null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint graph_proposals_node_edge_shape_check check (
    (proposal_type = 'node' and node_type is not null and edge_type is null)
    or
    (proposal_type = 'edge' and edge_type is not null and node_type is null)
  )
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. graph_proposal_sources — source provenance for proposals
-- ═══════════════════════════════════════════════════════════════════════════════

create table graph_proposal_sources (
  id uuid primary key default gen_random_uuid(),

  proposal_id uuid not null references graph_proposals(id) on delete restrict,

  source_type text not null,
  source_table text,
  source_id text not null,
  source_label text,
  source_excerpt text,
  source_metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. graph_proposal_events — audit trail for proposal lifecycle
-- ═══════════════════════════════════════════════════════════════════════════════

create table graph_proposal_events (
  id uuid primary key default gen_random_uuid(),

  proposal_id uuid not null references graph_proposals(id) on delete restrict,

  event_type text not null check (event_type in (
    'proposal_created',
    'status_changed',
    'marked_needs_more_evidence',
    'marked_workspace_only',
    'approved_graph',
    'rejected',
    'superseded',
    'restored'
  )),

  previous_status text,
  new_status text,

  actor text not null check (actor in (
    'tara', 'ari', 'eli', 'system_candidate', 'graph_pipeline', 'claude_code'
  )),

  reason text,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Indexes
-- ═══════════════════════════════════════════════════════════════════════════════

create index graph_proposals_status_idx
  on graph_proposals (status, created_at desc)
  where deleted_at is null;

create index graph_proposals_scope_idx
  on graph_proposals (presence_scope, status, created_at desc)
  where deleted_at is null;

create index graph_proposals_authority_idx
  on graph_proposals (authority_status, status)
  where deleted_at is null;

create index graph_proposals_primary_source_idx
  on graph_proposals (primary_source_type, primary_source_id, created_at desc)
  where deleted_at is null;

create unique index graph_proposals_pending_dedupe_unique
  on graph_proposals (dedupe_key)
  where status = 'pending_review'
    and deleted_at is null;

create index graph_proposal_sources_proposal_idx
  on graph_proposal_sources (proposal_id);

create index graph_proposal_sources_source_idx
  on graph_proposal_sources (source_type, source_id);

create unique index graph_proposal_sources_unique
  on graph_proposal_sources (proposal_id, source_type, source_id);

create index graph_proposal_events_proposal_idx
  on graph_proposal_events (proposal_id, created_at desc);

create index graph_proposal_events_type_idx
  on graph_proposal_events (event_type, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. RLS (open v1 pattern — matches existing House tables)
-- ═══════════════════════════════════════════════════════════════════════════════

alter table graph_proposals enable row level security;
alter table graph_proposal_sources enable row level security;
alter table graph_proposal_events enable row level security;

create policy "Allow all access to graph_proposals"
  on graph_proposals for all using (true) with check (true);

create policy "Allow all access to graph_proposal_sources"
  on graph_proposal_sources for all using (true) with check (true);

create policy "Allow all access to graph_proposal_events"
  on graph_proposal_events for all using (true) with check (true);
