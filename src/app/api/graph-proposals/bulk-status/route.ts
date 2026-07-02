// Phase 37C — Bulk Proposal Status Update API
//
// POST /api/graph-proposals/bulk-status
//
// Updates multiple graph proposals' review status in a single operation.
// Does not create Memory. Does not create final graph items.
// Does not modify prompt_eligible. Actor is always 'tara'.
// Invalid transitions are skipped, not failed.

import { NextRequest, NextResponse } from 'next/server'
import { bulkUpdateProposalStatus } from '@/lib/graph/proposalReview'
import { GRAPH_REVIEW_STATUSES } from '@/lib/graph/types'

export async function POST(request: NextRequest) {
  let body: { proposalIds?: string[]; status?: string; reason?: string }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { proposalIds, status, reason } = body

  // Validate proposalIds
  if (!proposalIds || !Array.isArray(proposalIds) || proposalIds.length === 0) {
    return NextResponse.json(
      { error: 'proposalIds must be a non-empty array' },
      { status: 400 }
    )
  }

  if (proposalIds.length > 100) {
    return NextResponse.json(
      { error: `Maximum 100 proposals per bulk action. ${proposalIds.length} provided.` },
      { status: 400 }
    )
  }

  // Validate all IDs are strings
  if (!proposalIds.every(id => typeof id === 'string' && id.trim().length > 0)) {
    return NextResponse.json(
      { error: 'All proposalIds must be non-empty strings' },
      { status: 400 }
    )
  }

  // Validate status
  if (!status || typeof status !== 'string') {
    return NextResponse.json({ error: 'status is required' }, { status: 400 })
  }

  if (!(GRAPH_REVIEW_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json(
      { error: `Invalid status: "${status}". Allowed: ${GRAPH_REVIEW_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  if (status === 'unreviewed') {
    return NextResponse.json(
      { error: 'Cannot set status to "unreviewed"' },
      { status: 400 }
    )
  }

  const result = await bulkUpdateProposalStatus({
    proposalIds,
    newStatus: status,
    reason,
  })

  return NextResponse.json(result)
}
