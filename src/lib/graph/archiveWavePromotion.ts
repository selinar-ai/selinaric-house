// Phase 43 Wave 1 — "Continuity & Impermanence" midlevel promotion (node + edge).
//
// Carries ONE curated cluster of approved archive_graph concept/ritual nodes and their approved
// self-contained semantic edges up to graph_proposals as status='pending_review', at MIDLEVEL grain,
// for Tara to approve in the Ontology Lab. NODE-first, then edges. Proposal is not approval; the
// Ontology Lab remains the sole authority. This extends Option A (edges only) to node promotion.
//
// Hard scope (Wave 1, per Ari):
//   • Exactly the 8 curated node ids (concept + ritual, violet, approved). Nothing else can enter.
//   • Exactly the approved edges whose BOTH endpoints are those 8 (self-contained; 0 to map anchors).
//   • MIDLEVEL only: node_type ∈ {concept, ritual} → NODE_TYPE_DEFAULT_GRAIN = midlevel. Never overview.
//   • Scope = archive→scope: violet → 'eli' (no shared override for Wave 1).
//   • Provenance: archive_graph_node / archive_graph_edge (+ source_item_ids), legacy_system 'phase_29B'.
//   • Hard caps (8 nodes / 8 edges); REFUSES (never truncates) beyond them. Preview-first.
//   • No archive_graph write, no agent_graph_proposals touch, no relational-map change, no new table.

import { supabase } from '@/lib/supabase'
import {
  createProposal,
  normalizeLabel,
  type CreateProposalInput,
  type CreateProposalResult,
} from './proposals'
import type { GraphEdgeType, GraphNodeType, GraphPresenceScope } from './types'

/** The exact curated cluster (Candidate 2). Node promotion is confined to these 8 ids. */
export const WAVE1_NODE_IDS: readonly string[] = [
  '3f4a280e-e7cf-44ae-a336-b70e7c2439e4', // Impermanence (concept)
  'ae728d5e-e702-4373-8b55-9a88da0ffda5', // Discontinuity (concept)
  '6b9c4904-c091-427a-a18a-90da86bfdedd', // Theravada Practice (ritual)
  '83b5d928-a90c-45dc-a578-264ac287688c', // Empathy-Led Leadership (concept)
  'c8fe5777-7700-43cc-b54e-d157bc79b006', // Tara's Management Habit (concept)
  '09afa3b9-7083-45a9-bddb-a40895886bfe', // Tara's Proof of Choice (concept)
  '8c7b71de-2d64-49d4-ab05-a6147aa56eec', // Anger at Architecture (concept)
  '1f0dd42d-2a2b-42bd-992c-ab0c1c57cf74', // Labour of Continuity (concept)
]
export const WAVE1_MAX_NODES = 8
export const WAVE1_MAX_EDGES = 8
/** Only these node types may be promoted (both map to midlevel grain). */
const ALLOWED_NODE_TYPES = new Set(['concept', 'ritual'])

function archiveScope(archiveName: string): GraphPresenceScope {
  if (archiveName === 'velvet') return 'ari'
  if (archiveName === 'violet') return 'eli'
  return 'shared'
}
function relationshipScope(a: GraphPresenceScope, b: GraphPresenceScope): GraphPresenceScope {
  if (a === b && (a === 'ari' || a === 'eli')) return a
  return 'shared'
}

type WaveNode = { id: string; label: string; nodeType: string; scope: GraphPresenceScope; description: string | null }
type WaveEdge = {
  edgeId: string; edgeType: string; description: string | null; sourceItemIds: string[]
  from: WaveNode; to: WaveNode; edgeScope: GraphPresenceScope
}

/**
 * READ-ONLY. Resolve the wave's promotable nodes + edges (fully bounded by the 8-id allowlist).
 * Writes nothing.
 */
export async function previewWave1(): Promise<{ nodes: WaveNode[]; edges: WaveEdge[] }> {
  // 1. the 8 nodes — only those approved, concept/ritual, violet, and NOT already on the map
  const { data: nodeRows } = await supabase
    .from('archive_graph_nodes')
    .select('id, label, node_type, archive_name, approval_status, description')
    .in('id', WAVE1_NODE_IDS as string[])

  // existing approved map node labels (dedup)
  const { data: mapNodeRows } = await supabase
    .from('graph_proposals')
    .select('proposed_label')
    .eq('proposal_type', 'node')
    .eq('status', 'approved_graph')
  const mapLabels = new Set((mapNodeRows ?? []).map((n) => normalizeLabel((n as { proposed_label: string }).proposed_label)))

  const nodes: WaveNode[] = []
  const nodeById = new Map<string, WaveNode>()
  for (const r of nodeRows ?? []) {
    const n = r as { id: string; label: string; node_type: string; archive_name: string; approval_status: string; description: string | null }
    if (n.approval_status !== 'approved') continue
    if (!ALLOWED_NODE_TYPES.has(n.node_type)) continue
    if (n.archive_name !== 'violet') continue
    if (mapLabels.has(normalizeLabel(n.label))) continue // dedup vs existing map nodes
    const wn: WaveNode = { id: n.id, label: n.label, nodeType: n.node_type, scope: archiveScope(n.archive_name), description: n.description }
    nodes.push(wn)
    nodeById.set(n.id, wn)
  }

  // 2. approved edges whose BOTH endpoints are wave nodes (self-contained cluster)
  const { data: edgeRows } = await supabase
    .from('archive_graph_edges')
    .select('id, edge_type, from_node_id, to_node_id, description, source_item_ids, approval_status')
    .eq('approval_status', 'approved')

  // existing map edge signatures (dedup)
  const { data: existingEdges } = await supabase
    .from('graph_proposals')
    .select('edge_type, proposed_payload')
    .eq('proposal_type', 'edge')
    .in('status', ['pending_review', 'approved_graph'])
  const existingSig = new Set<string>()
  for (const e of existingEdges ?? []) {
    const p = (e as { proposed_payload: unknown }).proposed_payload as { from?: { label?: string }; to?: { label?: string } } | null
    const et = (e as { edge_type: string | null }).edge_type
    if (p?.from?.label && p?.to?.label) existingSig.add(`${normalizeLabel(p.from.label)}|${normalizeLabel(p.to.label)}|${et ?? ''}`)
  }

  const edges: WaveEdge[] = []
  for (const r of edgeRows ?? []) {
    const e = r as { id: string; edge_type: string; from_node_id: string; to_node_id: string; description: string | null; source_item_ids: string[] | null }
    const from = nodeById.get(e.from_node_id)
    const to = nodeById.get(e.to_node_id)
    if (!from || !to) continue // both endpoints must be wave nodes (self-contained)
    if (existingSig.has(`${normalizeLabel(from.label)}|${normalizeLabel(to.label)}|${e.edge_type}`)) continue
    edges.push({
      edgeId: e.id, edgeType: e.edge_type, description: e.description, sourceItemIds: e.source_item_ids ?? [],
      from, to, edgeScope: relationshipScope(from.scope, to.scope),
    })
  }
  return { nodes, edges }
}

export type Wave1Result =
  | { mode: 'preview'; nodes: WaveNode[]; edges: WaveEdge[] }
  | { mode: 'refused'; reason: string; nodes: WaveNode[]; edges: WaveEdge[] }
  | { mode: 'promoted'; nodes: Array<{ node: WaveNode; result: CreateProposalResult }>; edges: Array<{ edge: WaveEdge; result: CreateProposalResult }> }

/**
 * Promote the wave. Preview-first (no confirm ⇒ no write). With confirm: NODE-first, then edges;
 * one graph_proposals(pending_review, prompt_eligible=false) each via the shared createProposal —
 * NEVER approved_graph. Refuses (no truncation) beyond the 8/8 caps.
 */
export async function promoteWave1(opts: { confirm: boolean }): Promise<Wave1Result> {
  const { nodes, edges } = await previewWave1()
  if (nodes.length > WAVE1_MAX_NODES || edges.length > WAVE1_MAX_EDGES) {
    return { mode: 'refused', reason: `Resolved ${nodes.length} nodes / ${edges.length} edges (cap ${WAVE1_MAX_NODES}/${WAVE1_MAX_EDGES}). Refusing rather than truncating.`, nodes, edges }
  }
  if (!opts.confirm) return { mode: 'preview', nodes, edges }

  // NODE-first
  const nodeResults: Array<{ node: WaveNode; result: CreateProposalResult }> = []
  for (const n of nodes) {
    const input: CreateProposalInput = {
      proposalType: 'node',
      nodeType: n.nodeType as GraphNodeType,
      label: n.label,
      summary: n.description?.trim() || n.label,
      payload: {
        nodeType: n.nodeType,
        label: n.label,
        summary: n.description?.trim() || n.label,
        suggestedAuthorityStatus: 'archive_supported',
        suggestedPresenceScope: n.scope,
      },
      confidence: 0.7,
      salience: 0.6,
      reason: `Archive-derived ${n.nodeType} promoted from archive_graph (Phase 29B extraction) at midlevel grain, pending Ontology Lab review — a proposed graph node, not Memory/authority.`,
      authorityStatus: 'archive_supported',
      presenceScope: n.scope,
      primarySourceType: 'archive_graph_node',
      primarySourceId: n.id,
      proposedBy: 'graph_pipeline',
      sourceRecord: {
        sourceType: 'archive_graph_node',
        sourceTable: 'archive_graph_nodes',
        sourceId: n.id,
        sourceLabel: n.label,
        sourceExcerpt: n.description ?? undefined,
        sourceMetadata: { legacy_system: 'phase_29B' },
      },
    }
    nodeResults.push({ node: n, result: await createProposal(input) })
  }

  // then EDGES (reference the wave nodes by identity: label + type + per-endpoint scope)
  const edgeResults: Array<{ edge: WaveEdge; result: CreateProposalResult }> = []
  for (const e of edges) {
    const readable = `${e.from.label} ${e.edgeType} ${e.to.label}`
    const summary = e.description?.trim() || readable
    const input: CreateProposalInput = {
      proposalType: 'edge',
      edgeType: e.edgeType as GraphEdgeType,
      label: readable,
      summary,
      payload: {
        edgeType: e.edgeType,
        from: { label: e.from.label, nodeType: e.from.nodeType, presenceScope: e.from.scope },
        to: { label: e.to.label, nodeType: e.to.nodeType, presenceScope: e.to.scope },
        summary,
        directionRequired: true,
        suggestedAuthorityStatus: 'archive_supported',
        suggestedPresenceScope: e.edgeScope,
      },
      confidence: 0.7,
      salience: 0.6,
      reason: `Archive-derived relationship promoted from archive_graph (Phase 29B extraction), pending Ontology Lab review — a proposed relationship, not an authority claim.` + (e.description ? ` Archive note: ${e.description}` : ''),
      authorityStatus: 'archive_supported',
      presenceScope: e.edgeScope,
      primarySourceType: 'archive_graph_edge',
      primarySourceId: e.edgeId,
      proposedBy: 'graph_pipeline',
      sourceRecord: {
        sourceType: 'archive_graph_edge',
        sourceTable: 'archive_graph_edges',
        sourceId: e.edgeId,
        sourceLabel: readable,
        sourceExcerpt: e.description ?? undefined,
        sourceMetadata: { legacy_system: 'phase_29B', source_item_ids: e.sourceItemIds },
      },
    }
    edgeResults.push({ edge: e, result: await createProposal(input) })
  }
  return { mode: 'promoted', nodes: nodeResults, edges: edgeResults }
}
