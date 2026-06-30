/**
 * Phase 42.3.2 — archive_graph pack: shared contracts
 *
 * The second domain pack (a generalisation proof for the Governance Kernel).
 * Graph-shaped: findings are about nodes and edges, not rows. Per the generic-
 * seams rule, ALL archive_graph specifics live here in the typed payload + the
 * read-only record shapes — never in the kernel envelope, and the kernel is not
 * modified at all (see the generalisation test).
 *
 * ── Boundaries (hard) ────────────────────────────────────────────────────────
 *   * Records carry only the columns the inspectors read. `approval_status` is
 *     read (the endpoint-integrity check needs it) but is NEVER written, patched,
 *     proposed, or mutated.
 *   * Reads only `archive_graph_nodes` / `archive_graph_edges`. No graph proposals,
 *     no candidate suggestions, no archive_items, no helper_outputs.
 *   * PURE contracts. No I/O, no Supabase, no DB, no LLM.
 */

export const ARCHIVE_GRAPH_DOMAIN = 'archive_graph'

/** Scan-scope caps for one read-only report (Phase 42.3.2). */
export const MAX_NODES_PER_REPORT = 500
export const MAX_EDGES_SCANNED = 2000

/** The approval_status value that marks an approved node/edge. */
export const APPROVAL_STATUS_APPROVED = 'approved'

export type ArchiveGraphCapability =
  | 'archive_graph.orphan_node'
  | 'archive_graph.edge_endpoint_integrity'
  | 'archive_graph.node_missing_provenance'
  | 'archive_graph.edge_missing_provenance'

/** The domain-typed payload — where every archive_graph specific lives. */
export type ArchiveGraphFindingPayload = {
  issue_label: string
  deterministic_reason: string
  suggested_next_step: string
  checked_fields: string[]
  observed_state: Record<string, unknown>
}

/** Read-only snapshot of an `archive_graph_nodes` row (only inspected columns). */
export type ArchiveGraphNodeRecord = {
  id: string
  archive_name: string
  label: string
  node_type: string
  approval_status: string
  source_item_ids: string[]
}

/** Read-only snapshot of an `archive_graph_edges` row (only inspected columns). */
export type ArchiveGraphEdgeRecord = {
  id: string
  archive_name: string
  from_node_id: string
  to_node_id: string
  edge_type: string
  approval_status: string
  source_item_ids: string[]
}

/** The input bundle an archive_graph inspector runs over (read-only). */
export type ArchiveGraphScopeInput = {
  nodes: ArchiveGraphNodeRecord[]
  edges: ArchiveGraphEdgeRecord[]
}

export type ArchiveGraphScopeDescriptor =
  | { type: 'archive'; archiveName: string }
  | { type: 'whole_graph' }
