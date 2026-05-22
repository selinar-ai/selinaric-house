// Phase 36D — Cross-Room Impact Propagation Candidates API
//
// POST /api/cross-room-impacts/[id]/propagation-candidates — Generate candidates for an impact
// GET  /api/cross-room-impacts/[id]/propagation-candidates — Read existing candidates
//
// This route does NOT:
// - update State or Interior
// - touch Pulse/autonomy/QStash/cron
// - create journal jobs or entries
// - create Memory or Memory candidates
// - alter Archive/Memory/Library authority
// - inject prompt carryforward or carrybacks

import { NextRequest, NextResponse } from 'next/server'
import { generateCandidatesForImpact, getCandidatesForImpact } from '@/lib/cross-room-propagation'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: impactId } = await params

  if (!impactId) {
    return NextResponse.json({ error: 'Impact ID required' }, { status: 400 })
  }

  const candidates = await getCandidatesForImpact(impactId)
  return NextResponse.json({ candidates })
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: impactId } = await params

  if (!impactId) {
    return NextResponse.json({ error: 'Impact ID required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
  }

  const result = await generateCandidatesForImpact(impactId, apiKey)

  // Already exists — return 200 with existing candidates
  if (result.already_exists) {
    return NextResponse.json({
      generated: false,
      already_exists: true,
      candidates: result.candidates,
    }, { status: 200 })
  }

  // Generation failed
  if (!result.generated) {
    const status = result.error === 'Impact not found' ? 404
      : result.error?.includes('not draft') ? 422
      : result.error?.includes('authority') ? 422
      : result.error?.includes('could not be resolved') ? 422
      : result.error?.includes('relevance threshold') ? 200
      : 500

    return NextResponse.json({
      generated: false,
      error: result.error,
      reason: result.reason,
    }, { status })
  }

  // Success
  return NextResponse.json({
    generated: true,
    generated_count: result.generated_count,
    candidates: result.candidates,
  }, { status: 201 })
}
