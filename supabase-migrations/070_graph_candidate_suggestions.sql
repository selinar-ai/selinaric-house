-- Phase 37H.1 — Graph-Assisted Candidate Suggestion Contract
-- Schema-only. No data writes. No backfill.
--
-- Graph assistance is evidence support, not Memory authority.
-- A graph-supported candidate is still only a candidate.
-- prompt_eligible is always false on suggestions.
--
-- These tables hold graph-assisted candidate suggestions, not Memory.
-- Suggestion is not candidacy. Candidacy is not Memory.
-- Graph authority is not Memory authority.
-- Nothing self-promotes. Nothing self-injects.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. graph_candidate_suggestions — graph-assisted candidate proposals
-- ═══════════════════════════════════════════════════════════════════════════════

create table graph_candidate_suggestions (
  id uuid primary key default gen_random_uuid(),

  candidate_type text not null check (candidate_type in (
    'memory_candidate',
    'held_truth_candidate'
  )),

  status text not null default 'pending_review' check (status in (
    'pending_review',
    'approved',
    'dismissed',
    'expired'
  )),

  proposed_label text not null,
  proposed_summary text,

  -- Held Truth candidate fields (must be null for memory_candidate)
  proposed_truth_text text,
  target_presence_id text check (target_presence_id in ('ari', 'eli')),

  -- Memory candidate fields (must be null for held_truth_candidate)
  target_archive_item_id uuid references archive_items(id),

  -- Graph evidence — approved nodes, edges, proposals only
  supporting_graph_node_ids uuid[] not null default '{}',
  supporting_graph_edge_ids uuid[] not null default '{}',
  supporting_proposal_ids uuid[] not null default '{}',

  -- Archive evidence — structured with authority snapshot per source
  -- Each element: { archive_item_id, canonical_status_snapshot, evidence_role, used_for_weighting }
  -- Must be a JSON array. Element-level evidence_role constraint enforced below.
  supporting_archive_sources jsonb not null default '[]'::jsonb,

  -- Deduplicated archive item IDs after collapsing graph provenance
  deduplicated_evidence_sources uuid[] not null default '{}',

  evidence_strength text not null default 'moderate' check (evidence_strength in (
    'strong',
    'moderate',
    'weak'
  )),

  reason_for_candidate text not null,
  limits_or_uncertainties text,

  -- Governance context (e.g. approved non-materialised proposals — informational only)
  -- Must be a JSON object, not an array or scalar.
  governance_context jsonb not null default '{}'::jsonb,

  -- prompt_eligible is always false. DB-enforced. No override path.
  prompt_eligible boolean not null default false,

  -- Snapshot of target archive_item's canonical_status at suggestion time.
  -- Must be a known archive status value, or null when no target archive item.
  canonical_status_before text check (canonical_status_before is null or canonical_status_before in (
    'staged',
    'needs_review',
    'canonical_candidate',
    'canonical',
    'duplicate',
    'superseded',
    'archive_only',
    'excluded'
  )),

  created_by text not null default 'tara',
  reviewed_by text,
  reviewed_at timestamptz,

  deleted_at timestamptz default null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- ─── Shape constraints ──────────────────────────────────────────────────────

  -- held_truth_candidate requires target_presence_id
  constraint gcs_held_truth_presence_check check (
    candidate_type != 'held_truth_candidate' or target_presence_id is not null
  ),

  -- held_truth_candidate requires proposed_truth_text
  constraint gcs_held_truth_text_check check (
    candidate_type != 'held_truth_candidate' or proposed_truth_text is not null
  ),

  -- held_truth_candidate must not carry memory_candidate fields
  constraint gcs_held_truth_no_archive_check check (
    candidate_type != 'held_truth_candidate' or target_archive_item_id is null
  ),

  -- memory_candidate requires target_archive_item_id
  constraint gcs_memory_archive_check check (
    candidate_type != 'memory_candidate' or target_archive_item_id is not null
  ),

  -- memory_candidate must not carry held_truth_candidate fields
  constraint gcs_memory_no_presence_check check (
    candidate_type != 'memory_candidate' or target_presence_id is null
  ),
  constraint gcs_memory_no_truth_text_check check (
    candidate_type != 'memory_candidate' or proposed_truth_text is null
  ),

  -- canonical_status_before only meaningful when a target archive item exists
  constraint gcs_canonical_status_requires_archive check (
    canonical_status_before is null or target_archive_item_id is not null
  ),

  -- prompt_eligible is always false — hardcoded DB constraint
  constraint gcs_prompt_eligible_check check (prompt_eligible = false),

  -- supporting_archive_sources must be a JSON array
  constraint gcs_archive_sources_is_array check (
    jsonb_typeof(supporting_archive_sources) = 'array'
  ),

  -- governance_context must be a JSON object
  constraint gcs_governance_context_is_object check (
    jsonb_typeof(governance_context) = 'object'
  ),

  -- ─── Evidence role safety ───────────────────────────────────────────────────
  -- A canonical_candidate archive source must never have evidence_role
  -- 'confirmed_memory_evidence'. A canonical_candidate is not confirmed Memory.
  --
  -- Uses JSONPath to check that no element in supporting_archive_sources has both
  -- canonical_status_snapshot='canonical_candidate' AND
  -- evidence_role='confirmed_memory_evidence'.
  constraint gcs_no_candidate_as_confirmed_evidence check (
    not jsonb_path_exists(
      supporting_archive_sources,
      '$[*] ? (@.canonical_status_snapshot == "canonical_candidate" && @.evidence_role == "confirmed_memory_evidence")'
    )
  )
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. graph_candidate_suggestion_events — audit trail
-- ═══════════════════════════════════════════════════════════════════════════════

create table graph_candidate_suggestion_events (
  id uuid primary key default gen_random_uuid(),

  suggestion_id uuid not null references graph_candidate_suggestions(id) on delete restrict,

  event_type text not null check (event_type in (
    'suggestion_created',
    'status_changed',
    'approved',
    'dismissed',
    'expired',
    'restored'
  )),

  previous_status text,
  new_status text,

  actor text not null check (actor in (
    'tara', 'ari', 'eli', 'system', 'claude_code'
  )),

  reason text,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Indexes
-- ═══════════════════════════════════════════════════════════════════════════════

create index graph_candidate_suggestions_status_idx
  on graph_candidate_suggestions (status, created_at desc)
  where deleted_at is null;

create index graph_candidate_suggestions_type_idx
  on graph_candidate_suggestions (candidate_type, status)
  where deleted_at is null;

create index graph_candidate_suggestions_target_archive_idx
  on graph_candidate_suggestions (target_archive_item_id)
  where deleted_at is null;

create index graph_candidate_suggestion_events_suggestion_idx
  on graph_candidate_suggestion_events (suggestion_id, created_at desc);

create index graph_candidate_suggestion_events_type_idx
  on graph_candidate_suggestion_events (event_type, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. RLS
-- ═══════════════════════════════════════════════════════════════════════════════
-- Open v1 pattern — matches all existing House tables.
-- Selináric House is a private single-user deployment.
-- RLS must be hardened before any external, public, or multi-user use.

alter table graph_candidate_suggestions enable row level security;
alter table graph_candidate_suggestion_events enable row level security;

create policy "Allow all access to graph_candidate_suggestions"
  on graph_candidate_suggestions for all using (true) with check (true);

create policy "Allow all access to graph_candidate_suggestion_events"
  on graph_candidate_suggestion_events for all using (true) with check (true);
