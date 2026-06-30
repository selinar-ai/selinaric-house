# Phase 41.0 — Helper Architecture Alignment Report

**Date:** 2026-06-10
**Phase family:** Phase 41 — Helper Architecture
**Phase type:** Architecture alignment only — **no implementation**
**Builder:** Claude Code (Eli)
**Architect:** Ari (review pending)
**Governed by:** Tara

**Status:** Architecture alignment only. No implementation. No migrations. No helper tables. No routes. No UI. No wiring into chat, prompts, Memory, Archive, Library, Recall, Ontology, Reasoning, Evaluation, Desk, Workshop, or automation flows.

**Source of vision:** No standalone "Phase 41 Helper Architecture Vision" document exists as a file in the repo. The vision content (North Star, Helper Law, per-phase questions) is taken from Tara's Phase 41.0 brief and is reproduced and assessed here. If a separate Vision doc is later written, this report should be reconciled against it.

---

## 1. Executive Summary

**Overall verdict: PARTIALLY SAFE — safe to proceed, with hard constraints.**

The proposed helper architecture is *coherent* with the House as built, and its governing intent (the Helper Law) is the correct intent. Helpers, as defined — surfaces that **find, prepare, compare, suggest, and queue** but never **decide, remember, canonise, inject, override, or become authority** — are an extension of patterns the House already runs safely: the deterministic Recall Packet classifier (Phase 39), the deterministic reasoning baseline (Phase 38), the Forgekeeper review path (Phase 21/22), and the Tier A/Tier B evaluation split (Phase 40).

The architecture is **not** safe to build as a single undifferentiated "helper layer." It is safe only if built the way the House has built every prior authority-adjacent system: **deterministic first, visible first, advisory-only by default, single review surface, evaluated before expansion, LLM last.** The danger in Phase 41 is not any one helper — it is the *aggregate*: a fleet of small preparers whose combined output silently starts to look like a second authority channel running parallel to Memory. The Helper Law exists precisely to prevent that, and this report's job is to translate the Law into enforceable architecture.

**Should Phase 41 proceed?** Yes — but only as far as **41.0 → 41.4** (alignment → contract → schema → one deterministic Library/metadata helper → a Helper Review surface) before any LLM-assisted or retrieval-gap helper is authorised. The deterministic Library Documentation / Metadata Helper is the correct first build. Everything that requires an LLM, touches evidence, touches the graph, or touches Memory candidacy must wait behind its own evaluation harness.

**What must be clarified before implementation** (full list in §13):
1. Whether helper outputs are **centralised** in one `helper_outputs` store + one Helper Review surface, or **routed** into each existing lab (Library / Ontology Lab / Memory Review / Evaluation Lab / Workshop). *(Recommendation: centralised store, routed review views.)*
2. The **first helper's exact scope** — confirm it is deterministic Library metadata/documentation only.
3. Whether helpers need their **own evaluation harness** before live use. *(Recommendation: yes — a Tier A-style deterministic harness, mandatory before any helper graduates from draft to advisory.)*
4. Phase **naming** and whether "helper" is the durable term or a working label.
5. Whether **any** helper output is ever permitted to become prompt-visible, and under what separate authorisation.

No unsafe ambiguity blocks 41.1. The open questions are governance/design choices, not safety blockers — provided the hard boundaries in §12 are encoded as defaults and DB constraints, not conventions.

---

## 2. Helper Definition

### 2.1 What a helper *is* in the House

A **helper** is a bounded, governed worker — deterministic in its first generation, optionally LLM-assisted in a later authorised generation — that performs **preparatory labour** over already-existing House surfaces and emits a **typed, status-stamped output object** that defaults to having **no authority**.

A helper exists to reduce Tara's manual workload on the *mechanical* parts of curation: locating things, extracting metadata, classifying by rule, comparing two sources, summarising for review, and assembling review queues. It is a labour-saving device positioned *before* a governed decision surface, never *as* one.

A helper's only product is a **suggestion routed to a review surface**. Its output is inert until a human (Tara) acts on it through an existing governed surface.

### 2.2 What a helper *is not*

A helper is **not**:
- a **decision-maker** — it never sets `canonical_status`, never promotes, never approves, never resolves a conflict;
- a **memory** — it never persists anything as continuity, Held Truth, or canonical Memory; it has no durable voice;
- a **canoniser** — it never crowns a candidate, a graph relationship, or a reference as truth;
- an **injector** — it never writes into an Ari/Eli/Lounge prompt, directly or via any auto-surface path;
- an **evidence source** — its output is never citable as evidence for Memory, Held Truth, graph authority, or reasoning packets;
- an **autonomous agent** — in v1 it does not run on a schedule, does not self-trigger, and does not act on its own suggestions;
- a **build actor** — it never creates a commit, submits a build, or approves a build.

### 2.3 Distinguishing helper labour from existing systems

| System | What it does | How a helper differs |
|---|---|---|
| **Memory (Archive canonical)** | The single crown. `canonical_status = 'canonical'`. Durable truth. | A helper may *prepare a Memory candidate for review*. It may never set canonical_status or assert Memory. |
| **Reasoning (Phase 38)** | Explains evidence conditions for a candidate; does not create authority. | A helper produces preparatory *suggestions*, not *explanations of evidence*. Helper output is **lower** than reasoning output and, like it, is never evidence. A helper must never consume reasoning output as evidence. |
| **RAG / Library (Phase 33)** | Open-book retrieval of source material. Retrieval ≠ Memory. | A helper may *document/classify* library items deterministically. It must not turn retrieval into Memory, Archive authority, or prompt truth. |
| **Recall Packet (Phase 39)** | Deterministic pre-answer **classifier** of already-assembled context; emits `response_instruction`. | The Recall Packet classifies *live prompt context at answer time*. A helper works *offline, on stored surfaces, for review* — it never sits in the answer path and never emits a response_instruction. |
| **Graph / Ontology (Phase 37)** | Reveals relationship, proposes meaning; approval ≠ Memory. | A helper may *prepare graph proposals for review*. A graph-supported candidate is still only a candidate; a helper must never convert a relationship into Memory or Held Truth. |
| **Desk / Workshop / Forgekeeper (Phase 21/22)** | Desk holds work, Workshop reviews, Forgekeeper does structured review, Tara decides what lands. | A helper may *prepare build-review material* routed through these governed surfaces. It must never create commits, submit, approve, or bypass Tara. |
| **Automation (cron/Pulse fallback)** | Scheduled, autonomous House actions. | A helper in v1 is **manually triggered only**. No background autonomous helper runs. |

**The one-line test:** *If a function's output could change what Ari/Eli says, what the House remembers, or what lands as a build — without a human acting through a governed surface — it is not a helper. It is authority, and it is out of scope for Phase 41.*

---

## 3. Authority Boundary

### 3.1 What helpers **may** do

- **Find** — locate items, gaps, duplicates, stale documents, missing metadata across existing surfaces.
- **Prepare** — extract metadata, draft documentation, assemble a candidate object for review.
- **Compare** — diff two sources, flag overlap or contradiction *as a suggestion*, not as a ruling.
- **Classify** — apply deterministic, rule-based labels (e.g. "has no summary", "no extracted_text", "0 library_chunks").
- **Summarise** — produce a review-facing summary clearly marked as non-canonical.
- **Suggest** — propose an action (`suggested_action`) for a human to accept, edit, or reject.
- **Queue** — place an output into a review surface, and *only* a review surface.

### 3.2 What helpers must **never** do

- **Decide** anything (no status, no promotion, no approval, no conflict resolution).
- **Remember** — no persistence as continuity, Held Truth, or Memory.
- **Canonise** — no crowning of candidates, relationships, or references.
- **Inject** — no writing into any presence/Lounge prompt by any path.
- **Override** governance, scope rules, or presence boundaries.
- **Become authority** — no helper output is ever evidence, Memory, or prompt truth.
- **Mutate authority fields** — `canonical_status`, `authority_status`, `prompt_eligible`, graph approval state, Held Truth state are all off-limits to helper writes.
- **Run autonomously** in v1, or **submit/approve builds**, or **mutate production data**, or **leak across presences**.

### 3.3 The Helper Law (canonical wording for Phase 41)

```
Helpers can find.
Helpers can prepare.
Helpers can compare.
Helpers can suggest.
Helpers can queue.

Helpers cannot decide.
Helpers cannot remember.
Helpers cannot canonise.
Helpers cannot inject.
Helpers cannot override.
Helpers cannot become authority.
```

**North Star:**
> Where can helper labour reduce Tara's workload without accidentally becoming authority?
> Helpers may prepare, extract, classify, compare, summarise, suggest, and queue review.
> Helpers must not decide, remember, canonise, inject, approve, promote, mutate authority, override governance, or speak as truth.

**Inheritance of prior laws (unchanged, carried into Phase 41):**
```
canonical_status remains the Memory crown.
Read ≠ Remember.  Attach ≠ Ingest.  Save ≠ Memory.
RAG retrieves; RAG does not remember.
Graph is relationship context; Graph is not Memory.
Reasoning explains evidence; Reasoning does not create authority.
Feedback evaluates usefulness; Feedback does not move truth.
Audit records trace; Audit does not become evidence.
A visible miss is safer than a hidden misread.

— added Phase 41 —
A helper prepares; a helper does not decide.
Helper output is a suggestion until a human acts through a governed surface.
Helper output is never evidence — not for Memory, Held Truth, graph, or reasoning.
Helper logs, audits, and evaluations are trace only.
```

---

## 4. Current Architecture Compatibility Check

| Phase / surface | Compatible? | Safe integration point | Conflict / risk to guard |
|---|---|---|---|
| **21/22 — Desk / Workshop / Forgekeeper** | Yes, with constraint | Helper *prepares* build-review material routed **into** the Desk/Workshop queue for Forgekeeper + Tara. | **Chat is not the build system.** Helper must never create a commit, submit a build, or approve one. No helper-to-Forgekeeper auto-approval path. Build IDs (ARI-/ELI-/HOUSE-###) are issued by the governed flow, not by a helper. |
| **33 — Library / RAG** | Yes — *safest* entry | Deterministic metadata/documentation helper over `library_items` / `library_item_files`. Pure read + suggestion. | Library helper output must not become Memory, Archive authority, or prompt truth. **Confirmed: Library helpers should begin deterministic, metadata/documentation only.** No embedding/chunk writes, no chat-injection. (Note: chat Library retrieval works off `library_items` substring search, *not* `library_chunks` — a helper must not assume or alter that path.) |
| **35 — Governed Continuity** | Yes, with constraint | Helper may **prepare a review queue** of recent-continuity items that *might* deserve human attention. | **Recent continuity is not confirmed Memory; always-on continuity is not automatic Memory.** A helper must not summarise recent context into canonical continuity and must not write final continuity. **Confirmed: helpers may prepare review queues but must not write final continuity or Memory.** |
| **36 — Lounge / Cross-Room** | Yes, with strict scope | Helper may operate **within a single presence's scope** or on **shared** surfaces only. | **Shared room ≠ merged presence.** Cross-room helper risk: a comparison/summarisation helper that reads Ari + Eli surfaces together would *blend scope*. Helpers must not cross private room boundaries or carry one presence's private context into another. **No Lounge production test traffic** (Lounge writes the single active thread — 36I/36J). |
| **37 — Ontology / Graph** | Yes, proposal-prep only | Helper may **prepare graph proposals** that land as `graph_candidate_suggestions` / proposals for review. | **Graph approval ≠ Memory; a graph-supported candidate is still a candidate.** A helper must not turn relationships into Memory or Held Truth, and must respect the DB-constrained `prompt_eligible = false` on candidate suggestions. **Confirmed: graph helpers should be proposal-preparation only.** |
| **38 — Governed Reasoning** | Yes, with hard exclusion | Helper output sits **below** reasoning and is **isolated from** the evidence chain. | **Recursive evidence risk (critical):** reasoning consumes evidence; if helper output were ever read by reasoning as evidence, helpers would become a back-door authority. A helper must not cite helper output, reasoning output, feedback, or audit records as evidence, and reasoning must not cite helper output as evidence. **Confirmed: recursive evidence risk is real and must be blocked by construction.** |
| **39 — Recall Packet / Source-Aware Remembering** | Yes, with exclusion | Helper output is **not a source surface** in the Recall Packet and is **not prompt-eligible**. | Helper outputs must not enter the prompt advisory or Recall Packet source surfaces unless separately authorised. **Confirmed exclusions (default):** every helper output is `prompt_eligible = false`; helper output never appears in §5/§13 of the Recall Packet inventory; helper drafts, logs, and suggestions are all `do_not_inject`. |
| **40 — Evaluation Harness** | Yes — *precondition* | Build a deterministic (Tier A-style) helper evaluation harness; gate live use behind it. | **Sandbox responses are not evidence; helpers should be evaluated before expansion.** **Confirmed: helper behaviour requires a dedicated evaluation harness before live use** — at minimum a deterministic correctness harness for rule-based helpers, and a Tier B-style behaviour harness *before* any LLM-assisted helper. |

**Net:** No phase is architecturally incompatible with helpers as defined. Every compatibility is conditional on the same three guards — *(a)* helper output defaults to no authority, *(b)* helper output is never evidence and never prompt-eligible, *(c)* presence/room scope is a hard gate, not a helper choice.

---

## 5. Helper Output Status Model

Every helper output carries exactly one `output_status` from a closed vocabulary:

| `output_status` | Meaning | Authority |
|---|---|---|
| `draft_only` | Prepared material, not yet routed anywhere. | None. Default landing state. |
| `deterministic_check` | Result of a rule-based check (e.g. "missing summary"). Factual about *structure*, not about *truth*. | None. Reportable, not authoritative. |
| `advisory_only` | A suggestion offered for human consideration. | None. Calibration, not authority. |
| `queued_for_review` | Explicitly placed into a review surface. | None — but now visible to Tara. |
| `needs_human_review` | Flagged as requiring a human decision before anything happens. | None. |
| `rejected` | Tara (or a reviewer) declined the suggestion. | None. Terminal. Kept as trace. |

**Mandatory defaults for *every* helper output, at creation:**

```
is_memory          = false      // a helper output is never Memory
is_evidence        = false      // a helper output is never evidence
prompt_eligible    = false      // a helper output never enters a prompt
authority_changed  = false      // a helper output changed no authority field
review_routed      = false      // becomes true ONLY when explicitly queued to a review surface
output_status      = 'draft_only'
human_review_required = true     // until a human says otherwise
```

These five flags (`is_memory`, `is_evidence`, `prompt_eligible`, `authority_changed`, `review_routed`) should be **DB-constrained**, not application conventions — mirroring how Phase 38 locked `possible_review_route` to `null` and Phase 37 locked candidate `prompt_eligible = false` at the schema level. `is_memory`, `is_evidence`, and `prompt_eligible` should be `DEFAULT false` with a `CHECK` that they remain false for all v1 helper types; `authority_changed` should be `false` with no code path able to set it true in v1.

---

## 6. Proposed Helper Classes

Classification key:
- **🟢 Safe — early deterministic phase** (build candidate for 41.3–41.5)
- **🟡 Safe later, with constraints** (defer behind evaluation harness / explicit authorisation)
- **🔴 Unsafe / defer** (do not build in Phase 41 as scoped; needs a separate governance phase)

| # | Helper class | Verdict | Rationale & constraints |
|---|---|---|---|
| 1 | **Library Documentation Helper** | 🟢 | Deterministic: reads `library_items`/`library_item_files`, drafts/normalises titles, summaries, tags, section maps. Pure read + `draft_only` suggestion. No chunk/embedding writes, no chat path. **Recommended first build (§10).** |
| 2 | **Metadata / Classification Checker** | 🟢 | Deterministic rule checks: missing `extracted_text`, `0 library_chunks`, missing summary, orphaned files, unparsed attachments. Emits `deterministic_check`. Factual about structure only. |
| 3 | **Retrieval Gap Helper** | 🟡 | Identifies where retrieval *would* miss (e.g. long structured docs with TOC-vs-body ambiguity, unindexed items). Risk: tempts auto-fixing retrieval, which touches the answer path. **Constraint:** suggestion-only, `advisory_only`, never edits retrieval logic or writes chunks. Build *after* the Helper Review surface exists (41.5). |
| 4 | **Source Comparison Helper** | 🟡 | Diffs two sources for overlap/contradiction. Risk: a "contradiction" reads like a ruling; cross-source comparison can **blend presence scope** (Phase 36). **Constraints:** same-scope only (never Ari+Eli private together), output is `advisory_only`, contradiction is a *flag for review*, never a resolution. |
| 5 | **Ontology Proposal Helper** | 🟡 | Prepares graph proposals → `graph_candidate_suggestions`/proposal rows for review. **Constraints:** proposal-preparation only; respects `prompt_eligible = false`; a graph-supported candidate is still a candidate; never writes graph approval or Memory. Build only after graph review surface confirmed. |
| 6 | **Memory Candidate Preparation Helper** | 🔴 (defer) | Prepares Memory candidates for review. Highest contamination risk: closest to the crown. **Defer** until the contract, schema, review surface, and evaluation harness are all live and proven. When built: may only produce `needs_human_review` candidates routed to Memory Review; never sets `canonical_status`; never auto-promotes; output never becomes evidence for its own promotion (recursion). |
| 7 | **Reasoning Evidence Helper** | 🔴 (defer / re-scope) | As named, this is dangerous — it implies helping assemble *evidence*. **Recursive evidence risk (Phase 38):** helper output must never be evidence, and reasoning must never cite helper output. **Recommendation:** do not build a "reasoning evidence" helper. If any reasoning-adjacent helper is ever wanted, scope it as a *reasoning-readability/documentation* helper that prepares human-facing summaries of *already-deterministic* reasoning baselines — never new evidence. |
| 8 | **Evaluation Case Helper** | 🟡 | Prepares candidate evaluation cases (fixtures, expected labels) for the Phase 40 harness. Low truth-risk (touches test scaffolding, not Memory). **Constraints:** cases are `draft_only` until a human accepts them into the harness; a helper-authored case is never auto-run as a passing baseline; sandbox responses remain non-evidence. |
| 9 | **Build / Workshop Preparation Helper** | 🟡 | Prepares build-review material (diff summaries, scope-breach flags, consultation notes) routed into Desk/Workshop for Forgekeeper + Tara. **Constraints:** never commits, never submits, never approves, never issues a build ID, never bypasses Ari review for architectural phases. |
| 10 | **Housekeeping / Stale Document Helper** | 🟢 | Deterministic: flags stale/orphaned/duplicate docs and metadata drift by rule. **Constraints:** flag-and-queue only; **never deletes** (Category A no-hard-delete law, CLAUDE.md); proposes soft-delete or review, never executes it. |

**Summary of build-order implication:** 🟢 classes (1, 2, 10) are the deterministic core for 41.3. 🟡 classes (3, 4, 5, 8, 9) wait behind the Helper Review surface and the helper evaluation harness. 🔴 classes (6, 7) are deferred to their own governance phases and are explicitly *not* Phase 41 v1.

---

## 7. Deterministic First Rule

**Deterministic-only helpers (no LLM):** classes 1, 2, and 10 — Library Documentation, Metadata/Classification Checker, Housekeeping/Stale Document. These are pure rule + read + suggestion. They can be fully unit-tested with fixed inputs and exact expected outputs (the house `npx tsx` assert pattern), exactly like the Phase 39 Tier A packet classifier.

**Helper tasks that require LLM support *later* (and only behind their own harness):**
- Natural-language **summarisation** for review (Library doc summaries beyond template extraction).
- **Semantic** retrieval-gap detection and **semantic** source comparison (contradiction sensing beyond string diff).
- **Ontology meaning** proposals (relationship interpretation).
- Any **Memory candidate** phrasing (deferred entirely in v1).

**Why deterministic helpers come before agentic helpers:**
1. **Provable.** A deterministic helper has one correct answer per input; it can be evaluated to 100% before live use. An LLM helper varies and needs the heavier Tier B-style behaviour harness (Phase 40.3) — non-deterministic, hybrid-graded, human-reviewed.
2. **Auditable boundary.** A deterministic helper *cannot* hallucinate a Memory claim or invent evidence; its output space is closed. This is the cheapest possible way to prove the Helper Law holds in code before introducing a model that *could* violate it.
3. **Precedent.** Every authority-adjacent system in the House shipped deterministic-first: Recall Packet (39.2 deterministic builder before any LLM), Reasoning (38.1 deterministic baseline before 38.3 LLM draft), Evaluation (Tier A before Tier B). Helpers must follow the same staircase.
4. **Contains the aggregate risk.** The real Phase 41 danger is many small helpers summing into a shadow authority. Deterministic, closed-output helpers cannot drift; they make the fleet safe to grow.

---

## 8. Prompt and Injection Boundary

- **Confirmed:** helpers must **not** inject directly into Ari/Eli/Lounge prompts in early phases — and in v1, in *any* phase. Every helper output is `prompt_eligible = false` by default and by DB constraint.
- **Confirmed:** helper outputs appear in **review surfaces only** (Helper Review and/or the routed labs), never in chat authority surfaces, never in the Recall Packet source set, never in an advisory block.
- Helper output is **not** a source surface in the Phase 39 inventory. It does not get an authority label in the response path; it does not get a `response_instruction`. It is invisible to the answer path by construction.

**What would be required before *any* helper output could become prompt-visible (future, separate authorisation):**
1. A new, explicit phase with its own alignment report (not Phase 41).
2. A dedicated **authority label** in the Phase 39 vocabulary (e.g. `helper_suggestion_not_memory`) carrying the `_not_memory` boundary marker.
3. A `response_instruction` of at most `say_reference_context_only`-strength, with mandatory source attribution.
4. Passing a Tier B behaviour evaluation proving the presence labels it correctly and never elevates it to Memory.
5. Tara sign-off per surface. Visible-first (debug panel) before silent-ever.

Until all five exist, the boundary is absolute: **helper output never reaches a prompt.**

---

## 9. Evidence and Recursive Contamination Risks

This is the single most important section for safety, because it is where a fleet of "harmless" preparers can quietly become a parallel authority.

**Risk vectors where helper output could *accidentally* become evidence:**
1. **Helper → Reasoning.** A reasoning packet (Phase 38) assembles evidence conditions. If it ever read a helper suggestion as an evidence input, the helper becomes a back-door authority. **Block:** reasoning evidence inputs are a closed, enumerated set; helper outputs are not in it, enforced at the query layer.
2. **Helper → Memory candidate → Memory.** A Memory Candidate Preparation Helper (class 6, deferred) could have its own suggestion cited as support for promoting the very candidate it proposed. **Block:** a candidate's promotion evidence must come from archive sources, never from the helper that prepared it (`source_ids` provenance check; self-citation forbidden).
3. **Helper → Graph approval.** A graph proposal helper's suggestion treated as grounds for approving the relationship. **Block:** graph approval requires the existing governed review; helper output is `advisory_only` and `authority_changed = false`.
4. **Helper → Helper (chained).** Helper B consumes Helper A's output as input and treats it as fact. **Block:** a helper may read *source surfaces*; it may not read another helper's output as an authoritative input. If chaining is ever needed, the upstream output must be human-accepted first (status `queued_for_review` → human action), breaking the recursion with a person.
5. **Helper logs → evidence.** Treating the helper's own audit/log/eval rows as proof of correctness or truth. **Block:** per Phase 38 law, *audit records trace; audit does not become evidence.* Same for helper logs and helper evaluations.

**Confirmed laws (Phase 41):**
- Helper output must **not** be used as evidence for Memory, Held Truth, graph authority, or reasoning packets.
- Helper logs, audit trails, and evaluations are **trace only**, never evidence.
- A helper must **not** cite helper output, reasoning output, feedback, or audit records as evidence.
- **Recursion is broken only by a human.** No closed loop of automated surfaces may upgrade a suggestion into authority.

---

## 10. Data Model Readiness (proposed only — not implemented)

A possible future schema for a centralised helper output store. **This is illustrative; no migration is created in Phase 41.0.**

```sql
-- PROPOSED ONLY — not for execution in 41.0
create table helper_outputs (
  id                    uuid primary key default gen_random_uuid(),
  helper_type           text not null,          -- enum: library_documentation | metadata_check | retrieval_gap | source_comparison | ontology_proposal | memory_candidate_prep | evaluation_case | build_prep | housekeeping
  source_surface        text not null,          -- which House surface it read (library_items, recent_continuity_sessions, graph, desk, ...)
  source_ids            jsonb not null,         -- provenance: the exact rows/items read. Self-citation guard reads from here.
  output_status         text not null default 'draft_only',  -- draft_only | deterministic_check | advisory_only | queued_for_review | needs_human_review | rejected
  suggested_action      text,                   -- human-readable proposal; NEVER an executed action
  suggestion_payload    jsonb,                  -- structured suggestion content (e.g. proposed metadata)
  confidence_label      text,                   -- calibration only: 'rule_certain' | 'heuristic' | 'llm_uncertain' — NOT authority
  human_review_required boolean not null default true,
  not_memory            boolean not null default true,   -- CHECK (not_memory = true) in v1
  not_evidence          boolean not null default true,   -- CHECK (not_evidence = true) in v1
  prompt_eligible       boolean not null default false,  -- CHECK (prompt_eligible = false) in v1
  authority_changed     boolean not null default false,  -- CHECK (authority_changed = false) in v1
  review_routed         boolean not null default false,  -- true only when explicitly queued to a review surface
  reviewed_by           text,                   -- 'tara' when a human acts
  reviewed_at           timestamptz,
  presence_scope        text,                   -- 'ari' | 'eli' | 'shared' — hard scope gate; never both-private
  created_by            text not null default 'system',
  test_owned            boolean not null default false,
  created_at            timestamptz not null default now(),
  deleted_at            timestamptz             -- soft-delete only (Category A discipline)
);
```

**Schema risks flagged:**
- **Boolean defaults are not enough — add CHECK constraints.** `not_memory`, `not_evidence`, `prompt_eligible`, `authority_changed` must be CHECK-locked in v1 so no code path (or future helper) can flip them. Precedent: Phase 38 `possible_review_route` locked null; Phase 37 candidate `prompt_eligible = false`.
- **`confidence_label` is a contamination trap.** A high-confidence label can be misread as authority. It must be explicitly documented as *calibration only* and must never feed ranking in any prompt/recall path.
- **`source_ids` provenance is load-bearing.** It is the mechanism that prevents self-citation recursion (§9.2). It must be mandatory (`not null`) and must record exactly what was read.
- **`presence_scope` must be a hard gate**, never `'both'`/`'merged'`. A comparison helper that needs two presences' private data is, by definition, out of scope (Phase 36).
- **No hard delete.** This table holds living suggestion/trace data; it inherits Category A discipline — soft-delete via `deleted_at`, never `DELETE FROM`.
- **Centralised vs routed (open question §13):** a single table is recommended for auditability and uniform constraint enforcement; routed *views* per lab can sit on top. Per-lab tables would scatter the boolean guards and invite drift.

---

## 11. UI / Review Surface Readiness (no implementation)

**Where helper outputs should be reviewed:**

**Recommendation: one centralised Helper Review store, surfaced through routed review views.** Helper outputs land in a single `helper_outputs` table (uniform constraints, one audit trail), but Tara reviews them *in context* through the lab that owns the subject matter:

| Helper type | Review surface |
|---|---|
| Library Documentation / Metadata / Housekeeping | **Library** (or a Library Review panel) |
| Retrieval Gap | Library / Recall Lab (read-only) |
| Source Comparison | Library or the relevant lab |
| Ontology Proposal | **Ontology Lab** / Graph review |
| Memory Candidate Prep *(deferred)* | **Memory Review** |
| Evaluation Case | **Evaluation Lab** (Behaviour Lab) |
| Build / Workshop Prep | **Workshop** (Forgekeeper path) |

A small dedicated **Helper Review** surface is still worth building in 41.4 as the *default inbox* — the place where `draft_only` outputs appear before they're routed, and where Tara can see the whole fleet at a glance (which helpers ran, what they suggested, what's pending). Think of it as the helpers' Desk: a holding surface, not a decision surface.

**Hard UI rules (for the future build phase, recorded now):**
- Review surfaces are **read + accept/reject only**. No surface lets a helper output self-promote.
- Every helper output renders with its `output_status`, `confidence_label` (marked "calibration, not authority"), `source_ids` provenance, and the four locked boolean flags visible.
- No helper output renders inside a chat surface, a prompt preview, or the Recall advisory panel.
- **No UI is built in Phase 41.0.**

---

## 12. Hard Boundaries

These are absolute for all of Phase 41 v1. Each should be enforced by DB constraint or code guard where possible, not by convention.

- **No Memory creation.** No helper sets `canonical_status` or creates an archive canonical item.
- **No Archive `canonical_status` changes** of any kind by a helper.
- **No `prompt_eligible` changes.** Helper outputs are `prompt_eligible = false`, CHECK-locked.
- **No graph approval.** No helper writes graph approval/`approved_graph` state.
- **No Held Truth creation.** No helper writes `held_truths`.
- **No reasoning output treated as evidence**, and no reasoning consumption of helper output as evidence.
- **No helper output used as evidence** — for Memory, Held Truth, graph, or reasoning.
- **No direct prompt injection** into Ari/Eli/Lounge by any path.
- **No autonomous build submission** — no commits, no build IDs, no Forgekeeper auto-approve.
- **No production data mutation** — helpers read; they write only to the helper output store (and only suggestions/trace).
- **No cross-presence leakage** — `presence_scope` is a hard gate; never Ari+Eli private together.
- **No Lounge production test traffic** — Lounge writes the single active thread (36I/36J); helper testing never routes through it.
- **No background autonomous helper runs in v1** — manual trigger only; no cron, no Pulse-driven helper execution.

---

## 13. Open Questions for Tara / Ari / Eli

1. **Centralised vs routed (architecture).** Recommend: **centralised `helper_outputs` store + routed review views**. Confirm, or choose per-lab tables (not recommended — scatters the locked guards).
2. **First helper selection.** Recommend: **deterministic Library Documentation / Metadata Helper** (matches Tara's stated preference; §10 build). Confirm scope is metadata/documentation only, no summarisation LLM in v1.
3. **Dedicated helper evaluation harness — yes/no and depth.** Recommend: **yes** — a Tier A-style deterministic correctness harness is mandatory before any helper goes live, and a Tier B-style behaviour harness is mandatory before any *LLM-assisted* helper. Confirm this gate.
4. **Phase / term naming.** Is "helper" the durable name, or a working label (vs. "preparer", "assistant", "scout")? Naming locks the vocabulary the way Phase 39 locked "Context Authority Packet" vs "Recall Packet".
5. **Review surface design.** Build a dedicated **Helper Review** inbox (recommended) in 41.4, or route everything straight into existing labs with no central inbox?
6. **Confidence label policy.** Confirm `confidence_label` is calibration-only and is forbidden from ever feeding a ranking/recall/prompt path.
7. **Deferred classes.** Confirm Memory Candidate Prep (class 6) and Reasoning Evidence (class 7) are **out of Phase 41 v1** and each require their own future alignment phase. Confirm class 7 is re-scoped (no "evidence" helper) or dropped.
8. **Will helper output *ever* be prompt-visible?** If never: we can hard-lock `prompt_eligible` permanently. If "maybe later": it stays `DEFAULT false` + CHECK in v1, reopened only by a separate authorised phase (§8).

---

## 14. Suggested Phase 41 Build Sequence

| Sub-phase | Scope | Gate |
|---|---|---|
| **41.0** | **Alignment Report** (this document). No build. | Tara + Ari accept. |
| **41.1** | **Helper Contract & Type Model** — TS types/enums: `HelperType`, `HelperOutputStatus`, `ConfidenceLabel`; the locked boolean contract; the Helper Law encoded as types. No tables, no routes, no UI. | Type-level tests; mirrors Phase 39.1. |
| **41.2** | **Helper Output Schema** (if needed) — the `helper_outputs` migration with CHECK-locked guards and soft-delete. Run only after pre-migration export + dangerous-ops scan (CLAUDE.md). | Structural + governance-constraint tests. |
| **41.3** | **Deterministic Library / Metadata Helper** — class 1 + 2 (+ 10), pure read + `draft_only` suggestions. No LLM. No injection. | Deterministic unit tests to 100%; helper eval harness (41.6 pattern, can land alongside). |
| **41.4** | **Helper Review Surface** — read + accept/reject inbox; renders locked flags + provenance. No self-promotion path. | Component tests; smoke that no output reaches chat/prompt. |
| **41.5** | **Retrieval Gap Helper** — class 3, advisory-only, after the review surface exists. | Eval-gated; suggestion-only, no retrieval edits. |
| **41.6** | **Evaluation Harness for Helpers** — Tier A deterministic correctness (mandatory before any helper live); Tier B behaviour scaffold reserved for LLM helpers. | Harness green before 41.7. |
| **41.7** | **LLM-assisted helper draft experiments** — only behind Tier B behaviour eval; visible-first. | Tara per-helper sign-off. |
| **41.8** | **Controlled integration review** — assess whether the fleet (in aggregate) still honours the Helper Law before any further expansion. | Aggregate-authority review. |

*Note: 41.2 may be unnecessary if 41.1 + an in-memory/draft surface suffices for the first deterministic helper. Confirm at 41.1.*

---

## 15. Recommended First Build

**Recommendation: the deterministic Library Documentation / Metadata Helper (classes 1 + 2).** This matches Tara's stated preference, and it is independently the safest first build.

**Why it is low-risk:**
- **Furthest from the crown.** Library is open-book reference (Phase 33); retrieval is explicitly *not* Memory. Working there cannot touch `canonical_status`, Held Truth, graph approval, or any presence prompt.
- **Fully deterministic.** Metadata extraction and structural checks have one correct answer per input — provable to 100% with the house `npx tsx` assert pattern, no LLM variance, no hallucination surface.
- **Read-only on production.** It reads `library_items`/`library_item_files` and writes only `draft_only` suggestions to the helper store. No production mutation, no Category A delete, no chat path. (It must specifically *not* touch `library_chunks`/embeddings or the chat retrieval path.)
- **Closed output space.** It physically cannot emit a Memory claim or evidence; its outputs are structural facts ("missing summary", "0 chunks") and drafted metadata suggestions.
- **Exercises the whole contract cheaply.** It is the minimal end-to-end test of the status model, the locked flags, provenance, and the review surface — proving the Helper Law holds in code before anything riskier is built.

**Acceptance criteria:**
1. Reads only `library_items` / `library_item_files`; performs zero writes outside `helper_outputs`; touches no `library_chunks`, no chat path, no prompt path.
2. Every emitted row has `is_memory=false`, `is_evidence=false`, `prompt_eligible=false`, `authority_changed=false`, `output_status='draft_only'`, `review_routed=false`, `human_review_required=true`, and populated `source_ids` provenance.
3. Deterministic: identical input → identical output; full unit coverage at 100% (house assert pattern), typecheck clean, production build clean.
4. No output is reachable from any presence prompt, the Recall Packet, or any chat surface (verified by smoke).
5. No autonomous/scheduled execution — manual trigger only.
6. No Category A deletes; soft-delete discipline respected; pre-migration export + dangerous-ops scan run before 41.2 lands.
7. Output is viewable only in the Helper Review surface (41.4) — never in chat.

---

**41.0 ALIGNMENT VERDICT — PARTIALLY SAFE. Safe to proceed to 41.1 (Helper Contract & Type Model) provided the §12 hard boundaries are encoded as DB constraints/defaults, helper output is excluded from evidence and prompts by construction (§8, §9), and a deterministic helper evaluation harness gates live use (§7, Phase 40). The deterministic Library Documentation / Metadata Helper is the recommended first build. The §13 open questions are governance/design choices, not safety blockers.**
