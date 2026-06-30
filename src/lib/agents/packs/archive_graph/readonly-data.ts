/**
 * Phase 42.3.2 — archive_graph pack: read-only data layer
 *
 * The ONLY file in this pack that reads the database — and it reads only. It runs
 * `.select()` queries against `archive_graph_nodes` / `archive_graph_edges`, maps
 * rows to record snapshots, and applies the scan-scope caps.
 *
 * ── Boundaries (hard) ────────────────────────────────────────────────────────
 *   * READ-ONLY. Only `.select()` is used. No write operation, no rpc, no client
 *     construction (the runner injects the client).
 *   * Reads ONLY the two archive_graph tables. Never graph proposals, never
 *     candidate suggestions, never archive_items, never helper_outputs.
 *   * `approval_status` is selected and read; it is NEVER written.
 *   * `applyScopeCaps` is PURE (no client) so caps are unit-testable on their own.
 */

import type { AgentReportScope } from '../../kernel/types'
import {
  MAX_EDGES_SCANNED,
  MAX_NODES_PER_REPORT,
  type ArchiveGraphEdgeRecord,
  type ArchiveGraphNodeRecord,
  type ArchiveGraphScopeDescriptor,
  type ArchiveGraphScopeInput,
} from './payloads'

/**
 * Minimal STRUCTURAL read-only client interface — only the query surface this
 * layer uses. Read-only by construction: there is no insert/update/delete/upsert/
 * rpc method on this type. A real Supabase client satisfies it structurally; the
 * runner injects one.
 */
type ReadResult = { data: unknown[] | null; error: { message: string } | null }
interface ReadFilter extends PromiseLike<ReadResult> {
  eq(column: string, value: string): ReadFilter
  limit(count: number): ReadFilter
}
interface ReadTable {
  select(columns: string): ReadFilter
}
export interface ReadOnlyDb {
  from(table: string): ReadTable
}

const NODE_COLUMNS = 'id,archive_name,label,node_type,approval_status,source_item_ids'
const EDGE_COLUMNS =
  'id,archive_name,from_node_id,to_node_id,edge_type,approval_status,source_item_ids'

function asStr(v: unknown): string {
  return typeof v === 'string' ? v : ''
}
function asStrArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function mapNode(row: Record<string, unknown>): ArchiveGraphNodeRecord {
  return {
    id: asStr(row.id),
    archive_name: asStr(row.archive_name),
    label: asStr(row.label),
    node_type: asStr(row.node_type),
    approval_status: asStr(row.approval_status),
    source_item_ids: asStrArray(row.source_item_ids),
  }
}
function mapEdge(row: Record<string, unknown>): ArchiveGraphEdgeRecord {
  return {
    id: asStr(row.id),
    archive_name: asStr(row.archive_name),
    from_node_id: asStr(row.from_node_id),
    to_node_id: asStr(row.to_node_id),
    edge_type: asStr(row.edge_type),
    approval_status: asStr(row.approval_status),
    source_item_ids: asStrArray(row.source_item_ids),
  }
}

function describeRef(descriptor: ArchiveGraphScopeDescriptor): string | undefined {
  return descriptor.type === 'archive' ? descriptor.archiveName : undefined
}

/**
 * PURE: apply scan-scope caps to already-fetched rows. Truncates nodes to
 * MAX_NODES_PER_REPORT and edges to MAX_EDGES_SCANNED, reporting any truncation
 * explicitly (never silent). Unit-testable without a client.
 */
export function applyScopeCaps(
  rawNodes: ArchiveGraphNodeRecord[],
  rawEdges: ArchiveGraphEdgeRecord[],
  descriptor: ArchiveGraphScopeDescriptor,
): { input: ArchiveGraphScopeInput; scope: AgentReportScope } {
  const nodesCapped = rawNodes.length > MAX_NODES_PER_REPORT
  const nodes = nodesCapped ? rawNodes.slice(0, MAX_NODES_PER_REPORT) : rawNodes
  const edgesCapped = rawEdges.length > MAX_EDGES_SCANNED
  const edges = edgesCapped ? rawEdges.slice(0, MAX_EDGES_SCANNED) : rawEdges

  const reasons: string[] = []
  if (nodesCapped) reasons.push(`nodes capped at ${MAX_NODES_PER_REPORT} (resolved ${rawNodes.length})`)
  if (edgesCapped) reasons.push(`edges capped at ${MAX_EDGES_SCANNED} (resolved ${rawEdges.length})`)

  return {
    input: { nodes, edges },
    scope: {
      type: descriptor.type,
      ref: describeRef(descriptor),
      resolved_count: nodes.length,
      capped: nodesCapped || edgesCapped,
      cap_reason: reasons.length > 0 ? reasons.join('; ') : undefined,
    },
  }
}

async function fetchNodes(
  sb: ReadOnlyDb,
  descriptor: ArchiveGraphScopeDescriptor,
): Promise<ArchiveGraphNodeRecord[]> {
  const over = MAX_NODES_PER_REPORT + 1
  const base = sb.from('archive_graph_nodes').select(NODE_COLUMNS)
  const q = descriptor.type === 'archive' ? base.eq('archive_name', descriptor.archiveName).limit(over) : base.limit(over)
  const { data, error } = await q
  if (error) throw new Error(`archive_graph_nodes read failed: ${error.message}`)
  return (data ?? []).map((r) => mapNode(r as Record<string, unknown>))
}

async function fetchEdges(
  sb: ReadOnlyDb,
  descriptor: ArchiveGraphScopeDescriptor,
): Promise<ArchiveGraphEdgeRecord[]> {
  const over = MAX_EDGES_SCANNED + 1
  const base = sb.from('archive_graph_edges').select(EDGE_COLUMNS)
  const q = descriptor.type === 'archive' ? base.eq('archive_name', descriptor.archiveName).limit(over) : base.limit(over)
  const { data, error } = await q
  if (error) throw new Error(`archive_graph_edges read failed: ${error.message}`)
  return (data ?? []).map((r) => mapEdge(r as Record<string, unknown>))
}

/** Read-only fetch + cap for a scope. The injected client is used for SELECT only. */
export async function fetchArchiveGraphScope(
  sb: ReadOnlyDb,
  descriptor: ArchiveGraphScopeDescriptor,
): Promise<{ input: ArchiveGraphScopeInput; scope: AgentReportScope }> {
  const rawNodes = await fetchNodes(sb, descriptor)
  const rawEdges = await fetchEdges(sb, descriptor)
  return applyScopeCaps(rawNodes, rawEdges, descriptor)
}
