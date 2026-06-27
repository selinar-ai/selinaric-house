# Phase 41.17.1 — Library Documentation Helper Type — Closure / Verification Record

**Status:** CLOSED (built, migrated, verified, smoke-passed) — not committed, not pushed, no real deposit
**Date:** 2026-06-27
**Phase family:** Phase 41 — Helper Architecture (41.17 — Helper Roster Expansion: "more eyes before more hands")
**Phase type:** Second deterministic, deposit-only helper / documentation-structure checks / no apply, no autonomy
**Builder:** Claude Code (Eli)
**Architect:** Ari
**Governed by:** Tara

**Branch:** `phase-41-17-1-library-documentation-helper` · **Parent:** `main` (`4423ae4`)
**Commit:** pending Tara/Ari approval — staged only, not yet committed · **Pushed:** no

---

## 1. One-Line Closure

Phase 41.17.1 added the House's second v1 helper — `library_documentation_helper`, a pure, deterministic, deposit-only helper that inspects one Library item's own columns for documentation-*structure* gaps (distinct from the metadata helper's quality checks) and deposits inert, review-only `helper_outputs` rows. It gained no apply power, no authority, and no autonomy. Migration 081 widened only the helper_type allow-list and the source-ref validation trigger; everything else is additive.

---

## 2. What Was Built

Nine files (5 new, 2 modified for registration, 2 new test files — plus this record):

**Implementation**
- `supabase-migrations/081_helper_documentation_type.sql` (new) — widens `ho_helper_type_v1` CHECK + the `validate_helper_output_source_refs()` trigger allow-map only.
- `src/lib/helpers/helperContract.ts` (modified) — registers `library_documentation_helper` as `v1_allowed`, reading the same two surfaces; adds `LIBRARY_DOCUMENTATION_HELPER_CONTRACT`.
- `src/lib/helpers/libraryDocumentationHelper.ts` (new) — pure deterministic helper.
- `src/lib/helpers/libraryDocumentationRunner.ts` (new) — pure runner core (arg parse incl. `--dry-run`, 4-field dedupe, deposit plan).
- `scripts/run-library-documentation-helper.ts` (new) — manual CLI, INSERT-only, reuses the sealed writer unchanged.

**Tests**
- `src/lib/helpers/__tests__/libraryDocumentationHelper.test.ts` (new)
- `src/lib/helpers/__tests__/libraryDocumentationRunner.test.ts` (new)
- `src/lib/helpers/__tests__/libraryDocumentationGovernance.test.ts` (new) — migration-081 static scan + Workshop no-apply-control proof.
- `src/lib/helpers/__tests__/helperContract.test.ts` (modified) — registration section (M).

**The two approved v1 issue codes (only these):**
- `phase_doc_missing_phase_metadata` — fires when `collection='development_documentation'` and `phase_code` + `phase_number` + `phase_label` are all null.
- `item_no_source_material` — fires when `file_path`, `source_url`, `content_text` are all empty and the item has zero `library_item_files`.

Both map to the existing `prepare_review_note` action (no action-vocabulary migration needed). They do **not** overlap the metadata helper's issue codes — documentation *structure* vs metadata *quality* are kept cleanly separate, so a single item is never double-flagged and per-helper-type dedupe stays clean.

---

## 3. What Was Not Built / Not Done

No apply action or button · no tag/bulk apply · no scheduler/cron/QStash/loop/self-trigger · no autonomy · no LLM call · no Memory/Graph/Archive/prompt writes · no Library-item mutation (INSERT-only into `helper_outputs`) · no change to `helperWorkOrder.ts`, the delegate/rollback routes, or any apply/work-order/apply-event schema · no change to the Workshop page (`page.tsx`); the new type renders via the generic review path and is hard-excluded from the retry-extraction apply control. **No real deposit was run.** The brief's deferred cross-item checks (e.g. "phase has no closure record") were not built — they are not single-item deterministic.

---

## 4. Migration 081 Status

Applied by Tara in Supabase SQL Editor → **"Success. No rows returned."** Verified live:
- helper_type CHECK now admits `library_documentation_helper` (a real insert succeeded; the pre-081 single-value CHECK would have rejected it).
- The source-ref trigger admits the new type reading `library_item` (insert succeeded) and **rejects** any other surface — the `archive_item_metadata` probe was refused with `P0001 — "helper library_documentation_helper may not read source surface archive_item_metadata"` (nothing persisted).
- By construction (two statements only) + the static governance test: no new grants, RLS change, policy, table, column, or work-order/apply-event change.

---

## 5. Verification — tests / build

| Check | Result |
|---|---|
| `libraryDocumentationHelper.test.ts` | **61/61 pass** |
| `libraryDocumentationRunner.test.ts` | **73/73 pass** |
| `libraryDocumentationGovernance.test.ts` | **20/20 pass** |
| `helperContract.test.ts` (regression + new section M) | **272/272 pass** |
| Full helper suite (20 files) | **0 failures** |
| Production build (`next build`) | **Compiled successfully, exit 0** |

Test harness: `npx tsx src/lib/helpers/__tests__/<file>.test.ts`. Build: `npm run build`.

---

## 6. Verification — governed smoke (live DB)

Target: one named item `bfee2302-dd88-4f46-9849-a8a922f8c077` ("Phase 14 — Web Search"), a `development_documentation` item with all three `phase_*` fields null.

| Step | Result |
|---|---|
| **Dry-run** (`--dry-run`) | 1 candidate previewed (`phase_doc_missing_phase_metadata`), **nothing written** |
| **Test-owned smoke** (default) | 1 row deposited — `027559f6-8989-4906-b749-27f2c0c7dd05`, `test_owned=true`, run_id `2026-06-27T02-49-11-277Z_0efb8a9f` |
| Deposited-row flags | `not_memory/not_evidence/human_review_required=true`; `prompt_eligible/authority_changed/review_routed=false`; `created_by=system_candidate`; `review_state=unreviewed`; `reviewed_by/reviewed_at=null`; payload carries booleans/labels only (no raw body text) |
| No-mutation check | target `library_item` + file **byte-identical** before/after |
| Negative "only-surfaces" probe | `archive_item_metadata` insert **rejected** by trigger (`P0001`), nothing persisted |
| **Cleanup** | test-owned row **soft-deleted** (`deleted_at` set); **0 active `library_documentation_helper` rows remain** |

---

## 7. No-Authority-Movement Confirmations

The helper exists and was exercised once, but it has **no authority path**. Confirmed during this phase:
- No Memory created · no evidence created · nothing made prompt-visible.
- No Graph write · no Archive write · no Held Truth · no prompt-authority change.
- No Library item/file mutation (verified byte-identical).
- No apply control appears for `library_documentation_helper` (`isDelegatableExtractionOutput` returns false for this type; proven by test and by the row's non-delegatable issue code).
- No scheduler/cron/QStash/loop/self-triggering · no LLM call · single manual CLI invocation only.
- The only table written was `helper_outputs` (one test-owned row, since soft-deleted).
- `review_routed`/`reviewed_by` are never set by the helper. The unit of authority remains Tara's action through a governed surface — never the helper.

> Tara authorised the verification; the helper prepared review material; the audit recorded the footprint; **authority did not move.**

---

## 8. Explicit Statement — No Real Deposit

**No real (non-test) helper output was deposited in this phase.** The only row created was test-owned and has been soft-deleted; the database holds zero active `library_documentation_helper` rows.

---

## 9. Carry-Forward Notes

1. **Real deposit requires separate Tara/Ari approval.** A real `--deposit-real` run would create persistent review rows for live documentation gaps (e.g. the four `development_documentation` items currently missing phase metadata). Do not run it without a fresh, explicit approval.
2. **Each further helper or apply power is its own scoped phase.** Do not extend this helper into new issue codes, new surfaces, a new helper type, tag/bulk apply, a scheduler, or any apply action without a new brief → Ari review → build → governed smoke → approval.
3. **Commit + push are still pending approval.** Branch `phase-41-17-1-library-documentation-helper` is staged but uncommitted; `origin/main` remains `4423ae4`.
4. **Optional definitive catalog confirmation** (steps 1–3) can be run read-only in SQL Editor (`pg_get_constraintdef` for `ho_helper_type_v1`, `pg_get_functiondef` for the trigger, `information_schema.columns` / `pg_policies` / `role_table_grants` for helper_outputs) — REST cannot read the pg catalog.

---

## 10. Stop Condition

Phase 41.17.1 is closed at build + migration + verification + governed smoke. Do not run a real deposit, start another helper, or touch any apply/work-order/delegate/rollback path under this phase. Open the next slice only with a separate approved brief.

---

**41.17.1 CLOSED — the House gained more eyes, not more hands. Helper labour may prepare review; only governed review changes truth.**
