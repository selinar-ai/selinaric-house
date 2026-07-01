# Phase 42.3.3 — Durable Findings + Maintenance Room (Review Surface)
## Constitution-level Design Brief — review-only, no hands — **split into 42.3.3a + 42.3.3b**

**Status:** Design brief — **no code, no migration, no DB mutation, no recon yet.** Constitution-level (introduces the first durable agent tables + the first agent migration).
**Phase family:** Phase 42 — Governed Helper Labour
**Parent:** Phase 42.3.0 (kernel constitution); builds on 42.3.1 (Library Pack #1) and 42.3.2 (`archive_graph` Pack #2), both live on `main` (`0351109`).
**Author:** Eli (systems & reliability) · **Amended** per Ari review (split + reconciliation safety + wording + schema).

> **The kernel may inspect and report. It may not act.** This phase gives the kernel a **durable operational record** of what its read-only packs find, plus a **review surface** — not hands.

---

## 1. Purpose

Persist the findings the read-only packs produce into a **durable operational record**, and provide a **Maintenance Room** — a read-only review surface where Tara can see, group, acknowledge, and dismiss findings across domains.

Today the reports are **ephemeral**: each run's findings are discarded when the run ends, so the House has no persisted operational record of its own health. This phase creates that record — **without** letting the kernel act.

## 2. Why this comes before hands

Persist-and-review is the natural rung between *ephemeral report* and *approved apply*:
- A fix cannot be safely **applied** until there is a **durable, reviewed record** of what was found, what recurs, and what Tara considers worth acting on.
- It is **lower-risk**: it writes only to *new, additive* agent tables and **never mutates any existing House surface**. The "may not act" law stays fully intact.

The apply arc (remedy → approval → apply) is deferred to **42.3.4+**, its own constitution-level brief.

## 3. Hard governance line (locked with Ari)

A persisted finding is **not** Memory · **not** evidence · **not** authority · **not** a graph proposal · **not** a helper output · **not** queued work. A **Maintenance Room is a review surface, not an apply surface.** A finding is a **review record** — never a task, proposal, or authorisation.

## 4. Wording standard (required)

Do **not** use "memory of what it sees" (or similar) in code, UI, table comments, or product wording — it must never be confused with House Memory. Use only: **durable operational record · maintenance record · persisted finding · review record.**

## 5. Phase split (required structural amendment)

| Phase | Scope | Explicitly excluded |
| :- | :- | :- |
| **42.3.3a — Durable Findings Store + Persistence Ingestion** | migration (`agent_runs` + `agent_findings`); separate persistence ingestion runners; dedupe / rerun / reconciliation; tests; **test-owned smoke only** | **no UI; no review-state route** |
| **42.3.3b — Maintenance Room Review Surface** | read-only Maintenance Room UI; auth-protected review-state route; Acknowledge / Dismiss only | **no Fix / Apply / Approve / Remedy controls** |
| **42.3.4+** | remedy / approval / apply hands | — separate constitution-level brief |

Each sub-phase runs the **full** cadence (brief → recon → build → post-build report → approval).

---

## 6. Phase 42.3.3a — Durable Findings Store + Persistence Ingestion

### 6.1 Tables — exactly `agent_runs` + `agent_findings` (do not fold runs into findings)

Additive; first agent migration; RLS enabled; **no existing table altered**.

**`agent_runs`** — one row per persisted run:
- `id` uuid PK · `domain` text (`library` | `archive_graph`) · `run_type` text (`health_report`)
- `scope_type` text · `scope_ref` text null · **`scope_fingerprint` text** (see §6.3) · `capped` bool · `cap_reason` text null
- `resolved_count` int · `finding_count` int · `requested_by` text (server-derived) · `created_at` timestamptz
- `test_owned` bool default false
- governance flags (DB-constrained): `not_memory` true · `not_evidence` true · `not_authority` true · `authority_changed` false · `prompt_eligible` false

**`agent_findings`** — one durable finding entity, keyed by dedupe:
- `id` uuid PK · `domain` text · `capability_id` text · `issue_code` text
- `target_table` text · `target_id` text · `target_label` text null
- `severity` text · `review_burden` text · `summary` text · `payload` jsonb
- `dedupe_key` text — `sha256(domain:capability_id:issue_code:target_table:target_id)`; **UNIQUE (domain, dedupe_key)**
- `first_seen_run_id` uuid FK→`agent_runs` · `last_seen_run_id` uuid FK→`agent_runs`
- `detection_status` text (`active` | `not_redetected`) · `review_state` text (`open` | `acknowledged` | `dismissed`)
- `reviewed_by` text null · `reviewed_at` timestamptz null · `created_at` · `updated_at`
- **`test_owned` bool default false** · **`deleted_at` timestamptz null** (soft cleanup for smoke rows)
- governance flags (DB-constrained), **revised per Ari**: `not_memory` true · `not_evidence` true · `not_authority` true · `authority_changed` false · `prompt_eligible` false · `is_queued_work` false · **`is_proposal` false** · **`is_helper_output` false**
  - *(Dropped `review_routed`: this is a reviewable maintenance record, not routed/queued work. The flag set above encodes the §3 line as enforced invariants.)*

### 6.2 Persistence ingestion path (separate runners — required)

The existing 42.3.1/42.3.2 **ephemeral runners stay untouched.** 42.3.3a adds **separate persistence runners/commands** (e.g. `scripts/agent-*-persist-findings.ts`) that: build the report (reusing the pack), then INSERT one `agent_runs` row and UPSERT its `agent_findings`. Persistence is a manual, explicit action — no scheduler, no self-firing.

### 6.3 Dedupe / rerun / reconciliation (safety-hardened per Ari)

- **Upsert by `(domain, dedupe_key)`:** first detection inserts (`detection_status=active`, `review_state=open`, first/last_seen=run); re-detection updates `last_seen_run_id` and sets `detection_status=active`, **preserving `review_state` / `reviewed_by`** (triage sticks across reruns). No duplicate row.
- **`scope_fingerprint`** makes reconciliation safe:
  - `whole_graph` / whole-collection → a stable scope identifier.
  - `collection` / `archive` → normalized `scope_ref`.
  - `manual_batch` → **exact item-list hash** (sha256 of the sorted item-id list). A manual batch may **not** be reconciled without this fingerprint.
- **Reconciliation (mark absent findings `not_redetected`) is allowed ONLY when** the new run and the prior baseline match on **all** of: `domain`, `run_type`, `scope_type`, and `scope_fingerprint`.
- **Capped runs never reconcile.** If `capped = true`, the run did not see everything, so absent findings must **not** be marked `not_redetected`.
- Findings are **never hard-deleted** by reconciliation; `not_redetected` is reversible (re-detection → `active`).

### 6.4 Finding lifecycle (review-only)

Two orthogonal axes — **no `approved`/`applying`/`applied`**:
- `detection_status`: `active` ⇄ `not_redetected` (detection-driven).
- `review_state`: `open` → `acknowledged` → `dismissed` (set in 42.3.3b only; 42.3.3a leaves all `open`).

### 6.5 Write boundary (42.3.3a)

The only writes are **INSERT `agent_runs`** and **INSERT/UPSERT `agent_findings`** (plus reconciliation `UPDATE`s of `detection_status`/`last_seen_run_id` on those same finding rows). **No write to any existing House surface.** Inspectors remain read-only over `library_*` / `archive_graph_*`. No `helper_outputs`, `graph_proposals`, `archive_items`, Memory/Graph-approval/Archive/Recall/prompt/canonical access.

### 6.6 RLS / service-role posture (deny-by-default — required)

- RLS **enabled** on both tables, **deny-by-default**. **No broad direct client reads or writes.**
- All access is through the **server / service-role path** (ingestion runners now; the 42.3.3b server routes later). No anon client access to these tables.
- No weakening of existing RLS; no broad grants.

### 6.7 Real-data posture (required)

**No real persistence of the ~103 existing findings yet.** 42.3.3a persists **only `test_owned = true` smoke rows** until a later, explicit, separate approval to capture real findings.

### 6.8 Tests (42.3.3a)

- Schema/contract + governance-flag invariants (`not_memory`/.../`is_proposal`/`is_helper_output` constrained).
- Ingestion: a report → expected `agent_runs` + `agent_findings` rows (test-owned).
- Dedupe/rerun: same finding across two runs → one durable row, `last_seen_run_id` advanced, `review_state` preserved.
- Reconciliation safety: marks `not_redetected` only on matching `domain`+`run_type`+`scope_type`+`scope_fingerprint`; **capped run does not reconcile**; manual batch without item-list hash does not reconcile; re-detection → `active`.
- No-house-mutation guard (static + smoke): ingestion writes only `agent_runs`/`agent_findings`; never House surfaces.

### 6.9 Smoke plan (42.3.3a, governed)

1. Tara applies the additive migration in the Supabase SQL Editor (gated; success = "No rows returned").
2. Run persistence ingestion against a **capped real scope** with `test_owned = true`.
3. Confirm rows persisted; rerun → dedupe holds; reconciliation behaves per §6.3.
4. **Source-surface write-proof:** `library_items`, `library_item_files`, `archive_graph_nodes`, `archive_graph_edges`, `graph_proposals`, `helper_outputs` counts **unchanged** before/after.
5. **Soft-clean** the `test_owned` smoke rows via `deleted_at` (or an explicit cleanup), per §6.10.

### 6.10 Rollback / no-mutation / cleanup (42.3.3a)

- Source surfaces unchanged (write-proof); inspectors read-only.
- New tables additive + droppable; migration includes rollback notes.
- Smoke rows are `test_owned = true` and soft-cleaned via `deleted_at` (no hard delete); all list/queries filter `deleted_at IS NULL`.
- No authority field written; governance flags DB-constrained.

### 6.11 Stop condition (42.3.3a)

Stop when: findings persist durably with stable dedupe and preserved `review_state`; reconciliation obeys the §6.3 safety rules (scope-fingerprint match, capped→no reconcile, manual-batch hash required); House source surfaces unchanged (write-proof); test-owned smoke only; tests + tsc + ESLint + build clean. **No UI, no review-state route in 42.3.3a.**

---

## 7. Phase 42.3.3b — Maintenance Room Review Surface

- **Read-only Maintenance Room UI** (`/agents` or a tab near the Helper Workshop): findings across **both** domains, grouped by domain → severity → issue_code; per-finding detail (summary, target, payload, first/last seen, detection_status); run history from `agent_runs`. Domain switcher.
- **Auth-protected review-state route** (server-side HttpOnly cookie, mirroring Phase 38.3.2b): updates **only** `review_state` (+ `reviewed_by`, `reviewed_at`) on a finding. No other column mutable. **All UI access via server routes with auth — no direct client reads/writes** (per §6.6 deny-by-default).
- **Actions limited to Acknowledge / Dismiss.** **No Fix / Apply / Approve / Remedy controls anywhere.**
- Mandatory boundary banner: *"Review surface only. Persisted findings are not Memory, not evidence, not authority, not proposals, not queued work. The kernel may inspect and report; it may not act."*
- Tests: review-state route updates only allowed fields; auth required; no apply path exists. Stop before any remedy/approval/apply control.

---

## 8. Why NOT the other agent tables yet

| Deferred | Why it waits |
| :- | :- |
| `agent_remedy_plans` | A remedy is a *proposed action* — the first step toward hands. |
| `agent_approval_events` | Authorising an action is meaningless with no remedies to approve. |
| `agent_apply_events` | Performing labour **is** hands — the hard line (42.3.4+). |

## 9. Open questions — resolved by Ari (folded in)

1. Tables: **`agent_runs` + `agent_findings`**, not folded. ✅
2. `not_redetected`: reconcile only within identical comparable scope — `domain`+`run_type`+`scope_type`+`scope_fingerprint`; **capped runs never reconcile**; manual batches require an exact item-list hash. ✅ (§6.3)
3. Persistence: **separate persistence runners**; ephemeral runners untouched. ✅ (§6.2)
4. Sub-split: **42.3.3a + 42.3.3b**. ✅ (§5)
5. RLS: **deny-by-default / server-service-role only**; UI via auth'd server routes. ✅ (§6.6)

## 10. Global non-goals (both sub-phases)

No apply/remedy/approval controls or tables · no scheduler/cron/self-fired persistence · no LLM · no real-finding persistence yet (test-owned only) · no Memory/Graph-approval/Archive/Recall/prompt-eligibility/canonical mutation · no kernel-contract change beyond adding a persistence sink alongside the ephemeral report.

---

*Design brief only. Per House build law: goes to Ari for the full review cadence before any recon, code, or migration. Nothing here authorises code, DB access, schema, or mutation. The kernel may inspect and report; it may not act.*
