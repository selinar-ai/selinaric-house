# Phase 41.0a — Helper Boundary Tightening / Build Sequence Refinement

**Date:** 2026-06-10
**Phase family:** Phase 41 — Helper Architecture
**Phase type:** Alignment refinement — **no implementation, no migrations, no commit**
**Track:** Architecture track — Tara · Ari · Claude Code. **Ari/Eli (the House presences) are not reviewers for Phase 41.0/41.0a.** They may receive outcomes later.
**Predecessor:** `docs/phase-41-0-helper-architecture-alignment-report.md` (accepted as directionally correct)
**Verdict carried forward:** PARTIALLY SAFE — safe only with hard constraints.

---

## 1. Purpose of this refinement

41.0 established *what a helper is* and *what it must never do*. This pass tightens three things before any implementation brief:

1. The **default authority state** of helper output (locked, restated below).
2. The **aggregate-authority problem** — the core risk — with concrete architectural controls, not just principles.
3. The **build sequence**, with a new 41.0a boundary-tightening step inserted before the contract.

Nothing here loosens 41.0. Everything here is a narrowing.

---

## 2. Decisions absorbed from the Ari/Tara architecture review

| # | Decision | Effect on architecture |
|---|---|---|
| 1 | Ari/Eli are **not reviewers** for this phase. | Phase 41 is a Tara/Ari/Claude Code architecture track. No House-presence review gate. Outcomes may surface to presences later. |
| 2 | Proceed from **PARTIALLY SAFE — only with hard constraints.** | Constraints in §3, §4, §6 are mandatory, not advisory. |
| 3 | Core risk = **aggregate helper authority.** | New §5 defines explicit anti-aggregation controls. |
| 4 | Locked output defaults. | §3 — encoded as DB constraints, not convention. |
| 5 | v1 helper output is **permanently prompt-ineligible** unless a later explicit phase changes it. | §3.2 — `prompt_eligible` is CHECK-locked false; no early helper is designed prompt-visible. |
| 6 | **Rename/remove "Reasoning Evidence Helper."** | §7 — renamed to **Reasoning Readiness Checker**, re-scoped to hygiene only; deferred from v1 regardless. |
| 7 | First build = **Deterministic Library Documentation / Metadata Helper**, far from the Crown. | §8 — scope hard-locked. |
| 8 | Refined build sequence with a 41.0a step. | §9. |
| 9 | Assess central vs routed storage. | §10 — recommend **one central ledger + routed review display**. |
| 10 | Define the **v1 hard exclusion list**. | §6. |

---

## 3. Locked helper output defaults (restated, now mandatory)

### 3.1 Every helper output, at creation

```
not_memory         = true        // CHECK (not_memory = true)        in v1
not_evidence       = true        // CHECK (not_evidence = true)       in v1
prompt_eligible    = false       // CHECK (prompt_eligible = false)   in v1
authority_changed  = false       // CHECK (authority_changed = false) in v1
review_routed      = false       // true ONLY when explicitly queued to a governed review surface
output_status      = 'draft_only'
human_review_required = true
```

These are **schema-enforced invariants**, not application defaults. Precedent in the House: Phase 38 locked `possible_review_route = null` at the DB layer; Phase 37 locked candidate `prompt_eligible = false`. Helpers follow the same discipline — a value that must never change is enforced where it cannot be bypassed by a future code path or a future helper.

### 3.2 Permanent prompt-ineligibility (v1)

- `prompt_eligible` is `DEFAULT false` **and** CHECK-locked to `false` for all v1 helper types.
- No v1 helper is *designed* as prompt-visible. There is no "visible-first" debug-into-prompt path for helpers in v1 (that path existed for the Recall Packet because the packet *is* in the answer path; helpers are not).
- Reopening prompt-visibility is **out of scope for all of Phase 41** and requires a separate, explicitly authorised future phase with its own alignment report, a `_not_memory`-marked authority label, a Tier B behaviour eval, and per-surface Tara sign-off. Until that phase exists, the boundary is absolute.

### 3.3 `review_routed` semantics

`review_routed` flips to `true` **only** when a helper output is explicitly queued to a *governed* review surface (Helper Review inbox or a routed lab view). It is the single bit that distinguishes "prepared and sitting inert" from "presented to Tara." It never implies authority — a routed output is still `not_memory`, `not_evidence`, `prompt_eligible = false`.

---

## 4. The unit of authority is the human action, not the helper

One sentence governs the whole phase:

> **A helper output is inert until a human acts on it through a governed surface. The human action is the authority event. The helper output never is.**

Every constraint below is a way of guaranteeing that no chain of automated surfaces can manufacture an authority event without a person in the loop.

---

## 5. Aggregate helper authority — the core risk, and how we block it

The danger is not a single helper misbehaving. It is **emergent**: a fleet of individually-inert advisory outputs that, in aggregate, start to function as a second authority channel running parallel to Memory — by volume, by repetition, by cross-reference, or by a reviewer rubber-stamping a queue because "the helpers all agree."

41.0 named this risk. 41.0a gives it **named controls** that belong in the contract (41.1) and schema (41.2):

| Control | Rule | Why it blocks aggregation |
|---|---|---|
| **C1 — No helper reads another helper's output as input.** | A helper may read *source surfaces* (Library, Archive, graph, continuity). It may not read `helper_outputs` rows as an authoritative input. | Breaks helper→helper chains. There is no closed automated loop that can compound suggestions into apparent consensus. |
| **C2 — No fleet consensus.** | The system never computes or surfaces "N helpers agree" as a signal that carries weight. Agreement among helpers is not evidence and is not displayed as a promotion signal. | Removes the most seductive aggregation path: many weak signals masquerading as one strong one. |
| **C3 — Recursion is broken only by a human.** | If a downstream helper ever needs an upstream result, that upstream output must first be **human-accepted** (`output_status` advanced by a person). A person, not a status transition, re-enters the chain. | Guarantees a human authority event sits between any two automated steps that could compound. |
| **C4 — One human action promotes one item.** | A review surface never offers "accept all" / bulk-promote of helper suggestions into any governed surface. Promotion is per-item, per-human-action. | Prevents a tired reviewer from converting a large queue into authority in one click — volume cannot become authority. |
| **C5 — Provenance is mandatory and self-citation is forbidden.** | Every output records `source_ids` (exactly what it read). A Memory/graph/reasoning decision may never cite, as support, a helper output that itself derives from the item being decided. | Stops circular self-support (a helper's own suggestion used to justify promoting the thing the helper flagged). |
| **C6 — Helper output is never evidence, anywhere.** | `not_evidence = true`, CHECK-locked. Reasoning's evidence inputs are a closed enumerated set that does not include `helper_outputs`. | The aggregate cannot leak into the one place (reasoning/evidence) where it would gain authority. |
| **C7 — The ledger is trace, not truth.** | `helper_outputs` rows, helper logs, and helper evaluations are trace-only (Phase 38 law: *audit records trace; audit does not become evidence*). | Even the full history of helper activity carries no authority by accumulation. |

**Net:** with C1–C7, the fleet can grow arbitrarily large and remain inert. No amount of helper output, agreement, or repetition can cross into authority without a discrete, per-item human action through a governed surface.

---

## 6. v1 hard exclusion list (absolute)

For all of Phase 41 **v1**, the following are excluded — enforced by constraint/guard where possible, not by convention:

- **No Memory Candidate Preparation Helper.** (Closest to the Crown; deferred to its own future governance phase.)
- **No Reasoning Evidence Helper** — under any name. The renamed *Reasoning Readiness Checker* (§7) is also **not** in v1; it is documented only so the name is corrected and its scope is bounded for the future.
- **No prompt-visible helper output.** `prompt_eligible` CHECK-locked false; no helper output reaches any Ari/Eli/Lounge prompt, the Recall Packet source set, or any advisory block.
- **No autonomous background helper runs.** Manual trigger only. No cron, no Pulse-driven execution, no self-triggering, no acting on own suggestions.
- **No production data mutation.** Helpers read production; they write **only** suggestion/trace rows to the helper ledger. No writes to `archive_items`, `library_chunks`, `held_truths`, graph approval, `living_state`, journals, or any presence surface.
- **No Lounge production test traffic.** Lounge writes the single active thread (36I/36J); helper development/testing never routes through it.

Additional v1 exclusions carried from 41.0 (still in force): no `canonical_status` change, no `authority_status`/`prompt_eligible` change, no graph approval, no Held Truth creation, no commits/build submission/Forgekeeper auto-approve, no cross-presence leakage, no Category A hard-delete.

---

## 7. Renamed: "Reasoning Evidence Helper" → **Reasoning Readiness Checker**

**Decision:** the name "Reasoning Evidence Helper" is retired. It is too authority-adjacent — it implies producing or strengthening evidence, which is precisely what a helper must never do.

**Replacement name (selected): `Reasoning Readiness Checker`.** (Considered alternatives: *Reasoning Packet Preparation Helper* — still implies assembling the packet; *Evidence Packet Hygiene Helper* — retains the word "evidence." "Reasoning Readiness Checker" is the furthest from authority language.)

**Bounded scope, if ever built (NOT in v1):**
- It may perform deterministic **hygiene/readiness checks** on an *already-deterministic* reasoning baseline — e.g. "this candidate has no hydrated evidence titles", "this packet is structurally incomplete", "this suggestion is missing a status snapshot."
- It reports structural readiness as a `deterministic_check`. It is a *checklist*, not a contributor.

**Absolute limits (permanent):**
- It must **never create evidence.**
- It must **never strengthen, weight, or rank evidence.**
- Its output must **never enter reasoning as a source** (C6 — reasoning's evidence inputs exclude `helper_outputs`).
- A "ready" verdict is not a quality verdict and confers no authority.

Documented now only to correct the name and fence the scope. Deferred from v1.

---

## 8. First build — scope hard-lock

**Deterministic Library Documentation / Metadata Helper** remains the recommended and only first build. Scope is now hard-locked:

- **Read-only** on production.
- **Deterministic** — identical input → identical output; no LLM.
- **Library metadata/documentation only** — reads `library_items` / `library_item_files`; drafts/normalises titles, summaries, tags, section maps; flags structural gaps (missing summary, missing `extracted_text`, `0 library_chunks`, orphaned files).
- **No embeddings.** **No `library_chunks` writes.** **No chat retrieval path changes** (chat Library retrieval uses substring search over `library_items`, not chunks — the helper must not touch or assume that path).
- **No prompt injection.**
- **No Memory / Archive / Graph / Reasoning / Recall mutation.**
- Writes **only** `draft_only` suggestion rows to the helper ledger.

Acceptance criteria as defined in 41.0 §15 carry forward unchanged.

---

## 9. Refined Phase 41 build sequence

| Sub-phase | Scope | Gate |
|---|---|---|
| **41.0** | Alignment Report. | **Complete** — accepted directionally correct. |
| **41.0a** | **Helper Boundary Tightening / Build Sequence Refinement** (this document). Locks defaults (§3), anti-aggregation controls (§5), v1 exclusions (§6), rename (§7). No build. | Tara/Ari accept this note. |
| **41.1** | **Helper Contract & Type Model** — TS types/enums: `HelperType`, `HelperOutputStatus`, `ConfidenceLabel`; the locked boolean contract; C1–C7 encoded as contract rules; Helper Law as types. No tables, routes, or UI. | Type-level tests; mirrors Phase 39.1. |
| **41.2** | **Helper Output Schema / Constraints** (if needed) — central `helper_outputs` ledger with CHECK-locked invariants (§3), mandatory `source_ids`, `presence_scope` hard gate, soft-delete. Run only after pre-migration export + dangerous-ops scan (CLAUDE.md). | Structural + governance-constraint tests. |
| **41.3** | **Deterministic Library Documentation / Metadata Helper** — §8 scope. Pure read + `draft_only`. No LLM, no injection. | Deterministic unit tests to 100%; typecheck + prod build clean. |
| **41.4** | **Helper Review Surface** — Helper Review inbox **or** Library-integrated review view. Read + per-item accept/reject (C4). Renders locked flags + provenance. No self-promotion path. | Component tests; smoke that no output reaches chat/prompt. |
| **41.5** | **Retrieval Gap Helper** — only after the Library helper is **stable**. Advisory-only, suggestion-only; never edits retrieval logic or writes chunks. | Eval-gated. |
| **41.6** | **Helper Evaluation Harness** — Tier A-style deterministic correctness harness; **mandatory green before any helper graduates from draft to live use.** Tier B behaviour scaffold reserved for the LLM step. | Harness green before 41.7. |
| **41.7** | **LLM-assisted helper drafts** — **only after deterministic helper evaluation passes (41.6).** Behind Tier B behaviour eval. Still `prompt_eligible = false`. | Per-helper Tara sign-off. |

*Sequencing note:* 41.6 (evaluation harness) is positioned to gate 41.7, but the deterministic correctness tests for 41.3 ship with 41.3 itself. The harness in 41.6 generalises those into a reusable gate before any LLM-assisted work. If 41.2 proves unnecessary for the first deterministic helper (e.g. a minimal draft store suffices), confirm at 41.1 — but the central ledger (§10) is the recommended target.

---

## 10. Storage: central ledger vs routed tables

**Assessed options:**

| Option | Pros | Cons |
|---|---|---|
| **One central `helper_outputs` ledger** + routed review *display* surfaces | Single place to enforce the locked invariants (§3) and C1–C7. One audit trail. One soft-delete discipline. Uniform `helper_type`/`output_status` constraints. Trivial to answer "what has the whole fleet produced?" — the key question for aggregate-authority monitoring (§5). | Wider table; needs disciplined `helper_type` enum and per-type validation. |
| **Routed per-surface tables** (Library helper table, ontology helper table, …) | Each table shaped to its subject. | **Scatters** the boolean guards → drift risk (the exact failure mode the locked invariants exist to prevent). N audit trails. No single view of the fleet → aggregate risk becomes harder to see. Constraint duplication across tables invites divergence. |

**Recommendation: one central `helper_outputs` ledger with strict type/status constraints, plus routed review *display* surfaces.** This matches Tara's stated preference and is the safer design: the anti-aggregation controls (§5) and locked invariants (§3) are enforced **once**, in one place, where they cannot drift — and the single ledger is itself the monitoring surface for the aggregate-authority risk. Per-surface *views* (Library Review, Ontology Lab, etc.) read from the ledger and render outputs in context; they do not own storage.

Proposed ledger shape carries forward from 41.0 §10 (illustrative, **not** for execution in 41.0a): `id`, `helper_type`, `source_surface`, `source_ids` (mandatory, provenance — load-bearing for C5), `output_status`, `suggested_action`, `suggestion_payload`, `confidence_label` (calibration only), `human_review_required`, the four CHECK-locked booleans, `review_routed`, `presence_scope` (hard gate, never both-private), `reviewed_by`/`reviewed_at`, `created_by`, `test_owned`, `created_at`, `deleted_at` (soft-delete only).

---

## 11. What this refinement does not change

- The 41.0 verdict (PARTIALLY SAFE) stands.
- The Helper Law stands verbatim.
- Deterministic-first / advisory-only / single-review-surface / evaluated-before-expansion / LLM-last staircase stands.
- The four-way Memory / Continuity / Reference / Trace distinction stands; helper output is **Trace**.

---

## 12. Status

**41.0a COMPLETE — boundaries tightened, sequence refined, storage recommendation made (central ledger), v1 exclusions fixed, "Reasoning Evidence Helper" retired and re-scoped as the deferred Reasoning Readiness Checker. Ready to draft the 41.1 Helper Contract & Type Model implementation brief when authorised. No code, no migration, no commit in this step.**
