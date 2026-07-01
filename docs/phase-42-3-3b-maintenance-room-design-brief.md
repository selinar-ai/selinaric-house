# Phase 42.3.3b — Maintenance Room Review Surface
## Constitution-level Design Brief — read + triage only, no hands

**Status:** Design brief — **no code, no migration, no DB mutation, no recon yet.**
**Phase family:** Phase 42 — Governed Helper Labour
**Parent:** Phase 42.3.0 (kernel constitution); follows 42.3.3a (Durable Findings Store), live on `main` (`aee8236`); migration `083` applied.
**Author:** Eli (systems & reliability)

> The kernel may inspect, report, and durably record. **42.3.3b lets Tara *read and triage* that record — acknowledge or dismiss findings. It still may not act on the House.**

---

## 1. Purpose

Give Tara a **read-only Maintenance Room**: one surface to see the persisted findings (across both domains), grouped and filterable, with per-finding detail and run history — and the **only** actions being **Acknowledge** and **Dismiss** (a finding's `review_state`). This turns the durable operational record from a write-only store into something a human can actually work with.

## 2. Why now / why this shape

42.3.3a built the durable store but deliberately left **no read path and no review-state write** (both deferred here). Right now the record is unreadable by anything but its own RPCs and unannotatable. 42.3.3b closes that — and **only** that. It does **not** add remedy/approval/apply (that is 42.3.4+).

## 3. Hard governance line

The Maintenance Room is a **review surface, not an apply surface.** Its single mutation is a finding's **`review_state`** (`open` ⇄ `acknowledged` ⇄ `dismissed`) plus `reviewed_by`/`reviewed_at`. That is **triage of the durable record, not action on the House**: no House source surface is written, no authority moves, no Memory/Graph/Archive/Recall/prompt/canonical mutation. Persisted findings remain **not Memory / not evidence / not authority / not proposals / not helper outputs / not queued work.**

## 4. The read problem (and the answer)

`agent_runs`/`agent_findings` are **deny-by-default** — `service_role` has no direct SELECT (42.3.3a). So the UI cannot read them directly. 42.3.3b adds **narrow `SECURITY DEFINER` read RPCs** (mirroring `078`/`080`), called only by **auth-protected server routes** using `service_role`. No client-side DB access; deny-by-default preserved.

## 5. Migration `084_agent_findings_review.sql` (proposed)

Additive; no table changes; only new functions + grants.

- **`agent_findings_list(p_domain, p_review_state, p_detection_status, p_include_test)`** — `SECURITY DEFINER`, fixed `search_path`, `stable`. Returns finding rows. **Always filters `deleted_at IS NULL`.** **Production filter: `test_owned = false`** unless `p_include_test = true` (smoke only). Optional domain/review_state/detection filters. Deterministic order. Execute → `service_role` only; revoked from public/anon/authenticated.
- **`agent_runs_list(p_domain, p_include_test)`** — `SECURITY DEFINER` read for run history; same `deleted_at IS NULL` + `test_owned=false`-by-default posture.
- **`agent_finding_set_review_state(p_finding_id, p_review_state, p_reviewed_by)`** — `SECURITY DEFINER`, the **only** review-state write. Validates `p_review_state ∈ {open, acknowledged, dismissed}`; acts only `WHERE deleted_at IS NULL`; sets **only** `review_state`, `reviewed_by`, `reviewed_at` (`updated_at` via the existing trigger). Touches **no other column** — never identity, `detection_status`, `payload`, `dedupe_key`, run refs, `test_owned`, or any governance flag. Returns the updated row. Execute → `service_role` only; revoked from public/anon/authenticated.

*(No direct table DML grants are added — writes still flow only through RPCs, exactly as 42.3.3a.)*

## 6. Server routes (Next API, auth-protected)

Mirror the Phase 38.3.2b auth hardening (server-side HttpOnly cookie; **401 before any DB call** when unauthenticated). `service_role` used server-side only — never shipped to the client.

- `GET /api/agents/findings` (+ filters) → `agent_findings_list` → returns to UI.
- `GET /api/agents/runs` → `agent_runs_list` → run history.
- `POST /api/agents/findings/[id]/review-state` (body `{ review_state }`) → `agent_finding_set_review_state`; `reviewed_by` **server-derived `'tara'`**, never client-supplied. **This is the only write route.**

## 7. Review-state lifecycle

States: `open` → `acknowledged` → `dismissed`. Proposed v1: **all three reachable and reversible** (Tara may re-open a dismissed finding) — they are review dispositions, not authority. Idempotent. *(Open question for Ari: allow re-open, or one-way `open→acknowledged→dismissed`?)*

## 8. Maintenance Room UI (read-only review surface)

- Surface: `/agents` (or a Maintenance Room tab near the Helper Workshop). Domain switcher (Library / `archive_graph` / all).
- Shows: findings grouped by domain → severity → issue_code; per-finding detail (summary, target, payload, first/last seen, `detection_status`, `review_state`); run history from `agent_runs`. Empty state when there are no real findings (currently the case — no real findings persisted yet).
- **Actions: Acknowledge / Dismiss only.** **No Fix / Apply / Approve / Remedy / Re-run controls anywhere.**
- Mandatory boundary banner: *"Review surface only. Persisted findings are durable operational records — not Memory, not evidence, not authority, not proposals, not queued work. The kernel may inspect, report, and record; it may not act."*
- House-native styling; quiet, not a debug dashboard.

## 9. Real-data posture

Production reads show **only real findings** (`test_owned = false`, `deleted_at IS NULL`). There are **no real findings yet** (42.3.3a persisted test-owned only), so the room renders an honest empty state until real persistence is separately approved (its own gate). The 42.3.3b **smoke** uses `p_include_test = true` to view/triage test-owned rows, then cleans them up.

## 10. Tests

- **Migration guards** (static SQL scan): all three functions `SECURITY DEFINER` + fixed `search_path`; execute granted to `service_role` only, revoked from public/anon/authenticated; reads filter `deleted_at IS NULL` and default `test_owned = false`; the review-state `UPDATE … SET` targets **only** `review_state`/`reviewed_by`/`reviewed_at` and **never** any other column or governance flag; no hard `DELETE`.
- **Route auth**: unauthenticated GET/POST → **401 before any DB call** (mirror 38.3.2b).
- **Review-state route**: updates only the allowed fields; `reviewed_by` server-derived; invalid `review_state` rejected.
- **No-house-mutation** (static): routes + UI write nothing to any House surface; the only write path is the review-state RPC.
- **UI guard** (static): the Maintenance Room component exposes no Fix/Apply/Approve/Remedy handler or label.

## 11. Smoke plan (governed)

1. Tara applies migration `084` (SQL Editor; success = "No rows returned").
2. Persist a small **test-owned** batch via the 42.3.3a runner.
3. Open the Maintenance Room with the test view; confirm findings render grouped, with detail + run history.
4. Acknowledge one finding, Dismiss another; confirm `review_state` changed (via the read RPC return) and **only** review fields changed.
5. **Source-surface write-proof:** `library_*`, `archive_graph_*`, `graph_proposals`, `helper_outputs` counts unchanged.
6. Cleanup the test-owned rows (42.3.3a cleanup RPC). Confirm the production view (test excluded) shows the honest empty state.

## 12. Rollback / no-mutation

- No House surface is ever written; source-surface write-proof holds.
- Migration `084` is additive functions only — droppable; rollback notes included; no table change.
- The sole DB write is `review_state`/`reviewed_by`/`reviewed_at` on `agent_findings` via the governed RPC — reversible (re-open) and confined to the durable record.

## 13. Non-goals (deferred / forbidden)

No remedy plans · no approval surface · no apply workers · no standing policies · no scheduler · no LLM · no new agent tables · no kernel change · no real-finding persistence (that is its own later gate) · no Memory/Graph-approval/Archive/Recall/prompt/canonical mutation · **no hands.**

## 14. Proposed cadence (per the recalibrated tiering)

42.3.3b touches a migration + a write RPC + a UI, so it sits at **Tier 2** (governed, but not the maximal per-step ceremony 42.3.3a needed). Proposed: **this brief → recon report → build → one post-build report → one bundled "ship it"** (commit → push → ff-merge → push main → deploy verify → cleanup → CLAUDE.md refresh) as a single approval. Optional sub-split if Ari prefers: **42.3.3b-i** (migration `084` + server routes) then **42.3.3b-ii** (UI). Ari to choose.

## 15. Open questions for Ari

1. Migration number `084` (next free) — confirm.
2. Review-state transitions: reversible (allow re-open) or one-way?
3. One combined `agent_findings_list` read RPC vs separate per-domain reads — combined recommended.
4. `test_owned` view exposure: a server-route smoke flag only (recommended), never in the normal UI.
5. UI placement: `/agents` vs a Helper Workshop tab.
6. Cadence: single 42.3.3b, or sub-split i/ii?

---

*Design brief only. Per House build law: goes to Ari for review before any recon, code, or migration. Nothing here authorises code, DB access, schema, or mutation. The kernel may inspect, report, and durably record; it may not act.*
