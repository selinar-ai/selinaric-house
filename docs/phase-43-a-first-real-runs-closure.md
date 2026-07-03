# Phase 43.A — First Real Runs (Function-First) — Closure Record

**Status:** CLOSED · shipped 3 Jul 2026
**Branch:** `phase-43-a` (P0 `7300097`, Wave-1 checkpoint `c2d0219`, this closure)
**Constitution:** Phase 43 "Function-First" brief + 43.A runbook + Wave-2 D7 declaration (Google Docs on file), each Ari-accepted before the step it authorised. **No migration** — every table/RPC was already live (075–089).

## What Phase 43.A did

Turned on the already-built, already-proven **suggest-only** machinery for real. The diagnosis
(accepted by Ari): after ~10 proven cage-pattern gates, dormancy had become a larger risk than
mutation for these surfaces. Speed came from batching authorisation — never from weakening an
invariant. Every real run was declared first (surface / runner / scope / cap / write + non-write
surfaces / snapshots / success criteria / stop conditions — the compact D7 form).

## P0 — persist-real gate (`7300097`)

The 42.3.3a persistence runners were hardcoded test-owned. P0 added the gate: real persistence
requires **both** `--persist-real` and `--confirm-persist-real` (one alone refuses), demands
`--max-findings` (no real run may be unbounded), is stamped `requested_by='tara'`, and checks
the cap against the **built** report before anything persists. Default byte-identical test-owned.
Pure gate module + 101 guard asserts. Code-only.

## The real runs (all exactly as declared)

| Run | Scope | Result |
|---|---|---|
| Wave 1 · R1 | archive_graph findings, whole_graph, cap 40 | **31** (= measured), run `61eb17cb` |
| Wave 1 · R2 | velvet deterministic proposals, stop 60 | **46** recorded, 0 skipped; rerun 0/46, run `aa79b53b` |
| Wave 2 · R3 | Library findings, development_documentation, cap 90 | **72** (= measured), run `efc4c563` |
| Wave 2 · R4 | violet deterministic proposals, stop 10 | **5** recorded, 0 skipped; rerun 0/5, run `7e99ac17` |
| Wave 2 · R5 | 5 helpers × 2 Tara-named items, rehearse-then-real | **5** new real rows; real = rehearsal on all 10 invocations |

R5 detail: `b5336eeb` (Phase 33D Extraction Test) → metadata 3 + documentation 1;
`a5753710` (Phase 7A Core Stabilisation, control) → completeness 1, metadata deduped against the
two pre-existing 20 Jun real rows (which target this item). **Control assertion held:**
content-health and source-reference deposited **0** on the healthy control item.
Rehearsal rows (5, test-owned) soft-cleaned to active test-owned **0** before the real run.

## Final state

- **103 real `agent_findings`** (31 archive_graph + 72 library), all `requested_by='tara'`, triage-open in `/agents`
- **51 real `agent_graph_proposals`** (46 velvet + 5 violet), all deterministic-class, triage-open in `/agents`
- **7 active real `helper_outputs`** (2 pre-existing 20 Jun + 5 new), active test-owned **0**, visible in `/helpers`
- **All 8 non-write surfaces byte-identical across S1/S2/S3**: `library_items` 49, `library_item_files` 44, `archive_graph_nodes` 105, `archive_graph_edges` 109, `graph_proposals` 43, `memory_nodes` 263, `memory_edges` 185, `archive_items` 922

## Governance

Real rows are **product, not debris**: no bulk-delete path exists for real review rows; the
rollback posture is governed triage/dismissal only. No Memory, graph-truth, `archive_graph`,
House `graph_proposals`, or prompt-eligibility mutation. No live LLM, no provider SDK, no
scheduler/daemon/queue/autonomy, no Hand apply/rollback, no whitelist expansion. Suggest-only
stayed suggest-only; every row awaits Tara's review. **Crowns nothing.**

## Evidence banked for what's next

- The extraction cluster surfaces through Library **findings** data (47 `library.metadata`
  findings; most dev-doc files are `extraction_status='not_started'` — a queued state the
  content-health helper correctly does not flag as unhealthy).
- This is 43.C's target data: remedy-whitelist candidates should be chosen from these real
  findings, not guessed.

## Next gates (neither started)

- **43.B** — live LLM graph proposals behind the shipped fixture cage (provider, cost ceiling,
  caps, live-mode migration) — full Tier-3 ceremony.
- **43.C** — Remedy Whitelist v2, informed by the 103 real findings — recon first.
