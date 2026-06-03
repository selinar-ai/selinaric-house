-- Phase 39.7 — Runtime Recall Advisory Trace
--
-- Metadata-only trace of Recall Packet Advisory events for /recall debug visibility.
-- This table is NOT Memory. NOT evidence. NOT audit authority. NOT a prompt source.
-- It must never be used as a RecallPacket source surface.
-- It must never become a prompt source for Ari, Eli, or Lounge.
--
-- Retention guidance: short-lived operational metadata.
--   Default expected: last 100–250 rows or last 30 days.
--   Pruning can be deferred to a later cleanup phase.
--
-- DB constraints enforce the authority boundaries permanently.
-- No raw content, no prompts, no user messages, no source IDs, no Memory IDs,
-- no assistant responses, no model output, no secrets.

CREATE TABLE runtime_recall_advisory_traces (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),

  trace_kind       text        NOT NULL DEFAULT 'recall_advisory',
  route_surface    text        NOT NULL,
  presence_id      text        NOT NULL,
  room_context     text        NOT NULL,

  packet_id        text,
  primary_response_instruction text,
  grounding_condition          text,
  conflict_count               integer NOT NULL DEFAULT 0,

  active_source_count          integer NOT NULL DEFAULT 0,
  excluded_source_count        integer NOT NULL DEFAULT 0,

  confirmed_memory_count       integer NOT NULL DEFAULT 0,
  recent_continuity_count      integer NOT NULL DEFAULT 0,
  journal_count                integer NOT NULL DEFAULT 0,
  library_count                integer NOT NULL DEFAULT 0,
  cross_room_count             integer NOT NULL DEFAULT 0,
  archive_recall_count         integer NOT NULL DEFAULT 0,
  unknown_count                integer NOT NULL DEFAULT 0,
  insufficient_count           integer NOT NULL DEFAULT 0,

  excluded_scope_count                 integer NOT NULL DEFAULT 0,
  excluded_expired_count               integer NOT NULL DEFAULT 0,
  excluded_low_relevance_count         integer NOT NULL DEFAULT 0,
  excluded_not_prompt_eligible_count   integer NOT NULL DEFAULT 0,

  advisory_inserted    boolean NOT NULL DEFAULT false,
  advisory_error       boolean NOT NULL DEFAULT false,
  error_code           text,

  -- Governance constraints — these columns are DB-constrained true/false permanently.
  -- They document the authority boundary that can never be overridden.
  not_memory           boolean NOT NULL DEFAULT true,
  not_evidence         boolean NOT NULL DEFAULT true,
  not_prompt_eligible  boolean NOT NULL DEFAULT true,
  authority_changed    boolean NOT NULL DEFAULT false,
  review_routed        boolean NOT NULL DEFAULT false
);

-- ─── Governance constraints ──────────────────────────────────────────────────
-- These enforce the authority boundary at DB level, consistent with Phase 38 pattern.

ALTER TABLE runtime_recall_advisory_traces
  ADD CONSTRAINT rrat_not_memory_always_true
    CHECK (not_memory = true),
  ADD CONSTRAINT rrat_not_evidence_always_true
    CHECK (not_evidence = true),
  ADD CONSTRAINT rrat_not_prompt_eligible_always_true
    CHECK (not_prompt_eligible = true),
  ADD CONSTRAINT rrat_authority_never_changes
    CHECK (authority_changed = false),
  ADD CONSTRAINT rrat_review_never_routed
    CHECK (review_routed = false);

-- ─── Count non-negativity ────────────────────────────────────────────────────

ALTER TABLE runtime_recall_advisory_traces
  ADD CONSTRAINT rrat_counts_non_negative CHECK (
    conflict_count >= 0 AND
    active_source_count >= 0 AND
    excluded_source_count >= 0 AND
    confirmed_memory_count >= 0 AND
    recent_continuity_count >= 0 AND
    journal_count >= 0 AND
    library_count >= 0 AND
    cross_room_count >= 0 AND
    archive_recall_count >= 0 AND
    unknown_count >= 0 AND
    insufficient_count >= 0 AND
    excluded_scope_count >= 0 AND
    excluded_expired_count >= 0 AND
    excluded_low_relevance_count >= 0 AND
    excluded_not_prompt_eligible_count >= 0
  );

-- ─── Allowed enum values ─────────────────────────────────────────────────────

ALTER TABLE runtime_recall_advisory_traces
  ADD CONSTRAINT rrat_route_surface_valid CHECK (
    route_surface IN ('ari_chat', 'eli_chat', 'lounge_chat')
  ),
  ADD CONSTRAINT rrat_presence_id_valid CHECK (
    presence_id IN ('ari', 'eli')
  ),
  ADD CONSTRAINT rrat_room_context_valid CHECK (
    room_context IN ('ari_room', 'eli_room', 'lounge')
  );

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX rrat_created_at_idx
  ON runtime_recall_advisory_traces(created_at DESC);

CREATE INDEX rrat_presence_route_idx
  ON runtime_recall_advisory_traces(presence_id, route_surface, created_at DESC);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Open in v1 (single-user private deployment, consistent with other House tables).

ALTER TABLE runtime_recall_advisory_traces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Open access v1"
  ON runtime_recall_advisory_traces
  USING (true)
  WITH CHECK (true);
