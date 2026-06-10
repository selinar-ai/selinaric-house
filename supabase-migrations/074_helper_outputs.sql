-- Phase 41.2 — Helper Output Schema (helper_outputs ledger)
-- Schema-only. No data writes. No backfill. No ALTER/DROP of existing tables.
--
-- Mirrors the committed Phase 41.1 helper contract (src/lib/helpers/helperContract.ts):
--   commit 6fd8656 — helper contract and type model
--   commit c33aefd — require helper output provenance (non-empty source_refs)
--
-- Helper Law:
--   Helpers can find, prepare, compare, suggest, queue.
--   Helpers cannot decide, remember, canonise, inject, override, become authority.
--
-- This ledger is TRACE, not truth.
--   Helper output is never Memory, never evidence, never prompt-eligible.
--   Acceptance by a human is helper labour acceptance only — it does NOT move
--   authority. Any later authority change happens through a separate governed
--   surface, never here.
--
-- Safety posture:
--   * Category A / protected / soft-delete only (deleted_at). No hard-delete path.
--   * No FK into any table — provenance is stored as ids inside source_refs jsonb,
--     so the ledger sits outside every CASCADE path (incl. the library_items
--     CASCADE) and reads production by id-record only.
--   * No CASCADE inbound. No existing table is altered or dropped.
--   * Only the v1-allowed helper type (library_metadata_helper) may be persisted.

create table helper_outputs (
  id uuid primary key default gen_random_uuid(),

  -- ── Closed vocabularies (mirror helperContract.ts unions) ──
  helper_type      text not null,
  output_status    text not null default 'draft_only',
  suggested_action text not null,
  confidence_label text not null,
  presence_scope   text not null,
  created_by       text not null,

  -- ── Provenance (Option B). jsonb array of { source_surface, source_id }. ──
  -- Load-bearing for the anti-aggregation controls (C5). MUST be non-empty
  -- (Phase 41.1 c33aefd / no ghost diagnostics). Surface readability and the
  -- helper/surface allow-list are enforced by the trigger below.
  source_refs jsonb not null,

  -- Free-form suggestion content. No authority, no executable action.
  suggestion_payload jsonb,

  -- ── Invariant flags — authority is locked off ──
  not_memory            boolean not null default true,
  not_evidence          boolean not null default true,
  prompt_eligible       boolean not null default false,
  authority_changed     boolean not null default false,
  human_review_required boolean not null default true,
  -- The one flag that may vary; carries no authority either way.
  review_routed         boolean not null default false,

  -- ── Review lifecycle (a single human action, recorded as trace) ──
  reviewed_by text,            -- v1: 'tara' only (see check below)
  reviewed_at timestamptz,

  -- ── Housekeeping / safety ──
  test_owned boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,      -- soft-delete only (Category A discipline)

  -- ─── Locked-invariant CHECKs (the DB backstop) ──────────────────────────────
  constraint ho_not_memory_locked        check (not_memory = true),
  constraint ho_not_evidence_locked      check (not_evidence = true),
  constraint ho_prompt_ineligible_locked check (prompt_eligible = false),
  constraint ho_authority_unchanged_lock check (authority_changed = false),
  constraint ho_human_review_locked      check (human_review_required = true),

  -- ─── Closed-vocabulary CHECKs (mirror the TS unions) ────────────────────────
  -- v1: only the one v1-allowed helper type may be persisted.
  constraint ho_helper_type_v1 check (
    helper_type = 'library_metadata_helper'
  ),
  constraint ho_status_vocab check (
    output_status in (
      'draft_only', 'deterministic_check', 'queued_for_review',
      'needs_human_review', 'accepted_by_human', 'rejected_by_human', 'superseded'
    )
  ),
  constraint ho_action_vocab check (
    suggested_action in (
      'review_metadata', 'normalise_title', 'add_summary', 'add_tags',
      'check_extraction_status', 'flag_missing_attachment_text',
      'flag_stale_document', 'compare_sources', 'prepare_review_note', 'no_action'
    )
  ),
  constraint ho_confidence_vocab check (
    confidence_label in ('low', 'medium', 'high', 'structural', 'not_applicable')
  ),
  -- No 'both' / 'merged' — cross-presence private leakage is unrepresentable.
  constraint ho_presence_scope_vocab check (
    presence_scope in ('ari', 'eli', 'shared', 'house', 'none')
  ),
  -- created_by closed union (Phase 41.1 Refinement 2).
  constraint ho_created_by_vocab check (
    created_by in ('helper_contract', 'system_candidate', 'tara', 'test')
  ),
  -- reviewed_by closed to 'tara' only in v1 (a human action is the authority event).
  constraint ho_reviewed_by_v1 check (
    reviewed_by is null or reviewed_by = 'tara'
  ),

  -- ─── Provenance present CHECK (non-empty; c33aefd mirror) ───────────────────
  constraint ho_provenance_present check (
    jsonb_typeof(source_refs) = 'array' and jsonb_array_length(source_refs) >= 1
  )
);

-- ─── Source-ref validation trigger ────────────────────────────────────────────
-- Enforces what a row-level CHECK cannot iterate:
--   (a) every source_ref surface is a READABLE surface — forbidden surfaces,
--       including 'helper_output', are rejected (C1 / C5: no helper-output,
--       private, or evidence provenance; self-citation impossible);
--   (b) the (helper_type, source_surface) pair is on the v1 allow-list — for
--       library_metadata_helper, only 'library_item' / 'library_item_file'.
-- This is the DB mirror of canHelperReadSource() + validateHelperOutputDraft().

create or replace function validate_helper_output_source_refs()
returns trigger
language plpgsql
as $$
declare
  ref jsonb;
  surface text;
  sid text;
  readable_surfaces text[] := array[
    'library_item', 'library_item_file', 'archive_item_metadata',
    'graph_proposal_metadata', 'graph_node_metadata', 'graph_edge_metadata',
    'recall_eval_case', 'workshop_build_metadata'
  ];
  allowed_for_helper text[];
begin
  -- Defence-in-depth: the CHECK also enforces non-empty array.
  if jsonb_typeof(NEW.source_refs) is distinct from 'array'
     or jsonb_array_length(NEW.source_refs) < 1 then
    raise exception 'helper_outputs.source_refs must be a non-empty array (row %)', NEW.id;
  end if;

  -- v1 helper/surface allow-list. Only library_metadata_helper is v1-allowed.
  if NEW.helper_type = 'library_metadata_helper' then
    allowed_for_helper := array['library_item', 'library_item_file'];
  else
    -- The ho_helper_type_v1 CHECK already blocks this; belt-and-braces.
    raise exception 'helper_type % is not v1-allowed', NEW.helper_type;
  end if;

  for ref in select value from jsonb_array_elements(NEW.source_refs)
  loop
    surface := ref->>'source_surface';
    sid := ref->>'source_id';

    if sid is null or length(sid) = 0 then
      raise exception 'helper_outputs source_ref has empty source_id (row %)', NEW.id;
    end if;

    -- (a) Readable-only. Forbidden surfaces (incl. helper_output) rejected.
    if surface is null or not (surface = any(readable_surfaces)) then
      raise exception 'helper_outputs source_ref surface % is not a readable surface (row %)', surface, NEW.id;
    end if;

    -- (b) Helper/surface allow-list.
    if not (surface = any(allowed_for_helper)) then
      raise exception 'helper % may not read source surface % (row %)', NEW.helper_type, surface, NEW.id;
    end if;
  end loop;

  return NEW;
end;
$$;

create trigger trg_validate_helper_output_source_refs
  before insert or update on helper_outputs
  for each row
  execute function validate_helper_output_source_refs();

-- ─── Indexes ──────────────────────────────────────────────────────────────────
-- For the future Helper Review surface (41.4) and aggregate monitoring.

create index helper_outputs_helper_type_idx
  on helper_outputs (helper_type);

create index helper_outputs_output_status_idx
  on helper_outputs (output_status);

create index helper_outputs_created_at_idx
  on helper_outputs (created_at desc);

-- Active (non-deleted) rows only.
create index helper_outputs_active_idx
  on helper_outputs (created_at desc)
  where deleted_at is null;

-- ─── RLS (open v1 — matches existing House tables) ────────────────────────────
-- Private single-user deployment. Server-side writes only via service role.
-- The CHECK constraints and the validation trigger still apply (they are not RLS).

alter table helper_outputs enable row level security;

create policy "Allow all access to helper_outputs"
  on helper_outputs for all using (true) with check (true);
