// Phase 37D — Relational Map API
//
// GET /api/relational-map — read-only graph data from approved proposals
//
// No POST, PATCH, or DELETE. No database writes. No Memory authority.
// The graph may reveal relationship. The graph does not crown truth.

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { buildRelationalMap } from '@/lib/graph/buildRelationalMap'
import type { GraphProposal, GraphProposalSource } from '@/lib/graph/proposals'
import type {
  GraphMapProposalSummary,
  GraphMapSourceSummary,
  GraphMapAuditEvent,
  RelationalMapResponse,
} from '@/lib/graph/relationalMapTypes'

// ─── GET /api/relational-map ──────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const url = request.nextUrl

  // Parse filter params
  const nodeType = url.searchParams.get('node_type') || undefined
  const edgeType = url.searchParams.get('edge_type') || undefined
  const presenceScope = url.searchParams.get('presence_scope') || undefined
  const authorityStatus = url.searchParams.get('authority_status') || undefined
  const sourceType = url.searchParams.get('source_type') || undefined
  const search = url.searchParams.get('search') || undefined
  const limitParam = url.searchParams.get('limit')
  const limit = limitParam ? Math.min(500, Math.max(1, parseInt(limitParam, 10) || 500)) : 500

  // 1. Fetch approved proposals (read-only)
  let proposalQuery = supabase
    .from('graph_proposals')
    .select('*')
    .eq('status', 'approved_graph')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (nodeType) proposalQuery = proposalQuery.eq('node_type', nodeType)
  if (edgeType) proposalQuery = proposalQuery.eq('edge_type', edgeType)
  if (presenceScope) proposalQuery = proposalQuery.eq('presence_scope', presenceScope)
  if (authorityStatus) proposalQuery = proposalQuery.eq('authority_status', authorityStatus)
  if (sourceType) proposalQuery = proposalQuery.eq('primary_source_type', sourceType)

  if (search && search.trim().length > 0) {
    const term = `%${search.trim()}%`
    proposalQuery = proposalQuery.or(
      `proposed_label.ilike.${term},proposed_summary.ilike.${term},reason.ilike.${term},safe_wording.ilike.${term}`
    )
  }

  const { data: proposals, error: proposalErr } = await proposalQuery

  if (proposalErr) {
    return NextResponse.json(
      { error: `Failed to fetch proposals: ${proposalErr.message}` },
      { status: 500 }
    )
  }

  const typedProposals = (proposals ?? []) as GraphProposal[]

  if (typedProposals.length === 0) {
    const emptyResponse: RelationalMapResponse = {
      nodes: [],
      edges: [],
      proposals: [],
      sources: [],
      auditEvents: [],
      diagnostics: { skippedProposals: 0, warnings: [] },
    }
    return NextResponse.json(emptyResponse)
  }

  const proposalIds = typedProposals.map(p => p.id)

  // 2. Fetch sources for these proposals (read-only)
  const { data: sources } = await supabase
    .from('graph_proposal_sources')
    .select('*')
    .in('proposal_id', proposalIds)
    .order('created_at', { ascending: true })

  const typedSources = (sources ?? []) as GraphProposalSource[]

  // 3. Fetch audit events for these proposals (read-only)
  const { data: events } = await supabase
    .from('graph_proposal_events')
    .select('*')
    .in('proposal_id', proposalIds)
    .order('created_at', { ascending: true })

  const typedEvents = (events ?? []) as Array<{
    proposal_id: string
    event_type: string
    previous_status: string | null
    new_status: string | null
    actor: string
    reason: string | null
    created_at: string
  }>

  // 4. Build runtime graph (pure transform, no writes)
  const { nodes, edges, diagnostics } = buildRelationalMap({
    proposals: typedProposals,
    sources: typedSources,
    events: typedEvents,
  })

  // 5. Build proposal summaries
  const proposalSummaries: GraphMapProposalSummary[] = typedProposals.map(p => ({
    id: p.id,
    proposalType: p.proposal_type,
    status: p.status,
    proposedLabel: p.proposed_label,
    proposedSummary: p.proposed_summary,
    proposedPayload: p.proposed_payload,
    reason: p.reason,
    safeWording: p.safe_wording,
    confidence: p.confidence,
    salience: p.salience,
    promptEligible: p.prompt_eligible,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }))

  // 6. Build source summaries
  const sourceSummaries: GraphMapSourceSummary[] = typedSources.map(s => ({
    proposalId: s.proposal_id,
    sourceType: s.source_type,
    sourceTable: s.source_table,
    sourceId: s.source_id,
    sourceLabel: s.source_label,
    sourceExcerpt: s.source_excerpt,
    sourceMetadata: s.source_metadata,
  }))

  // 7. Build audit event summaries
  const auditEvents: GraphMapAuditEvent[] = typedEvents.map(e => ({
    proposalId: e.proposal_id,
    eventType: e.event_type,
    previousStatus: e.previous_status,
    newStatus: e.new_status,
    actor: e.actor,
    reason: e.reason,
    createdAt: e.created_at,
  }))

  const response: RelationalMapResponse = {
    nodes,
    edges,
    proposals: proposalSummaries,
    sources: sourceSummaries,
    auditEvents,
    diagnostics,
  }

  return NextResponse.json(response)
}
