-- Phase 41.7 — Helper Output Review State (persistence only)
-- Additive. Adds review_state to helper_outputs with a CHECK over the six
-- Phase 41.6 review-support states, default 'unreviewed'. Existing rows take the
-- default — nothing is marked reviewed/viewed/useful/dismissed/needs_action/
-- needs_decision by this migration.
--
-- No review is performed here:
--   * reviewed_by / reviewed_at are NOT set or repurposed
--   * human_review_required stays locked true
--   * review_routed stays false
--   * no authority invariant is touched (not_memory / not_evidence /
--     prompt_eligible / authority_changed remain exactly as locked in 074)
--
-- Review state is workflow metadata, not authority. It is not Memory, not
-- evidence, not prompt authority, not Library truth, not approval, and not the
-- application of a helper suggestion. Storage capacity only — no execution.
--
-- Additive only: one ADD COLUMN + one named CHECK + one index. No DROP, no
-- RENAME, no FK, no CASCADE, no trigger, no change to existing constraints.

alter table helper_outputs
  add column review_state text not null default 'unreviewed',
  add constraint ho_review_state_vocab check (
    review_state in (
      'unreviewed',
      'viewed',
      'dismissed',
      'useful',
      'needs_action',
      'needs_decision'
    )
  );

create index helper_outputs_review_state_idx
  on helper_outputs (review_state);
