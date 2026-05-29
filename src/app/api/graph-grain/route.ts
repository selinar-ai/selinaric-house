// Phase 37F — Graph Grain Helper API
//
// GET  /api/graph-grain — preview high-level entity candidates
// POST /api/graph-grain — create pending proposals from selected candidates
//
// The graph is not a list of memories.
// The graph is a high-level relationship map supported by memories.
// Archive entries provide provenance, not automatic nodes.
// Detail belongs in drilldown, not the default map.
//
// All proposals start as pending_review with prompt_eligible = false.
// Approval remains in Ontology Lab.
// No Memory creation, no Archive authority changes, no prompt injection.
//
// Writes only to: graph_proposals, graph_proposal_sources, graph_proposal_events.

import { NextResponse } from 'next/server'
import { previewGrainCandidates, createGrainProposals, type GrainCandidate } from '@/lib/graph/grainHelper'

// ─── GET /api/graph-grain ─────────────────────────────────────────────────

export async function GET() {
  try {
    const preview = await previewGrainCandidates()
    return NextResponse.json(preview)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[graph-grain] Preview error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── POST /api/graph-grain ────────────────────────────────────────────────

export async function POST(request: Request) {
  let body: { candidates?: GrainCandidate[] }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { candidates } = body

  if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
    return NextResponse.json(
      { error: 'candidates must be a non-empty array' },
      { status: 400 }
    )
  }

  if (candidates.length > 10) {
    return NextResponse.json(
      { error: `Maximum 10 candidates per request. ${candidates.length} provided.` },
      { status: 400 }
    )
  }

  try {
    const result = await createGrainProposals(candidates)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[graph-grain] Create error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
