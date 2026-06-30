/**
 * Phase 42.3.2 — archive_graph pack: read-only inspectors
 *
 * Four L1 (deterministic) graph-shaped inspectors over the approved archive graph.
 * New deterministic logic (archive_graph has no shipped detect* helpers to reuse —
 * which makes the generalisation proof stronger: it cannot lean on reused code).
 * Each maps a node/edge observation into the generic kernel envelope.
 *
 * ── Boundaries (hard) ────────────────────────────────────────────────────────
 *   * PURE. No I/O, no Supabase, no DB, no LLM, no fetch, no clock.
 *   * Reads `approval_status` only to detect; never writes/patches/proposes it.
 *   * Findings are report-only: not authority, not evidence, not a graph proposal.
 *   * severity / review_burden are report-only ephemeral labels.
 */

import type {
  AgentFinding,
  Inspector,
  IssueSeverity,
  ReviewBurden,
  TargetRef,
} from '../../kernel/types'
import {
  APPROVAL_STATUS_APPROVED,
  ARCHIVE_GRAPH_DOMAIN,
  type ArchiveGraphCapability,
  type ArchiveGraphEdgeRecord,
  type ArchiveGraphFindingPayload,
  type ArchiveGraphNodeRecord,
  type ArchiveGraphScopeInput,
} from './payloads'

const NODES_TABLE = 'archive_graph_nodes'
const EDGES_TABLE = 'archive_graph_edges'

/** Report-only ephemeral severity per issue code. NOT a durable field. */
const SEVERITY_BY_ISSUE: Record<string, IssueSeverity> = {
  graph_edge_endpoint_not_approved: 'high',
  graph_node_no_source_items: 'medium',
  graph_edge_no_source_items: 'medium',
  graph_node_orphaned: 'low',
}

function severityFor(issueCode: string): IssueSeverity {
  return SEVERITY_BY_ISSUE[issueCode] ?? 'low'
}
function burdenFor(severity: IssueSeverity): ReviewBurden {
  if (severity === 'high') return 'high'
  if (severity === 'medium') return 'medium'
  return 'low'
}

function isApproved(approvalStatus: string): boolean {
  return approvalStatus === APPROVAL_STATUS_APPROVED
}
function isEmptyProvenance(sourceItemIds: string[] | null | undefined): boolean {
  return !Array.isArray(sourceItemIds) || sourceItemIds.length === 0
}

function finding(
  capability: ArchiveGraphCapability,
  issueCode: string,
  targetRef: TargetRef,
  payload: ArchiveGraphFindingPayload,
): AgentFinding<ArchiveGraphFindingPayload> {
  const severity = severityFor(issueCode)
  return {
    domain: ARCHIVE_GRAPH_DOMAIN,
    capability_id: capability,
    issue_code: issueCode,
    target_ref: targetRef,
    severity,
    review_burden: burdenFor(severity),
    summary: payload.issue_label,
    payload,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Inspectors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * archive_graph.orphan_node — an APPROVED node that no APPROVED edge connects to
 * (in or out). Report-only, low severity: an isolated approved node is not
 * inherently wrong, but is worth a human glance.
 */
const orphanNodeInspector: Inspector<ArchiveGraphScopeInput, ArchiveGraphFindingPayload> = {
  id: 'archive_graph.orphan_node',
  domain: ARCHIVE_GRAPH_DOMAIN,
  issue_codes: ['graph_node_orphaned'],
  level: 'L1',
  tables_read: [NODES_TABLE, EDGES_TABLE],
  run(input) {
    const connected = new Set<string>()
    for (const e of input.edges) {
      if (isApproved(e.approval_status)) {
        connected.add(e.from_node_id)
        connected.add(e.to_node_id)
      }
    }
    const out: AgentFinding<ArchiveGraphFindingPayload>[] = []
    for (const n of input.nodes) {
      if (!isApproved(n.approval_status)) continue
      if (connected.has(n.id)) continue
      out.push(
        finding('archive_graph.orphan_node', 'graph_node_orphaned', {
          table: NODES_TABLE,
          id: n.id,
          label: n.label,
        }, {
          issue_label: 'Approved graph node has no approved connected edges',
          deterministic_reason:
            'node approval_status is approved and no approved edge references it via from_node_id or to_node_id.',
          suggested_next_step:
            'A human may review whether this isolated node should be connected, or is intentionally standalone.',
          checked_fields: ['approval_status', 'from_node_id', 'to_node_id'],
          observed_state: {
            node_type: n.node_type,
            archive_name: n.archive_name,
            approved_edge_connected: false,
          },
        }),
      )
    }
    return out
  },
}

/**
 * archive_graph.edge_endpoint_integrity — an APPROVED edge whose from/to endpoint
 * node (when present in scope) is not approved. This is the Phase 29B law
 * ("edge approval blocked if either endpoint node is rejected") checked as a
 * read-only integrity observation. If an endpoint node is not in the fetched
 * scope, the check is skipped (cannot verify — never false-flag).
 */
const edgeEndpointIntegrityInspector: Inspector<ArchiveGraphScopeInput, ArchiveGraphFindingPayload> = {
  id: 'archive_graph.edge_endpoint_integrity',
  domain: ARCHIVE_GRAPH_DOMAIN,
  issue_codes: ['graph_edge_endpoint_not_approved'],
  level: 'L1',
  tables_read: [NODES_TABLE, EDGES_TABLE],
  run(input) {
    const nodeApproval = new Map<string, string>()
    for (const n of input.nodes) nodeApproval.set(n.id, n.approval_status)

    const out: AgentFinding<ArchiveGraphFindingPayload>[] = []
    for (const e of input.edges) {
      if (!isApproved(e.approval_status)) continue
      const fromStatus = nodeApproval.get(e.from_node_id)
      const toStatus = nodeApproval.get(e.to_node_id)
      const fromBad = fromStatus !== undefined && !isApproved(fromStatus)
      const toBad = toStatus !== undefined && !isApproved(toStatus)
      if (!fromBad && !toBad) continue
      out.push(
        finding('archive_graph.edge_endpoint_integrity', 'graph_edge_endpoint_not_approved', {
          table: EDGES_TABLE,
          id: e.id,
          label: e.edge_type,
        }, {
          issue_label: 'Approved edge has an endpoint node that is not approved',
          deterministic_reason:
            'edge approval_status is approved but an in-scope endpoint node has approval_status other than approved.',
          suggested_next_step:
            'A human should review this integrity mismatch (an approved edge should not rest on an unapproved node).',
          checked_fields: ['approval_status', 'from_node_id', 'to_node_id'],
          observed_state: {
            edge_type: e.edge_type,
            archive_name: e.archive_name,
            from_node_not_approved: fromBad,
            to_node_not_approved: toBad,
          },
        }),
      )
    }
    return out
  },
}

/** archive_graph.node_missing_provenance — node with empty source_item_ids. */
const nodeMissingProvenanceInspector: Inspector<ArchiveGraphScopeInput, ArchiveGraphFindingPayload> = {
  id: 'archive_graph.node_missing_provenance',
  domain: ARCHIVE_GRAPH_DOMAIN,
  issue_codes: ['graph_node_no_source_items'],
  level: 'L1',
  tables_read: [NODES_TABLE],
  run(input) {
    const out: AgentFinding<ArchiveGraphFindingPayload>[] = []
    for (const n of input.nodes) {
      if (!isEmptyProvenance(n.source_item_ids)) continue
      out.push(
        finding('archive_graph.node_missing_provenance', 'graph_node_no_source_items', {
          table: NODES_TABLE,
          id: n.id,
          label: n.label,
        }, {
          issue_label: 'Graph node has no source provenance',
          deterministic_reason: 'node source_item_ids is null or empty.',
          suggested_next_step:
            'A human may review whether this node should carry source_item_ids linking it to archive provenance.',
          checked_fields: ['source_item_ids'],
          observed_state: { node_type: n.node_type, archive_name: n.archive_name, source_item_count: 0 },
        }),
      )
    }
    return out
  },
}

/** archive_graph.edge_missing_provenance — edge with empty source_item_ids. */
const edgeMissingProvenanceInspector: Inspector<ArchiveGraphScopeInput, ArchiveGraphFindingPayload> = {
  id: 'archive_graph.edge_missing_provenance',
  domain: ARCHIVE_GRAPH_DOMAIN,
  issue_codes: ['graph_edge_no_source_items'],
  level: 'L1',
  tables_read: [EDGES_TABLE],
  run(input) {
    const out: AgentFinding<ArchiveGraphFindingPayload>[] = []
    for (const e of input.edges) {
      if (!isEmptyProvenance(e.source_item_ids)) continue
      out.push(
        finding('archive_graph.edge_missing_provenance', 'graph_edge_no_source_items', {
          table: EDGES_TABLE,
          id: e.id,
          label: e.edge_type,
        }, {
          issue_label: 'Graph edge has no source provenance',
          deterministic_reason: 'edge source_item_ids is null or empty.',
          suggested_next_step:
            'A human may review whether this edge should carry source_item_ids linking it to archive provenance.',
          checked_fields: ['source_item_ids'],
          observed_state: { edge_type: e.edge_type, archive_name: e.archive_name, source_item_count: 0 },
        }),
      )
    }
    return out
  },
}

/** The full archive_graph inspector set, in stable order. */
export const archiveGraphInspectors: Inspector<ArchiveGraphScopeInput, ArchiveGraphFindingPayload>[] = [
  orphanNodeInspector,
  edgeEndpointIntegrityInspector,
  nodeMissingProvenanceInspector,
  edgeMissingProvenanceInspector,
]
