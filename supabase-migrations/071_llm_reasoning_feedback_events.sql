-- Phase 38.4.1 — LLM Reasoning Feedback Events
-- Schema-only. No data writes. No backfill.
--
-- Reasoning explains evidence. Reasoning does not create authority.
-- Feedback evaluates reasoning usefulness only. Feedback does not move truth.
--
-- This table records Tara's feedback on LLM-assisted reasoning drafts.
-- It is separate from all authority tables:
--   archive_items, held_truths, graph_proposals,
--   graph_candidate_suggestions, archive_memory_events
--
-- Feedback is NOT evidence.
-- Feedback is NOT prompt eligible.
-- Feedback does NOT change authority.
-- Feedback does NOT route to review.
-- Feedback does NOT create Memory, Held Truth, or graph proposals.
-- Append-only. No UPDATE or DELETE expected.

create table llm_reasoning_feedback_events (
  id uuid primary key default gen_random_uuid(),

  -- The suggestion this feedback concerns
  suggestion_id uuid not null references graph_candidate_suggestions(id) on delete restrict,

  -- Feedback type — enum
  feedback_type text not null check (feedback_type in (
    'useful',
    'not_useful',
    'needs_evidence',
    'misread',
    'candidate_signal'
  )),

  -- Optional note from Tara (max 500 chars enforced in application layer)
  feedback_note text,

  -- Draft metadata — traceability only, not evidence
  -- Do not store: draft body, prompt, model response, archive content
  draft_model text,
  draft_generated_at timestamptz,

  -- Snapshots of suggestion state at feedback time (server-derived)
  suggestion_status_at_feedback text,
  candidate_type_at_feedback text,

  -- Server-set governance fields — hardcoded safe values
  -- These are DB-enforced; no client override is possible.
  authority_changed boolean not null default false,
  not_evidence boolean not null default true,
  prompt_eligible boolean not null default false,
  review_routed boolean not null default false,

  created_by text not null default 'tara',
  created_at timestamptz not null default now(),

  -- ─── Governance constraints ──────────────────────────────────────────────

  -- feedback never changes authority
  constraint lrfe_authority_never_changes check (authority_changed = false),

  -- feedback is never evidence
  constraint lrfe_not_evidence_always_true check (not_evidence = true),

  -- feedback is never prompt eligible
  constraint lrfe_not_prompt_eligible check (prompt_eligible = false),

  -- feedback never routes to review
  constraint lrfe_not_review_routed check (review_routed = false),

  -- feedback_note max 500 chars
  constraint lrfe_note_length_check check (
    feedback_note is null or char_length(feedback_note) <= 500
  )
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

create index llm_reasoning_feedback_events_suggestion_idx
  on llm_reasoning_feedback_events (suggestion_id, created_at desc);

create index llm_reasoning_feedback_events_type_idx
  on llm_reasoning_feedback_events (feedback_type, created_at desc);

create index llm_reasoning_feedback_events_created_idx
  on llm_reasoning_feedback_events (created_at desc);

-- ─── RLS (open v1 — matches existing House tables) ───────────────────────────
-- Private single-user deployment. Must be hardened before any external/multi-user use.

alter table llm_reasoning_feedback_events enable row level security;

create policy "Allow all access to llm_reasoning_feedback_events"
  on llm_reasoning_feedback_events for all using (true) with check (true);
