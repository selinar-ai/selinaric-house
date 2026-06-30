# Phase 42.3.3a — Durable Findings Store + Persistence Ingestion — Closure Record

**Phase:** Phase 42.3.3a — Durable Findings Store + Persistence Ingestion
**Branch:** `phase-42-3-3a-durable-findings-store`
**Base `main` HEAD:** `0351109`
**Implementation commit:** `d81e24f`
**Migration:** `supabase-migrations/083_agent_findings_store.sql`
**Parent:** Phase 42.3.0 (kernel constitution); follows 42.3.1 (Library Pack #1) + 42.3.2 (`archive_graph` Pack #2), both live on `main`.

> Migration `083` was applied **manually by Tara** in the Supabase SQL Editor and returned **`Success. No rows returned`** (no errors). It is the first agent-layer table and the first agent migration in the House.

---

## Purpose

The first **durable operational record** for the Governance Kernel's findings: persist what the read-only packs detect into a queryable, governed store, and keep it across reruns. **Review-only — no hands.** A persisted finding is a durable operational record / review record; it does not create or move authority.

## What was built

- **`agent_runs`** and **`agent_findings`** tables (additive; first agent migration).
- **Active / `test_owned`-isolated dedupe** — partial unique index `(domain, dedupe_key, test_owned) where deleted_at is null` (soft-deleted or test rows never block/absorb future real rows).
- **`scope_fingerprint`** for safe rerun reconciliation.
- **Composite run-domain FKs** — `(first_seen_run_id, domain)` / `(last_seen_run_id, domain)` → `agent_runs(id, domain)`.
- **Domain/target-table pairing constraint** — `library` findings may only target `library_items`/`library_item_files`; `archive_graph` only `archive_graph_nodes`/`archive_graph_edges`. No cross-domain leakage.
- **Governance-flag CHECK-locks** — `not_memory`/`not_evidence`/`not_authority`/`authority_changed=false`/`prompt_eligible=false`/`is_queued_work=false`/`is_proposal=false`/`is_helper_output=false`.
- **`updated_at` trigger** on `agent_findings`.
- **Execute-only `SECURITY DEFINER` RPCs** (deny-by-default: RLS on, no policies, `revoke all`, no direct table DML grants; execute granted to `service_role` only; trigger helper execute revoked from all roles).
- **Persistence library** under `src/lib/agents/persistence/` (`types`, `dedupe`, `fingerprint`, `reconcile`, `ingest`) — outside `kernel/**`.
- **Two separate test-owned persistence runners** — `scripts/agent-library-persist-findings.ts`, `scripts/agent-archive-graph-persist-findings.ts` (existing ephemeral runners untouched).
- **Tests** — dedupe-fingerprint, reconcile, ingest, migration-guards, no-house-mutation.

Total: 13 files. **No `kernel/**` change.**

## RPCs

- `public.agent_record_findings(jsonb, jsonb, boolean)` — insert one run, partial-index-aware upsert of findings, scope-guarded reconciliation. `DO UPDATE` refreshes only observation fields (`last_seen_run_id`, `detection_status`, `payload`, `summary`, `severity`, `review_burden`, `target_label`) — never `review_state`, `reviewed_by`, identity columns, `dedupe_key`, `first_seen_run_id`, or any governance flag.
- `public.agent_findings_cleanup_test_run(uuid)` — soft-delete a `test_owned` run and its `test_owned` findings only; never hard-deletes; never touches non-test rows.

## Verification

- **Tests:** 132 assertions, 0 failures.
- **Typecheck:** `tsc --noEmit` clean. **Lint:** ESLint clean. **Build:** `next build` clean.
- **Kernel diff:** `git diff main -- src/lib/agents/kernel/` **empty** (kernel untouched).

## Smoke (test-owned only)

- Library smoke captured **72** test-owned findings; archive_graph smoke captured **31** — total **103** test-owned findings.
- Library rerun **deduped**: **72 rows total, not 144** (the rerun upserted; `last_seen_run_id` advanced; `review_state` stayed `open`).
- Cleanup RPC soft-deleted **103 findings and 3 runs**. **No hard deletes. No real findings persisted.**

## Source-surface write-proof (before → after persist → after cleanup)

- `library_items` 49 → 49 → 49
- `library_item_files` 44 → 44 → 44
- `archive_graph_nodes` 105 → 105 → 105
- `archive_graph_edges` 109 → 109 → 109
- `graph_proposals` 43 → 43 → 43
- `helper_outputs` 37 → 37 → 37

## Verification note (deny-by-default)

Direct `SELECT` on `agent_runs` / `agent_findings` is **intentionally blocked** by the deny-by-default posture (`service_role` has no read grant). Active/real row state was therefore accepted as verified through **RPC return values, runner constraints, cleanup behaviour, and DB invariants** rather than direct SELECT — which itself confirms the posture holds.

## Governance

Not Memory · not evidence · not authority · not a graph proposal · not a helper output · not queued work · no existing House source-surface mutation · no UI · no review-state route · no remedy · no approval · no apply · no scheduler · no LLM · **no hands.**

## Closure statement

Phase 42.3.3a gives the Kernel a **durable maintenance record** for what its read-only packs find — but it does not give the Kernel authority or action. **42.3.3b** remains the future read-only Maintenance Room review surface; **42.3.4+** remains the future hands / remedy / apply threshold, each its own governed phase.
