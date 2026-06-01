// Phase 37G.1 — Graph Edit Proposals API
//
// POST /api/graph-edit-proposals
//
// The map may suggest. Ontology Lab governs.
// A suggestion is not a graph edit. A graph proposal is not Memory.
// No UI action creates truth directly.
//
// Supported actions: suggest_node, suggest_edge, suggest_alias
// All proposals: pending_review, prompt_eligible=false, proposed_by=tara
//
// Writes ONLY to: graph_proposals, graph_proposal_sources, graph_proposal_events

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createProposal } from '@/lib/graph/proposals'
import {
  validateEditActionPayload,
  generateEditActionDedupeKey,
  editActionToProposalType,
  isSupportedEditAction,
  EDIT_ACTION_PROPOSAL_DEFAULTS,
} from '@/lib/graph/graphEditActions'
import {
  isValidGraphNodeType,
  isValidGraphEdgeType,
  isValidGraphPresenceScope,
  type GraphNodeType,
  type GraphEdgeType,
  type GraphPresenceScope,
} from '@/lib/graph/ontology'

// ─── POST /api/graph-edit-proposals ───────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const actionType = body.edit_action_type as string

  // 1. Reject unsupported/deferred actions
  if (!actionType || !isSupportedEditAction(actionType)) {
    return NextResponse.json(
      { error: `Unsupported edit action: "${actionType}". Supported: suggest_node, suggest_edge, suggest_alias` },
      { status: 400 }
    )
  }

  // 2. Build the full payload with required governance fields
  const payload: Record<string, unknown> = {
    ...body,
    edit_origin: 'relational_map',
    edit_origin_phase: '37G.1',
    detail_policy: 'review_required',
    requires_review: true,
    review_surface: 'ontology_lab',
    governance_note: 'Graph edit action proposal only. Not Memory. Not Archive authority. Not prompt truth.',
  }

  // Default grain_level to overview if not provided
  if (!payload.grain_level) {
    payload.grain_level = 'overview'
  }

  // 3. Validate
  const validation = validateEditActionPayload(payload)
  if (!validation.valid) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.errors },
      { status: 400 }
    )
  }

  // 4. Route to handler
  if (actionType === 'suggest_node') {
    return handleSuggestNode(payload)
  } else if (actionType === 'suggest_alias') {
    return handleSuggestAlias(payload)
  } else if (actionType === 'suggest_edge') {
    return handleSuggestEdge(payload)
  } else if (actionType === 'suggest_reclassify' || actionType === 'suggest_confidence_change' || actionType === 'suggest_salience_change') {
    return handleSuggestMetadataChange(payload)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// ─── Suggest Node Handler ─────────────────────────────────────────────────

async function handleSuggestNode(payload: Record<string, unknown>) {
  const label = (payload.label as string).trim()
  const nodeType = payload.node_type as string
  const scope = payload.presence_scope as string
  const rationale = (payload.rationale as string) || 'Proposed from Relational Map UI.'

  // Duplicate check: approved or pending node with same normalized label
  const { data: existing } = await supabase
    .from('graph_proposals')
    .select('id, proposed_label, status')
    .eq('proposal_type', 'node')
    .is('deleted_at', null)
    .in('status', ['pending_review', 'approved_graph'])
    .ilike('proposed_label', label)
    .limit(1)

  if (existing && existing.length > 0) {
    const match = existing[0]
    return NextResponse.json(
      {
        error: match.status === 'approved_graph'
          ? `This node already exists: "${match.proposed_label}"`
          : `A matching pending node proposal already exists: "${match.proposed_label}"`,
        code: 'duplicate',
        existingId: match.id,
      },
      { status: 409 }
    )
  }

  // Create proposal
  const result = await createProposal({
    proposalType: 'node',
    nodeType: nodeType as GraphNodeType,
    label,
    summary: rationale,
    payload: {
      ...payload,
      canonical_label: label,
      nodeType,
      summary: rationale,
      suggestedAuthorityStatus: 'candidate',
      suggestedPresenceScope: scope,
    },
    confidence: 0.7,
    salience: 0.6,
    reason: rationale,
    safeWording: `Graph edit proposal: ${label}. Proposed from Relational Map UI.`,
    authorityStatus: 'candidate',
    presenceScope: scope as GraphPresenceScope,
    primarySourceType: EDIT_ACTION_PROPOSAL_DEFAULTS.primary_source_type,
    primarySourceId: EDIT_ACTION_PROPOSAL_DEFAULTS.primary_source_id,
    proposedBy: EDIT_ACTION_PROPOSAL_DEFAULTS.proposed_by,
    generationVersion: '37G.1',
    sourceRecord: {
      sourceType: 'map_ui',
      sourceId: 'relational_map_ui',
      sourceLabel: 'Relational Map UI',
      sourceExcerpt: `User proposed node: ${label}`,
      sourceMetadata: {
        phase: '37G.1',
        edit_action_type: 'suggest_node',
        origin: 'relational_map',
      },
    },
  })

  if (!result.ok) {
    if (result.code === 'duplicate_pending') {
      return NextResponse.json(
        { error: 'A matching pending proposal already exists.', code: 'duplicate' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    proposalId: result.proposalId,
    message: 'Proposal created for Ontology Lab review.',
  }, { status: 201 })
}

// ─── Suggest Edge Handler ─────────────────────────────────────────────────

async function handleSuggestEdge(payload: Record<string, unknown>) {
  const from = payload.from as Record<string, unknown>
  const to = payload.to as Record<string, unknown>
  const edgeType = payload.edge_type as string
  const rationale = (payload.rationale as string) || 'Proposed from Relational Map UI.'
  const canonicalLabel = (payload.canonical_label as string) ||
    `${from.label} ${edgeType.replace(/_/g, ' ')} ${to.label}`

  const fromScope = from.presenceScope as string
  const toScope = to.presenceScope as string

  // Row-level presence_scope convention:
  // same scope → use that scope; cross-scope → 'shared'
  const edgeRowScope: GraphPresenceScope =
    fromScope === toScope ? fromScope as GraphPresenceScope : 'shared'

  // Validate endpoints exist as approved_graph
  const fromKey = from.runtimeKey as string
  const toKey = to.runtimeKey as string

  // Check from endpoint
  const { data: fromProposals } = await supabase
    .from('graph_proposals')
    .select('id, status')
    .eq('proposal_type', 'node')
    .eq('status', 'approved_graph')
    .is('deleted_at', null)
    .ilike('proposed_label', from.label as string)
    .limit(1)

  if (!fromProposals || fromProposals.length === 0) {
    return NextResponse.json(
      { error: `Source node "${from.label}" is not an approved graph node.`, code: 'endpoint_not_approved' },
      { status: 422 }
    )
  }

  // Check to endpoint
  const { data: toProposals } = await supabase
    .from('graph_proposals')
    .select('id, status')
    .eq('proposal_type', 'node')
    .eq('status', 'approved_graph')
    .is('deleted_at', null)
    .ilike('proposed_label', to.label as string)
    .limit(1)

  if (!toProposals || toProposals.length === 0) {
    return NextResponse.json(
      { error: `Target node "${to.label}" is not an approved graph node.`, code: 'endpoint_not_approved' },
      { status: 422 }
    )
  }

  // Duplicate edge check
  const { data: existingEdges } = await supabase
    .from('graph_proposals')
    .select('id, proposed_label, status')
    .eq('proposal_type', 'edge')
    .eq('edge_type', edgeType)
    .is('deleted_at', null)
    .in('status', ['pending_review', 'approved_graph'])
    .ilike('proposed_label', canonicalLabel)
    .limit(1)

  if (existingEdges && existingEdges.length > 0) {
    const match = existingEdges[0]
    return NextResponse.json(
      {
        error: match.status === 'approved_graph'
          ? `This edge already exists: "${match.proposed_label}"`
          : `A matching pending edge proposal already exists: "${match.proposed_label}"`,
        code: 'duplicate',
        existingId: match.id,
      },
      { status: 409 }
    )
  }

  // Create proposal
  const result = await createProposal({
    proposalType: 'edge',
    edgeType: edgeType as GraphEdgeType,
    label: canonicalLabel,
    summary: rationale,
    payload: {
      ...payload,
      from: { ...from },
      to: { ...to },
      edgeType,
      directionRequired: true,
      canonical_label: canonicalLabel,
      summary: rationale,
      suggestedAuthorityStatus: 'candidate',
      suggestedPresenceScope: edgeRowScope,
    },
    confidence: 0.7,
    salience: 0.6,
    reason: rationale,
    safeWording: `Graph edit proposal: ${canonicalLabel}. Proposed from Relational Map UI.`,
    authorityStatus: 'candidate',
    presenceScope: edgeRowScope,
    primarySourceType: EDIT_ACTION_PROPOSAL_DEFAULTS.primary_source_type,
    primarySourceId: EDIT_ACTION_PROPOSAL_DEFAULTS.primary_source_id,
    proposedBy: EDIT_ACTION_PROPOSAL_DEFAULTS.proposed_by,
    generationVersion: '37G.1',
    sourceRecord: {
      sourceType: 'map_ui',
      sourceId: 'relational_map_ui',
      sourceLabel: 'Relational Map UI',
      sourceExcerpt: `User proposed edge: ${canonicalLabel}`,
      sourceMetadata: {
        phase: '37G.1',
        edit_action_type: 'suggest_edge',
        origin: 'relational_map',
        selected_node_keys: [fromKey, toKey],
      },
    },
  })

  if (!result.ok) {
    if (result.code === 'duplicate_pending') {
      return NextResponse.json(
        { error: 'A matching pending edge proposal already exists.', code: 'duplicate' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    proposalId: result.proposalId,
    message: 'Edge proposal created for Ontology Lab review.',
  }, { status: 201 })
}

// ─── Suggest Alias Handler (Phase 37G.2) ──────────────────────────────────

async function handleSuggestAlias(payload: Record<string, unknown>) {
  const target = payload.target as Record<string, unknown>
  const proposedAlias = (payload.proposed_alias as string).trim()
  const rationale = (payload.rationale as string)?.trim() || 'Proposed alias from Relational Map UI.'
  const targetLabel = target.label as string
  const targetNodeType = target.nodeType as string
  const targetScope = target.presenceScope as string
  const targetRuntimeKey = target.runtimeKey as string

  // Validate target is an approved graph node
  const { data: targetProposals } = await supabase
    .from('graph_proposals')
    .select('id, status')
    .eq('proposal_type', 'node')
    .eq('status', 'approved_graph')
    .is('deleted_at', null)
    .ilike('proposed_label', targetLabel)
    .limit(1)

  if (!targetProposals || targetProposals.length === 0) {
    return NextResponse.json(
      { error: `Target node "${targetLabel}" is not an approved graph node.`, code: 'target_not_approved' },
      { status: 422 }
    )
  }

  // Collision check: alias must not match any existing approved/pending node label
  const { data: labelCollision } = await supabase
    .from('graph_proposals')
    .select('id, proposed_label, status')
    .eq('proposal_type', 'node')
    .is('deleted_at', null)
    .in('status', ['pending_review', 'approved_graph'])
    .ilike('proposed_label', proposedAlias)
    .limit(1)

  if (labelCollision && labelCollision.length > 0) {
    return NextResponse.json(
      {
        error: `This alias conflicts with an existing graph node: "${labelCollision[0].proposed_label}"`,
        code: 'alias_collision',
      },
      { status: 409 }
    )
  }

  // Duplicate alias proposal check: same target + same alias already pending or approved
  const aliasLabel = `Alias: ${proposedAlias} → ${targetLabel}`
  const { data: existingAlias } = await supabase
    .from('graph_proposals')
    .select('id, proposed_label, status')
    .eq('proposal_type', 'node')
    .is('deleted_at', null)
    .in('status', ['pending_review', 'approved_graph'])
    .ilike('proposed_label', aliasLabel)
    .limit(1)

  if (existingAlias && existingAlias.length > 0) {
    const match = existingAlias[0]
    return NextResponse.json(
      {
        error: match.status === 'approved_graph'
          ? `This alias already exists for this node.`
          : `A matching pending alias proposal already exists.`,
        code: 'duplicate',
        existingId: match.id,
      },
      { status: 409 }
    )
  }

  // Create alias proposal (proposal_type=node, but edit_action_type=suggest_alias — renderer guard prevents map materialisation)
  const result = await createProposal({
    proposalType: 'node',
    nodeType: targetNodeType as GraphNodeType,
    label: aliasLabel,
    summary: rationale,
    payload: {
      ...payload,
      canonical_label: aliasLabel,
      nodeType: targetNodeType,
      summary: rationale,
      suggestedAuthorityStatus: 'candidate',
      suggestedPresenceScope: targetScope,
    },
    confidence: 0.7,
    salience: 0.5,
    reason: rationale,
    safeWording: `Alias proposal: "${proposedAlias}" for "${targetLabel}". Proposed from Relational Map UI.`,
    authorityStatus: 'candidate',
    presenceScope: targetScope as GraphPresenceScope,
    primarySourceType: EDIT_ACTION_PROPOSAL_DEFAULTS.primary_source_type,
    primarySourceId: EDIT_ACTION_PROPOSAL_DEFAULTS.primary_source_id,
    proposedBy: EDIT_ACTION_PROPOSAL_DEFAULTS.proposed_by,
    generationVersion: '37G.2',
    sourceRecord: {
      sourceType: 'map_ui',
      sourceId: 'relational_map_ui',
      sourceLabel: 'Relational Map UI',
      sourceExcerpt: `User proposed alias: "${proposedAlias}" for "${targetLabel}"`,
      sourceMetadata: {
        phase: '37G.2',
        edit_action_type: 'suggest_alias',
        origin: 'relational_map',
        target_node_key: targetRuntimeKey,
        target_proposal_id: target.proposalId ?? null,
        proposed_alias: proposedAlias,
      },
    },
  })

  if (!result.ok) {
    if (result.code === 'duplicate_pending') {
      return NextResponse.json(
        { error: 'A matching pending alias proposal already exists.', code: 'duplicate' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    proposalId: result.proposalId,
    message: 'Alias proposal created for Ontology Lab review.',
  }, { status: 201 })
}

// ─── Suggest Metadata Change Handler (Phase 37G.3) ────────────────────────

async function handleSuggestMetadataChange(payload: Record<string, unknown>) {
  const actionType = payload.edit_action_type as string
  const target = payload.target as Record<string, unknown>
  const targetLabel = target.label as string
  const targetKind = target.kind as 'node' | 'edge'
  const targetScope = target.presenceScope as string
  const targetNodeType = (target.nodeType as string) || null
  const targetEdgeType = (target.edgeType as string) || null
  const targetRuntimeKey = target.runtimeKey as string

  // Build human-readable label and change field for proposed_label
  let proposedLabel: string
  let changeField: string
  let currentValue: unknown
  let proposedValue: unknown

  if (actionType === 'suggest_reclassify') {
    changeField = payload.field as string
    currentValue = payload.current_value
    proposedValue = payload.proposed_value
    proposedLabel = `Reclassify: ${targetLabel} ${changeField} ${currentValue} → ${proposedValue}`
  } else if (actionType === 'suggest_confidence_change') {
    changeField = 'confidence'
    currentValue = payload.current_confidence
    proposedValue = payload.proposed_confidence
    proposedLabel = `Confidence: ${targetLabel} ${currentValue ?? '?'} → ${proposedValue}`
  } else {
    changeField = 'salience'
    currentValue = payload.current_salience
    proposedValue = payload.proposed_salience
    proposedLabel = `Salience: ${targetLabel} ${currentValue ?? '?'} → ${proposedValue}`
  }

  const rationale = (payload.rationale as string)?.trim() || 'Proposed metadata change from Relational Map UI.'

  // Validate target is approved_graph
  const approvalQuery = supabase
    .from('graph_proposals')
    .select('id, status')
    .eq('proposal_type', targetKind === 'node' ? 'node' : 'edge')
    .eq('status', 'approved_graph')
    .is('deleted_at', null)
    .ilike('proposed_label', targetLabel)
    .limit(1)

  const { data: targetProposals } = await approvalQuery

  if (!targetProposals || targetProposals.length === 0) {
    return NextResponse.json(
      { error: `Target "${targetLabel}" is not an approved graph ${targetKind}.`, code: 'target_not_approved' },
      { status: 422 }
    )
  }

  // Duplicate check
  const { data: existingChange } = await supabase
    .from('graph_proposals')
    .select('id, proposed_label, status')
    .eq('proposal_type', targetKind === 'node' ? 'node' : 'edge')
    .is('deleted_at', null)
    .in('status', ['pending_review', 'approved_graph'])
    .ilike('proposed_label', proposedLabel)
    .limit(1)

  if (existingChange && existingChange.length > 0) {
    const match = existingChange[0]
    return NextResponse.json(
      {
        error: match.status === 'approved_graph'
          ? 'This metadata change already exists.'
          : 'A matching pending metadata-change proposal already exists.',
        code: 'duplicate',
        existingId: match.id,
      },
      { status: 409 }
    )
  }

  // Create metadata-change proposal
  // proposal_type: node for node targets, edge for edge targets
  // node/edge type from target (satisfies DB shape constraint)
  const createInput = {
    proposalType: (targetKind === 'node' ? 'node' : 'edge') as 'node' | 'edge',
    nodeType: targetKind === 'node' ? (targetNodeType as GraphNodeType) : undefined,
    edgeType: targetKind === 'edge' ? (targetEdgeType as GraphEdgeType) : undefined,
    label: proposedLabel,
    summary: rationale,
    payload: {
      ...payload,
      canonical_label: proposedLabel,
      change: { field: changeField, current_value: currentValue, proposed_value: proposedValue },
      governance_note: 'Metadata-change proposal only. Not a new graph node or edge. Not Memory. Not Archive authority. Not prompt truth.',
    },
    confidence: 0.7,
    salience: 0.5,
    reason: rationale,
    safeWording: `Metadata-change proposal: ${proposedLabel}.`,
    authorityStatus: 'candidate' as const,
    presenceScope: targetScope as GraphPresenceScope,
    primarySourceType: EDIT_ACTION_PROPOSAL_DEFAULTS.primary_source_type,
    primarySourceId: EDIT_ACTION_PROPOSAL_DEFAULTS.primary_source_id,
    proposedBy: EDIT_ACTION_PROPOSAL_DEFAULTS.proposed_by,
    generationVersion: '37G.3',
    sourceRecord: {
      sourceType: 'map_ui' as const,
      sourceId: 'relational_map_ui',
      sourceLabel: 'Relational Map UI',
      sourceExcerpt: `User proposed ${actionType}: ${proposedLabel}`,
      sourceMetadata: {
        phase: '37G.3',
        edit_action_type: actionType,
        origin: 'relational_map',
        target_kind: targetKind,
        target_key: targetRuntimeKey,
        target_proposal_id: target.proposalId ?? null,
        change_field: changeField,
        current_value: currentValue,
        proposed_value: proposedValue,
      },
    },
  }

  const result = await createProposal(createInput)

  if (!result.ok) {
    if (result.code === 'duplicate_pending') {
      return NextResponse.json(
        { error: 'A matching pending metadata-change proposal already exists.', code: 'duplicate' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    proposalId: result.proposalId,
    message: 'Metadata-change proposal created for Ontology Lab review.',
  }, { status: 201 })
}
