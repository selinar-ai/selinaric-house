# Phase 42.4.2a — LLM Graph Proposal Cage (Fixture-Only) — Closure Record

**Status:** CLOSED · shipped 3 Jul 2026
**Implementation commit:** `fbad79b` (branch `phase-42-4-2a-llm-postgate`, based on `main@9f79d26`)
**Migration:** `089_agent_graph_proposals_llm_fixture.sql` — **applied and live** (Tara, SQL Editor, "Success. No rows returned"; first attempt failed `42P13`, rolled back cleanly and fully, retried after the drop-function-first patch)

## What shipped

The kernel's first LLM-in-the-loop threshold, built **cage-first with no model**:

- **Typed class extension of `agent_graph_proposals`** (migration 089): deterministic 42.4.1
  rows (`shared_source` / `shared_source_v1`, no LLM provenance) are byte-for-byte unchanged;
  LLM-class rows are separately and more strictly constrained by the `agp_class_typed` CHECK —
  **structurally fixture-only**: `generation_mode = 'fixture'` (no `'live'` value exists in
  this phase), `test_owned = true`, edge whitelist `contrasts_with` / `precedes` / `extends`,
  `rule_id = 'llm_edge_v1'`, non-blank `model_id` + `prompt_version`, non-null JSON-object
  `model_settings`, `confidence >= 0.7 and <= 1`. Dedupe key generalised to
  `archive_graph:from:to:edge_type` (backward-compatible with shipped `shared_source` rows).
- **`agent_graph_llm_proposal_record`** — execute-only `SECURITY DEFINER` RPC, the DB-boundary
  post-gate: raises `LIVE_NOT_AUTHORISED` for any non-fixture mode, re-verifies endpoints
  approved + same-archive, canonical pair, whitelist, provenance, confidence floor, and
  source-refs ⊆ union of endpoint evidence; skips existing edges and active dupes; inserts
  only `is_llm_generated=true, generation_mode='fixture', test_owned=true`.
- **`llm_postgate.ts`** — pure deterministic post-gate (no I/O, no DB, no LLM), fail-closed
  on unknown fields; the LLM's confidence is a floor, never an override.
- **Fixture-only CLI runner** (`scripts/agent-graph-llm-fixture.ts`) — reads a simulated-output
  JSON file; **there is no model call anywhere in the slice**.
- **Three test suites** (postgate 25 / migration-guards 52 / no-execution 72 asserts).

## Governed smoke (accepted by Ari)

Archive `velvet`, real approved canonical pair, 1 valid + 10 planted hallucinations:
valid recorded test-owned only; all 10 plants rejected with correct reasons; dedupe rerun
recorded 0 (`DUPLICATE_PENDING`); triage acknowledge→reopen→dismiss with server-derived
`reviewed_by='tara'`; 6 DB-boundary negatives (incl. `LIVE_NOT_AUTHORISED`,
`MODEL_SETTINGS_REQUIRED`) all raised pre-insert; cleanup soft-cleaned the fixture rows.
Before/after House counts identical.

## Governance confirmations

- 42.4.2a is **fixture-only**; no live LLM call exists and none is possible structurally.
- No provider SDK imported anywhere in the slice.
- No graph-truth write, no `archive_graph` mutation, no House `graph_proposals` mutation.
- No Memory mutation; no prompt-eligibility mutation.
- No scheduler / daemon / queue / autonomy; trigger is an explicit CLI fixture runner.
- **Real proposals remain 0**; all test-owned fixture proposals soft-cleaned.
- Proposal ≠ graph truth ≠ Memory. The cage crowns nothing.

## Next gate

**42.4.2b — live LLM proposal generation** behind this proven cage: provider/model choice,
cost ceiling and caps, bounded pre-gate context, and its own migration to admit
`generation_mode='live'` — a separate Tier-3 gate, **not started**.
