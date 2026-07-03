# Phase 43.A — Wave 1 Checkpoint Record

**Date:** 3 Jul 2026 · **Status:** Wave 1 COMPLETE and accepted; **Wave 2 NOT started**
**Branch:** `phase-43-a` (P0 commit `7300097`; nothing pushed/merged)
**Authorisation:** Ari's 43.A runbook acceptance (P0 + Wave 1 only; runbook Google Doc on file)

## P0 — persist-real gate (built and verified)

The 42.3.3a persistence runners were hardcoded test-owned by design. P0 added the
Phase 43.A gate: real persistence requires **both** `--persist-real` and
`--confirm-persist-real` (one alone refuses), must declare `--max-findings`
(no real run may be unbounded), is stamped `requested_by='tara'`, and the report is
built **before** persisting — an over-cap report persists nothing. Default behaviour
remains byte-identical test-owned. Pure gate module (`src/lib/agents/persistence/gate.ts`)
+ 101 guard asserts (`phase-43-a-persist-gate.test.ts`). Code-only; **no migration**.
Verification: all 42.3.3a suites unchanged, full phase-42+43 regression 1486/0,
`tsc`/lint/`next build` clean, kernel diff EMPTY, changed files = approved scope exactly.

## Wave 1 — the House's first real agent rows

**R1 — archive_graph findings persist (REAL):** run `61eb17cb`, `--scope whole_graph`,
cap 40 → **31 findings, exactly the pre-measured count** (29 `orphan_node`,
1 `edge_missing_provenance`, 1 `node_missing_provenance`). All real, zero test-owned,
`requested_by='tara'`, not capped.

**R2 — deterministic graph proposals (REAL):** run `aa79b53b`, `--archive-name velvet`
→ **recorded 46, skipped 0** (declared stop 60; code cap 200). All 46 verified
deterministic-class (`shared_source` / `shared_source_v1` / `is_llm_generated=false` /
no LLM provenance). **Dedupe rerun: recorded 0, skipped 46.**

## Checkpoint deltas (before → after)

| Surface | Before | After |
|---|---|---|
| `agent_findings` (real) | 0 | **31** |
| `agent_runs` | 0 | **1** |
| `agent_graph_proposals` (real) | 0 | **46** |
| `helper_outputs` (real) | 2 | 2 (unchanged — no helper runs in Wave 1) |

**Non-write surfaces byte-identical:** `library_items` 49, `library_item_files` 44,
`archive_graph_nodes` 105, `archive_graph_edges` 109, `graph_proposals` 43,
`memory_nodes` 263, `memory_edges` 185, `archive_items` 922.

## Governance confirmations

Real rows were created **only** in the authorised agent-side queues
(`agent_runs`, `agent_findings`, `agent_graph_proposals`). No Memory, graph-truth,
`archive_graph`, House `graph_proposals`, or prompt-eligibility mutation. No live LLM,
no provider SDK, no scheduler/daemon/queue/autonomy, no Hand apply/rollback.
Real rows are the product: no bulk-delete path exists; un-wanting one = triage dismissal.
`/agents` now renders real work for Tara's triage.

## Next

Wave 2 (library findings persist · violet proposals · 5 helpers × 2 Tara-named items)
is **held** pending: Tara's item selection from the proposed shortlist, and Tara/Ari
acceptance of the Wave 2 pre-run declaration (compact D7 form).
