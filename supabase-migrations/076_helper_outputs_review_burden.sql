-- Phase 41.9 — Helper Output Review Burden (persistence only)
-- Additive. Persists the Phase 41.8 review-burden classification on
-- helper_outputs. Storage only — no review execution, no batch review, no
-- queue, no UI, no authority movement. Defaults are CONSERVATIVE: existing rows
-- (created before burden classification existed) become authority_critical /
-- two-gate / not batch-eligible / escalation required, so nothing inherits
-- low-risk or batchable status by accident.
--
-- Review burden is triage metadata, not authority. Risk class is triage, not
-- truth. Priority is queue ordering, not approval. Batch eligibility is
-- permission to GROUP review work later, not to approve it.
--
-- Additive only: ADD COLUMN + named CHECKs + indexes. No DROP, no RENAME, no FK,
-- no CASCADE, no trigger, no UPDATE/backfill, and NO change to the authority
-- invariants or vocabularies locked by migrations 074 and 075.

alter table helper_outputs
  add column risk_class          text    not null default 'authority_critical',
  add column review_priority     text    not null default 'normal',
  add column review_mode         text    not null default 'two_gate_review_required',
  add column batch_eligible      boolean not null default false,
  add column sample_required     boolean not null default false,
  add column escalation_required boolean not null default true,
  add column escalation_reasons  text[]  not null default array['human_judgement_required']::text[],

  -- ── Closed vocabularies (mirror Phase 41.8) ──
  add constraint ho_risk_class_vocab check (
    risk_class in ('low', 'medium', 'high', 'authority_critical')
  ),
  add constraint ho_review_priority_vocab check (
    review_priority in ('routine', 'normal', 'elevated', 'urgent')
  ),
  add constraint ho_review_mode_vocab check (
    review_mode in (
      'no_review_needed', 'batch_review_allowed',
      'individual_review_required', 'two_gate_review_required'
    )
  ),

  -- ── escalation_reasons: every value in the closed vocabulary ──
  add constraint ho_escalation_reasons_vocab check (
    escalation_reasons <@ array[
      'sensitive_scope', 'authority_surface', 'memory_implication',
      'archive_implication', 'prompt_implication', 'reasoning_evidence_implication',
      'graph_implication', 'recall_implication', 'library_mutation_implication',
      'conflicting_sources', 'missing_provenance', 'unsupported_inference',
      'bulk_review_not_allowed', 'human_judgement_required'
    ]::text[]
  ),

  -- ── escalation_required = true must carry at least one reason ──
  add constraint ho_escalation_reasons_when_required check (
    escalation_required = false or cardinality(escalation_reasons) >= 1
  ),

  -- ── escalation_required = false is only allowed for low-risk
  --    no-review-needed / batch-review-allowed cases ──
  add constraint ho_escalation_required_low_only check (
    escalation_required = true
    or (risk_class = 'low' and review_mode in ('no_review_needed', 'batch_review_allowed'))
  ),

  -- ── batch_eligible = true requires the full safe condition ──
  --    (low risk + batch mode + all invariant flags safe + no escalation).
  --    This alone makes medium/high/authority_critical and two-gate rows
  --    non-batchable.
  add constraint ho_batch_eligibility check (
    batch_eligible = false
    or (
          risk_class = 'low'
      and review_mode = 'batch_review_allowed'
      and not_memory = true
      and not_evidence = true
      and prompt_eligible = false
      and authority_changed = false
      and escalation_required = false
    )
  ),

  -- ── two_gate rows are never batch-eligible (explicit; also implied above) ──
  add constraint ho_two_gate_not_batch check (
    review_mode <> 'two_gate_review_required' or batch_eligible = false
  ),

  -- ── authority_critical rows are two-gate and escalation-required ──
  add constraint ho_authority_critical_shape check (
    risk_class <> 'authority_critical'
    or (review_mode = 'two_gate_review_required' and escalation_required = true)
  );

-- ─── Indexes for later review queues (read-only; keep simple) ──────────────────

create index helper_outputs_risk_class_idx          on helper_outputs (risk_class);
create index helper_outputs_review_priority_idx     on helper_outputs (review_priority);
create index helper_outputs_review_mode_idx         on helper_outputs (review_mode);
create index helper_outputs_batch_eligible_idx      on helper_outputs (batch_eligible);
create index helper_outputs_escalation_required_idx on helper_outputs (escalation_required);

-- Composite for a future active-review-queue read path.
create index helper_outputs_review_queue_idx
  on helper_outputs (deleted_at, review_state, risk_class, review_priority);
