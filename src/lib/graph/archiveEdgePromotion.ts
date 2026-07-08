// Phase 43 Option A — Curated archive_graph → Relational Map edge promotion.
//
// Carries a TINY, CURATED set of APPROVED archive_graph semantic edges into graph_proposals as
// status='pending_review' — for Tara to approve in the Ontology Lab. It promotes EDGES ONLY
// (the endpoint entities already exist as approved map nodes), never nodes, never archive truth,
// never approved_graph. Proposal is not approval; the Ontology Lab remains the sole authority.
//
// Hard scope (this gate):
//   • ALLOWLIST = 5 coarse entities that exist in BOTH archive_graph and the map.
//   • Promote an edge ONLY if approval_status='approved' AND both endpoints resolve (by
//     normalized label) to the allowlist AND to an existing approved MAP node.
//   • Edge SCOPE is the RELATIONSHIP's scope, not the source archive's: mixed/cross-presence
//     → 'shared' (never scope an Ari↔Eli edge as ari-only/eli-only). Each ENDPOINT keeps its
//     own map-node scope in the payload so buildRelationalMap links to the real node.
//   • Provenance: primary source = the archive_graph_edge (+ its source_item_ids), legacy_system
//     'phase_29B' — so every promoted edge traces map → archive_graph_edge → source items → archive.
//   • MAX_PROMOTE cap; REFUSES (never truncates) if the curated set exceeds it. Preview-first.
//   • No archive_graph write, no agent_graph_proposals touch, no relational-map change, no new table.

import { supabase } from '@/lib/supabase'
import {
  createProposal,
  normalizeLabel,
  type CreateProposalInput,
  type CreateProposalResult,
} from './proposals'
import type { GraphEdgeType, GraphPresenceScope } from './types'

/** The 5 coarse entities that exist in both archive_graph and the map (normalized labels). */
export const PROMOTION_ALLOWLIST: readonly string[] = [
  'tara', 'ari', 'eli', 'velvet archives', 'the lounge',
]

/** Hard cap for a single promotion run. Exceeding it REFUSES the run (no silent truncation). */
export const MAX_PROMOTE = 5

type MapNode = { label: string; nodeType: string; scope: GraphPresenceScope }

export interface PromotionCandidate {
  edgeId: string
  edgeType: string
  description: string | null
  sourceItemIds: string[]
  from: MapNode
  to: MapNode
  edgeScope: GraphPresenceScope
}

function relationshipScope(a: GraphPresenceScope, b: GraphPresenceScope): GraphPresenceScope {
  // Cross-presence / mixed → 'shared' (honours the Ari/Eli separation rule). Only a single
  // shared single-presence scope on BOTH ends keeps that presence's scope.
  if (a === b && (a === 'ari' || a === 'eli')) return a
  return 'shared'
}

/**
 * READ-ONLY. Resolve the curated, promotable edges (exactly the both-endpoints-in-allowlist,
 * approved, not-already-promoted set). Writes nothing.
 */
export async function previewArchiveEdgePromotions(): Promise<PromotionCandidate[]> {
  // 1. approved archive_graph edges
  const { data: edges, error: eErr } = await supabase
    .from('archive_graph_edges')
    .select('id, edge_type, from_node_id, to_node_id, description, source_item_ids, approval_status')
    .eq('approval_status', 'approved')
  if (eErr || !edges) return []

  // 2. archive_graph node id → label
  const { data: nodes } = await supabase.from('archive_graph_nodes').select('id, label')
  const labelById = new Map<string, string>()
  for (const n of nodes ?? []) labelById.set((n as { id: string }).id, (n as { label: string }).label)

  // 3. approved MAP nodes (graph_proposals), keyed by normalized label
  const { data: mapNodeRows } = await supabase
    .from('graph_proposals')
    .select('proposal_type, status, node_type, presence_scope, proposed_label')
    .eq('proposal_type', 'node')
    .eq('status', 'approved_graph')
  const mapNodeByNorm = new Map<string, MapNode>()
  for (const r of mapNodeRows ?? []) {
    const row = r as { node_type: string; presence_scope: GraphPresenceScope; proposed_label: string }
    const norm = normalizeLabel(row.proposed_label)
    if (!mapNodeByNorm.has(norm)) {
      mapNodeByNorm.set(norm, { label: row.proposed_label, nodeType: row.node_type, scope: row.presence_scope })
    }
  }

  // 4. existing map EDGE proposals (pending_review + approved_graph) → dedup signatures
  const { data: existingEdges } = await supabase
    .from('graph_proposals')
    .select('edge_type, proposed_payload, status')
    .eq('proposal_type', 'edge')
    .in('status', ['pending_review', 'approved_graph'])
  const existingSig = new Set<string>()
  for (const e of existingEdges ?? []) {
    const row = e as { edge_type: string | null; proposed_payload: unknown }
    const p = row.proposed_payload as { from?: { label?: string }; to?: { label?: string } } | null
    if (p?.from?.label && p?.to?.label) {
      existingSig.add(`${normalizeLabel(p.from.label)}|${normalizeLabel(p.to.label)}|${row.edge_type ?? ''}`)
    }
  }

  const candidates: PromotionCandidate[] = []
  for (const e of edges) {
    const edge = e as {
      id: string; edge_type: string; from_node_id: string; to_node_id: string
      description: string | null; source_item_ids: string[] | null
    }
    const fromLabel = labelById.get(edge.from_node_id)
    const toLabel = labelById.get(edge.to_node_id)
    if (!fromLabel || !toLabel) continue
    const normFrom = normalizeLabel(fromLabel)
    const normTo = normalizeLabel(toLabel)
    // coarse-grain guarantee: BOTH endpoints must be allowlist entities...
    if (!PROMOTION_ALLOWLIST.includes(normFrom) || !PROMOTION_ALLOWLIST.includes(normTo)) continue
    // ...and BOTH must resolve to an existing approved MAP node (no node auto-creation)
    const fromNode = mapNodeByNorm.get(normFrom)
    const toNode = mapNodeByNorm.get(normTo)
    if (!fromNode || !toNode) continue
    // dedup vs the map (same from/to/edge_type already proposed or approved)
    if (existingSig.has(`${normalizeLabel(fromNode.label)}|${normalizeLabel(toNode.label)}|${edge.edge_type}`)) continue

    candidates.push({
      edgeId: edge.id,
      edgeType: edge.edge_type,
      description: edge.description,
      sourceItemIds: edge.source_item_ids ?? [],
      from: fromNode,
      to: toNode,
      edgeScope: relationshipScope(fromNode.scope, toNode.scope),
    })
  }
  return candidates
}

export type PromoteResult =
  | { mode: 'preview'; candidates: PromotionCandidate[] }
  | { mode: 'refused'; reason: string; candidates: PromotionCandidate[] }
  | { mode: 'promoted'; created: Array<{ candidate: PromotionCandidate; result: CreateProposalResult }> }

/**
 * Promote the curated edges. Preview-first: without `confirm`, returns the candidates and writes
 * nothing. With `confirm`, creates one graph_proposals (pending_review, prompt_eligible=false) per
 * candidate via the shared createProposal — NEVER approved_graph. Refuses (no truncation) if the
 * curated set exceeds MAX_PROMOTE.
 */
export async function promoteArchiveEdges(opts: { confirm: boolean }): Promise<PromoteResult> {
  const candidates = await previewArchiveEdgePromotions()
  if (candidates.length > MAX_PROMOTE) {
    return { mode: 'refused', reason: `Curated set is ${candidates.length} (> MAX_PROMOTE ${MAX_PROMOTE}). Refusing rather than truncating.`, candidates }
  }
  if (!opts.confirm) return { mode: 'preview', candidates }

  const created: Array<{ candidate: PromotionCandidate; result: CreateProposalResult }> = []
  for (const c of candidates) {
    const readable = `${c.from.label} ${c.edgeType} ${c.to.label}`
    const summary = c.description?.trim() || readable
    const input: CreateProposalInput = {
      proposalType: 'edge',
      edgeType: c.edgeType as GraphEdgeType,
      label: readable,
      summary,
      payload: {
        edgeType: c.edgeType,
        // per-endpoint scope so buildRelationalMap links to the REAL map nodes (not derived dupes)
        from: { label: c.from.label, nodeType: c.from.nodeType, presenceScope: c.from.scope },
        to: { label: c.to.label, nodeType: c.to.nodeType, presenceScope: c.to.scope },
        summary,
        directionRequired: true,
        suggestedAuthorityStatus: 'archive_supported',
        suggestedPresenceScope: c.edgeScope,
      },
      confidence: 0.7,
      salience: 0.6,
      reason:
        `Archive-derived relationship promoted from archive_graph (Phase 29B extraction), pending ` +
        `Ontology Lab review — a proposed relationship, not an authority claim. ` +
        (c.edgeType === 'precedes' ? `"precedes" denotes chronological/relational sequence, not superiority. ` : '') +
        (c.description ? `Archive note: ${c.description}` : ''),
      authorityStatus: 'archive_supported',
      presenceScope: c.edgeScope,
      primarySourceType: 'archive_graph_edge',
      primarySourceId: c.edgeId,
      proposedBy: 'graph_pipeline',
      sourceRecord: {
        sourceType: 'archive_graph_edge',
        sourceTable: 'archive_graph_edges',
        sourceId: c.edgeId,
        sourceLabel: readable,
        sourceExcerpt: c.description ?? undefined,
        sourceMetadata: { legacy_system: 'phase_29B', source_item_ids: c.sourceItemIds },
      },
    }
    const result = await createProposal(input)
    created.push({ candidate: c, result })
  }
  return { mode: 'promoted', created }
}
