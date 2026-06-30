# Phase 42.3.2 — Archive Graph Read-Only Pack / Generalisation Proof — Closure Record

**Phase:** Phase 42.3.2 — Archive Graph Read-Only Pack / Generalisation Proof
**Branch:** `phase-42-3-2-archive-graph-read-only-pack`
**Base `main` HEAD:** `1b69a77`
**Implementation commit:** `62a63a4`
**Parent:** Phase 42.3.0 (constitution) · Phase 42.3.1 (kernel skeleton + Library Pack #1, on `main`)

---

## What was built

A second domain pack — `archive_graph` — on the existing Governance Kernel, proving the seams generalise to a graph-shaped domain. TypeScript-only; additive; **no kernel change**.

- **`archive_graph` pack** (`src/lib/agents/packs/archive_graph/`): `payloads.ts`, `readonly-data.ts`, `inspectors.ts`, `index.ts`.
- **Four deterministic L1 inspectors** (new logic — `archive_graph` has no shipped detect* helpers to reuse):
  - `archive_graph.orphan_node` → `graph_node_orphaned`
  - `archive_graph.edge_endpoint_integrity` → `graph_edge_endpoint_not_approved`
  - `archive_graph.node_missing_provenance` → `graph_node_no_source_items`
  - `archive_graph.edge_missing_provenance` → `graph_edge_no_source_items`
- **Read-only archive-graph data layer**: `.select()` only over `archive_graph_nodes` / `archive_graph_edges`, typed against a `ReadOnlyDb` interface with no write method. `approval_status` is read, never written.
- **Manual read-only runner**: `scripts/agent-archive-graph-health-report.ts` (dry-only; ephemeral report).
- **Five tests**: generalisation (T-GEN), pure recompute (T-PURE), inspectors, scope caps, no mutation.

Total: 10 files, no kernel files touched.

## Proof

- **A real second domain was added with no kernel changes.**
- **T-GEN passed:** `git diff main -- src/lib/agents/kernel/` is **empty** — the kernel hosted `archive_graph` (registry, report builder, governance flags) verbatim. This upgrades 42.3.1's `T-SEAM` (a throwaway `demo` inspector) to a real, graph-shaped second domain.

## Verification

- **Tests:** 136 assertions, 0 failures.
- **Typecheck:** `tsc --noEmit` clean.
- **Lint:** ESLint clean.
- **Build:** `next build` clean.
- **Live read-only smoke:** `--scope whole_graph` against the real graph: 105 nodes / 109 edges scanned, **31 findings produced as ephemeral report output only** (`graph_node_orphaned`×29, `graph_node_no_source_items`×1, `graph_edge_no_source_items`×1, `graph_edge_endpoint_not_approved`×0).
- **Write-proof:** row counts unchanged before and after —
  - `archive_graph_nodes` 105→105
  - `archive_graph_edges` 109→109
  - `graph_proposals` 43→43
  - `helper_outputs` 37→37

## Governance

- No migration.
- No DB writes.
- No kernel changes.
- No durable agent tables.
- No graph proposals created.
- No `helper_outputs` read or write by the pack or runner.
- No deposits.
- No apply / remedy / approval / standing-policy / scheduler / LLM / UI.
- No Memory / Archive truth / Recall / prompt-eligibility / canonical mutation.

## Closure statement

Phase 42.3.2 proves the Governance Kernel can host a second, **graph-shaped** domain without change. The Kernel still has **eyes only, not hands**. Findings are **report-only**: not authority, not evidence, not Memory, not graph proposals, and not queued work. Any apply path, approval surface, remedy plan, or additional pack remains a separate, later, governed phase — and the first phase that would give the Kernel hands warrants its own constitution-level review.
