// Phase 37C — Single Proposal Status Update API
//
// PATCH /api/graph-proposals/:id/status
//
// Updates a single graph proposal's review status.
// Does not create Memory. Does not create final graph items.
// Does not modify prompt_eligible. Actor is always 'tara'.

import { NextRequest, NextResponse } from 'next/server'
import { updateProposalStatus } from '@/lib/graph/proposalReview'
import { GRAPH_REVIEW_STATUSES } from '@/lib/graph/types'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Missing proposal ID' }, { status: 400 })
  }

  let body: { status?: string; reason?: string }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { status, reason } = body

  if (!status || typeof status !== 'string') {
    return NextResponse.json({ error: 'status is required' }, { status: 400 })
  }

  // Validate against known review statuses
  if (!GRAPH_REVIEW_STATUSES.includes(status as any)) {
    return NextResponse.json(
      { error: `Invalid status: "${status}". Allowed: ${GRAPH_REVIEW_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  // Do not accept 'unreviewed' as a target — it's only for initial state
  if (status === 'unreviewed') {
    return NextResponse.json(
      { error: 'Cannot set status to "unreviewed"' },
      { status: 400 }
    )
  }

  const result = await updateProposalStatus({
    proposalId: id,
    newStatus: status,
    reason: reason,
  })

  if (!result.ok) {
    const httpStatus =
      result.code === 'not_found' ? 404 :
      result.code === 'invalid_transition' ? 422 :
      500

    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: httpStatus }
    )
  }

  return NextResponse.json({ ok: true })
}
