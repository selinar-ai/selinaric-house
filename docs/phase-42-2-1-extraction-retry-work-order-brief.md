# Phase 42.2.1 — Delegated Extraction Retry Work Order (Build Brief)

**Status:** Proposed — **draft for Ari/Tara review. No code, no migration, no build, no commit, no push.** Uncommitted note only.
**Phase family:** Phase 42 — Helper Execution / Delegated Labour
**Phase type:** First delegated-apply slice (one action only)
**Builder:** Claude Code · **Architect:** Ari · **Governed by:** Tara
**Parent architecture:** `docs/phase-42-2-delegated-helper-labour-brief.md` (approved direction).
**Rides on:** 42.1 manual runner (`e020ce0`, live). One real helper output is the smoke target: `file_extraction_not_run → check_extraction_status` (id `eb10557c-236b-4a80-8146-fcfdb945996a`).

---

## One-line brief

Build the **first delegated apply**: from a real `file_extraction_not_run` helper output, Tara approves a single bounded **`retry_extraction`** work order; a governed executor re-runs extraction for **one** Library file under audit, with before/after snapshots and a rollback path. **Authority never moves; Tara's click is the only thing that acts.**

## Core law (carried)

> Helpers carry labour. Tara keeps authority. Approval applies bounded work under audit — it does not assign work back to Tara, and it never touches Memory, evidence, prompt authority, Graph truth, or Archive truth.

## Scope — exactly one action

Only `retry_extraction` (Tier 3, operational, no content authorship). **No** tag/title/description apply. **No** bulk. **No** other action types in this slice (the `action_type` vocabulary is opened to `retry_extraction` only).

---

## 1. Proposed migration — `helper_work_orders`

A new table holding the proposed/approved bounded action. It is **not** append-only (status transitions), but every transition goes through a **governed path**, never a free PATCH.

- **Columns (sketch):** `id uuid pk`, `helper_output_id uuid` (soft link, no FK — mirrors `helper_review_events`), `action_type text`, `target_surface text`, `target_id uuid`, `tier int`, `status text`, `proposed_change jsonb`, `edited_change jsonb` (null in this slice), `approved_by text`, `created_at`, `approved_at`, `applied_at`, `deleted_at` (soft-delete), `test_owned boolean`, plus the locked authority flags.
- **CHECKs:** `action_type in ('retry_extraction')` (first build only); `target_surface in ('library_item_file')`; `status in ('proposed','approved','applied','failed','rejected','rolled_back')`; `approved_by = 'tara'`; locked-invariant `not_memory=true`, `not_evidence=true`, `prompt_eligible=false`, `authority_changed=false` (a Library op is not an authority move).
- **Transitions only via a governed RPC** (`helper_work_order_apply` / approve+apply), mirroring the 41.12 `helper_review_apply` pattern: allowed-transition guard, `SELECT … FOR UPDATE`, optimistic concurrency, writes only the status/approval/applied fields. No broad table UPDATE grant.
- **Grants/RLS:** strict — `revoke all … ; grant insert/select/update only to service_role` (or RPC-mediated), RLS enabled; no public/anon/authenticated table policies. Browser never touches the table directly.

## 2. Proposed migration — `helper_apply_events` (append-only)

The apply **audit** — distinct from the 41.14 review trace (workflow movement) and from the work order (intent/state). One row per apply attempt and per rollback.

- **Columns:** `id uuid pk`, `work_order_id uuid` (soft link), `action_type text`, `target_surface text`, `target_id uuid`, `before_snapshot jsonb`, `after_snapshot jsonb`, `result text`, `error_text text`, `actor text`, `created_at`, plus locked echoes `not_memory`, `not_evidence`, `not_prompt_authority` (all true).
- **CHECKs:** `result in ('applied','failed','rolled_back')`; `actor in ('tara','system')` (Tara approves; system executes); `action_type in ('retry_extraction')`.
- **Append-only:** BEFORE UPDATE OR DELETE trigger → raise (the exact `helper_review_events` posture). RLS enabled, **0 policies**. `revoke all … from public/anon/authenticated/service_role; grant insert … to service_role`.
- **Read:** a narrow `SECURITY DEFINER` read `helper_apply_events_for_work_orders(uuid[])` returning safe summary fields only — mirroring 078 (fixed `search_path`, deterministic order, null/empty-safe, execute granted only to `service_role`, no broad table SELECT). Browser never reads the table directly.

## 3. Work order lifecycle

`proposed` → `approved` (Tara's click — the authority event) → `applied` **or** `failed` (executor) → optional `rolled_back`. Also `rejected` (Tara dismisses without applying). In this slice, the approval click may create-and-approve in one governed transaction (proposed persisted for the record, then approved). Soft-delete via `deleted_at` only (Category-A discipline); never hard-deleted.

## 4. Apply event lifecycle

One append-only `helper_apply_events` row at each real apply attempt: `applied` (with before/after snapshots) or `failed` (with `error_text`), and one `rolled_back` row if the prior state is restored. Never updated, never deleted — the audit is immutable.

## 5. Workshop UI changes (one action only)

For a helper output whose issue is `file_extraction_not_run` / action `check_extraction_status` (a Tier-3 delegatable), the room adds **one** control: **"Approve & retry extraction"** (alongside the existing Mark reviewed / Dismiss / Needs follow-up — Tara may still simply review without delegating). On click → the governed apply route runs → result (and before/after) appears via the new read-only apply-audit line. Caption for delegatable rows shifts to: *"Approve authorises the helper to retry extraction for this one file, under audit and reversible. It does not move authority, Memory, evidence, prompt visibility, Graph truth, or Archive truth."* **No** tag/title apply control. Tier 4/5 never show an apply control.

## 6. Narrow executor model — `retry_extraction` only

A **new governed, auth-gated route** (proposed): `POST /api/helpers/work-orders/[id]/apply` (or create+apply) — `requireHouseApiAuth` first, fail-closed. It is triggered **only** by Tara's click; **no standing agent, no scheduler, no cron, no self-triggering.** The executor:

1. Loads/creates the work order; validates `action_type = retry_extraction`, `target_surface = library_item_file`, exactly one `target_id`.
2. **Action-specific whitelist** (Ari): may touch only the file's extraction state via the existing extract path. **Forbidden fields hard-rejected:** all Library authority fields (`authority_status`, `derived_canonical_status`, `archive_item_id`), tags / title / description, any `library_items` field, any delete. The executor cannot mutate them by payload accident.
3. **Before snapshot:** `extraction_status`, `extracted_text` presence/length, `extraction_char_count`, error state.
4. Performs the bounded op: retry/run extraction for that **one** file.
5. **After snapshot:** resulting status, text presence/length, char count, result/error.
6. Atomically records: work order → `applied`/`failed`, and one append-only `helper_apply_events` row (via the RPC). No authority flags flip.

## 7. Tests

- **Pure action-contract:** allowed target/op/fields; forbidden fields rejected; one-target enforcement; `action_type`/`status`/`result` vocabularies; before/after snapshot shape; allowed vs forbidden status transitions.
- **Migration static scans:** `helper_work_orders` (locked CHECKs, vocab CHECKs, strict grants, RPC-mediated transitions, no broad UPDATE grant); `helper_apply_events` (append-only trigger, RLS 0 policies, service-role INSERT-only, definer read execute-to-service_role-only, fixed `search_path`, deterministic order).
- **Route:** auth-first; action-whitelist enforced; forbidden/authority fields rejected; exactly one target; before+after snapshot captured; apply event written; **no** broad `library_items` PATCH; **no** authority-field write; no Memory/Graph/Archive/candidate read or write.
- **UI:** the "Approve & retry extraction" control appears **only** for the delegatable action; caption present; **no** tag-apply control; existing review controls + 41.14 trace intact; reduced-motion / mobile / List fallback unaffected.
- **Regression:** existing helper / store / contract / workshop / review / runner suites green; typecheck; build.

## 8. Smoke test (governed — separate Tara approval)

Using the existing real helper output `file_extraction_not_run` (`eb10557c…`):
1. In the Workshop, **approve** "retry extraction" → work order created + approved.
2. Executor retries extraction for the one target `library_item_file` → **before snapshot** captured.
3. **after snapshot** captured; **append-only `helper_apply_events`** row written (`applied` or `failed`, with snapshots).
4. Workshop shows the result + before/after via the read-only apply-audit path.
5. **Confirm no authority move:** Library authority fields unchanged; `helper_outputs` locked flags intact; no Memory/Graph/Archive/prompt write.
6. **Rollback test (reversibility):** restore the snapshotted prior extraction state → `rolled_back` apply event appended → file restored. (Keeps the smoke non-destructive on real data.)
7. Confirm the audit chain is complete and immutable; report.

## 9. Rollback / snapshot expectations

Every apply captures a **before snapshot** (pre-op extraction state) and an **after snapshot** (post-op state/result). **Rollback** restores the before snapshot for that one file and appends a `rolled_back` audit event. There are no Library-authority or content-authoring side effects to undo (the action only re-runs extraction). Snapshots live in the work order / apply events — the audit *is* the reversibility record.

## 10. Hard boundaries

No tag apply in the first build · no bulk apply · no Memory Candidate Agent · no Graph Candidate bridge · no candidate import · no prompt authority · no Memory creation · no evidence creation · no Archive truth · no Graph truth · no autonomous helper execution · no scheduler · no cron · no self-triggering · no commit · no push. The executor uses an action-specific whitelist and can never reach authority-adjacent fields. The `helper_outputs`, 41.12 route, and 41.14 trace remain untouched in posture.

## Open questions for Ari

1. **Route shape** — one combined `POST …/work-orders/[id]/apply` that creates-approves-applies in a governed transaction, or split **create/approve** from **apply**?
2. **Work order creation timing** — created lazily at Tara's approval click (simplest), or pre-created as `proposed` when the delegatable output is surfaced?
3. **Apply audit surfacing** — a new read-only "apply trace" line in the room, or extend the existing 41.14 trace area with an apply section?
4. **Smoke reversibility** — always roll back at the end of the smoke (non-destructive), or leave a successful re-extraction in place if it strictly improved the file?
