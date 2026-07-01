/**
 * Phase 42.4.1 — Graph Proposal Pack: PURE deterministic detector + hashing.
 *
 * Given approved archive_graph nodes + existing shared_source edges, compute candidate
 * `shared_source` edge proposals: two APPROVED nodes in the SAME archive that share ≥1
 * source_item_id and are not already connected by a shared_source edge. Fully deterministic —
 * stable node sort, stable pair order, stable output, stable input hash. No inference, no LLM,
 * no I/O. Endpoints are canonicalised (from < to) so the pair is undirected.
 */

import { createHash } from 'crypto'
import {
  GRAPH_PROPOSAL_TARGET,
  GRAPH_PROPOSAL_EDGE_TYPE,
} from './contract'

export type GraphNode = { id: string; archive_name: string; approval_status: string; source_item_ids: string[] }
export type ExistingEdge = { from_node_id: string; to_node_id: string; edge_type: string }
export type ProposeCaps = { maxNodes: number; maxPairs: number; maxProposals: number }

export type SharedSourceProposal = {
  from_node_id: string // canonical: from < to
  to_node_id: string
  source_item_ids: string[] // sorted shared intersection (non-empty)
  dedupe_key: string
  rationale: string
}

export type ProposeResult = {
  proposals: SharedSourceProposal[]
  nodes_scanned: number
  pairs_examined: number
  capped: boolean
}

/**
 * Undirected dedupe key — a PLAIN canonical string (not a hash), so the DB can verify it at the
 * record boundary without pgcrypto: `<target_graph>:<lo>:<hi>:<edge_type>` with lo < hi.
 */
export function computeGraphDedupeKey(a: string, b: string): string {
  const [lo, hi] = a <= b ? [a, b] : [b, a]
  return `${GRAPH_PROPOSAL_TARGET}:${lo}:${hi}:${GRAPH_PROPOSAL_EDGE_TYPE}`
}

/** Deterministic scope fingerprint = sha256 of the sorted scanned node ids. */
export function computeInputHash(nodeIds: string[]): string {
  const sorted = [...nodeIds].sort()
  return createHash('sha256').update(sorted.join(',')).digest('hex')
}

function undirectedKey(a: string, b: string): string {
  return a <= b ? `${a}|${b}` : `${b}|${a}`
}

/**
 * Pure deterministic proposal generation. Considers only approved nodes; only pairs within the
 * same archive_name; only pairs with a non-empty source_item_ids intersection and no existing
 * shared_source edge (either direction). Output is stably ordered and capped.
 */
export function computeSharedSourceProposals(
  nodes: GraphNode[],
  existingEdges: ExistingEdge[],
  caps: ProposeCaps,
): ProposeResult {
  // approved nodes only, stable-sorted by id, capped
  const approved = nodes
    .filter((n) => n.approval_status === 'approved' && n.id)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const scanned = approved.slice(0, Math.max(0, caps.maxNodes))

  // existing shared_source edges → undirected skip set
  const existing = new Set<string>()
  for (const e of existingEdges) {
    if (e.edge_type === GRAPH_PROPOSAL_EDGE_TYPE) existing.add(undirectedKey(e.from_node_id, e.to_node_id))
  }

  // group by archive_name (deterministic — scanned is already id-sorted)
  const byArchive = new Map<string, GraphNode[]>()
  for (const n of scanned) {
    const list = byArchive.get(n.archive_name) ?? []
    list.push(n)
    byArchive.set(n.archive_name, list)
  }
  const archives = [...byArchive.keys()].sort()

  const proposals: SharedSourceProposal[] = []
  let pairs = 0
  let capped = false

  for (const archive of archives) {
    const group = byArchive.get(archive)!
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (pairs >= caps.maxPairs) { capped = true; break }
        pairs++
        const A = group[i], B = group[j]
        if (existing.has(undirectedKey(A.id, B.id))) continue
        const setB = new Set(B.source_item_ids)
        const shared = [...new Set(A.source_item_ids.filter((s) => setB.has(s)))].sort()
        if (shared.length === 0) continue
        const [from, to] = A.id <= B.id ? [A.id, B.id] : [B.id, A.id]
        proposals.push({
          from_node_id: from,
          to_node_id: to,
          source_item_ids: shared,
          dedupe_key: computeGraphDedupeKey(from, to),
          rationale: `Nodes ${from} and ${to} share ${shared.length} source item(s) in archive "${archive}".`,
        })
        if (proposals.length >= caps.maxProposals) { capped = true; break }
      }
      if (capped) break
    }
    if (capped) break
  }

  // stable output order by (from, to)
  proposals.sort((a, b) =>
    a.from_node_id < b.from_node_id ? -1 : a.from_node_id > b.from_node_id ? 1
      : a.to_node_id < b.to_node_id ? -1 : a.to_node_id > b.to_node_id ? 1 : 0,
  )

  return { proposals, nodes_scanned: scanned.length, pairs_examined: pairs, capped }
}
