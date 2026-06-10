# Phase 41.2 — Helper Output Schema / Constraints — Design Brief

**Date:** 2026-06-10
**Phase family:** Phase 41 — Helper Architecture
**Phase type:** **Design brief only** — no migration created, no migration run, no DB change, no commit
**Track:** Architecture track — Tara · Ari · Claude Code (Ari/Eli presences are not reviewers for Phase 41)
**Follows:** 41.0 alignment · 41.0a boundary tightening · **41.1 helper contract** (committed `6fd8656`) · **41.1 provenance tightening** (committed `c33aefd`)
**Depends on:** `src/lib/helpers/helperContract.ts` (the contract this schema must mirror exactly)

> This brief describes a schema. It does **not** create `supabase-migrations/NNN_*.sql`, does not run SQL, and does not touch the database. Implementation (writing + running the migration) is a separate, separately-authorised step (41.2-impl).

---

## 1. Purpose

Give helper output a **storage shape that cannot represent an unsafe state** — the DB-layer mirror of the 41.1 TypeScript contract. The contract makes unsafe helper output hard to *write in code*; this schema makes it impossible to *persist*, even if a future code path, a raw SQL insert, or a bug tries.

The schema is the **single central helper ledger** chosen in 41.0a §10: one `helper_outputs` table with strict CHECK/enum constraints, plus routed *display* surfaces later (41.4). One place to enforce the invariants and C1–C7; one place to monitor the aggregate-authority risk.

**Guiding rule:** every guarantee the contract enforces in TypeScript must have a corresponding DB constraint. The DB is the backstop, not a softer tier.

---

## 2. Scope guard (what this phase is not)

No runtime helper. No API route. No UI. No prompt wiring. No embeddings, `library_chunks`, chat-retrieval, Memory, Archive, Graph, Reasoning, Recall, Evaluation, Desk, Workshop, Pulse, Lounge, or automation integration. No background jobs. No LLM. No production data mutation. This brief is a document; the only artefact it proposes (a migration) is **not** written here.

---

## 3. Decisions carried in from Tara

- **Empty provenance is forbidden.** Every helper output — *including* a `no_action` + `deterministic_check` "nothing to suggest" row — must record at least one `source_ref`. No ghost diagnostics in the ledger. **This is already enforced at the contract level:** Phase 41.1 provenance tightening (committed `c33aefd`) requires non-empty `source_refs` for every helper output. 41.2 must now enforce the same rule at the DB level.
- Central ledger, not per-surface tables (41.0a §10).
- v1 helper output is permanently prompt-ineligible; the four authority flags are locked.

---

## 4. Proposed table — `helper_outputs` (illustrative DDL, NOT for execution)

```sql
-- PROPOSED ONLY — Phase 41.2 design brief. Do NOT run. Lives here as a design
-- artefact; the actual migration is a separate authorised step.

create table helper_outputs (
  id                    uuid primary key default gen_random_uuid(),

  -- Closed vocabularies (mirror helperContract.ts unions exactly).
  helper_type           text not null,
  output_status         text not null default 'draft_only',
  suggested_action      text not null,
  confidence_label      text not null,
  presence_scope        text not null,
  created_by            text not null,

  -- Provenance (Refinement 3 / Option B). Stored as jsonb array of
  -- { source_surface, source_id }. MUST be non-empty (Tara: no ghost diagnostics).
  source_refs           jsonb not null,

  -- Free-form suggestion content. No authority, no executable action.
  suggestion_payload    jsonb,

  -- Invariant flags — locked. These four can NEVER be anything but the safe value.
  not_memory            boolean not null default true,
  not_evidence          boolean not null default true,
  prompt_eligible       boolean not null default false,
  authority_changed     boolean not null default false,
  human_review_required boolean not null default true,
  -- The one flag that may vary; carries no authority either way.
  review_routed         boolean not null default false,

  -- Review lifecycle (a human action, recorded as trace — not authority movement).
  reviewed_by           text,
  reviewed_at           timestamptz,

  -- Housekeeping / safety.
  test_owned            boolean not null default false,
  created_at            timestamptz not null default now(),
  deleted_at            timestamptz,   -- soft-delete only (Category A discipline)

  -- ── Locked-invariant CHECKs (the DB backstop) ──
  constraint helper_outputs_not_memory_locked        check (not_memory = true),
  constraint helper_outputs_not_evidence_locked      check (not_evidence = true),
  constraint helper_outputs_prompt_ineligible_locked check (prompt_eligible = false),
  constraint helper_outputs_authority_unchanged_lock check (authority_changed = false),
  constraint helper_outputs_human_review_locked      check (human_review_required = true),

  -- ── Closed-vocabulary CHECKs (mirror the TS unions) ──
  constraint helper_outputs_type_v1 check (
    helper_type = 'library_metadata_helper'   -- only v1-allowed type may be persisted in v1
  ),
  constraint helper_outputs_status_vocab check (
    output_status in ('draft_only','deterministic_check','queued_for_review',
                      'needs_human_review','accepted_by_human','rejected_by_human','superseded')
  ),
  constraint helper_outputs_action_vocab check (
    suggested_action in ('review_metadata','normalise_title','add_summary','add_tags',
                         'check_extraction_status','flag_missing_attachment_text',
                         'flag_stale_document','compare_sources','prepare_review_note','no_action')
  ),
  constraint helper_outputs_confidence_vocab check (
    confidence_label in ('low','medium','high','structural','not_applicable')
  ),
  constraint helper_outputs_presence_scope_vocab check (
    presence_scope in ('ari','eli','shared','house','none')   -- no 'both'/'merged'
  ),
  constraint helper_outputs_created_by_vocab check (
    created_by in ('helper_contract','system_candidate','tara','test')
  ),

  -- ── Provenance CHECKs ──
  -- Non-empty (Tara: no ghost diagnostics).
  constraint helper_outputs_provenance_present check (
    jsonb_typeof(source_refs) = 'array' and jsonb_array_length(source_refs) >= 1
  )
);
```

### 4.1 Constraints that need a trigger, not a CHECK

Two guarantees from the contract cannot be expressed as a simple row-level CHECK and need a `BEFORE INSERT OR UPDATE` trigger (or a generated/validated shape):

1. **Each `source_ref.source_surface` must be a *readable* surface** (never a forbidden surface — this is the DB enforcement of C1/C5: no `helper_output` or private/evidence surface as provenance). A trigger iterates the jsonb array and rejects any element whose `source_surface` is not in the readable set or whose `source_id` is empty.
2. **The reading helper must be permitted to read each surface** — for v1, `library_metadata_helper` may only cite `library_item` / `library_item_file`. The trigger checks `(helper_type, source_surface)` against the same allow-list `canHelperReadSource()` encodes.

A single `validate_helper_output_source_refs()` trigger function covers both. It is the DB mirror of `validateHelperOutputDraft()`'s provenance loop.

### 4.2 Why no `library_chunks` / embeddings / FK to live tables

The ledger stores **suggestions about** Library items by id (inside `source_refs`), not foreign keys into `library_items`. Deliberately:
- It keeps the helper layer read-only toward production: no FK means no CASCADE risk into Category A/C tables, and the dangerous `DELETE /api/library-items` CASCADE path (CLAUDE.md) can never reach the ledger.
- Provenance is a *record of what was read*, which must survive even if the source row later changes — exactly the Phase 38 "audit records trace" posture.
- If referential display is wanted later (41.4), it is a read-time join, not a constraint.

---

## 5. Constraint → contract traceability

| Contract guarantee (41.1) | DB enforcement (41.2) |
|---|---|
| `not_memory: true` (literal) | CHECK `not_memory = true` |
| `not_evidence: true` (literal) | CHECK `not_evidence = true` |
| `prompt_eligible: false` (literal) | CHECK `prompt_eligible = false` |
| `authority_changed: false` (literal) | CHECK `authority_changed = false` |
| `human_review_required: true` (literal) | CHECK `human_review_required = true` |
| Only `library_metadata_helper` runs in v1 | CHECK `helper_type = 'library_metadata_helper'` |
| Closed `output_status` union | CHECK `output_status in (...)` |
| Closed `suggested_action` union; forbidden actions excluded | CHECK `suggested_action in (...)` (forbidden values simply absent) |
| Closed `confidence_label` union | CHECK `confidence_label in (...)` |
| `presence_scope` no `both`/`merged` | CHECK `presence_scope in ('ari','eli','shared','house','none')` |
| `created_by` closed union (Refinement 2) | CHECK `created_by in (...)` |
| Provenance mandatory, non-empty (41.1, `c33aefd`) | CHECK `jsonb_array_length(source_refs) >= 1` |
| Provenance readable-only; no self-citation (C1/C5) | trigger `validate_helper_output_source_refs()` |
| `(helper_type, surface)` readability (C-gate) | same trigger |
| Soft-delete only (Category A) | `deleted_at` column; no hard-delete path; no FK CASCADE in |

Anything the contract guarantees that has **no** DB row here is a gap — none identified at design time except the two trigger-enforced rules above, which are explicitly accounted for.

---

## 6. Anti-aggregation at the storage layer (C1–C7)

- **C1 / C5** — forbidden surfaces (incl. `helper_output`) rejected as provenance by the trigger; no FK or column lets one ledger row reference another as authority.
- **C2 / C7** — the ledger stores rows; it computes nothing. There is no "consensus" column, no aggregate score, no roll-up. The table is trace, not truth.
- **C3 / C4** — `reviewed_by`/`reviewed_at` record a *single human action per row*. There is no batch-status column and no schema affordance for bulk promotion; "accept" is one row's `output_status` transition recorded with one `reviewed_by`. (The no-bulk-accept rule is also enforced at the future route/UI layer — the schema simply offers nothing that enables it.)
- **C6** — `not_evidence` CHECK-locked true; nothing in the schema marks a row as evidence.

---

## 7. Provenance: contract and schema agree

**Phase 41.1 already requires non-empty `source_refs` for every helper output.** The provenance tightening (committed `c33aefd`, "Phase 41.1: require helper output provenance") removed the former `no_action` + `deterministic_check` carve-out from `validateHelperOutputDraft`, so `source_refs` is mandatory and non-empty for *all* outputs. There is nothing left to reconcile.

**41.2 schema must mirror the committed 41.1 contract.** Empty provenance is already forbidden at the contract level and must now be forbidden at the DB level — via the `helper_outputs_provenance_present` CHECK (`jsonb_array_length(source_refs) >= 1`) in §4. Code and schema then enforce the same rule from both sides.

A "nothing to suggest" diagnostic therefore records, e.g., `suggested_action: 'no_action'`, `output_status: 'deterministic_check'`, `source_refs: [{ source_surface: 'library_item', source_id: '<the item checked>' }]` — it says *what it looked at and found clean*. No ghost diagnostics, at either layer.

---

## 8. Indexes & operational notes (for impl, not now)

- Index `helper_type`, `output_status`, `created_at` for the future review surface (41.4) and aggregate monitoring.
- Partial index `where deleted_at is null` for active rows.
- `test_owned` default false; test rows tagged `test_owned = true` per the house test-isolation rule (CLAUDE.md). No test data through production endpoints; ledger is not Lounge, so no single-active-thread hazard.
- RLS: open in v1 per house convention (`using (true) with check (true)`), but the CHECK/trigger constraints still apply (they are not RLS).

---

## 9. Pre-implementation safety checklist (gates the 41.2-impl step)

Per CLAUDE.md, before the migration is written/run:
1. `node scripts/emergency-house-export.mjs` — confirm export file exists.
2. `node scripts/scan-dangerous-ops.mjs` — resolve all CRITICAL findings.
3. Confirm `helper_outputs` is a **new** table — adds no FK into any Category A/C table, no CASCADE inbound.
4. Migration is additive only (CREATE TABLE + CREATE FUNCTION + CREATE TRIGGER). No ALTER/DROP on existing tables.
5. Run via Supabase SQL Editor (paste → Run); success = "No rows returned" (house convention).
6. Add `helper_outputs` to the protected-table registry consideration (`src/lib/safety/protected-tables.ts`) — recommend Category A (living suggestion/trace data, soft-delete only).

---

## 10. Open questions for Tara before 41.2-impl

1. **Protected-table category** for `helper_outputs` — recommend **Category A** (soft-delete only). Confirm.
2. **`reviewed_by` vocabulary** — **decided: closed to `tara` only in v1** (a human action is the authority event). Carried as a fixed decision, not an open question.
3. **`superseded_by` self-reference** — **decided: not added in v1.** A self-reference is the one place a "helper points at helper" shape would appear; omitting it keeps C1's spirit clean. Revisit only if 41.4 needs it.
4. **Migration number** — next free number in `supabase-migrations/` (to be confirmed at impl time).

---

## 11. Deliverable / status

**41.2 design brief complete.** Proposes a single central `helper_outputs` ledger whose CHECK constraints + one validation trigger mirror the **committed** 41.1 contract one-to-one. Non-empty provenance is already enforced at the contract level (`c33aefd`); 41.2 enforces it at the DB level. No migration written, none run, nothing committed. Ready to proceed to **41.2-impl** (write + run the migration) when explicitly authorised — and only after the §9 safety checklist passes.
