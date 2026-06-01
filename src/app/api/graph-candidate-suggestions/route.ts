// Phase 37H.2 — Graph-Assisted Candidate Suggestion API
//
// POST: Create a manual graph-assisted candidate suggestion.
// GET:  List suggestions with optional filters.
//
// Writes ONLY to graph_candidate_suggestions + graph_candidate_suggestion_events.
// Does not write to archive_items, held_truths, graph_proposals, or any other table.
// prompt_eligible is always false. status is always pending_review on creation.

import { NextRequest, NextResponse } from 'next/server'
import {
  createCandidateSuggestion,
  listCandidateSuggestions,
} from '@/lib/graph/candidateSuggestionService'
import { isValidCandidateType, isValidEvidenceStrength } from '@/lib/graph/candidateSuggestionTypes'

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    candidate_type,
    proposed_label,
    proposed_summary,
    proposed_truth_text,
    target_presence_id,
    target_archive_item_id,
    supporting_graph_node_ids,
    supporting_graph_edge_ids,
    supporting_proposal_ids,
    supporting_archive_sources,
    evidence_strength,
    reason_for_candidate,
    limits_or_uncertainties,
    governance_context,
  } = body

  if (!candidate_type || typeof candidate_type !== 'string' || !isValidCandidateType(candidate_type)) {
    return NextResponse.json({ error: 'Invalid or missing candidate_type' }, { status: 400 })
  }

  if (!proposed_label || typeof proposed_label !== 'string' || !proposed_label.trim()) {
    return NextResponse.json({ error: 'proposed_label is required' }, { status: 400 })
  }

  if (!reason_for_candidate || typeof reason_for_candidate !== 'string' || !(reason_for_candidate as string).trim()) {
    return NextResponse.json({ error: 'reason_for_candidate is required' }, { status: 400 })
  }

  if (!evidence_strength || typeof evidence_strength !== 'string' || !isValidEvidenceStrength(evidence_strength)) {
    return NextResponse.json({ error: 'Invalid or missing evidence_strength' }, { status: 400 })
  }

  if (supporting_archive_sources !== undefined && !Array.isArray(supporting_archive_sources)) {
    return NextResponse.json({ error: 'supporting_archive_sources must be an array' }, { status: 400 })
  }

  if (governance_context !== undefined && (typeof governance_context !== 'object' || Array.isArray(governance_context) || governance_context === null)) {
    return NextResponse.json({ error: 'governance_context must be a JSON object' }, { status: 400 })
  }

  const result = await createCandidateSuggestion({
    candidate_type,
    proposed_label: (proposed_label as string).trim(),
    proposed_summary: typeof proposed_summary === 'string' ? proposed_summary.trim() || null : null,
    proposed_truth_text: typeof proposed_truth_text === 'string' ? proposed_truth_text.trim() || null : null,
    target_presence_id: typeof target_presence_id === 'string' ? target_presence_id : null,
    target_archive_item_id: typeof target_archive_item_id === 'string' ? target_archive_item_id : null,
    supporting_graph_node_ids: Array.isArray(supporting_graph_node_ids) ? supporting_graph_node_ids : [],
    supporting_graph_edge_ids: Array.isArray(supporting_graph_edge_ids) ? supporting_graph_edge_ids : [],
    supporting_proposal_ids: Array.isArray(supporting_proposal_ids) ? supporting_proposal_ids : [],
    supporting_archive_sources: Array.isArray(supporting_archive_sources)
      ? supporting_archive_sources.map((s: Record<string, unknown>) => ({
          archive_item_id: String(s.archive_item_id ?? ''),
          evidence_role: String(s.evidence_role ?? 'archive_provenance'),
          used_for_weighting: Boolean(s.used_for_weighting),
        }))
      : [],
    evidence_strength,
    reason_for_candidate: (reason_for_candidate as string).trim(),
    limits_or_uncertainties: typeof limits_or_uncertainties === 'string' ? limits_or_uncertainties.trim() || null : null,
    governance_context: (governance_context as Record<string, unknown>) ?? undefined,
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, errors: result.errors },
      { status: 400 }
    )
  }

  return NextResponse.json({ success: true, suggestion: result.suggestion })
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const status = url.searchParams.get('status') ?? undefined
  const candidate_type = url.searchParams.get('candidate_type') ?? undefined
  const limitStr = url.searchParams.get('limit')
  const limit = limitStr ? parseInt(limitStr, 10) : undefined

  const result = await listCandidateSuggestions({ status, candidate_type, limit })

  return NextResponse.json(result)
}
