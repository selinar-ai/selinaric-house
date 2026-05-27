// Phase 37B — Single Graph Proposal API
//
// GET /api/graph-proposals/:id — fetch a single proposal with its sources

import { NextRequest, NextResponse } from 'next/server'
import { getProposal, getProposalSources } from '@/lib/graph/proposals'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Missing proposal ID' }, { status: 400 })
  }

  const proposal = await getProposal(id)
  if (!proposal) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  }

  const sources = await getProposalSources(id)

  return NextResponse.json({ proposal, sources })
}
