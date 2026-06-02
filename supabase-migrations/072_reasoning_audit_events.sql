-- Phase 38.5.1 — Reasoning Audit Events
-- Schema-only. No data writes. No backfill.
--
-- Audit records trace.
-- Audit does not create truth.
-- Audit does not become evidence.
-- Audit does not move authority.
--
-- Append-only. No UPDATE or DELETE expected.
-- Separate from all authority tables.
-- Never enters evidence packet builders, prompt context, or Memory/Held Truth paths.

create table reasoning_audit_events (
  id uuid primary key default gen_random_uuid(),

  -- The suggestion this reasoning event concerns
  suggestion_id uuid not null references graph_candidate_suggestions(id) on delete restrict,

  -- What happened in the reasoning lifecycle
  event_type text not null,

  -- Whether this was deterministic or LLM-assisted reasoning
  reasoning_mode text not null,

  -- Outcome of this event
  event_status text not null,

  -- Why reasoning was blocked or failed (nullable — only present on non-success)
  failure_code text,

  -- Deterministic baseline metadata — trace only, not evidence
  baseline_evidence_condition text,
  baseline_packet_sufficient boolean,
  baseline_categories text[],

  -- Evidence structure counts — trace only, not content
  archive_source_count integer,
  graph_source_count integer,
  evidence_source_ids uuid[],  -- IDs only, no content — trace metadata

  -- LLM provider metadata
  llm_model text,
  llm_validation_passed boolean,

  -- Governance fields — hardcoded safe values, DB-enforced
  authority_changed boolean not null default false,
  not_evidence boolean not null default true,
  prompt_eligible boolean not null default false,
  review_routed boolean not null default false,

  created_by text not null default 'system',
  created_at timestamptz not null default now(),

  -- ─── Named constraints ────────────────────────────────────────────────────

  constraint rae_event_type_check check (event_type in (
    'llm_draft_requested',
    'llm_precheck_blocked',
    'llm_output_invalid',
    'llm_draft_returned'
  )),

  constraint rae_reasoning_mode_check check (reasoning_mode in (
    'llm_assisted',
    'deterministic'
  )),

  constraint rae_event_status_check check (event_status in (
    'success',
    'blocked',
    'failed'
  )),

  -- Audit never changes authority
  constraint rae_authority_never_changes check (authority_changed = false),

  -- Audit is never evidence
  constraint rae_not_evidence_always_true check (not_evidence = true),

  -- Audit is never prompt eligible
  constraint rae_not_prompt_eligible check (prompt_eligible = false),

  -- Audit never routes to review
  constraint rae_not_review_routed check (review_routed = false),

  -- Source counts must be non-negative if present
  constraint rae_archive_source_count_nonneg check (
    archive_source_count is null or archive_source_count >= 0
  ),
  constraint rae_graph_source_count_nonneg check (
    graph_source_count is null or graph_source_count >= 0
  )
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

create index reasoning_audit_events_suggestion_id_idx
  on reasoning_audit_events (suggestion_id);

create index reasoning_audit_events_created_at_idx
  on reasoning_audit_events (created_at desc);

create index reasoning_audit_events_event_type_idx
  on reasoning_audit_events (event_type);

create index reasoning_audit_events_suggestion_created_idx
  on reasoning_audit_events (suggestion_id, created_at desc);

-- ─── RLS (open v1 — matches existing House tables) ────────────────────────────
-- Private single-user deployment. Server-side writes only via service role.
-- No client-callable write path exists.

alter table reasoning_audit_events enable row level security;

create policy "Allow all access to reasoning_audit_events"
  on reasoning_audit_events for all using (true) with check (true);
