# Phase 42.3.4a — Remedy Representation — Closure Record

**Phase:** Phase 42.3.4a — Remedy Representation
**Branch:** `phase-42-3-4a-remedy-representation`
**Base:** `a7446b0`
**Migration:** `085_agent_remedy_plans.sql`
**Migration applied:** manually by Tara via Supabase SQL Editor — **"Success. No rows returned"**.
**Implementation commit:** `49d12c9` — *Phase 42.3.4a: add remedy plan representation*

## Selected action
- **`library_title_trim`** on **`library_items.title`** — **surrounding ASCII-space (U+0020) only**, byte-exact with PostgreSQL `btrim(x, ' ')` via the shared `trimSurroundingSpaces` helper (detector, builder, SQL CHECK, and RPC all agree). NOT JavaScript `.trim()`; tab/newline-surrounded titles do not fire in v1.

## New detector
- **`item_title_untrimmed`** (pure, in the Library pack `library.title_trim` inspector): fires only when a title carries surrounding ASCII spaces and the trimmed form is non-empty; booleans-only `observed_state` (raw title never echoed).

## Purpose
Represent a **proposed** remedy only. **No approval, no apply, no rollback, no worker, no hands.** The first step toward the kernel's first hand — the kernel can now *describe* a deterministic, reversible fix and *validate it against reality*, but cannot act on it.

## What was built
- **`agent_remedy_plans`** sibling table (additive; no change to `agent_findings`).
- **Positive v1 whitelist** CHECK: `domain='library'` ∧ `action_type='library_title_trim'` ∧ `target_table='library_items'` ∧ `target_field='title'` — nothing else representable.
- **Value constraints** (DB-level): both values JSON strings; `proposed = btrim(current, ' ')`; proposed non-empty; values differ.
- **`deterministic_reason` guard**: DB CHECK `btrim(deterministic_reason) <> ''` + RPC `DETERMINISTIC_REASON_BLANK`.
- **Target-row / current-value verification** (record RPC, read-only on `library_items`): reads the actual title; rejects `TARGET_ROW_NOT_FOUND`, `CURRENT_VALUE_MISMATCH`, `PROPOSED_NOT_TRIM_OF_TARGET` — so the recorded inverse is trustworthy at the DB boundary.
- **Governance flag-locks** (9): not_memory/not_evidence/not_authority = true; authority_changed/prompt_eligible/is_queued_work/is_graph_proposal/is_helper_output/is_apply_instruction = false.
- **Lifecycle**: `plan_state` ∈ {proposed, superseded} only — no approved/applied/queued/rejected/rolled_back states or columns. Active-only partial unique index `(finding_id, action_type, test_owned) where deleted_at is null and plan_state='proposed'`.
- **RPCs only**: `agent_remedy_plan_record`, `agent_remedy_plans_list`, `agent_remedy_plans_cleanup_test` — all `SECURITY DEFINER`, fixed `search_path`, execute→`service_role` only, revoked elsewhere, no table grants. **No apply / approval / rollback RPC.**
- **Pure detector** + **pure remedy-plan builder** (`buildTitleTrimPlan`) — no DB, no execution capability.
- **Read-only `/agents` "Proposed remedy" display** — current/proposed/deterministic reason; **no Approve/Apply/Execute/Authorise/Rollback/Queue control**; only Acknowledge/Dismiss/Reopen remain.
- **Tests** (4): detector, builder, migration-guards, no-execution. 116 asserts; full phase-42.3 regression green; `tsc`/lint/`next build` clean; kernel diff empty.

## Smoke result (test-owned only; Path D)
- Before snapshot: `library_items=49`, `library_item_files=44`, `archive_graph_nodes=105`, `archive_graph_edges=109`, `graph_proposals=43`, `helper_outputs=37`; real findings 0; real remedy plans 0.
- Eligibility scan (read-only): 49 real items, **0 eligible** real titles with surrounding ASCII spaces. **No source fixture fabricated; no `library_items` row mutated.**
- Negative DB-boundary checks (via test-owned synthetic findings; read-only on `library_items`) all passed: `TARGET_ROW_NOT_FOUND`, `DETERMINISTIC_REASON_BLANK`, `CURRENT_VALUE_MISMATCH`, `PROPOSED_NOT_TRIM_OF_TARGET`, `NO_CHANGE`; tab-surrounded title → no v1 plan.
- **No real remedy plans recorded.** Source surfaces unchanged after; test-owned findings cleaned up; active test-owned plans = 0.

## Governance
A remedy plan is **not Memory · not evidence · not authority · not a proposal · not a helper output · not queued work · not an apply instruction**. **No approval · no apply · no rollback · no scheduler · no LLM · no hands.** Kernel diff empty.

## Note
Live positive plan recording was **not** exercised because no eligible real target exists, and fabricating one would require mutating a House source surface. Per Ari's Path D, this was held — accepted and safer than mutating the House to create a fixture. The success path is covered by the builder unit tests and will occur naturally the first time a real title carries surrounding spaces.

## Next
**42.3.4b** — future Tara approval surface. **42.3.4c** — future apply / audit / rollback threshold (the actual hand). Each its own Tier-3 gate.
