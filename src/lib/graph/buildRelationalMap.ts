// Phase 37D — Build Relational Map
//
// Transforms approved graph proposals into runtime graph data.
// This is a pure function — no database writes, no side effects.
//
// The graph may reveal relationship.
// The graph does not crown truth.
//
// Defensive ontology validation: even though 37B validates on insert,
// 37D re-validates at runtime. Invalid values are skipped with warnings.

import {
  isValidGraphNodeType,
  isValidGraphEdgeType,
  isValidGraphPresenceScope,
  isValidGraphAuthorityStatus,
} from './validation'
import { makeNodeKey, normalizeGraphLabel } from './graphDisplayUtils'
import { classifyGrain } from './graphGrain'
import { NON_MATERIALISING_EDIT_ACTIONS } from './graphEditActions'
import type { GraphProposal, GraphProposalSource } from './proposals'
import type { GraphMapNode, GraphMapEdge } from './relationalMapTypes'

// ─── Input / Output Types ──────────────────────────────────────────────────

export interface BuildRelationalMapInput {
  proposals: GraphProposal[]
  sources: GraphProposalSource[]
  events: Array<{
    proposal_id: string
    event_type: string
    previous_status: string | null
    new_status: string | null
    actor: string
    reason: string | null
    created_at: string
  }>
}

export interface BuildRelationalMapOutput {
  nodes: GraphMapNode[]
  edges: GraphMapEdge[]
  diagnostics: {
    skippedProposals: number
    warnings: string[]
  }
}

// ─── Edge Payload Shape ────────────────────────────────────────────────────

interface EdgePayloadEndpoint {
  label?: string
  nodeType?: string
  /** Phase 37F.3 — optional per-endpoint scope for cross-scope edges */
  presenceScope?: string
}

interface EdgePayload {
  from?: EdgePayloadEndpoint
  to?: EdgePayloadEndpoint
  edgeType?: string
  directionRequired?: boolean
}

function isEdgePayload(val: unknown): val is EdgePayload {
  return val != null && typeof val === 'object'
}

// ─── Main Transform ────────────────────────────────────────────────────────

export function buildRelationalMap(
  input: BuildRelationalMapInput
): BuildRelationalMapOutput {
  const nodeMap = new Map<string, GraphMapNode>()
  const edges: GraphMapEdge[] = []
  const warnings: string[] = []
  let skippedProposals = 0

  // Build source-type lookup: proposalId → sourceTypes[]
  const sourceTypesByProposal = new Map<string, string[]>()
  for (const src of input.sources) {
    const existing = sourceTypesByProposal.get(src.proposal_id) ?? []
    existing.push(src.source_type)
    sourceTypesByProposal.set(src.proposal_id, existing)
  }

  for (const proposal of input.proposals) {
    // Only process approved_graph proposals
    if (proposal.status !== 'approved_graph') {
      skippedProposals++
      warnings.push(`Skipped proposal ${proposal.id}: status "${proposal.status}" is not approved_graph.`)
      continue
    }

    if (proposal.proposal_type === 'node') {
      const result = processNodeProposal(proposal, sourceTypesByProposal, warnings)
      if (result) {
        mergeNode(nodeMap, result)
      } else {
        skippedProposals++
      }
    } else if (proposal.proposal_type === 'edge') {
      const result = processEdgeProposal(proposal, sourceTypesByProposal, nodeMap, warnings)
      if (result) {
        edges.push(result)
      } else {
        skippedProposals++
      }
    } else {
      skippedProposals++
      warnings.push(`Skipped proposal ${proposal.id}: unknown proposal_type "${proposal.proposal_type}".`)
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
    diagnostics: { skippedProposals, warnings },
  }
}

// ─── Process Node Proposal ─────────────────────────────────────────────────

function processNodeProposal(
  proposal: GraphProposal,
  sourceTypesByProposal: Map<string, string[]>,
  warnings: string[]
): GraphMapNode | null {
  const nodeType = proposal.node_type ?? ''
  const scope = proposal.presence_scope
  const authority = proposal.authority_status

  // Phase 37G.2/37G.3 — shared renderer guard: non-materialising edit action proposals must
  // never become map nodes regardless of their approval status.
  // Covers: suggest_alias, suggest_reclassify, suggest_confidence_change, suggest_salience_change
  const editActionType = (proposal.proposed_payload as unknown as Record<string, unknown> | undefined)?.edit_action_type as string | undefined
  if (editActionType && NON_MATERIALISING_EDIT_ACTIONS.has(editActionType)) {
    warnings.push(`Skipped non-materialising proposal ${proposal.id} (${editActionType}): must not materialise as a graph node.`)
    return null
  }

  // Defensive ontology validation
  if (!isValidGraphNodeType(nodeType)) {
    warnings.push(`Skipped node proposal ${proposal.id}: invalid node_type "${nodeType}".`)
    return null
  }
  if (!isValidGraphPresenceScope(scope)) {
    warnings.push(`Skipped node proposal ${proposal.id}: invalid presence_scope "${scope}".`)
    return null
  }
  if (!isValidGraphAuthorityStatus(authority)) {
    warnings.push(`Skipped node proposal ${proposal.id}: invalid authority_status "${authority}".`)
    return null
  }

  const key = makeNodeKey(scope, nodeType, proposal.proposed_label)
  const sourceTypes = sourceTypesByProposal.get(proposal.id) ?? [proposal.primary_source_type]

  const grainLevel = classifyGrain({
    nodeType,
    label: proposal.proposed_label,
    proposedPayload: proposal.proposed_payload as unknown as Record<string, unknown> | undefined,
    sourceTypes, // Phase 43 5A — archive-sourced concept/ritual stay midlevel (no overview promotion)
  })

  return {
    id: key,
    label: proposal.proposed_label,
    nodeType,
    presenceScope: scope,
    authorityStatus: authority,
    confidence: proposal.confidence,
    salience: proposal.salience,
    sourceTypes,
    proposalIds: [proposal.id],
    derivedFromEdge: false,
    promptEligible: proposal.prompt_eligible,
    grainLevel,
  }
}

// ─── Process Edge Proposal ─────────────────────────────────────────────────

function processEdgeProposal(
  proposal: GraphProposal,
  sourceTypesByProposal: Map<string, string[]>,
  nodeMap: Map<string, GraphMapNode>,
  warnings: string[]
): GraphMapEdge | null {
  const scope = proposal.presence_scope
  const authority = proposal.authority_status

  // Defensive scope/authority validation
  if (!isValidGraphPresenceScope(scope)) {
    warnings.push(`Skipped edge proposal ${proposal.id}: invalid presence_scope "${scope}".`)
    return null
  }
  if (!isValidGraphAuthorityStatus(authority)) {
    warnings.push(`Skipped edge proposal ${proposal.id}: invalid authority_status "${authority}".`)
    return null
  }

  // Phase 37G.3 — shared renderer guard for edge proposals.
  const edgeEditActionType = (proposal.proposed_payload as unknown as Record<string, unknown> | undefined)?.edit_action_type as string | undefined
  if (edgeEditActionType && NON_MATERIALISING_EDIT_ACTIONS.has(edgeEditActionType)) {
    warnings.push(`Skipped non-materialising edge proposal ${proposal.id} (${edgeEditActionType}): must not materialise as a graph edge.`)
    return null
  }

  // Determine edge type: prefer DB column over payload
  const dbEdgeType = proposal.edge_type ?? ''
  const payload = isEdgePayload(proposal.proposed_payload) ? proposal.proposed_payload : null

  let edgeType = dbEdgeType
  if (payload?.edgeType && payload.edgeType !== dbEdgeType && dbEdgeType) {
    warnings.push(
      `Edge proposal ${proposal.id}: payload.edgeType "${payload.edgeType}" disagrees with ` +
      `DB edge_type "${dbEdgeType}". Using DB value.`
    )
  }
  if (!edgeType && payload?.edgeType) {
    edgeType = payload.edgeType
  }

  if (!isValidGraphEdgeType(edgeType)) {
    warnings.push(`Skipped edge proposal ${proposal.id}: invalid edge_type "${edgeType}".`)
    return null
  }

  // Validate endpoint payload
  if (!payload?.from?.label || !payload?.to?.label) {
    warnings.push(
      `Skipped edge proposal ${proposal.id}: missing proposed_payload.from or proposed_payload.to.`
    )
    return null
  }

  const fromLabel = payload.from.label
  const toLabel = payload.to.label
  const fromNodeType = payload.from.nodeType ?? 'concept'
  const toNodeType = payload.to.nodeType ?? 'concept'

  // Phase 37F.3 — per-endpoint scope for cross-scope edges.
  // Falls back to the edge's own scope for backward compatibility.
  const fromScope = payload.from.presenceScope ?? scope
  const toScope = payload.to.presenceScope ?? scope

  // Create or find "from" node
  const fromKey = makeNodeKey(fromScope, fromNodeType, fromLabel)
  if (!nodeMap.has(fromKey)) {
    const sourceTypes = sourceTypesByProposal.get(proposal.id) ?? [proposal.primary_source_type]
    nodeMap.set(fromKey, {
      id: fromKey,
      label: fromLabel,
      nodeType: fromNodeType,
      presenceScope: fromScope,
      authorityStatus: authority,
      confidence: null,
      salience: null,
      sourceTypes,
      proposalIds: [proposal.id],
      derivedFromEdge: true,
      promptEligible: false,
      grainLevel: classifyGrain({ nodeType: fromNodeType, label: fromLabel, sourceTypes }),
    })
  } else {
    // Existing node — add this proposal ID
    const existing = nodeMap.get(fromKey)!
    if (!existing.proposalIds.includes(proposal.id)) {
      existing.proposalIds.push(proposal.id)
    }
  }

  // Create or find "to" node
  const toKey = makeNodeKey(toScope, toNodeType, toLabel)
  if (!nodeMap.has(toKey)) {
    const sourceTypes = sourceTypesByProposal.get(proposal.id) ?? [proposal.primary_source_type]
    nodeMap.set(toKey, {
      id: toKey,
      label: toLabel,
      nodeType: toNodeType,
      presenceScope: toScope,
      authorityStatus: authority,
      confidence: null,
      salience: null,
      sourceTypes,
      proposalIds: [proposal.id],
      derivedFromEdge: true,
      promptEligible: false,
      grainLevel: classifyGrain({ nodeType: toNodeType, label: toLabel, sourceTypes }),
    })
  } else {
    const existing = nodeMap.get(toKey)!
    if (!existing.proposalIds.includes(proposal.id)) {
      existing.proposalIds.push(proposal.id)
    }
  }

  return {
    id: `edge:${proposal.id}`,
    fromNodeId: fromKey,
    toNodeId: toKey,
    edgeType,
    label: proposal.proposed_label,
    presenceScope: scope,
    authorityStatus: authority,
    confidence: proposal.confidence,
    salience: proposal.salience,
    proposalId: proposal.id,
    promptEligible: proposal.prompt_eligible,
  }
}

// ─── Merge Nodes ───────────────────────────────────────────────────────────

/**
 * Merge a node into the map. If a node with the same key already exists,
 * combine proposal IDs and source types, keep higher confidence/salience.
 * Merge only when all three match: scope + nodeType + normalizedLabel.
 */
function mergeNode(
  nodeMap: Map<string, GraphMapNode>,
  node: GraphMapNode
): void {
  const existing = nodeMap.get(node.id)
  if (!existing) {
    nodeMap.set(node.id, node)
    return
  }

  // Merge proposal IDs
  for (const pid of node.proposalIds) {
    if (!existing.proposalIds.includes(pid)) {
      existing.proposalIds.push(pid)
    }
  }

  // Merge source types (deduplicate)
  for (const st of node.sourceTypes) {
    if (!existing.sourceTypes.includes(st)) {
      existing.sourceTypes.push(st)
    }
  }

  // Keep higher confidence/salience
  if (node.confidence != null) {
    existing.confidence = existing.confidence != null
      ? Math.max(existing.confidence, node.confidence)
      : node.confidence
  }
  if (node.salience != null) {
    existing.salience = existing.salience != null
      ? Math.max(existing.salience, node.salience)
      : node.salience
  }

  // If any contributing proposal is NOT derived from edge, mark as not derived
  if (!node.derivedFromEdge) {
    existing.derivedFromEdge = false
  }
}
