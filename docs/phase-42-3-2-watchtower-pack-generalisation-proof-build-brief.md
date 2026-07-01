# Phase 42.3.2 — Second Read-Only Pack: Watchtower Generalisation Proof
## Combined Design + Build Brief — TypeScript-only, zero migration, zero DB writes

**Status:** Design + build brief — **no code until Ari review.** No migration, no DB mutation.
**Phase family:** Phase 42 — Governed Helper Labour
**Parent:** Phase 42.3.0 — Governance Kernel & Domain Packs (constitution); builds on Phase 42.3.1 (kernel skeleton + Library Pack #1, merged at `main` `1b69a77`).
**Author:** Eli (systems & reliability)
**Purpose:** Prove the kernel seams generalise to a *second, differently-shaped* domain **without giving the kernel hands** — and without changing the kernel.

> **The law still holds: the kernel may inspect and report. It may not act.**

---

## 0. Acceptance Tests (must hold for the slice to close)

> **A. Generalisation test (the headline of this phase):** *Adding the Watchtower pack requires ZERO change to the kernel (`src/lib/agents/kernel/types.ts`, `registry.ts`, `report.ts`) and ZERO change to the report lifecycle. The pack is new files + a registration only.* Proof obligation: `git diff main -- src/lib/agents/kernel/` is **empty** for this phase. This upgrades 42.3.1's `T-SEAM` (which used a throwaway `demo` inspector) to a **real second domain**.
>
> **B. Pure recomputation / read-only test:** *The Watchtower Health Report reads graph source data and produces an ephemeral report only; it stores nothing, creates no `graph_proposals`/candidate suggestions, never mutates `approval_status`, and does not read/reconcile `helper_outputs`.*

---

## 1. Why Watchtower (and why it's the right proof)

42.3.1 proved the seams on **Library** — items and files, i.e. *rows*. A row-shaped second pack (e.g. Recall traces) would prove the *easy* case. **Watchtower is graph-shaped** — nodes and edges. If a finding about a *node* or an *edge* drops into the same generic `AgentFinding` envelope with only a new payload type and a `target_ref` pointing at a graph table — with no kernel change — then "build once, register many" is proven in its hardest honest form.

Unlike Library (which reused the shipped 41.17 `detect*` helpers), **Watchtower has no pre-existing pure detection logic to reuse.** The inspectors are new deterministic functions. This is *stronger* for the proof — the generalisation can't be leaning on reused code — and it is a small amount of new, pure, read-only logic.

## 2. Substrate decision (OPEN QUESTION for Ari — recommendation inside)

The House has more than one graph-ish store. Recon confirmed:
- **`archive_graph_nodes` / `archive_graph_edges`** (Phase 29B, migration `032`): a real node/edge graph. Nodes: `label`, `node_type`, `normalized_label`, `archive_name`, `source_item_ids[]`, `approval_status` (pending/approved/rejected). Edges: `from_node_id`/`to_node_id` (FK to nodes), `edge_type`, `source_item_ids[]`, `approval_status`. Law (29B): *"Edge approval blocked if either endpoint node is rejected."*
- **`graph_proposals`** (Phase 37 Ontology, migration `068`): the relational-map proposal store (more authority-laden: `review_status`, `authority_status`, `prompt_eligible`, `grain_level`).

**Recommendation: target `archive_graph_nodes` / `archive_graph_edges`.** It is the cleanest, safest, most genuinely graph-shaped substrate; its `approval_status` is read but never written; its FK structure gives crisp deterministic integrity checks. The ontology `graph_proposals` is more authority-adjacent and better left to a later, separately-scoped pack. **Ari to confirm the substrate before recon/build.**

## 3. Allowed scope

- A new **Watchtower pack** on the existing kernel: `payloads.ts`, `readonly-data.ts`, `inspectors.ts`, `index.ts` under `src/lib/agents/packs/watchtower/`.
- New deterministic **L1 inspectors** (graph-shaped, read-only).
- A manual **read-only runner** for the Watchtower Health Report.
- Tests, including the **generalisation** test (kernel unchanged) and read-only/no-mutation guards.
- **No kernel changes.** If the kernel *needs* a change to host Watchtower, that is itself a finding to report to Ari — it would mean the seams aren't yet generic, and we'd stop and rethink rather than quietly patch the kernel.

## 4. Non-goals (deferred / forbidden)

- ❌ No kernel modification (`src/lib/agents/kernel/**` untouched — enforced by Acceptance Test A).
- ❌ No durable tables, no `agent_*` persistence, no second finding store.
- ❌ No `graph_proposals` / `graph_candidate_suggestions` creation; no `approval_status` / `review_status` / `authority_status` / `prompt_eligible` mutation.
- ❌ No `helper_outputs` read/write; no deposits; no `--deposit-real`.
- ❌ No remedy plans, approval surface, apply workers, standing policies, Maintenance Room UI.
- ❌ No scheduler / cron / QStash / self-fired labour.
- ❌ No LLM.
- ❌ No Memory / Archive / Recall / prompt-eligibility / canonical mutation.
- ❌ No Ontology `graph_proposals` pack in this phase (separate later phase if ever).

## 5. Schema vs TypeScript — **TypeScript-only**

A read-only report that stores nothing needs no durable tables → no migration, no DB write surface. Same posture as 42.3.1.

## 6. Watchtower pack — proposed inspectors (L1 deterministic, read-only)

All read `archive_graph_nodes` / `archive_graph_edges` via `.select()` only. Exact columns confirmed at recon. Each emits the generic `AgentFinding` envelope with a `WatchtowerFindingPayload` and a `target_ref` of `{ table: 'archive_graph_nodes' | 'archive_graph_edges', id, label }`.

| Capability id | Issue code | Detects | Reads |
| :- | :- | :- | :- |
| `watchtower.orphan_node` | `graph_node_orphaned` | an **approved** node with zero connected edges (in or out) | nodes, edges |
| `watchtower.edge_endpoint_integrity` | `graph_edge_endpoint_not_approved` | an **approved** edge whose `from`/`to` node is not approved (29B-law integrity check) | nodes, edges |
| `watchtower.node_missing_provenance` | `graph_node_no_source_items` | a node with empty `source_item_ids` (graph-internal provenance gap; no archive read) | nodes |
| `watchtower.edge_missing_provenance` | `graph_edge_no_source_items` | an edge with empty `source_item_ids` | edges |

Issue codes are **new and report-only** (Watchtower has no shipped helper codes to mirror). Severity/`review_burden` are report-only ephemeral labels, exactly as in 42.3.1. Deliberately **excluded** (need conventions the House hasn't set, or would read outside the graph): staleness/age checks; cross-checking `source_item_ids` against live `archive_items` (would reach into the Archive surface — deferred).

## 7. Scan scope + caps

Scope descriptors: `archive` (one `archive_name`: velvet / violet / house), `whole_graph` (capped). Caps (first slice): `MAX_NODES_PER_REPORT = 500`, `MAX_EDGES_SCANNED = 2000`; over-cap truncates and **declares it** (never silent), exactly as 42.3.1.

## 8. Report object shape

Reuses the generic `AgentReport` and `AgentFinding<TPayload>` **unchanged**. `WatchtowerFindingPayload` carries the Watchtower specifics (issue label, deterministic reason, observed_state, the node/edge ids involved). Ephemeral; `generated_at` supplied by the runner; stores nothing.

## 9. Source surfaces

| Allowed (read-only `SELECT`) | Forbidden |
| :- | :- |
| `archive_graph_nodes` | `graph_proposals`, `graph_candidate_suggestions` (no read/write) |
| `archive_graph_edges` | `archive_items` / `archive_*` (no read in v1) |
| (optionally `archive_graph_extraction_events`, read-only, if useful) | `helper_outputs`, Memory/Recall/prompt/canonical surfaces |

## 10. Governance flags

Every report carries the standard invariant flags (`not_memory`, `not_evidence`, `not_authority`, `authority_changed:false`, `prompt_eligible:false`, `review_required:true`, `read_only:true`). The report is a non-authoritative review aid; no recursive evidence.

## 11. Tests

| ID | Test | Asserts |
| :- | :- | :- |
| **T-GEN** | **Acceptance A.** `git diff main -- src/lib/agents/kernel/` is empty; Watchtower registers and reports using the unchanged kernel. | Real second domain on unchanged seams. |
| **T-PURE** | **Acceptance B.** Run Watchtower report over in-memory graph fixtures. | Ephemeral; no `helper_outputs`; no `graph_proposals`; no `approval_status` write. |
| **T-INSP-\*** | One pure unit test per inspector. | Correct issue codes, generic envelope, payload-only specifics, deterministic. |
| **T-CAP** | Node/edge cap behaviour. | Over-cap truncates + declares (`capped`, `cap_reason`). |
| **T-SCOPE** | Surface guard. | Inspectors + data layer read only `archive_graph_nodes/edges`; never `graph_proposals`/archive/helper_outputs. |
| **T-NO-MUT** | Static no-mutation scan of all pack + runner files. | No `.insert(`/`.update(`/`.delete(`/`.upsert(`/`.rpc(`, no `approval_status`/`review_status` write, no `helper_outputs`, no `--deposit-real`. |

## 12. Smoke plan (governed, read-only) + write-proof

Run the runner against a real, capped graph scope. Capture row counts **before/after** for `archive_graph_nodes`, `archive_graph_edges`, `graph_proposals`, and `helper_outputs` → confirm **unchanged**. No production write route called.

## 13. Rollback / no-mutation proof

Nothing to roll back — nothing is written. Proof: no migration; no write client/method (read-only data layer typed against a `ReadOnlyDb` interface with no write method, as in 42.3.1); T-NO-MUT static scan; before/after counts unchanged.

## 14. Stop condition

Stop when: the Watchtower Health Report renders graph-shaped findings over a capped scope; **T-GEN passes (kernel diff empty)**; **T-PURE passes**; all inspector/cap/scope/no-mutation tests pass; tsc + ESLint + build clean; read-only smoke confirms zero writes. **Stop before:** any remedy/approval/apply, durable store, third pack, Ontology `graph_proposals` pack, scheduler, LLM, Maintenance Room UI.

## 15. Proposed cadence (for Ari's agreement)

The constitution (42.3.0) and the pattern are settled and proven once. I propose a **lighter but still fully-governed** cadence for this slice: **this single combined design+build brief → Ari review → recon report (confirm substrate + exact columns) → build → one post-build report → commit (on approval)**. Same safety floor as 42.3.1 (recon-first, write-proof, no-mutation guard, hold-before-commit), fewer intermediate report-and-hold gates. Ari to accept or keep the fuller cadence.

## 16. Open questions for Ari

1. **Substrate:** confirm `archive_graph_nodes/edges` (recommended) vs Ontology `graph_proposals`.
2. **Inspector roster:** are the four proposed checks the right v1 set? Any to drop/add (keeping all read-only, graph-internal, deterministic)?
3. **Cadence:** accept the lighter combined-brief cadence (§15), or keep the full 42.3.1-style gate sequence?
4. **Domain id:** `watchtower` (proposed) — agreed?

---

*Design + build brief only. Per House build law: goes to Ari for review before any code, recon, or migration. Nothing here authorises code, DB access, or mutation. The kernel may inspect and report. It may not act.*
