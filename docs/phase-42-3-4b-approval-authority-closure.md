# Phase 42.3.4b — Tara Approval Authority Event — Closure Record

**Phase:** Phase 42.3.4b — Tara Approval Authority Event
**Branch:** `phase-42-3-4b-approval-authority`
**Base:** `94294d4`
**Migration:** `086_agent_remedy_approval_events.sql`
**Migration applied:** manually by Tara via Supabase SQL Editor — **"Success. No rows returned"**.
**Implementation commit:** `20be6f3` — *Phase 42.3.4b: add remedy approval authority surface*

## Purpose
Append-only Tara **approval authority events** over a proposed remedy plan: **approve / reject / revoke** only. Approval means *authorised for future apply consideration* — it is **inert**. Still **no apply, no rollback, no worker, no hands**.

## What was built
- **`agent_remedy_approval_events`** — append-only authority-event table (additive; no change to `agent_remedy_plans`).
- **`event_sequence bigint generated always as identity` + `unique`** — deterministic ordering.
- **Derived approval status** = decision of the latest event by `event_sequence` (never stored as a mutable pointer; no approval columns on `agent_remedy_plans`).
- **Governance flag-locks**: `is_authority_event=true`, `authority_changed=false`, `not_memory/not_evidence=true`, `is_graph_proposal/is_helper_output/is_apply_instruction/is_queued_work/prompt_eligible=false`. Snapshot CHECK: approved ⇒ both `verified_*` JSON strings; non-approved ⇒ both null.
- **Test-owned structural gate** — `test_owned` derived from the parent plan; `p_allow_test_owned` (default false); normal route always passes false, so the UI can never create test-owned approval events.
- **Approved-only drift revalidation** — re-verifies plan still proposed + exact whitelist (`library_title_trim`/`library_items.title`/ASCII-space) + target row exists + actual `library_items.title` == `current_value` + `proposed_value` == `btrim(actual,' ')`; drift → `STALE_PLAN_*`/`TARGET_ROW_NOT_FOUND`, no event, no House write (verification-only read).
- **`FOR UPDATE` serialisation** — the record RPC loads the agent-side plan row `FOR UPDATE` before deriving status, so concurrent decisions for the same plan serialise (no double-approve race). Agent-side lock only; no House lock/mutation.
- **Transition guards** — `REVOKE_NOT_APPROVED`, `ALREADY_APPROVED`, `REVOKE_REQUIRED`.
- **RPCs only** (execute→`service_role`, `SECURITY DEFINER`, fixed `search_path`): `agent_remedy_approval_record`, `agent_remedy_approvals_list`, `agent_remedy_approval_events_cleanup_test` — **no apply / rollback / worker RPC**.
- **Approval route** `POST /api/agents/remedy-plans/[id]/approval` — Tara-only, 401-before-DB, service-role, `decided_by` server-derived (RPC-hardcoded `tara`), `p_allow_test_owned:false`.
- **`/agents` UI** — derived approval status + append-only event history + **Approve / Reject / Revoke** (Revoke only when approved); no Apply/Execute/Run/Fix now/Rollback/Queue/Auto-apply/Generate/LLM.
- **Tests** — 4 `phase-42-3-4b-*` (migration-guards, derived-status, route-auth, no-execution); two prior guards evolved to drop only the now-sanctioned word "Approve". 114 42.3.4b asserts; full phase-42.3 suite green; `tsc`/lint/`next build` clean; kernel diff empty.

## Smoke result (test-owned only; Path-D)
- Before: source surfaces `49/44/105/109/43/37`; real remedy plans 0; real approval events 0.
- **No eligible real remedy plan exists** (a recordable plan needs a real space-padded title; none exist). **Path-D accepted — no source fixture fabricated, no `library_items` mutation.**
- Live negatives passed: `INVALID_DECISION`; approve non-existent plan → `PLAN_NOT_FOUND_OR_DELETED`; revoke non-existent plan → `PLAN_NOT_FOUND_OR_DELETED`.
- Cleanup touched no real events (`events_cleaned: 0`). Source surfaces unchanged. Real approval events remained 0; real remedy plans remained 0.

## Governance
An approval is an **authority event** but **moves no House authority field**. Not Memory / not evidence / not graph proposal / not helper output / not apply instruction / not queued work / not prompt eligible. **No apply · no rollback · no worker · no scheduler · no LLM · no hands.** Kernel diff empty.

## Note
The live positive approval lifecycle was **not** exercised because no eligible real plan exists; fabricating one would require mutating a House source surface — held, accepted, and safer. Transition guards, drift revalidation, derived-status ordering, and `FOR UPDATE` serialisation are proven by unit/static tests. **42.3.4c must revalidate again immediately before any future apply** — approval-time revalidation is not sufficient for apply.

## Next
**42.3.4c** — future apply worker + append-only apply audit + rollback (the actual hand). Its own Tier-3 gate; not started.
