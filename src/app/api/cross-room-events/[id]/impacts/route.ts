// Phase 36C — Cross-Room Event Impact Extraction API
//
// POST /api/cross-room-events/[id]/impacts — Extract impacts for an event
// GET  /api/cross-room-events/[id]/impacts — Read existing impacts
//
// This route does NOT:
// - update State or Interior
// - touch Pulse/autonomy/QStash/cron
// - create journal jobs or entries
// - create Memory or Memory candidates
// - alter Archive/Memory/Library authority
// - inject prompt carryforward

import { NextRequest, NextResponse } from 'next/server'
import { extractImpactsForEvent, getImpactsForEvent } from '@/lib/cross-room-impact'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: eventId } = await params

  if (!eventId) {
    return NextResponse.json({ error: 'Event ID required' }, { status: 400 })
  }

  const impacts = await getImpactsForEvent(eventId)
  return NextResponse.json({ impacts })
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: eventId } = await params

  if (!eventId) {
    return NextResponse.json({ error: 'Event ID required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
  }

  const result = await extractImpactsForEvent(eventId, apiKey)

  // Already exists — return 200 with existing impacts
  if (result.already_exists) {
    return NextResponse.json({
      extracted: false,
      already_exists: true,
      impacts: result.impacts,
    }, { status: 200 })
  }

  // Extraction failed
  if (!result.extracted) {
    // Determine appropriate status code
    const status = result.error === 'Event not found' ? 404
      : result.error?.includes('could not be resolved') ? 422
      : result.error?.includes('no source_message_ids') ? 422
      : result.error?.includes('No valid presence_ids') ? 422
      : 500

    return NextResponse.json({
      extracted: false,
      error: result.error,
    }, { status })
  }

  // Success
  return NextResponse.json({
    extracted: true,
    impacts: result.impacts,
  }, { status: 201 })
}
