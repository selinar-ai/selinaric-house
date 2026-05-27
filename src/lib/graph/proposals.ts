// Phase 37B — Graph Proposal Pipeline
//
// Proposal is not approval. Approval is not Memory.
// Graph authority is not Memory authority.
//
// These helpers manage pending graph proposals only.
// They do not create approved graph items or canonical Memory.

import { supabase } from '@/lib/supabase'
import {
  isValidGraphNodeType,
  isValidGraphEdgeType,
  isValidGraphAuthorityStatus,
  isValidGraphPresenceScope,
  isValidGraphSourceType,
  type GraphNodeType,
  type GraphEdgeType,
  type GraphAuthorityStatus,
  type GraphPresenceScope,
  type GraphSourceType,
} from './ontology'

// ─── Types ──────────────────────────────────────────────────────────────────

export type ProposalType = 'node' | 'edge'

export type ProposalStatus =
  | 'pending_review'
  | 'approved_graph'
  | 'rejected'
  | 'needs_more_evidence'
  | 'workspace_only'
  | 'superseded'

export type ProposalActor =
  | 'tara'
  | 'ari'
  | 'eli'
  | 'system_candidate'
  | 'graph_pipeline'

export type ProposalEventType =
  | 'proposal_created'
  | 'status_changed'
  | 'marked_needs_more_evidence'
  | 'marked_workspace_only'
  | 'approved_graph'
  | 'rejected'
  | 'superseded'
  | 'restored'

export interface GraphNodeProposalPayload {
  nodeType: GraphNodeType
  label: string
  summary: string
  aliases?: string[]
  relationshipArcRole?: string
  suggestedAuthorityStatus: GraphAuthorityStatus
  suggestedPresenceScope: GraphPresenceScope
}

export interface GraphEdgeProposalPayload {
  edgeType: GraphEdgeType
  from: {
    label: string
    nodeType?: GraphNodeType
    existingNodeId?: string
  }
  to: {
    label: string
    nodeType?: GraphNodeType
    existingNodeId?: string
  }
  summary: string
  directionRequired: boolean
  suggestedAuthorityStatus: GraphAuthorityStatus
  suggestedPresenceScope: GraphPresenceScope
}

export interface GraphProposal {
  id: string
  proposal_type: ProposalType
  status: ProposalStatus
  presence_scope: GraphPresenceScope
  authority_status: GraphAuthorityStatus
  node_type: GraphNodeType | null
  edge_type: GraphEdgeType | null
  proposed_label: string
  proposed_summary: string | null
  proposed_payload: GraphNodeProposalPayload | GraphEdgeProposalPayload
  confidence: number
  salience: number
  reason: string
  safe_wording: string | null
  prompt_eligible: boolean
  primary_source_type: GraphSourceType
  primary_source_id: string
  dedupe_key: string
  proposed_by: string
  generation_model: string | null
  generation_version: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface GraphProposalSource {
  id: string
  proposal_id: string
  source_type: string
  source_table: string | null
  source_id: string
  source_label: string | null
  source_excerpt: string | null
  source_metadata: Record<string, unknown>
  created_at: string
}

export interface CreateProposalInput {
  proposalType: ProposalType
  nodeType?: GraphNodeType
  edgeType?: GraphEdgeType
  label: string
  summary: string
  payload: Record<string, unknown>
  confidence: number
  salience: number
  reason: string
  safeWording?: string
  authorityStatus: GraphAuthorityStatus
  presenceScope: GraphPresenceScope
  primarySourceType: GraphSourceType
  primarySourceId: string
  generationModel?: string
  sourceRecord: {
    sourceType: GraphSourceType
    sourceTable?: string
    sourceId: string
    sourceLabel?: string
    sourceExcerpt?: string
    sourceMetadata?: Record<string, unknown>
  }
}

export type CreateProposalResult =
  | { ok: true; proposalId: string }
  | { ok: false; error: string; code: string }

// ─── Label Normalization ────────────────────────────────────────────────────

export function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

// ─── Dedupe Key Generation ──────────────────────────────────────────────────

export function generateDedupeKey(input: {
  proposalType: ProposalType
  sourceType: string
  sourceId: string
  presenceScope: string
  label: string
  edgeType?: string
  fromLabel?: string
  toLabel?: string
}): string {
  if (input.proposalType === 'edge') {
    const from = normalizeLabel(input.fromLabel ?? '')
    const to = normalizeLabel(input.toLabel ?? '')
    return `edge:${input.sourceType}:${input.sourceId}:${input.presenceScope}:${input.edgeType ?? 'unknown'}:${from}:${to}`
  }
  return `node:${input.sourceType}:${input.sourceId}:${input.presenceScope}:${normalizeLabel(input.label)}`
}

// ─── Validation ─────────────────────────────────────────────────────────────

export function validateProposalInput(input: CreateProposalInput): string[] {
  const errors: string[] = []

  // proposal type shape check
  if (input.proposalType === 'node') {
    if (!input.nodeType) errors.push('Node proposal requires nodeType')
    if (input.edgeType) errors.push('Node proposal must not have edgeType')
    if (input.nodeType && !isValidGraphNodeType(input.nodeType)) {
      errors.push(`Invalid node type: "${input.nodeType}"`)
    }
  } else if (input.proposalType === 'edge') {
    if (!input.edgeType) errors.push('Edge proposal requires edgeType')
    if (input.nodeType) errors.push('Edge proposal must not have nodeType')
    if (input.edgeType && !isValidGraphEdgeType(input.edgeType)) {
      errors.push(`Invalid edge type: "${input.edgeType}"`)
    }
  } else {
    errors.push(`Invalid proposal type: "${input.proposalType}"`)
  }

  if (!isValidGraphAuthorityStatus(input.authorityStatus)) {
    errors.push(`Invalid authority status: "${input.authorityStatus}"`)
  }
  if (!isValidGraphPresenceScope(input.presenceScope)) {
    errors.push(`Invalid presence scope: "${input.presenceScope}"`)
  }
  if (!isValidGraphSourceType(input.primarySourceType)) {
    errors.push(`Invalid primary source type: "${input.primarySourceType}"`)
  }

  if (input.confidence < 0 || input.confidence > 1) {
    errors.push(`Confidence must be 0–1, got ${input.confidence}`)
  }
  if (input.salience < 0 || input.salience > 1) {
    errors.push(`Salience must be 0–1, got ${input.salience}`)
  }

  if (!input.label || input.label.trim().length === 0) {
    errors.push('Label is required')
  }
  if (!input.reason || input.reason.trim().length === 0) {
    errors.push('Reason is required')
  }
  if (!input.primarySourceId || input.primarySourceId.trim().length === 0) {
    errors.push('Primary source ID is required')
  }

  return errors
}

// ─── Create Proposal ────────────────────────────────────────────────────────

export async function createProposal(
  input: CreateProposalInput
): Promise<CreateProposalResult> {
  // 1. Validate
  const errors = validateProposalInput(input)
  if (errors.length > 0) {
    return { ok: false, error: errors.join('; '), code: 'validation_failed' }
  }

  // 2. Force prompt_eligible = false (37B law)
  const promptEligible = false

  // 3. Derive dedupe key
  const payload = input.payload as Record<string, unknown>
  const fromLabel = (payload?.from as Record<string, unknown>)?.label as string | undefined
  const toLabel = (payload?.to as Record<string, unknown>)?.label as string | undefined

  const dedupeKey = generateDedupeKey({
    proposalType: input.proposalType,
    sourceType: input.primarySourceType,
    sourceId: input.primarySourceId,
    presenceScope: input.presenceScope,
    label: input.label,
    edgeType: input.edgeType,
    fromLabel,
    toLabel,
  })

  // 4. Insert proposal
  const { data: proposal, error: proposalErr } = await supabase
    .from('graph_proposals')
    .insert({
      proposal_type: input.proposalType,
      status: 'pending_review',
      presence_scope: input.presenceScope,
      authority_status: input.authorityStatus,
      node_type: input.nodeType ?? null,
      edge_type: input.edgeType ?? null,
      proposed_label: input.label.trim(),
      proposed_summary: input.summary.trim() || null,
      proposed_payload: input.payload,
      confidence: Math.max(0, Math.min(1, input.confidence)),
      salience: Math.max(0, Math.min(1, input.salience)),
      reason: input.reason.trim(),
      safe_wording: input.safeWording?.trim() ?? null,
      prompt_eligible: promptEligible,
      primary_source_type: input.primarySourceType,
      primary_source_id: input.primarySourceId,
      dedupe_key: dedupeKey,
      proposed_by: 'graph_pipeline',
      generation_model: input.generationModel ?? null,
      generation_version: '37B',
    })
    .select('id')
    .single()

  if (proposalErr) {
    // Dedupe unique index violation — treat as skip, not error
    if (proposalErr.code === '23505' && proposalErr.message?.includes('dedupe')) {
      return { ok: false, error: 'Duplicate pending proposal', code: 'duplicate_pending' }
    }
    return { ok: false, error: `Proposal insert failed: ${proposalErr.message}`, code: 'db_error' }
  }

  const proposalId = proposal.id

  // 5. Insert source record
  const { error: sourceErr } = await supabase
    .from('graph_proposal_sources')
    .insert({
      proposal_id: proposalId,
      source_type: input.sourceRecord.sourceType,
      source_table: input.sourceRecord.sourceTable ?? null,
      source_id: input.sourceRecord.sourceId,
      source_label: input.sourceRecord.sourceLabel ?? null,
      source_excerpt: input.sourceRecord.sourceExcerpt ?? null,
      source_metadata: input.sourceRecord.sourceMetadata ?? {},
    })

  if (sourceErr) {
    // Source failed — log but proposal exists. Future: consider cleanup.
    console.error('[graph-proposals] Source insert failed for proposal', proposalId, sourceErr.message)
  }

  // 6. Insert creation event
  const { error: eventErr } = await supabase
    .from('graph_proposal_events')
    .insert({
      proposal_id: proposalId,
      event_type: 'proposal_created',
      previous_status: null,
      new_status: 'pending_review',
      actor: 'graph_pipeline',
      reason: input.reason.trim(),
      metadata: {
        source_type: input.primarySourceType,
        source_id: input.primarySourceId,
        generation_model: input.generationModel ?? null,
      },
    })

  if (eventErr) {
    console.error('[graph-proposals] Event insert failed for proposal', proposalId, eventErr.message)
  }

  return { ok: true, proposalId }
}

// ─── Query Proposals ────────────────────────────────────────────────────────

export interface ListProposalsInput {
  status?: ProposalStatus
  presenceScope?: GraphPresenceScope
  authorityStatus?: GraphAuthorityStatus
  proposalType?: ProposalType
  sourceType?: GraphSourceType
  search?: string
  limit?: number
  offset?: number
}

export async function listProposals(
  input: ListProposalsInput = {}
): Promise<GraphProposal[]> {
  let query = supabase
    .from('graph_proposals')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (input.status) query = query.eq('status', input.status)
  if (input.presenceScope) query = query.eq('presence_scope', input.presenceScope)
  if (input.authorityStatus) query = query.eq('authority_status', input.authorityStatus)
  if (input.proposalType) query = query.eq('proposal_type', input.proposalType)
  if (input.sourceType) query = query.eq('primary_source_type', input.sourceType)

  // Simple ilike search over label, summary, reason, safe_wording
  if (input.search && input.search.trim().length > 0) {
    const term = `%${input.search.trim()}%`
    query = query.or(
      `proposed_label.ilike.${term},proposed_summary.ilike.${term},reason.ilike.${term},safe_wording.ilike.${term}`
    )
  }

  const limit = input.limit ?? 50
  const offset = input.offset ?? 0
  query = query.range(offset, offset + limit - 1)

  const { data, error } = await query

  if (error) {
    console.error('[graph-proposals] List failed:', error.message)
    return []
  }

  return (data ?? []) as GraphProposal[]
}

export async function getProposal(id: string): Promise<GraphProposal | null> {
  const { data, error } = await supabase
    .from('graph_proposals')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error || !data) return null
  return data as GraphProposal
}

export async function getProposalSources(proposalId: string): Promise<GraphProposalSource[]> {
  const { data } = await supabase
    .from('graph_proposal_sources')
    .select('*')
    .eq('proposal_id', proposalId)
    .order('created_at', { ascending: true })

  return (data ?? []) as GraphProposalSource[]
}
