// Phase 36E — Cross-Room Prompt Carryforward API
//
// POST /api/cross-room-propagation-candidates/[id]/prompt-carryforward
//   — Create carryforward from an eligible propagation candidate
// GET  /api/cross-room-propagation-candidates/[id]/prompt-carryforward
//   — Read existing carryforward for a candidate
//
// This route does NOT:
// - update State or Interior
// - touch Pulse/autonomy/QStash/cron
// - create journal jobs or entries
// - create Memory or Memory candidates
// - alter Archive/Memory/Library authority
// - inject prompt carryforward into Lounge prompts

import { NextRequest, NextResponse } from 'next/server'
import {
  createCarryforwardFromCandidate,
  getCarryforwardForCandidate,
} from '@/lib/cross-room-prompt-carryforward'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: candidateId } = await params

  if (!candidateId) {
    return NextResponse.json({ error: 'Candidate ID required' }, { status: 400 })
  }

  const carryforwards = await getCarryforwardForCandidate(candidateId)
  return NextResponse.json({ carryforwards })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: candidateId } = await params

  if (!candidateId) {
    return NextResponse.json({ error: 'Candidate ID required' }, { status: 400 })
  }

  // Optional body params
  let targetRoomSlug: string | undefined
  let expiresInDays: number | undefined

  try {
    const body = await request.json().catch(() => ({}))
    if (body && typeof body === 'object') {
      if (typeof body.target_room_slug === 'string') targetRoomSlug = body.target_room_slug
      if (typeof body.expires_in_days === 'number') expiresInDays = body.expires_in_days
    }
  } catch { /* empty body is fine */ }

  const result = await createCarryforwardFromCandidate(candidateId, {
    targetRoomSlug,
    expiresInDays,
  })

  // Already exists
  if (result.already_exists) {
    return NextResponse.json({
      created: false,
      already_exists: true,
      carryforward: result.carryforward,
    }, { status: 200 })
  }

  // Creation failed
  if (!result.created) {
    const status = result.error === 'Candidate not found' ? 404
      : result.error?.includes('not eligible') ? 422
      : result.error?.includes('Only state_candidate') ? 422
      : result.error?.includes('authority') ? 422
      : result.error?.includes('presence') ? 422
      : result.error?.includes('could not be resolved') ? 422
      : 500

    return NextResponse.json({
      created: false,
      error: result.error,
      reason: result.reason,
    }, { status })
  }

  // Success
  return NextResponse.json({
    created: true,
    carryforward: result.carryforward,
  }, { status: 201 })
}
