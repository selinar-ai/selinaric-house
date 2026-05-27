// Phase 37B — Graph Proposals API
//
// GET  /api/graph-proposals         — list pending proposals
// POST /api/graph-proposals         — generate proposals from a source record
//
// The graph may reveal relationship. The graph may propose meaning.
// The graph does not crown truth.

import { NextRequest, NextResponse } from 'next/server'
import { listProposals, type ListProposalsInput } from '@/lib/graph/proposals'
import { fetchSourceRecord } from '@/lib/graph/sourceAdapters'
import { generateProposalsFromSource } from '@/lib/graph/proposalGenerator'
import { isValidGraphSourceType, type GraphSourceType } from '@/lib/graph/ontology'

// ─── GET /api/graph-proposals ───────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const input: ListProposalsInput = {}

  const status = url.searchParams.get('status')
  if (status) input.status = status as ListProposalsInput['status']

  const scope = url.searchParams.get('presence_scope')
  if (scope) input.presenceScope = scope as ListProposalsInput['presenceScope']

  const authority = url.searchParams.get('authority_status')
  if (authority) input.authorityStatus = authority as ListProposalsInput['authorityStatus']

  const proposalType = url.searchParams.get('proposal_type')
  if (proposalType) input.proposalType = proposalType as ListProposalsInput['proposalType']

  const sourceType = url.searchParams.get('source_type')
  if (sourceType) input.sourceType = sourceType as ListProposalsInput['sourceType']

  const search = url.searchParams.get('search')
  if (search) input.search = search

  const limit = url.searchParams.get('limit')
  if (limit) input.limit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50))

  const offset = url.searchParams.get('offset')
  if (offset) input.offset = Math.max(0, parseInt(offset, 10) || 0)

  const proposals = await listProposals(input)
  return NextResponse.json({ proposals })
}

// ─── POST /api/graph-proposals ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: { sourceType?: string; sourceId?: string }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  const { sourceType, sourceId } = body

  // Validate inputs
  if (!sourceType || typeof sourceType !== 'string') {
    return NextResponse.json(
      { error: 'sourceType is required' },
      { status: 400 }
    )
  }

  if (!sourceId || typeof sourceId !== 'string') {
    return NextResponse.json(
      { error: 'sourceId is required' },
      { status: 400 }
    )
  }

  if (!isValidGraphSourceType(sourceType)) {
    return NextResponse.json(
      { error: `Unsupported source type: "${sourceType}"` },
      { status: 400 }
    )
  }

  // Fetch source record server-side
  const fetchResult = await fetchSourceRecord(sourceType, sourceId)
  if (!fetchResult.ok) {
    const statusCode =
      fetchResult.error === 'unsupported_source_type' ? 400 :
      fetchResult.error === 'source_not_found' ? 404 :
      fetchResult.error === 'source_not_eligible' ? 422 :
      fetchResult.error === 'source_too_short' ? 422 :
      fetchResult.error === 'source_deleted' ? 410 :
      fetchResult.error === 'source_test_owned' ? 422 :
      500

    return NextResponse.json(
      { error: fetchResult.message, code: fetchResult.error },
      { status: statusCode }
    )
  }

  // Generate proposals
  const result = await generateProposalsFromSource(fetchResult.record)

  return NextResponse.json({
    created: result.created,
    skipped: result.skipped,
    proposals: result.proposals,
    warnings: result.warnings,
  })
}
