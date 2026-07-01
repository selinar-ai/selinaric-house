# Phase 42.1 — Manual Helper Runner for Library Metadata Agent (Build Brief)

**Status:** Proposed — **draft for Ari/Tara review. No build, no code, no commit, no push.** Uncommitted note only.
**Phase family:** Phase 42 — Helper Execution (first execution spine)
**Phase type:** Manual runner / write path over already-sealed pieces
**Builder:** Claude Code · **Architect:** Ari · **Governed by:** Tara
**Rides on:** Helper Floor (Phase 41, sealed) + Workshop Visual Pass (`10916f4`). `origin/main = 10916f4`, global active helper outputs = 0.

---

## One-line brief

Give the already-approved deterministic `library_metadata_helper` a **manual, one-item-at-a-time runner** that deposits **real** inert `helper_outputs` rows into the closed Workshop — so Tara can review genuine helper labour through the existing 41.12 route, with the 41.14 trace read-only. Nothing becomes truth, applied, remembered, prompt-visible, or authoritative.

## Core law

> The helper may prepare work. The Workshop may show work. Tara may review workflow state. Nothing becomes true, applied, remembered, prompt-visible, or authoritative.

---

## Inspection findings (the 9 items)

### 1. Current `library_metadata_helper` — can it already generate payloads?

**Yes, fully.** `src/lib/helpers/libraryMetadataHelper.ts` is pure and deterministic (no I/O). `inspectLibraryItem(item, files, options)` returns validated `HelperOutputDraft[]` — one per detected gap (weak/placeholder title, missing summary, missing tags, file-extraction gaps). Every draft is contract-validated and carries the locked flags (`not_memory` / `not_evidence` / `prompt_eligible:false` / `authority_changed:false` / `human_review_required:true`). **No change needed.**

### 2. `helper_outputs` schema requirements for a valid insert (migration 074)

- `helper_type` CHECK = **`library_metadata_helper`** only (v1).
- `output_status` ∈ writable inert set (`draft_only` / `deterministic_check`).
- `suggested_action` / `confidence_label` / `presence_scope` / `created_by` are closed vocabularies.
- `source_refs` is a non-empty jsonb array; a trigger enforces **readable surfaces** + the **helper/surface allow-list**.
- Locked-invariant CHECKs force the four authority flags + `human_review_required`.

The pure writer `buildHelperOutputInsertPayload` (`src/lib/helpers/helperOutputStore.ts`) already emits exactly this shape and validates before insert. **No change needed.**

### 3. Allowed `source_refs` today

For `library_metadata_helper`: **only `library_item` and `library_item_file`** (DB trigger + `canHelperReadSource`). The runner reads one item + its files; it never references helper_output, candidate, Memory, or Graph surfaces.

### 4. Safest minimal manual trigger — recommendation: CLI script

| Option | Verdict |
|---|---|
| **CLI script (recommended)** | No new route, no auth surface, manual-only, one item per invocation, refuses without explicit flags. Mirrors the existing `scripts/seed-helper-output-test-row.ts` (PostgREST `fetch` client, Node-safe). |
| admin-only API route | Adds a route + auth surface + a callable execution endpoint — more attack surface; needs a route (boundary says "no route unless proposed"). Defer. |
| dev-only / test-owned runner | Already exists (the seed script) — but it tags rows `test_owned`; it is not the real-deposit spine. |
| server action | Adds a surface; same objections as a route. Defer. |

Proposed: a **new CLI script** `scripts/run-library-metadata-helper.ts` that **reuses `inspectLibraryItem` + `insertHelperOutputs` unchanged**, requires `--library-item-id <id>` (never "all"), and **defaults to `test_owned=true`** — writing real rows only with an explicit `--deposit-real` confirm flag. No new module logic beyond glue + dedupe.

### 5. Duplicate prevention — recommendation: runner-side dedupe key (no migration)

Stamp a deterministic `_dedupe_key = sha256(helper_type | helper_version | source_item_id | issue_code)` into `suggestion_payload`. Before inserting each draft, the runner **reads existing active `helper_outputs`** (`deleted_at is null`, `review_state` not `dismissed`/terminal) filtered by that key and **skips** if one exists. Layers:

- **source item id** + **issue_code** → identifies "the same gap on the same item."
- **helper_version** (new payload constant) → a helper-logic change yields a new key, so genuinely-new findings aren't suppressed.
- **active/unreviewed check** → a dismissed/closed prior output doesn't block a fresh deposit.

This is read-side dedupe — **no DB constraint, no migration**. (Optional future hardening: a unique partial index — flagged below, **not** part of 42.1.)

### 6. Fields the runner writes (exactly the writer's payload — nothing more)

`helper_type`, `output_status` (`deterministic_check`), `suggested_action`, `confidence_label` (`structural`), `presence_scope`, `created_by` (`system_candidate`, unchanged), `source_refs` (library_item[/library_item_file]), `suggestion_payload` (issue detail + new `helper_version` + `_dedupe_key`), and the locked flags `not_memory:true` / `not_evidence:true` / `prompt_eligible:false` / `authority_changed:false` / `human_review_required:true` / `review_routed:false`, plus `test_owned` (true by default; false only with `--deposit-real`). **Never** writes `reviewed_by` / `reviewed_at` / `deleted_at` (absent from the payload type by design).

### 7. Migration needed? — No

The existing 074 schema + store + helper produce a valid real insert as-is; the runner only passes `testOwned:false` (already an accepted option). **DB posture unchanged** (RLS, grants, locked flags, append-only events untouched). The only schema-touching idea (a unique dedupe index) is **explicitly out of scope** for 42.1 — runner-side dedupe suffices. One doc nit: `helperOutputStore.ts`'s comment says "no non-test rows in 41.5"; 42.1 is the phase that authorises real rows, so that comment would be updated (no logic change).

### 8. Tests required

- Runner arg-handling: refuses without `--library-item-id`; refuses "all"; real deposit requires the explicit `--deposit-real` confirm; default is test-owned.
- Dedupe: given an existing active output with the same `_dedupe_key`, the runner skips; a dismissed/deleted prior does not block.
- Payload correctness: runner writes `created_by:system_candidate`, locked flags safe, `test_owned` per flag, `helper_version` + `_dedupe_key` present; never sets review / authority / `deleted_at` fields.
- Static scans: runner reads only `library_item` / `library_item_file`; **INSERT only** (no update / delete / upsert); no route; no Memory / Graph / candidate / `graph_candidate_suggestions` reads; one item per run.
- Regression: existing helper / store / contract / workshop / review suites still green; typecheck; build.

### 9. Smoke test (governed) — what it proves

Run in **test-owned mode first** (real-deposit is a separate, explicitly-approved step since real rows persist):

1. Run the runner against **one** library item (test-owned) → **creates the expected helper_outputs row(s)**.
2. `/helpers` Workshop **shows** them (correct room by burden; Agent label; silent courier).
3. **Review one row** via the existing 41.12 route → 200; `unreviewed → viewed`.
4. **41.14 trace appears** read-only.
5. **Protected fields unchanged** (only review_state / reviewed_by / reviewed_at move).
6. **Re-run the runner** → dedupe **skips** (no duplicate).
7. **Cleanup** (soft-delete by run marker) → **global active helper outputs back to 0**.

A real (`--deposit-real`) deposit against a chosen production library item is a **separate approval** after the test-owned smoke passes — and those rows are reviewed, not auto-cleaned.

---

## Proposed file footprint (on approval)

- **New:** `scripts/run-library-metadata-helper.ts` (CLI glue + dedupe; reuses helper + store unchanged).
- **New:** a test file for the runner's pure logic (arg parsing, dedupe key, skip logic).
- **Maybe:** a 1-line doc-comment update in `helperOutputStore.ts` (no logic change).
- **No** migration, route, schema, or DB-posture change. **No** change to `libraryMetadataHelper.ts` / `helperOutputStore.ts` logic, the 41.12 route, or the 41.14 trace.

## Hard boundaries (carried)

No Memory Candidate Agent · no bridge from `graph_candidate_suggestions` · no candidate import · **no helper-type widening** (inspection proves none is needed) · no batch review · no approve / apply / promote controls · no autonomous cron · no scheduled execution · no route / migration / schema / DB-posture change · no Phase 42.2 work · no commit · no push.

## Open questions for Ari

1. **Trigger shape** — confirm **CLI script** (vs admin route / server action)?
2. **Real-deposit gating** — is "default test-owned, real rows only via `--deposit-real` + explicit confirm" the right safety default, and should the first **real** deposit be its own separately-approved run?
3. **Dedupe** — runner-side `_dedupe_key` only (no migration), or a DB unique partial index as a *later* hardening phase?
4. **`created_by`** — keep the helper's `system_candidate`, or stamp `tara` / `helper_contract` for manually-triggered runs?
5. **Scope of "real"** — one named library item per run only (no all-items path), confirmed?

## Stop condition

Build only after Ari + Tara approve. This is a brief; nothing is implemented. No commit, no push, no Phase 42.2.

---

**Headline:** the helper and the safe writer already exist and are sealed — 42.1 is *only* a manual CLI trigger + duplicate guard that flips `test_owned` to false on explicit command. No migration, no route, no schema, no DB-posture change, no helper-type widening. The crown stays with Tara.
