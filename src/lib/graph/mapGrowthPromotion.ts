// Phase 43 — Map Growth Queue (generalized archive_graph → map promotion engine).
//
// Turns the bespoke per-wave promotions (Option A edges, Wave 1 nodes+edges) into ONE repeatable,
// governed engine: discover eligible clusters, preview one, promote one — all at MIDLEVEL grain, all
// to graph_proposals status='pending_review', Ontology Lab remains the sole approval authority.
// "Fast" = fast to Tara's review desk; NEVER fast to map truth.
//
// Governance (unchanged from the proven pattern):
//   • Nodes: approved archive_graph concept/ritual ONLY; excluded if already on the map or pending.
//   • Edges: only where BOTH endpoints are eligible nodes OR existing approved map nodes, ≥1 eligible,
//     and edge_type is ADMITTED in GRAPH_EDGE_TYPES. Unadmitted types are HELD + flagged, never coerced.
//   • Clusters = connected components over admitted within-pool edges; stable id = hash of sorted node ids.
//   • MIDLEVEL only (concept/ritual → midlevel; never overview). Scope = archive→scope; cross-presence→shared.
//   • WAVE_MAX hard cap: refuse (never truncate). One cluster per promote. Preview-first. Node-first, then edges.
//   • Provenance to archive_graph_node/edge + source_item_ids. Dedup at discovery AND at promote time.
//   • Writes only via the shared createProposal. No archive_graph write; no approved_graph; no new table/engine.

import { createHash } from 'crypto'
import { supabase } from '@/lib/supabase'
import {
  createProposal,
  normalizeLabel,
  type CreateProposalInput,
  type CreateProposalResult,
} from './proposals'
import { GRAPH_EDGE_TYPES, type GraphEdgeType, type GraphNodeType, type GraphPresenceScope } from './types'

const ADMITTED_EDGE_TYPES = new Set<string>(GRAPH_EDGE_TYPES)
const ALLOWED_NODE_TYPES = new Set(['concept', 'ritual'])
/** Hard per-wave cap (Ari's 10–20 range). Refuse — never truncate. */
export const WAVE_MAX = 20

function archiveScope(archiveName: string): GraphPresenceScope {
  if (archiveName === 'velvet') return 'ari'
  if (archiveName === 'violet') return 'eli'
  return 'shared'
}
function relationshipScope(a: GraphPresenceScope, b: GraphPresenceScope): GraphPresenceScope {
  if (a === b && (a === 'ari' || a === 'eli')) return a
  return 'shared'
}
function clusterIdOf(nodeIds: string[]): string {
  return createHash('sha1').update([...nodeIds].sort().join('|')).digest('hex').slice(0, 10)
}

type Endpoint = { kind: 'pool' | 'map'; label: string; nodeType: string; scope: GraphPresenceScope }
type EligibleNode = { id: string; label: string; nodeType: string; archiveName: string; scope: GraphPresenceScope; description: string | null }
type EligibleEdge = { edgeId: string; edgeType: string; description: string | null; sourceItemIds: string[]; from: Endpoint; to: Endpoint; edgeScope: GraphPresenceScope }
export type Cluster = {
  id: string
  nodes: EligibleNode[]
  edges: EligibleEdge[]
  archives: string[]
  edgeTypes: string[]
  heldEdgeTypes: string[]   // unadmitted types touching this cluster (flagged, not promoted)
  sampleLabels: string[]
  overCap: boolean
}

type Eligible = {
  pool: Map<string, EligibleNode>
  allById: Map<string, { label: string; node_type: string; archive_name: string }>
  mapByLabel: Map<string, { label: string; nodeType: string; scope: GraphPresenceScope }>
  edges: Array<{ id: string; edge_type: string; from_node_id: string; to_node_id: string; description: string | null; source_item_ids: string[] | null }>
  existingEdgeSig: Set<string>
}

async function loadEligible(): Promise<Eligible> {
  const { data: allN } = await supabase.from('archive_graph_nodes').select('id, label, node_type, archive_name, approval_status, description')
  const allById = new Map<string, { label: string; node_type: string; archive_name: string }>()
  for (const r of allN ?? []) { const n = r as { id: string; label: string; node_type: string; archive_name: string }; allById.set(n.id, { label: n.label, node_type: n.node_type, archive_name: n.archive_name }) }

  // existing map nodes (approved = on map) and pending node proposals (for exclusion + edge endpoints)
  const { data: gpNodes } = await supabase.from('graph_proposals').select('proposed_label, node_type, presence_scope, status').eq('proposal_type', 'node').in('status', ['approved_graph', 'pending_review'])
  const excluded = new Set<string>()
  const mapByLabel = new Map<string, { label: string; nodeType: string; scope: GraphPresenceScope }>()
  for (const r of gpNodes ?? []) {
    const n = r as { proposed_label: string; node_type: string; presence_scope: GraphPresenceScope; status: string }
    const norm = normalizeLabel(n.proposed_label)
    excluded.add(norm) // exclude anything already on-map OR pending from the pool
    if (n.status === 'approved_graph' && !mapByLabel.has(norm)) mapByLabel.set(norm, { label: n.proposed_label, nodeType: n.node_type, scope: n.presence_scope })
  }

  const pool = new Map<string, EligibleNode>()
  for (const r of allN ?? []) {
    const n = r as { id: string; label: string; node_type: string; archive_name: string; approval_status: string; description: string | null }
    if (n.approval_status !== 'approved') continue
    if (!ALLOWED_NODE_TYPES.has(n.node_type)) continue
    if (excluded.has(normalizeLabel(n.label))) continue
    pool.set(n.id, { id: n.id, label: n.label, nodeType: n.node_type, archiveName: n.archive_name, scope: archiveScope(n.archive_name), description: n.description })
  }

  const { data: edgeRows } = await supabase.from('archive_graph_edges').select('id, edge_type, from_node_id, to_node_id, description, source_item_ids, approval_status').eq('approval_status', 'approved')
  const edges = (edgeRows ?? []).map((r) => r as Eligible['edges'][number])

  // existing map edge signatures (dedup): pending + approved
  const { data: existingEdges } = await supabase.from('graph_proposals').select('edge_type, proposed_payload').eq('proposal_type', 'edge').in('status', ['pending_review', 'approved_graph'])
  const existingEdgeSig = new Set<string>()
  for (const r of existingEdges ?? []) {
    const p = (r as { proposed_payload: unknown }).proposed_payload as { from?: { label?: string }; to?: { label?: string } } | null
    const et = (r as { edge_type: string | null }).edge_type
    if (p?.from?.label && p?.to?.label) existingEdgeSig.add(`${normalizeLabel(p.from.label)}|${normalizeLabel(p.to.label)}|${et ?? ''}`)
  }
  return { pool, allById, mapByLabel, edges, existingEdgeSig }
}

/** Resolve an archive_graph node id to a promotion endpoint: a pool node, an existing map node, or null. */
function resolveEndpoint(id: string, e: Eligible): Endpoint | null {
  const p = e.pool.get(id)
  if (p) return { kind: 'pool', label: p.label, nodeType: p.nodeType, scope: p.scope }
  const a = e.allById.get(id)
  if (!a) return null
  const m = e.mapByLabel.get(normalizeLabel(a.label))
  if (m) return { kind: 'map', label: m.label, nodeType: m.nodeType, scope: m.scope }
  return null
}

/** READ-ONLY. Discover eligible clusters (connected components over admitted within-pool edges). */
export async function discoverEligibleClusters(): Promise<Cluster[]> {
  const e = await loadEligible()

  // classify every approved edge → eligible (admitted) / held (unadmitted) / ignored
  const eligibleEdges: EligibleEdge[] = []
  const heldByNode = new Map<string, Set<string>>() // pool node id → unadmitted edge types touching it
  for (const raw of e.edges) {
    const from = resolveEndpoint(raw.from_node_id, e)
    const to = resolveEndpoint(raw.to_node_id, e)
    if (!from || !to) continue
    if (from.kind !== 'pool' && to.kind !== 'pool') continue // need ≥1 pool node (wave content)
    if (!ADMITTED_EDGE_TYPES.has(raw.edge_type)) {
      for (const id of [raw.from_node_id, raw.to_node_id]) if (e.pool.has(id)) { if (!heldByNode.has(id)) heldByNode.set(id, new Set()); heldByNode.get(id)!.add(raw.edge_type) }
      continue
    }
    if (e.existingEdgeSig.has(`${normalizeLabel(from.label)}|${normalizeLabel(to.label)}|${raw.edge_type}`)) continue // dedup
    eligibleEdges.push({ edgeId: raw.id, edgeType: raw.edge_type, description: raw.description, sourceItemIds: raw.source_item_ids ?? [], from, to, edgeScope: relationshipScope(from.scope, to.scope) })
  }

  // adjacency among POOL nodes (edges where BOTH endpoints are pool nodes) → connected components
  const adj = new Map<string, Set<string>>(); for (const id of e.pool.keys()) adj.set(id, new Set())
  const poolIdByLabel = new Map<string, string>(); for (const [id, n] of e.pool) poolIdByLabel.set(normalizeLabel(n.label), id)
  const withinPool = eligibleEdges.filter((ed) => ed.from.kind === 'pool' && ed.to.kind === 'pool')
  for (const ed of withinPool) {
    const a = poolIdByLabel.get(normalizeLabel(ed.from.label)); const b = poolIdByLabel.get(normalizeLabel(ed.to.label))
    if (a && b) { adj.get(a)!.add(b); adj.get(b)!.add(a) }
  }
  const seen = new Set<string>(); const comps: string[][] = []
  for (const id of e.pool.keys()) { if (seen.has(id)) continue; const st = [id], c: string[] = []; seen.add(id); while (st.length) { const x = st.pop()!; c.push(x); for (const nb of adj.get(x) || []) if (!seen.has(nb)) { seen.add(nb); st.push(nb) } } comps.push(c) }

  const clusters: Cluster[] = comps.map((ids) => {
    const idset = new Set(ids)
    const nodes = ids.map((id) => e.pool.get(id)!)
    const labelset = new Set(nodes.map((n) => normalizeLabel(n.label)))
    // cluster edges = eligible edges with ≥1 endpoint in this component (within-cluster + to-map-node)
    const edges = eligibleEdges.filter((ed) => labelset.has(normalizeLabel(ed.from.label)) || labelset.has(normalizeLabel(ed.to.label)))
      .filter((ed) => {
        // keep only edges whose endpoints are THIS cluster's nodes or map nodes (not another cluster's pool node)
        const fromOk = ed.from.kind === 'map' || labelset.has(normalizeLabel(ed.from.label))
        const toOk = ed.to.kind === 'map' || labelset.has(normalizeLabel(ed.to.label))
        return fromOk && toOk
      })
    const heldTypes = new Set<string>(); for (const id of ids) for (const t of heldByNode.get(id) || []) heldTypes.add(t)
    void idset
    return {
      id: clusterIdOf(ids),
      nodes,
      edges,
      archives: [...new Set(nodes.map((n) => n.archiveName))],
      edgeTypes: [...new Set(edges.map((ed) => ed.edgeType))],
      heldEdgeTypes: [...heldTypes],
      sampleLabels: nodes.map((n) => n.label).slice(0, 6),
      overCap: nodes.length > WAVE_MAX || edges.length > WAVE_MAX,
    }
  })
  clusters.sort((a, b) => b.nodes.length - a.nodes.length)
  return clusters
}

export async function previewCluster(clusterId: string): Promise<Cluster | null> {
  return (await discoverEligibleClusters()).find((c) => c.id === clusterId) ?? null
}

export type PromoteResult =
  | { mode: 'not_found'; clusterId: string }
  | { mode: 'refused'; reason: string; cluster: Cluster }
  | { mode: 'preview'; cluster: Cluster }
  | { mode: 'promoted'; cluster: Cluster; nodes: Array<{ node: EligibleNode; result: CreateProposalResult }>; edges: Array<{ edge: EligibleEdge; result: CreateProposalResult }> }

/**
 * Promote ONE cluster. discoverEligibleClusters() re-runs here → fresh dedup at promote time.
 * Refuses over WAVE_MAX. Preview-first. Node-first, then edges. pending_review only; never approves.
 */
export async function promoteCluster(clusterId: string, opts: { confirm: boolean }): Promise<PromoteResult> {
  const cluster = (await discoverEligibleClusters()).find((c) => c.id === clusterId)
  if (!cluster) return { mode: 'not_found', clusterId }
  if (cluster.overCap) return { mode: 'refused', reason: `Cluster ${clusterId} has ${cluster.nodes.length} nodes / ${cluster.edges.length} edges (cap ${WAVE_MAX}). Refusing rather than truncating.`, cluster }
  if (!opts.confirm) return { mode: 'preview', cluster }

  // NODE-first
  const nodeResults: Array<{ node: EligibleNode; result: CreateProposalResult }> = []
  for (const n of cluster.nodes) {
    const input: CreateProposalInput = {
      proposalType: 'node',
      nodeType: n.nodeType as GraphNodeType,
      label: n.label,
      summary: n.description?.trim() || n.label,
      payload: { nodeType: n.nodeType, label: n.label, summary: n.description?.trim() || n.label, suggestedAuthorityStatus: 'archive_supported', suggestedPresenceScope: n.scope },
      confidence: 0.7,
      salience: 0.6,
      reason: `Archive-derived ${n.nodeType} promoted from archive_graph (Phase 29B extraction) at midlevel grain, pending Ontology Lab review — a proposed graph node, not Memory/authority.`,
      authorityStatus: 'archive_supported',
      presenceScope: n.scope,
      primarySourceType: 'archive_graph_node',
      primarySourceId: n.id,
      proposedBy: 'graph_pipeline',
      sourceRecord: { sourceType: 'archive_graph_node', sourceTable: 'archive_graph_nodes', sourceId: n.id, sourceLabel: n.label, sourceExcerpt: n.description ?? undefined, sourceMetadata: { legacy_system: 'phase_29B' } },
    }
    nodeResults.push({ node: n, result: await createProposal(input) })
  }

  // then EDGES
  const edgeResults: Array<{ edge: EligibleEdge; result: CreateProposalResult }> = []
  for (const ed of cluster.edges) {
    const readable = `${ed.from.label} ${ed.edgeType} ${ed.to.label}`
    const summary = ed.description?.trim() || readable
    const input: CreateProposalInput = {
      proposalType: 'edge',
      edgeType: ed.edgeType as GraphEdgeType,
      label: readable,
      summary,
      payload: {
        edgeType: ed.edgeType,
        from: { label: ed.from.label, nodeType: ed.from.nodeType, presenceScope: ed.from.scope },
        to: { label: ed.to.label, nodeType: ed.to.nodeType, presenceScope: ed.to.scope },
        summary, directionRequired: true, suggestedAuthorityStatus: 'archive_supported', suggestedPresenceScope: ed.edgeScope,
      },
      confidence: 0.7,
      salience: 0.6,
      reason: `Archive-derived relationship promoted from archive_graph (Phase 29B extraction), pending Ontology Lab review — a proposed relationship, not an authority claim.` + (ed.description ? ` Archive note: ${ed.description}` : ''),
      authorityStatus: 'archive_supported',
      presenceScope: ed.edgeScope,
      primarySourceType: 'archive_graph_edge',
      primarySourceId: ed.edgeId,
      proposedBy: 'graph_pipeline',
      sourceRecord: { sourceType: 'archive_graph_edge', sourceTable: 'archive_graph_edges', sourceId: ed.edgeId, sourceLabel: readable, sourceExcerpt: ed.description ?? undefined, sourceMetadata: { legacy_system: 'phase_29B', source_item_ids: ed.sourceItemIds } },
    }
    edgeResults.push({ edge: ed, result: await createProposal(input) })
  }
  return { mode: 'promoted', cluster, nodes: nodeResults, edges: edgeResults }
}
