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
  HydratedGraphCandidateSuggestion,
  HydratedTargetArchiveItem,
  HydratedArchiveSource,
  HydratedProposal,
  HydratedLegacyNode,
  HydratedLegacyEdge,
  HydratedDeduplicatedSource,
  HydrationWarning,
} from './candidateSuggestionTypes'
import {
  evidenceRoleLabel,
  evidenceRoleExplanation,
  weightingExplanation,
  makeStatusDriftWarning,
  makeTargetStatusDriftWarning,
  makeMissingEvidenceWarning,
  STANDING_WARNINGS,
} from './candidateSuggestionDisplay'

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
        .select('id, canonical_status, deleted_at, eligible_for_graph')
        .eq('id', src.archive_item_id)
        .single()

      if (fetchErr || !item) {
        return { ok: false, error: `Archive item not found: ${src.archive_item_id}` }
      }
      if (item.deleted_at) {
        return { ok: false, error: `Archive item is deleted: ${src.archive_item_id}` }
      }
      // Gate A-R wiring: ontology intake is flag-gated with no side door — a supporting
      // archive source must be explicitly marked graph-eligible by Tara first
      if (item.eligible_for_graph !== true) {
        return { ok: false, error: `Archive item is not graph-eligible (eligible_for_graph=false): ${src.archive_item_id} — mark it eligible before using it as an ontology source` }
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
      .select('id, canonical_status, deleted_at, eligible_for_graph')
      .eq('id', input.target_archive_item_id)
      .single()

    if (tErr || !target) {
      return { ok: false, error: `Target archive item not found: ${input.target_archive_item_id}` }
    }
    if (target.deleted_at) {
      return { ok: false, error: `Target archive item is deleted: ${input.target_archive_item_id}` }
    }
    // Gate A-R wiring: the target item must be explicitly graph-eligible — no side door
    if (target.eligible_for_graph !== true) {
      return { ok: false, error: `Target archive item is not graph-eligible (eligible_for_graph=false): ${input.target_archive_item_id} — mark it eligible before proposing it into the ontology layer` }
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

  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status)
  }
  // When status is absent or 'all', return all non-deleted suggestions (no status filter)

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

// ─── Hydrate (Phase 37H.3 — read-only) ────────────────────────────────────
// Resolves evidence IDs into human-readable titles, statuses, and labels.
// No writes. Missing evidence produces warnings, not failures.

export async function hydrateCandidateSuggestion(
  id: string
): Promise<HydratedGraphCandidateSuggestion | null> {
  // 1. Fetch suggestion
  const { data: row, error: rowErr } = await supabase
    .from('graph_candidate_suggestions')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (rowErr || !row) return null
  const suggestion = row as GraphCandidateSuggestion
  const warnings: HydrationWarning[] = [...STANDING_WARNINGS]

  if (suggestion.governance_context && Object.keys(suggestion.governance_context).length > 0) {
    warnings.push({ code: 'governance_context_only', message: 'Governance context is informational only — not evidence.', severity: 'info' })
  }

  // 2. Fetch events
  const { data: evtRows } = await supabase
    .from('graph_candidate_suggestion_events')
    .select('*')
    .eq('suggestion_id', id)
    .order('created_at', { ascending: true })
  const events = (evtRows ?? []) as GraphCandidateSuggestionEvent[]

  // 3. Resolve target archive item
  let targetArchiveItem: HydratedTargetArchiveItem | null = null
  if (suggestion.target_archive_item_id) {
    const { data: ai } = await supabase
      .from('archive_items')
      .select('id, title, canonical_status, deleted_at')
      .eq('id', suggestion.target_archive_item_id)
      .single()

    if (ai && !ai.deleted_at) {
      const changed = suggestion.canonical_status_before !== null &&
        ai.canonical_status !== suggestion.canonical_status_before
      targetArchiveItem = {
        id: ai.id,
        title: ai.title,
        currentCanonicalStatus: ai.canonical_status,
        statusAtSuggestion: suggestion.canonical_status_before,
        statusChanged: changed,
        missing: false,
      }
      if (changed) {
        warnings.push(makeTargetStatusDriftWarning(
          suggestion.canonical_status_before!,
          ai.canonical_status
        ))
      }
    } else {
      targetArchiveItem = {
        id: suggestion.target_archive_item_id,
        title: '(unavailable)',
        currentCanonicalStatus: null,
        statusAtSuggestion: suggestion.canonical_status_before,
        statusChanged: false,
        missing: true,
      }
      warnings.push(makeMissingEvidenceWarning('archive item', suggestion.target_archive_item_id))
    }
  }

  // 4. Batch-resolve supporting archive sources
  const sourceIds = suggestion.supporting_archive_sources.map(s => s.archive_item_id)
  const archiveMap = new Map<string, { title: string; canonical_status: string }>()
  if (sourceIds.length > 0) {
    const { data: items } = await supabase
      .from('archive_items')
      .select('id, title, canonical_status, deleted_at')
      .in('id', sourceIds)
    for (const item of (items ?? [])) {
      if (!item.deleted_at) {
        archiveMap.set(item.id, { title: item.title, canonical_status: item.canonical_status })
      }
    }
  }

  const hydratedArchiveSources: HydratedArchiveSource[] = suggestion.supporting_archive_sources.map(src => {
    const found = archiveMap.get(src.archive_item_id)
    const missing = !found
    const currentStatus = found?.canonical_status ?? null
    const changed = !missing && currentStatus !== src.canonical_status_snapshot

    if (missing) {
      warnings.push(makeMissingEvidenceWarning('archive source', src.archive_item_id))
    } else if (changed) {
      warnings.push(makeStatusDriftWarning(
        found!.title,
        src.canonical_status_snapshot,
        currentStatus
      ))
    }

    return {
      archiveItemId: src.archive_item_id,
      title: found?.title ?? '(unavailable)',
      canonicalStatusSnapshot: src.canonical_status_snapshot,
      currentCanonicalStatus: currentStatus,
      statusChanged: changed,
      evidenceRole: src.evidence_role,
      evidenceRoleLabel: evidenceRoleLabel(src.evidence_role),
      evidenceRoleExplanation: evidenceRoleExplanation(src.evidence_role),
      usedForWeighting: src.used_for_weighting,
      weightingExplanation: weightingExplanation(src.used_for_weighting),
      missing,
    }
  })

  // 5. Batch-resolve supporting proposals
  const hydratedProposals: HydratedProposal[] = []
  if (suggestion.supporting_proposal_ids.length > 0) {
    const { data: props } = await supabase
      .from('graph_proposals')
      .select('id, proposed_label, proposal_type, node_type, edge_type, status, authority_status, proposed_summary')
      .in('id', suggestion.supporting_proposal_ids)

    const propMap = new Map((props ?? []).map(p => [p.id, p]))

    for (const pid of suggestion.supporting_proposal_ids) {
      const p = propMap.get(pid)
      if (p) {
        hydratedProposals.push({
          proposalId: p.id,
          label: p.proposed_label,
          proposalType: p.proposal_type,
          nodeType: p.node_type,
          edgeType: p.edge_type,
          status: p.status,
          authorityStatus: p.authority_status,
          summary: p.proposed_summary,
          missing: false,
        })
      } else {
        hydratedProposals.push({
          proposalId: pid, label: '(unavailable)', proposalType: 'unknown',
          nodeType: null, edgeType: null, status: 'unknown', authorityStatus: null,
          summary: null, missing: true,
        })
        warnings.push(makeMissingEvidenceWarning('graph proposal', pid))
      }
    }
  }

  // 6. Batch-resolve legacy graph nodes
  const hydratedLegacyNodes: HydratedLegacyNode[] = []
  if (suggestion.supporting_graph_node_ids.length > 0) {
    const { data: nodes } = await supabase
      .from('archive_graph_nodes')
      .select('id, label, node_type, approval_status')
      .in('id', suggestion.supporting_graph_node_ids)

    const nodeMap = new Map((nodes ?? []).map(n => [n.id, n]))

    for (const nid of suggestion.supporting_graph_node_ids) {
      const n = nodeMap.get(nid)
      if (n) {
        hydratedLegacyNodes.push({
          nodeId: n.id, label: n.label, nodeType: n.node_type,
          approvalStatus: n.approval_status, missing: false,
        })
      } else {
        hydratedLegacyNodes.push({
          nodeId: nid, label: '(unavailable)', nodeType: 'unknown',
          approvalStatus: 'unknown', missing: true,
        })
        warnings.push(makeMissingEvidenceWarning('legacy graph node', nid))
      }
    }
  }

  // 7. Batch-resolve legacy graph edges
  const hydratedLegacyEdges: HydratedLegacyEdge[] = []
  if (suggestion.supporting_graph_edge_ids.length > 0) {
    const { data: edges } = await supabase
      .from('archive_graph_edges')
      .select('id, edge_type, description, approval_status')
      .in('id', suggestion.supporting_graph_edge_ids)

    const edgeMap = new Map((edges ?? []).map(e => [e.id, e]))

    for (const eid of suggestion.supporting_graph_edge_ids) {
      const e = edgeMap.get(eid)
      if (e) {
        hydratedLegacyEdges.push({
          edgeId: e.id, edgeType: e.edge_type, description: e.description,
          approvalStatus: e.approval_status, missing: false,
        })
      } else {
        hydratedLegacyEdges.push({
          edgeId: eid, edgeType: 'unknown', description: null,
          approvalStatus: 'unknown', missing: true,
        })
        warnings.push(makeMissingEvidenceWarning('legacy graph edge', eid))
      }
    }
  }

  // 8. Batch-resolve deduplicated evidence sources
  const dedupIds = suggestion.deduplicated_evidence_sources ?? []
  const hydratedDeduplicatedSources: HydratedDeduplicatedSource[] = []
  if (dedupIds.length > 0) {
    // Reuse archiveMap where possible, fetch remaining
    const missingDedupIds = dedupIds.filter(id => !archiveMap.has(id))
    if (missingDedupIds.length > 0) {
      const { data: extra } = await supabase
        .from('archive_items')
        .select('id, title, deleted_at')
        .in('id', missingDedupIds)
      for (const item of (extra ?? [])) {
        if (!item.deleted_at) {
          archiveMap.set(item.id, { title: item.title, canonical_status: '' })
        }
      }
    }

    for (const did of dedupIds) {
      const found = archiveMap.get(did)
      hydratedDeduplicatedSources.push({
        archiveItemId: did,
        title: found?.title ?? '(unavailable)',
        missing: !found,
      })
    }
  }

  return {
    suggestion,
    targetArchiveItem,
    hydratedArchiveSources,
    hydratedProposals,
    hydratedLegacyNodes,
    hydratedLegacyEdges,
    hydratedDeduplicatedSources,
    events,
    warnings,
  }
}
