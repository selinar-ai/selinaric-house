// Phase 37H.2 — Graph-Assisted Candidate Suggestion Service
//
// Graph assistance is evidence support, not Memory authority.
// A graph-supported suggestion is still only a suggestion.
// prompt_eligible is always false on suggestions.
//
// This service writes ONLY to:
//   graph_candidate_suggestions
//   graph_candidate_suggestion_events
//
// It NEVER writes to:
//   archive_items, archive_memory_events, held_truths,
//   memory_injection_events, graph_proposals, graph_proposal_sources,
//   graph_proposal_events, archive_graph_nodes, archive_graph_edges

import { supabase } from '@/lib/supabase'
import {
  validateCandidateSuggestion,
  validateEvidenceRoleConsistency,
  validateCircularEvidence,
  type CandidateSuggestionInput,
} from './candidateSuggestionValidation'
import type {
  CandidateType,
  SuggestionStatus,
  EvidenceRole,
  EvidenceStrength,
  SupportingArchiveSource,
  GraphCandidateSuggestion,
  GraphCandidateSuggestionEvent,
} from './candidateSuggestionTypes'

// ─── Input Types ───────────────────────────────────────────────────────────

export interface CreateSuggestionInput {
  candidate_type: string
  proposed_label: string
  proposed_summary?: string | null
  proposed_truth_text?: string | null
  target_presence_id?: string | null
  target_archive_item_id?: string | null
  supporting_graph_node_ids?: string[]
  supporting_graph_edge_ids?: string[]
  supporting_proposal_ids?: string[]
  supporting_archive_sources?: Array<{
    archive_item_id: string
    evidence_role: string
    used_for_weighting: boolean
  }>
  evidence_strength: string
  reason_for_candidate: string
  limits_or_uncertainties?: string | null
  governance_context?: Record<string, unknown>
}

export type CreateSuggestionResult =
  | { ok: true; suggestion: GraphCandidateSuggestion }
  | { ok: false; error: string; errors?: string[] }

export type ListSuggestionsResult = {
  suggestions: GraphCandidateSuggestion[]
  total: number
}

export type DismissResult =
  | { ok: true; suggestion: GraphCandidateSuggestion }
  | { ok: false; error: string }

// ─── Create ────────────────────────────────────────────────────────────────

export async function createCandidateSuggestion(
  input: CreateSuggestionInput
): Promise<CreateSuggestionResult> {
  // 1. Verify and snapshot supporting archive sources
  const archiveSources: SupportingArchiveSource[] = []
  if (input.supporting_archive_sources && input.supporting_archive_sources.length > 0) {
    for (const src of input.supporting_archive_sources) {
      const { data: item, error: fetchErr } = await supabase
        .from('archive_items')
        .select('id, canonical_status, deleted_at')
        .eq('id', src.archive_item_id)
        .single()

      if (fetchErr || !item) {
        return { ok: false, error: `Archive item not found: ${src.archive_item_id}` }
      }
      if (item.deleted_at) {
        return { ok: false, error: `Archive item is deleted: ${src.archive_item_id}` }
      }

      // Server derives canonical_status_snapshot — client value ignored
      const snapshot = item.canonical_status as string

      // Derive correct evidence_role based on snapshot
      let evidenceRole: EvidenceRole = 'archive_provenance'
      if (snapshot === 'canonical') {
        if (src.evidence_role === 'confirmed_memory_evidence' || src.evidence_role === 'archive_provenance') {
          evidenceRole = src.evidence_role as EvidenceRole
        } else {
          evidenceRole = 'confirmed_memory_evidence'
        }
      } else if (snapshot === 'canonical_candidate') {
        evidenceRole = 'candidate_context'
      }

      archiveSources.push({
        archive_item_id: src.archive_item_id,
        canonical_status_snapshot: snapshot as SupportingArchiveSource['canonical_status_snapshot'],
        evidence_role: evidenceRole,
        used_for_weighting: src.used_for_weighting,
      })
    }
  }

  // 2. Verify supporting graph nodes (legacy archive_graph_nodes)
  const verifiedNodeIds: string[] = []
  const graphNodeSourceItemIds: Record<string, string[]> = {}
  if (input.supporting_graph_node_ids && input.supporting_graph_node_ids.length > 0) {
    for (const nodeId of input.supporting_graph_node_ids) {
      const { data: node, error: nErr } = await supabase
        .from('archive_graph_nodes')
        .select('id, approval_status, source_item_ids')
        .eq('id', nodeId)
        .single()

      if (nErr || !node) {
        return { ok: false, error: `Legacy graph node not found: ${nodeId}` }
      }
      if (node.approval_status !== 'approved') {
        return { ok: false, error: `Legacy graph node is not approved: ${nodeId} (status: ${node.approval_status})` }
      }
      verifiedNodeIds.push(nodeId)
      graphNodeSourceItemIds[nodeId] = (node.source_item_ids || []) as string[]
    }
  }

  // 3. Verify supporting graph edges (legacy archive_graph_edges)
  const verifiedEdgeIds: string[] = []
  if (input.supporting_graph_edge_ids && input.supporting_graph_edge_ids.length > 0) {
    for (const edgeId of input.supporting_graph_edge_ids) {
      const { data: edge, error: eErr } = await supabase
        .from('archive_graph_edges')
        .select('id, approval_status')
        .eq('id', edgeId)
        .single()

      if (eErr || !edge) {
        return { ok: false, error: `Legacy graph edge not found: ${edgeId}` }
      }
      if (edge.approval_status !== 'approved') {
        return { ok: false, error: `Legacy graph edge is not approved: ${edgeId} (status: ${edge.approval_status})` }
      }
      verifiedEdgeIds.push(edgeId)
    }
  }

  // 4. Verify supporting proposals (graph_proposals)
  const verifiedProposalIds: string[] = []
  if (input.supporting_proposal_ids && input.supporting_proposal_ids.length > 0) {
    for (const propId of input.supporting_proposal_ids) {
      const { data: prop, error: pErr } = await supabase
        .from('graph_proposals')
        .select('id, status')
        .eq('id', propId)
        .single()

      if (pErr || !prop) {
        return { ok: false, error: `Graph proposal not found: ${propId}` }
      }
      if (prop.status !== 'approved_graph') {
        return { ok: false, error: `Graph proposal is not approved_graph: ${propId} (status: ${prop.status})` }
      }
      verifiedProposalIds.push(propId)
    }
  }

  // 5. Snapshot canonical_status_before for target archive item
  let canonicalStatusBefore: string | null = null
  if (input.target_archive_item_id) {
    const { data: target, error: tErr } = await supabase
      .from('archive_items')
      .select('id, canonical_status, deleted_at')
      .eq('id', input.target_archive_item_id)
      .single()

    if (tErr || !target) {
      return { ok: false, error: `Target archive item not found: ${input.target_archive_item_id}` }
    }
    if (target.deleted_at) {
      return { ok: false, error: `Target archive item is deleted: ${input.target_archive_item_id}` }
    }
    canonicalStatusBefore = target.canonical_status
  }

  // 6. Compute deduplicated_evidence_sources
  const allArchiveIds = new Set<string>()
  for (const src of archiveSources) {
    allArchiveIds.add(src.archive_item_id)
  }
  for (const sourceIds of Object.values(graphNodeSourceItemIds)) {
    for (const sid of sourceIds) {
      allArchiveIds.add(sid)
    }
  }
  const deduplicatedEvidenceSources = Array.from(allArchiveIds)

  // 7. Validate with 37H.1 contract
  const validationInput: CandidateSuggestionInput = {
    candidate_type: input.candidate_type,
    status: 'pending_review',
    prompt_eligible: false,
    proposed_label: input.proposed_label,
    proposed_summary: input.proposed_summary,
    proposed_truth_text: input.proposed_truth_text,
    target_presence_id: input.target_presence_id,
    target_archive_item_id: input.target_archive_item_id,
    supporting_graph_node_ids: verifiedNodeIds,
    supporting_graph_edge_ids: verifiedEdgeIds,
    supporting_proposal_ids: verifiedProposalIds,
    supporting_archive_sources: archiveSources,
    deduplicated_evidence_sources: deduplicatedEvidenceSources,
    evidence_strength: input.evidence_strength,
    reason_for_candidate: input.reason_for_candidate,
    limits_or_uncertainties: input.limits_or_uncertainties,
  }

  const validation = validateCandidateSuggestion(validationInput)
  if (!validation.valid) {
    return { ok: false, error: 'Validation failed', errors: validation.errors }
  }

  // 8. Check circular evidence
  const circular = validateCircularEvidence({
    supporting_archive_sources: archiveSources,
    supporting_graph_node_ids: verifiedNodeIds,
    graphNodeSourceItemIds,
  })
  if (circular.hasCircularEvidence) {
    return {
      ok: false,
      error: `Circular evidence detected: archive item(s) ${circular.overlappingArchiveIds.join(', ')} appear as both direct weighted evidence and as source(s) of supporting graph nodes. Set used_for_weighting to false for overlapping direct sources, or remove the graph node.`,
      errors: circular.warnings,
    }
  }

  // 9. Insert — server-owned fields enforced
  const row = {
    candidate_type: input.candidate_type,
    status: 'pending_review',
    proposed_label: input.proposed_label,
    proposed_summary: input.proposed_summary ?? null,
    proposed_truth_text: input.candidate_type === 'held_truth_candidate' ? input.proposed_truth_text : null,
    target_presence_id: input.candidate_type === 'held_truth_candidate' ? input.target_presence_id : null,
    target_archive_item_id: input.candidate_type === 'memory_candidate' ? input.target_archive_item_id : null,
    supporting_graph_node_ids: verifiedNodeIds,
    supporting_graph_edge_ids: verifiedEdgeIds,
    supporting_proposal_ids: verifiedProposalIds,
    supporting_archive_sources: archiveSources,
    deduplicated_evidence_sources: deduplicatedEvidenceSources,
    evidence_strength: input.evidence_strength,
    reason_for_candidate: input.reason_for_candidate,
    limits_or_uncertainties: input.limits_or_uncertainties ?? null,
    governance_context: input.governance_context ?? {},
    prompt_eligible: false,
    canonical_status_before: canonicalStatusBefore,
    created_by: 'tara',
    reviewed_by: null,
    reviewed_at: null,
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('graph_candidate_suggestions')
    .insert(row)
    .select()
    .single()

  if (insertErr || !inserted) {
    console.error('[37H.2] Insert error:', insertErr?.message)
    return { ok: false, error: insertErr?.message ?? 'Failed to create suggestion' }
  }

  // 10. Insert creation event
  await supabase.from('graph_candidate_suggestion_events').insert({
    suggestion_id: inserted.id,
    event_type: 'suggestion_created',
    previous_status: null,
    new_status: 'pending_review',
    actor: 'tara',
    reason: input.reason_for_candidate,
    metadata: {},
  })

  return { ok: true, suggestion: inserted as GraphCandidateSuggestion }
}

// ─── List ──────────────────────────────────────────────────────────────────

export async function listCandidateSuggestions(params: {
  status?: string
  candidate_type?: string
  limit?: number
}): Promise<ListSuggestionsResult> {
  const limit = Math.min(params.limit ?? 50, 100)

  let query = supabase
    .from('graph_candidate_suggestions')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (params.status) {
    query = query.eq('status', params.status)
  } else {
    query = query.eq('status', 'pending_review')
  }

  if (params.candidate_type) {
    query = query.eq('candidate_type', params.candidate_type)
  }

  const { data, count, error } = await query

  if (error) {
    console.error('[37H.2] List error:', error.message)
    return { suggestions: [], total: 0 }
  }

  return {
    suggestions: (data ?? []) as GraphCandidateSuggestion[],
    total: count ?? 0,
  }
}

// ─── Dismiss ───────────────────────────────────────────────────────────────

export async function dismissCandidateSuggestion(
  id: string,
  reason?: string
): Promise<DismissResult> {
  const { data: existing, error: fetchErr } = await supabase
    .from('graph_candidate_suggestions')
    .select('id, status')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (fetchErr || !existing) {
    return { ok: false, error: 'Suggestion not found' }
  }

  if (existing.status !== 'pending_review') {
    return { ok: false, error: `Cannot dismiss suggestion with status "${existing.status}". Only pending_review suggestions can be dismissed.` }
  }

  const now = new Date().toISOString()

  const { data: updated, error: updateErr } = await supabase
    .from('graph_candidate_suggestions')
    .update({
      status: 'dismissed',
      reviewed_by: 'tara',
      reviewed_at: now,
      updated_at: now,
    })
    .eq('id', id)
    .select()
    .single()

  if (updateErr || !updated) {
    return { ok: false, error: updateErr?.message ?? 'Failed to dismiss suggestion' }
  }

  await supabase.from('graph_candidate_suggestion_events').insert({
    suggestion_id: id,
    event_type: 'dismissed',
    previous_status: 'pending_review',
    new_status: 'dismissed',
    actor: 'tara',
    reason: reason ?? null,
    metadata: {},
  })

  return { ok: true, suggestion: updated as GraphCandidateSuggestion }
}
