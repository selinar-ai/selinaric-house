# Phase 42.3.3b — Maintenance Room Review Surface — Closure Record

**Phase:** Phase 42.3.3b — Maintenance Room Review Surface
**Branch:** `phase-42-3-3b-maintenance-room`
**Base:** `aee8236`
**Migration:** `084_agent_findings_review.sql`
**Migration applied:** manually by Tara via Supabase SQL Editor — **"Success. No rows returned"**.
**Implementation commit:** `029c2e2` — *Phase 42.3.3b: add maintenance room review surface*

## Purpose
A **review / triage-only** Maintenance Room: it lets Tara read the durable findings store and change a finding's review disposition (Acknowledge / Dismiss / Reopen) — and nothing more. The kernel may inspect, report, and durably record; **it may not act.**

## What was built
- **Three governed RPCs** (migration `084`, additive functions only — no table changes, no new tables, no direct table grants; all `SECURITY DEFINER`, fixed `search_path = pg_catalog, pg_temp`, schema-qualified, no dynamic SQL, no `select *`, whitelisted columns, execute granted to `service_role` only, revoked from public/anon/authenticated):
  - `agent_findings_list(p_domain, p_review_state, p_detection_status, p_include_test)` — reads where `deleted_at IS NULL`; `test_owned = false` unless `p_include_test`.
  - `agent_runs_list(p_domain, p_include_test)` — run history, same posture.
  - `agent_finding_set_review_state(p_finding_id, p_review_state, p_reviewed_by)` — the **only** write; rejects null/invalid `review_state` and null/blank `reviewed_by`; updates **only** `review_state`, `reviewed_by`, `reviewed_at` (`updated_at` via the `083` trigger), acting only where `deleted_at IS NULL`; no hard delete; no House-surface write.
- **Server routes** (auth-protected via the existing `requireHouseApiAuth`; 401 before any DB call; `service_role` server-side only; the House is single-password/single-user, so House auth is Tara-only):
  - `GET /api/agents/findings` and `GET /api/agents/runs` — `p_include_test=false` hardcoded.
  - `POST /api/agents/findings/[id]/review-state` — only write route; `reviewed_by` server-derived `'tara'`, never client-supplied.
- **`/agents` Maintenance Room UI** — boundary banner; filters (domain / review_state / detection_status); findings grouped domain → severity → issue_code; per-finding detail; run history; honest empty state; **Acknowledge / Dismiss / Reopen only** — no Fix / Apply / Approve / Remedy / Re-run / Generate-plan / LLM control.
- **Maintenance nav link** — `src/lib/rooms.ts`, label **Maintenance**, path `/agents`, quiet styling.
- **Review-state lifecycle** — reversible: `open` ⇄ `acknowledged` ⇄ `dismissed`; review dispositions only, not authority.
- **Smoke script** — `scripts/agent-maintenance-smoke.ts` (test-owned read/review verification; RPC-only, no House-surface access).
- **Tests** — 5 `phase-42-3-3b-*` (migration-guards, route-auth, review-state, no-house-mutation, ui-guard). Full phase-42.3 suite green; `tsc` clean; `next build` green; kernel diff empty.

## Smoke result (test-owned only)
- Persisted test-owned archive_graph batch: run `c96afcab-ec7c-4fa8-b5f6-32054aff01e4`, **31 findings**.
- Visible only through the smoke/test path (`p_include_test=true`); normal production view (`p_include_test=false`) stayed empty (`real_findings=0`).
- **Acknowledge / Dismiss / Reopen** all passed; `reviewed_by` server-derived `tara`.
- **Only review fields changed** (`review_state`, `reviewed_by`, `reviewed_at`, `updated_at`) — no identity / target / payload / detection / run-ref / governance-flag change.
- **Source surfaces unchanged** before/after: `library_items=49`, `library_item_files=44`, `archive_graph_nodes=105`, `archive_graph_edges=109`, `graph_proposals=43`, `helper_outputs=37`.
- Cleanup RPC soft-deleted the test-owned run and 31 findings; active test-owned after cleanup = 0; **real findings persisted = 0**.

## Governance
Persisted findings remain **not Memory · not evidence · not authority · not proposal · not helper output · not queued work**. The review-state mutation is confined to `agent_findings` (the durable maintenance record) and never touches any House source surface. **No remedy · no approval · no apply · no scheduler · no LLM · no hands.** Kernel diff empty (the review surface required no kernel change). 42.3.4+ remains the future hands threshold, requiring its own constitution-level brief.
