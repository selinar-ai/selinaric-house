# Phase 42.3.0 — Governance Kernel & Domain Packs
## One Spine for Governed Labour — Consolidating the Pattern the House Already Built Twelve Times

**Status:** Vision / alignment design brief — **no code, no migration, no mutation**
**Phase family:** Phase 42 — Governed Helper Labour
**Author:** Eli (systems & reliability)
**Sits beside:** Ari's *Phase 42.3 — Library Steward Agent* (this brief generalises it; it does not replace it)
**Related:** Phase 41 Helper Vision ("The House Grows Hands, Not Crowns"); Phase 41.17.1/41.17.2 (helper roster); Phase 42.2.1 (delegated extraction-retry); Phases 16, 21–22, 27–40 (the twelve governed subsystems)
**Working principle:** The House already invented governed labour twelve times. Name the pattern once, build it once, and let every domain — Library first — register onto it.

---

## 1. Purpose

Phase 42.3.0 proposes a **Governance Kernel**: a single, domain-agnostic spine for governed labour, plus a **Domain Pack** model that lets each subsystem of the House (Library, Ontology, Recall, Archive, Watchtower, Reasoning, Inner Life, Continuity, Cross-Room) register inspectors and — only where the House's laws permit — bounded, reversible apply workers.

The Kernel does not introduce a new kind of authority. It consolidates a lifecycle the House has **already implemented twelve separate times** into one reviewable, auditable, enforceable spine, so that:

- New governed labour is added by **registration**, not by rebuilding a subsystem.
- Tara stops orchestrating helpers by hand and stops being the one who runs each detector and collates its output.
- Authority stays exactly where it is today — with Tara — but the **labour** of preparing and (where safe) applying work is carried by the system.

This is an efficiency phase. Its entire justification is: *stop repeating the same thing per domain.*

---

## 2. Why This Brief Exists

### 2.1 The pattern, built twelve times

Every governed subsystem in the House runs the **same five-beat lifecycle**:

> **eligible source** → **non-authoritative proposal** (deterministic-first) → **explicit review surface** → **Tara decision = the authority event** → **append-only audit with identical governance flags**

| Domain | Proposal stage | Review surface | Audit / trace |
| :- | :- | :- | :- |
| Library/RAG (33) | retrieval → RAG composer | Retrieval Lab | search logs |
| Archive/Recall (27–32) | `archive_entry_drafts` | Memory Review / Curation | `archive_memory_events` |
| Ontology (37) | `graph_proposals` (9 `suggest_*`) | Ontology Lab | `graph_review_events` |
| Reasoning (38) | evidence packet → caged LLM draft | Reasoning Panel | `reasoning_audit_events` |
| Recall/Eval (39–40) | `buildRecallPacket` → advisory; Tier A→B | /recall | `runtime_recall_advisory_traces` |
| Watchtower (16) | mode detect → edge-vs-interpretation | (inline) | — |
| Desk/Workshop (21–22) | Concept → Build Draft | Workshop + Forgekeeper | Desk History |
| Inner Life (18–26) | `journal_jobs`, `reflection_jobs` | Reflection Review | `reflection_feedback` |
| Continuity (35) | `recent_continuity_sessions` | RC inspect view | `memory_injection_events` |
| Cross-Room (36) | `cross_room_events` → candidates | propagation gate | event ledger |
| Helpers (41/42) | `helper_outputs` | Helper review | `helper_work_orders`/`helper_apply_events` |

Twelve subsystems, twelve sets of tables, twelve audit logs — **one pattern**. That repetition is the inefficiency Phase 42.3.0 exists to end.

### 2.2 The original Vision already pointed here

Phase 41's Helper Vision specified a **standard helper contract**, **eight helper classes** spanning the whole House, generic metadata-first tables (`helper_tasks`/`helper_runs`/`helper_outputs`/`helper_review_queue`), and **three execution levels** (L1 deterministic → L2 LLM-assisted → **L3 orchestrated**). The deviation built **one class** (Library), **five deterministic types**, stalled at **Level 1**, and never reached L3 orchestration. Phase 42.3.0 is the **return to that Vision**, completed.

### 2.3 The orchestration harness already exists

Desk / Workshop / Forgekeeper (Phases 21–22) is already a complete governed orchestration pipeline: propose → approval gate → prepare → automated review (Forgekeeper's five-part bundle) → Tara decides → append-only history, with scope-breach detection and consultation. Its own doc states: *"Agents may later assist Desks."* The Kernel is **Forgekeeper's pattern, generalised from builds to every domain** — not a foreign construct.

---

## 3. Core Laws (Kernel)

These inherit and do not weaken the House's existing laws.

- The Kernel carries labour. It does not carry authority.
- A finding is not a problem confirmed. A remedy is not a decision. Approval is the authority event. An apply is audit, not authority.
- Read is not Remember. Helper output is not evidence. Reasoning output is not evidence. No output is ever its own evidence (no recursive evidence).
- Every capability is registered, contracted, levelled, and enforced at one boundary — or it does not run.
- Tara decides what lands. Only governed review moves authority.
- A clock may open a door for *presence inner life* (Pulse). A clock never opens a door for *labour*. Labour agents do not self-fire.

---

## 4. North Star

*What governed labour can the House prepare — and, where safe and reversible, carry — across every domain, through one spine, without ever creating authority?*

The Kernel should make the **whole House** easier to govern, not just the Library, and never easier to corrupt.

---

## 5. Relationship to Ari's Phase 42.3 (explicit)

Ari designed the correct organ. This brief builds the body it should live in. Almost everything in Ari's 42.3 is adopted verbatim; the divergences are about **scope and consolidation**, not governance.

### 5.1 Adopted from Ari's 42.3 — verbatim

- The four-layer authority model: **Finding → Remedy proposal → Tara approval (the authority event) → Apply event (audit, not authority)**.
- **Read-only first.** Prove eyes before hands.
- **Whitelisted apply workers**, no generic edit route, **before/after snapshots**, **rollback or explicit non-rollback label**, full apply audit.
- The **risk / remedy classes** (review-only · deterministic metadata patch · operational maintenance · source hygiene · authority-bearing).
- The **LLM policy** (begin without LLM; if introduced, strict schema + deterministic pre-check + post-generation validation + no authority language + no direct apply).
- The **scheduler/autonomy prohibition** (no cron, no self-triggering, no recurring mutation).
- The non-goals: never touch `canonical_status`, Memory, Graph approval, Archive truth, `prompt_eligible`.

### 5.2 Where this brief diverges from 42.3 — and why

| # | Ari's 42.3 | This brief | Why |
| :- | :- | :- | :- |
| D1 | `library_steward_*` tables (Library-shaped) | Generic `agent_runs` / `agent_findings` / `agent_remedy_plans` / `agent_approval_events` / `agent_events`, with a `domain` column | One migration set forever, not one per domain. Avoids 5× rebuild. |
| D2 | Per-worker forbidden-field lists | One **Capability Registry** + a **global authority deny-list** enforced at a single apply boundary | One place to audit and prove, identical across domains; can't forget a field in domain #4. |
| D3 | All applies gated per-action (effectively Tier 2) | **Autonomy ladder**: Tier-1 reversible-deterministic applies may run under a Tara-set **standing policy** (audit + rollback), per-action stays for Tier 2 | This is what actually sheds Tara's babysitting without moving authority. Tier-1 already exists in 30B + 42.2.1. |
| D4 | Library Steward is the system | Library is **pack #1** of many | Ontology/Recall/Watchtower/etc. become registrations, not subsystems. |
| D5 | `/helpers/steward` (Library-only surface) | **One Maintenance Room** with a domain switcher | Tara learns one review UX, governs the whole House from it. |
| D6 | Helpers deposit, Steward re-consolidates | Inspectors are a kernel capability; the **deposit queue is one optional sink** | Removes the redundant "deposit then re-scan" loop. |

**Net:** 42.3 becomes the **Library pack on the Kernel** — Ari's exact flow, on shared rails.

---

## 6. Architecture — Four Layers

```
 ┌──────────────────────────────────────────────────────────┐
 │  SURFACE   —  One Maintenance Room (domain switcher)       │  one review UX
 ├──────────────────────────────────────────────────────────┤
 │  PACKS     —  Library · Ontology · Recall · Watchtower ·   │  just knowledge
 │               Archive · Reasoning · Inner Life · Continuity│  (mostly inspectors)
 ├──────────────────────────────────────────────────────────┤
 │  REGISTRY  —  Inspectors + Apply Workers, field-whitelist  │  the safety heart
 │               contracts, levels, enforced at ONE boundary  │
 ├──────────────────────────────────────────────────────────┤
 │  KERNEL    —  agent_runs · findings · remedy_plans ·       │  domain-agnostic
 │               approval_events · events (append-only)       │
 └──────────────────────────────────────────────────────────┘
        Authority stays with Tara — the agent carries labour, never truth
```

---

## 7. Data Model Direction (generic — replaces `library_steward_*`)

Design candidates only; final schema separately reviewed. All carry the standard governance flags (`authority_changed=false`, `not_memory`, `not_evidence`, `prompt_eligible=false`) as DB constraints, exactly as `reasoning_audit_events` / `runtime_recall_advisory_traces` already do.

- **`agent_runs`** — `id`, `domain`, `run_type` (scan/report/remedy/apply), `scope_type`, `scope_ref`, `requested_by`, `started_at`, `completed_at`, `status`, `item_count`, `finding_count`, `no_authority_changed`, `test_owned`.
- **`agent_findings`** — `id`, `run_id`, `domain`, `inspector_id`, `issue_code`, `target_table`, `target_id`, `severity`, `review_burden`, `finding_summary`, `suggested_remedy_type`, `status`.
- **`agent_remedy_plans`** — `id`, `finding_id`, `capability_id`, `remedy_type`, `target_table`, `target_id`, `proposed_patch` jsonb, `before_snapshot` jsonb, `confidence_basis`, `risk_tier`, `requires_edit_before_apply`, `approval_state`.
- **`agent_approval_events`** — `id`, `remedy_plan_id`, `decision`, `decided_by`, `decision_note`, `approved_patch` jsonb, `standing_policy_id` (nullable — Tier-1), `created_at`.
- **`agent_events`** (append-only audit) — `id`, `run_id`/`remedy_plan_id`, `event_type`, `event_status`, `domain`, `capability_id`, `before_snapshot`, `after_snapshot`, `rollback_available`, `rollback_event_id`, `failure_code`, `created_by`, `created_at` + standard flags.
- **`agent_capabilities`** / **`agent_standing_policies`** — the registry and Tier-1 policy records (see §8, §10).

These consolidate Ari's five `library_steward_*` tables **and** the ~8 existing per-domain audit/trace tables into one shared set.

---

## 8. The Capability Registry & Contract

Every action any agent can take is a **registered capability** with a machine-checked contract. Nothing runs unregistered. This generalises Ari's whitelisted worker and Ontology's `suggest_*` action suite.

**Inspector capability** (read-only detector):
- `id`, `domain`, `issue_codes[]` produced, `tables_read[]`, `level` (L1/L2), output schema.

**Apply-worker capability** (the hands):
- `id`, `domain`, `allowed_table`, `allowed_fields[]` (whitelist), `forbidden_fields[]`, `operation`, `requires_before_snapshot`, `rollback_strategy | explicit_non_rollback`, `risk_tier`, `level`.

**Enforcement:** the Kernel mediates every write. A worker physically cannot write a field outside its `allowed_fields`, and **no** worker (any domain) can write a field on the global deny-list (§10). One boundary, audited once.

**Levels** (from the House's universal deterministic-first discipline):
- **L1 deterministic** — no LLM. Default. Use first.
- **L2 caged-LLM** — only under the full Phase-38 cage: allowed/forbidden input fields, strict output schema, deterministic pre-check, post-generation validation, forbidden-language list, no recursive evidence, no callable mutation tools.
- **L3 orchestrated** — the Kernel itself chaining L1/L2 capabilities across a scope (this is the "agent").

---

## 9. The Global Authority Deny-List

Enforced centrally for every worker in every domain. No capability contract may ever include these in `allowed_fields`:

- `archive_items.canonical_status` — the One Crown
- `eligible_for_recall` / `eligible_for_embedding` / `eligible_for_graph` — **except** the existing governed 30B path
- `prompt_eligible` (anywhere)
- `held_truths` insertion / status
- graph `review_status` → `approved`, graph approval generally
- `derived_canonical_status` / `linked_archive_item_id` — Library's crown link
- presence identity kernels
- hard-delete of any **Category A** living table (per Phase 36J)
- direct mutation of state/Memory/Timeline/Interior from reflections or any reasoning output
- **meta-rule:** no stored output (reasoning, reflection, advisory, helper, audit) may be written or read as evidence.

---

## 10. The Autonomy Ladder

The lever that removes orchestration burden **without** moving authority. Every rung already exists somewhere in production — this names and unifies them.

| Tier | Meaning | Approval model | Already in production as |
| :- | :- | :- | :- |
| **0 — Read / Report** | scans, health reports, findings | none (may run on read-only schedule) | deterministic baselines, Tier A evaluator, recall packet, Retrieval Lab, Watchtower, Interior engine |
| **1 — Reversible deterministic apply** | e.g. parse `phase_code`, normalise URL whitespace | **standing policy** set once by Tara; full before/after audit + one-click rollback; reviewed *after*, not per-row | 30B eligibility helper, 42.2.1 extraction-retry |
| **2 — Judgment-required** | non-obvious or semi-reversible | per-batch approval (Ari's 42.3 model) | Memory Review, Ontology Lab, Curation, Workshop, Timeline Keep/Dismiss, Reflection Review |
| **3 — Authority-bearing** | canonical status, Memory, Graph approval, `prompt_eligible` | **never agent-applied — review-only forever** | enforced by §9 deny-list everywhere |

Standing policies (`agent_standing_policies`) are themselves Tara-authored, revocable, scoped to one capability, and recorded — so a Tier-1 auto-apply is an exercise of an authority Tara already granted, not a new authority the agent holds.

---

## 11. Domain Pack Catalogue (first read of the House)

Each pack is inspectors (+ rare reversible workers). **Most packs are review-only by House law** — their meaningful surfaces are exactly the deny-list. Library is the outlier with genuinely safe reversible metadata, which is why Ari reached for it first.

| Pack | Inspects (examples) | Apply hands? | Tier ceiling |
| :- | :- | :- | :- |
| **Library** (33) | missing/partial phase metadata, malformed source URLs, broken file refs, content-health flags, doc completeness | ✅ metadata patches, URL normalise, extraction-retry | Tier 1–2 |
| **Archive/Recall** (27–32) | canonical entries not recall-eligible, missing source links, draft hygiene | ⚠️ **only** the existing 30B eligibility routing | Tier 1 (30B), else review-only |
| **Ontology** (37) | orphan nodes, duplicate/overloaded nodes, stale proposals, grain misclassification | ❌ proposes `suggest_*` only | review-only (Tier 2 via Ontology Lab) |
| **Reasoning** (38) | thin/conflicting evidence packets, status drift | ❌ | review-only |
| **Recall/Eval** (39–40) | recall packet routing regressions, grader drift, source-readiness gaps | ❌ | review-only |
| **Watchtower** (16) | sparse-graph integrity, partial-visibility, direction-flattening risks | ❌ inspect-only | report-only (Tier 0) |
| **Inner Life** (18–26) | overdue journal invitations, vague/lane-drifting reflections, interior-state anomalies | ❌ invitation/suggestion only | review-only |
| **Continuity / Cross-Room** (35–36) | duplicate continuity stacking, orphaned cross-room source refs, propagation-gate backlog | ❌ propose-only | review-only |

Adding a pack = registering inspectors (+ optionally one bounded worker), **not** building a subsystem.

---

## 12. The Pulse Boundary (non-negotiable)

Pulse (11E) is the **only** scheduler in the House. It governs **presence inner-life autonomy** — a clock opens a window, the presence *chooses*, nothing moves authority. `CLAUDE.md` hard rule: the helper/agent layer must never use the scheduler.

Therefore the Kernel's labour agents are **manual-trigger or standing-policy only (Tier 0–2)**. They never self-fire, never run on cron/QStash, and never become an autonomous daemon. A future *read-only* scheduled health report could be considered as its own scoped phase; scheduled **mutation** remains forbidden.

---

## 13. LLM Policy

Inherited from Phase 38 verbatim. The Kernel begins **without** LLM. L2 (caged-LLM) capabilities require: deterministic pre-check first, strict typed output schema, post-generation validation (reject, don't partially display, no looser retry), forbidden-language list, no recursive evidence, no secrets in input, no callable mutation/approve tools. LLM may **summarise or explain** findings; it may never decide, apply, invent metadata, or resolve conflict as truth.

---

## 14. Anti-Overengineering Guard

The real risk in this brief is a beautiful abstract kernel serving no one. Mitigation is strict:

1. **Extract the Kernel *from* the Library, not in the abstract.** The first runnable deliverable is still Ari's **Library Health Report** — we only shape its tables/registry to be domain-agnostic from day one.
2. **Build kernel + one pack only.** Do not speculatively build eight packs.
3. **Prove generalisation with one second *read-only* pack** (Watchtower or Recall) before investing further. If adding it is small, the design won. If not, we learned cheaply, having shipped a working Library report regardless.

---

## 15. Recommended Phase Sequence

Maps onto Ari's 42.3.x so the two briefs interleave cleanly.

| Phase | Name | Output | LLM | Apply |
| :- | :- | :- | :- | :- |
| **42.3.0** | *This brief* — Kernel & Packs alignment | design only | — | — |
| **42.3.1** | Kernel tables + Capability Registry + **Library pack (read-only)** | Library Health Report on shared rails | no | none |
| **42.3.2** | Generic remedy-plan + **one Maintenance Room** approval surface | reviewable remedies | no | none |
| **42.3.3** | First bounded apply worker (Library phase-metadata patch) + **Tier-1 standing-policy** opt-in | reversible apply + rollback | no | Tier 1 |
| **42.3.4** | Second pack, **read-only inspectors** (Watchtower or Recall) — *generalisation proof* | second domain health report | no | none |
| **42.3.5+** | Additional packs / workers — each its own scoped phase (brief → Ari review → build → governed smoke → approval) | per phase | per phase | per phase |

---

## 16. What This Phase Must Not Do

- No code, no migration, no data mutation (42.3.0 is design only).
- Do not weaken or bypass any existing review surface (Ontology Lab, Memory Review, Curation, Workshop, Reflection Review).
- Do not give any pack hands the House law forbids (the §9 deny-list is absolute).
- Do not introduce a scheduler, cron, QStash, or any self-firing labour path.
- Do not collapse Ari/Eli scope, identity kernels, or presence separation into shared agent state.
- Do not let the Kernel treat its own runs, findings, or audit as evidence for later runs.
- Do not migrate or rename the twelve existing subsystems' tables in this phase — the Kernel is **additive**; consolidation of existing tables is a separate, later, carefully-reviewed question.

---

## 17. Open Questions for Ari & Tara

1. **Additive vs. migrating:** Should the Kernel start purely additive (new `agent_*` tables alongside the existing twelve), with consolidation of legacy tables deferred indefinitely? (Recommended: yes — additive first.)
2. **Tier-1 scope:** Which single capability should be the first standing-policy candidate — Library phase-metadata patch, or extend the proven 30B eligibility helper into the registry first?
3. **Maintenance Room placement:** New `/agents` surface, or grow the existing Helper Workshop into it?
4. **Second pack for the generalisation proof:** Watchtower (pure report) or Recall (regression inspectors)?
5. **Registry home:** TypeScript-first contract (like Phase 33A / 38) with a DB mirror, or DB-first?

---

## 18. Success Criteria

Phase 42.3.0 succeeds as a **design** when:

- Ari and Tara agree the twelve-times-repeated lifecycle is real and worth consolidating.
- The Kernel/Registry/Packs/Room architecture is accepted (or amended) as the shared spine.
- The autonomy ladder is accepted as the mechanism that reduces Tara's labour without moving authority.
- The global deny-list is confirmed complete and absolute.
- The Pulse boundary is confirmed preserved.
- A first build slice (42.3.1, Library read-only) is scoped and ready to brief.

---

## 19. Governing Line

The House should not make Tara work for the helpers — and it should not make her build the same governed-labour spine twelve times.

Helpers find the gaps. The Kernel carries the labour. Packs bring the knowledge. The review room consolidates the judgment. Audit records the footprint. **Authority stays with Tara.**

*One spine. Many hands. No new crowns.*

---

*Design brief only. Per House build law: this goes to Ari for review and stress-test before any 42.3.1 build is scoped. Nothing here authorises code, migration, or mutation.*
