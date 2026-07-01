# Phase 42.4.1 — Deterministic Graph Proposal Pack — Closure Record

**Phase:** Phase 42.4.1 — Deterministic Graph Proposal Pack (no LLM)
**Branch:** `phase-42-4-1-graph-proposal-pack`
**Base (corrected):** `main@0271003` — the branch was originally built from `d361a4c`, which **drifted / became orphaned** when `main` was rewound to `0271003`; the base drift was corrected before ship-it (work stashed, branch recreated from current `main`, diff reapplied, re-verified) so the final merge is fast-forward only. `d361a4c` was not carried into the merge.
**Migration:** `088_agent_graph_proposals.sql`
**Migration applied:** manually by Tara via Supabase SQL Editor — **"Success. No rows returned"**.
**Implementation commit:** `44b6607` — *Phase 42.4.1: add deterministic graph proposal pack*

## Purpose
The kernel's first inferential-adjacent helper — but v1 is fully **deterministic** and **suggest-only**: propose candidate `shared_source` graph edges for review. **No LLM. No graph truth. No Memory. No prompt mutation. No crowns.** Graph suggests structure; graph does not remember.

## What was built
- **`agent_graph_proposals`** — new agent-side, append-only, review-queued table (deny-by-default RLS; execute-only RPCs). **Target pinned to `archive_graph`; edge-only; `shared_source` only.**
- **DB-boundary verification** in the record RPC: both endpoints must exist + be `approved` + same `archive_name` + canonical (`from < to`); it computes the **live shared-source intersection** (excluding null/blank), requires the supplied refs to equal it exactly, and **stores the DB-computed intersection** (not caller input).
- **DB-verifiable plain dedupe key** (`archive_graph:<from>:<to>:shared_source`) — table CHECK + RPC check; skips existing `shared_source` edges (either direction) and active duplicates.
- **Provenance guards** — `run_id` required; `input_hash` required + sha256-hex (CHECK); `rationale` non-blank (CHECK).
- **Immutable proposal content** after insert — the only UPDATEs are triage (`review_state`/`reviewed_by`/`reviewed_at`) and test cleanup (`deleted_at`); `reviewed_by` is server-derived `tara`.
- **CLI runner** (`scripts/agent-graph-propose.ts`) — explicit `--archive-name`, hard caps (500/5000/200), reads `archive_graph` read-only, records via RPC. No whole-graph default, no scheduler.
- **`/agents` triage-only review surface** — Acknowledge / Dismiss / Reopen; no Add-edge / Approve-to-graph / Promote / Make-Memory / Apply / Run-LLM.
- **Tests** — `phase-42-4-1-{detect, migration-guards, no-execution, route-auth}`. 42.4.1 216 asserts; full phase-42 suite 1231; `tsc`/lint/`next build` green; kernel diff empty.

## Smoke result (test-owned, end-to-end)
- Archive scope `velvet` (23 approved nodes, 46 shared-source candidates).
- 46 test-owned proposals generated; dedupe rerun **0 recorded / 46 skipped**.
- Sample validation passed (existing approved endpoints; DB-verified shared refs present in both nodes; canonical pair; dedupe key; provenance; governance flags).
- Triage worked (`reviewed_by='tara'`); proposal content immutable during triage.
- Cleanup removed all 46; real proposals remained 0; active test-owned returned to 0.
- `archive_graph_nodes` / `archive_graph_edges` / House `graph_proposals` / `memory_nodes` / `memory_edges` all unchanged. **No LLM call.**

## Governance
A proposal is **not graph truth · not Memory · not evidence · not prompt eligible** (`authority_changed=false`, `is_llm_generated=false`, `not_graph_truth=true`). No graph-truth write, no Memory mutation, no prompt-eligibility mutation, no scheduler / daemon / queue / autonomy. It prepares reviewable structure and crowns nothing.

## Next
**Phase 42.4.2** — the future LLM proposal layer — is its own Tier-3 gate. The LLM may only enter **behind the deterministic validators proven here**. **No LLM call is authorised by 42.4.1.**
