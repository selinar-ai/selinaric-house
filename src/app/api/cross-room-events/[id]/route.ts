// Phase 36A — Cross-Room Event Ledger: Single Event API
//
// GET /api/cross-room-events/:id — get one event by ID

import { NextRequest, NextResponse } from 'next/server'
import { getCrossRoomEvent } from '@/lib/cross-room-events'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Missing event ID' }, { status: 400 })
  }

  const event = await getCrossRoomEvent(id)

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  return NextResponse.json({ event })
}
