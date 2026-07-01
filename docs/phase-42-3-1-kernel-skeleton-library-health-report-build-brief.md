# Phase 42.3.1 — Kernel Skeleton + Library Pack Read-Only Health Report
## Build Brief (scoped) — TypeScript-only, zero migration, zero DB writes

**Status:** Build brief — **design only. No code, no migration, no DB mutation until separately approved.**
**Phase family:** Phase 42 — Governed Helper Labour
**Parent:** Phase 42.3.0 — Governance Kernel & Domain Packs (design/constitution)
**Author:** Eli (systems & reliability)
**Governs:** the first build slice of the Governance Kernel — generic seams with a single Library tenant.
**Build law:** brief → Ari review → build → governed smoke → closure. This document is the brief.

---

## 0. Acceptance Tests (must hold for the slice to close)

> **A. Generic seams test:** *"A hypothetical second domain pack can be added without schema redesign or rewriting the report lifecycle."*
>
> **B. Pure recomputation test:** *"The v1 Health Report reads source data and produces an ephemeral report only; it stores no findings and does not read/reconcile `helper_outputs`."*

**Operational meaning of Test A in a TypeScript-only slice** (since there is no schema to redesign, the test bites on the *type contracts*): the core kernel types carry a **generic envelope** (`domain`, `issue_code`, `capability_id`, `target_ref`, `severity`, `review_burden`, `summary`) plus a **domain-typed `payload`**. All Library-specific fields live in the payload. The proof is: *a second inspector for a different domain compiles against the unchanged core contracts and is consumed by the unchanged report lifecycle, requiring only a new payload type + a registration.* This is asserted by an actual test (see §11, T-SEAM).

---

## 1. Exact Purpose

Build the **Kernel skeleton** (generic, domain-agnostic contracts + an inspector registry + a generic report builder) and the **Library pack** (Library inspectors only), and use them to produce one thing: a **read-only, ephemeral Library Health Report** that consolidates deterministic Library findings over a selected, capped scope.

The slice proves two propositions at once:
1. The kernel seams are real and generic (Test A).
2. The House can look at Library health holistically **without writing anything anywhere** (Test B).

It is deliberately the smallest build that exercises the kernel shape while having zero blast radius.

---

## 2. Allowed Scope

- Create generic kernel **TypeScript contracts** (types + interfaces + flag constants).
- Create an in-memory **inspector registry** (register / list by domain).
- Create a generic, domain-agnostic **report builder** (collect → group → count → assemble `AgentReport`).
- Implement the **Library pack**: five read-only inspectors, a Library `payload` union, scope resolution with caps, and pack registration.
- Inspectors **may reuse the existing deterministic detection logic** from the Phase 41.17 helper modules **as imported pure functions only**.
- Provide a **manual, read-only runner** (CLI / test-harness entry) that produces and prints the report object.
- Tests + a governed read-only production smoke.

Everything here is **read-only** and **TypeScript-only**. No migration. No table. No write client. No UI surface.

---

## 3. Non-Goals (explicit — deferred to later phases)

- ❌ No durable tables (`agent_runs`, `agent_findings`, `agent_remedy_plans`, `agent_approval_events`, `agent_events`, standing-policy tables). The report stores nothing.
- ❌ No second durable finding store of any kind.
- ❌ No reading, reconciling, or creating `helper_outputs`. The 41.17 roster and its safety posture remain entirely untouched.
- ❌ No remedy plans, approval surface, or apply workers.
- ❌ No standing policies / Tier-1 auto-apply.
- ❌ No Maintenance Room UI, no domain switcher (breadth — deferred).
- ❌ No second domain pack implementation (only the *contract* must accommodate one).
- ❌ No scheduler, cron, QStash, or self-fired labour. *(Future read-only cadence may be considered as its own governed phase.)*
- ❌ No LLM. All inspectors are L1 deterministic.
- ❌ No touching Memory, Graph, Archive, Recall, prompt eligibility, `canonical_status`, or any authority field.
- ❌ No real helper deposits, no `--deposit-real`.

---

## 4. Schema vs TypeScript — decided: **TypeScript-only**

A read-only report that **stores nothing** needs **no durable tables**, therefore **no migration and no DB write surface**. The kernel "seams" in this slice are **typed contracts in code**, not schema. Durability (`agent_runs` etc.) is deliberately deferred to the first phase that genuinely needs persistence — at which point the table is modelled on the already-proven TypeScript envelope.

**Consequence:** 42.3.1 cannot corrupt data because it writes nothing, anywhere. Reads are `SELECT`-only against Library tables.

---

## 5. Proposed Files (all TypeScript; final paths confirmed at build time)

**Kernel skeleton (generic seams):**
- `src/lib/agents/kernel/types.ts` — `AgentDomain`, `IssueSeverity`, `ReviewBurden`, `TargetRef`, `AgentFinding<TPayload>` (the generic envelope), `Inspector<TPayload>` contract, `AgentReport`, and `KERNEL_GOVERNANCE_FLAGS` constants.
- `src/lib/agents/kernel/registry.ts` — `registerInspector()`, `listInspectors(domain)`; in-memory, no persistence.
- `src/lib/agents/kernel/report.ts` — `buildReport(domain, scope, inspectors, input)` → `AgentReport`; pure, domain-agnostic grouping/counting.

**Library pack (single tenant):**
- `src/lib/agents/packs/library/payloads.ts` — `LibraryFindingPayload` union (one payload type per issue code).
- `src/lib/agents/packs/library/scope.ts` — scope descriptors + cap enforcement; read-only Library queries.
- `src/lib/agents/packs/library/inspectors.ts` — the five Library inspectors implementing `Inspector`, importing existing 41.17 deterministic detection logic as pure functions.
- `src/lib/agents/packs/library/index.ts` — registers the Library pack inspectors.

**Manual runner (read-only):**
- `scripts/agent-library-health-report.mjs` — manual entry; resolves scope, runs Library inspectors, prints the `AgentReport`. No writes. `--dry-run` is the only mode (there is no non-dry mode).

**Tests:**
- `src/lib/agents/__tests__/phase-42-3-1-*.test.ts` — see §11.

---

## 6. Library Pack — Inspector List (L1 deterministic, read-only)

Each inspector wraps existing deterministic detection logic and emits `AgentFinding` envelopes with a Library payload. **None deposit; none read `helper_outputs`.**

| Inspector ID | Issue codes produced | Reads | Notes |
| :- | :- | :- | :- |
| `library.metadata` | `item_missing_core_metadata` | `library_items` | metadata presence checks only |
| `library.documentation` | `phase_doc_missing_phase_metadata`, `item_no_source_material` | `library_items` | all-null phase metadata; no source material |
| `library.content_health` | `file_content_truncated`, `file_flagged_needs_review` | `library_item_files` (metadata only) | **never reads `extracted_text` content** — flags/status fields only |
| `library.source_integrity` | `source_url_malformed`, `item_file_path_without_file_record`, `file_storage_reference_broken` | `library_items`, `library_item_files` | deterministic only; no network / no "stale" check |
| `library.doc_completeness` | `phase_doc_incomplete_phase_metadata`, `superseded_item_missing_archive_link` | `library_items` | partial phase metadata; superseded items missing archive link (reads `library_item` only) |

(Issue codes mirror the shipped 41.17 roster so the detection logic is reused, not reinvented.)

---

## 7. Scan Scope Limits

Scope is **explicitly selected** by the operator; the report never silently scans everything.

| Scope type | Meaning |
| :- | :- |
| `item` | one Library item by id |
| `collection` | one collection (e.g. `development_documentation`) |
| `items_with_files` | items that have attached files |
| `manual_batch` | an explicit list of item ids |
| `whole_library` | full Library — **only because read-only**, hard-capped |

**Caps (first slice):**
- `MAX_ITEMS_PER_REPORT = 100`
- `MAX_FILES_SCANNED = 500`
- If a scope exceeds a cap, the report **truncates and declares it** in the report object (no silent truncation).

---

## 8. Report Object Shape (ephemeral — never persisted)

Generic envelope; Library specifics live in `payload`. Produced at runtime, returned/printed, then discarded.

```
AgentReport {
  domain: AgentDomain                 // 'library'
  run_type: 'health_report'
  scope: { type, ref, resolved_count, capped: boolean, cap_reason?: string }
  generated_at: string                // runtime stamp for display only — NOT stored
  governance: KERNEL_GOVERNANCE_FLAGS // not_memory, not_evidence, not_authority,
                                      // authority_changed:false, prompt_eligible:false,
                                      // review_required:true, read_only:true
  findings: AgentFinding<LibraryFindingPayload>[]
  groups: { by_issue_code, by_severity }   // derived, deterministic
  counts: { total, by_severity, affected_items }
  excluded: { target_ref, reason }[]       // do-not-touch / out-of-scope items
}

AgentFinding<TPayload> {              // the generic SEAM
  domain: AgentDomain
  capability_id: string               // e.g. 'library.source_integrity'
  issue_code: string
  target_ref: { table, id, label }
  severity: IssueSeverity
  review_burden: ReviewBurden
  summary: string
  payload: TPayload                   // domain-typed; Library specifics ONLY here
}
```

**Named tradeoff (deliberate):** ephemeral = there is **no record that a report was run** (no `agent_runs` row, no history). "What did the report say last Tuesday?" is unanswerable; you recompute on demand. This is an intentional v1 choice to keep the slice write-free; durable run history is a later phase that introduces the first durable table.

---

## 9. Source Surfaces Allowed

| Allowed (read-only `SELECT`) | Forbidden (no read, no write) |
| :- | :- |
| `library_items` | `helper_outputs`, `helper_work_orders`, `helper_apply_events` |
| `library_item_files` (metadata/status fields) | `archive_items`, `archive_*`, `held_truths` |
| | `graph_*`, `memory_*`, recall/continuity tables |
| | any Category A living table |
| | identity kernels, prompts, secrets |

`extracted_text` body content is **not** read — content-health uses status/flag fields only.

---

## 10. Governance Flags

Even though nothing is persisted, every `AgentReport` carries the standard House flags as **contract constants** (display + invariant):
`not_memory = true` · `not_evidence = true` · `not_authority = true` · `authority_changed = false` · `prompt_eligible = false` · `review_required = true` · `read_only = true`.

The report is a **non-authoritative review aid**. It is not Memory, not evidence, not a basis for later runs (no recursive evidence).

---

## 11. Tests

| ID | Test | Asserts |
| :- | :- | :- |
| **T-SEAM** | **Acceptance Test A.** Register a throwaway fake second-domain inspector (`'demo'`) implementing `Inspector` with its own payload; run `buildReport` over it. | Compiles against unchanged core types; report lifecycle consumes it with zero change to `types.ts`/`report.ts`. Proves generic seams. |
| **T-PURE** | **Acceptance Test B.** Run the Library report; inspect for any write/deposit. | No write client imported; `helper_outputs` neither read nor written; returns an ephemeral object only. |
| **T-INSP-\*** | One pure unit test per Library inspector against fixtures. | Correct issue codes, correct envelope, deterministic, payload-only Library specifics. |
| **T-CAP** | Scope cap behaviour. | Over-cap scope truncates and sets `capped:true` + `cap_reason` (no silent truncation). |
| **T-SCOPE** | Forbidden-surface guard. | Inspectors read only `library_items` / `library_item_files`; no archive/graph/memory/helper_outputs reads. |
| **T-NO-MUT** | No-mutation static check. | No `insert`/`update`/`delete`/`upsert` in the slice; no Supabase write client; no migration file added. |

All inspector/report/registry tests are pure (fixtures, no DB, no LLM, no async I/O).

---

## 12. Smoke Plan (governed, read-only)

1. Run `scripts/agent-library-health-report.mjs` against a **real but capped** Library scope (e.g. `collection=development_documentation`, capped at 100).
2. Confirm it returns a consolidated `AgentReport` with grouped findings.
3. **Write-proof:** capture `count(*)` of `helper_outputs` (and a Library row sample) **before and after**; confirm **unchanged**.
4. Confirm no new rows in any table; no migration applied.
5. Soft-confirm scope/caps behave (run an over-cap scope, see truncation declared).

Read-only production reads are permitted; **no production route that writes is called** (Phase 36J Rule 1).

---

## 13. Rollback / No-Mutation Proof

There is **nothing to roll back** because nothing is written. Proof obligations:
- No migration file exists in the slice.
- No write code path exists (T-NO-MUT).
- No write Supabase client is imported by any slice file.
- Smoke shows `helper_outputs` count and Library rows unchanged before/after.
- No Category A table touched; no authority field read or written.

"No mutation" is the rollback strategy, stated explicitly per the kernel contract.

---

## 14. Stop Condition

Stop the slice when **all** hold:
- The Library Health Report renders consolidated findings from the five inspectors over a selected, capped scope.
- **T-SEAM passes** (a second-domain inspector works with zero core change).
- **T-PURE passes** (ephemeral, no `helper_outputs` read/write, no persistence).
- All inspector/cap/scope/no-mutation tests pass; build + typecheck clean.
- Read-only smoke confirms zero writes.

**Stop *before* (these are the next phases, each its own brief):** remedy plans, approval surface, apply workers, any durable finding store, a second real pack, standing policies, scheduler, LLM, Maintenance Room UI.

---

## 15. What This Slice Must Not Do (hard boundaries)

- No migration, no DB write, no durable table.
- No `helper_outputs` read, write, or reconcile; 41.17 roster untouched.
- No remedy/approval/apply/standing-policy logic.
- No scheduler / cron / self-fired labour.
- No LLM.
- No Memory / Graph / Archive / Recall / prompt-eligibility / `canonical_status` / authority access.
- No real deposits.
- No Library-specific field in the core kernel envelope (payload-only) — guarded by T-SEAM.

---

## 16. Governing Line

The first slice writes nothing, decides nothing, and remembers nothing — and still proves the kernel is real. It looks at the Library holistically, hands Tara a consolidated read, and leaves the House exactly as it found it.

*Generic seams. Single tenant. Zero blast radius.*

---

*Build brief only. Per House build law: this goes to Ari for review before any code is written. Nothing here authorises code, migration, or mutation.*
