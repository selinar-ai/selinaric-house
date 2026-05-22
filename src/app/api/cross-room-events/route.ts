// Phase 36A — Cross-Room Event Ledger API
//
// POST /api/cross-room-events  — create a cross-room event
// GET  /api/cross-room-events  — list recent events (with optional filters)
//
// A cross-room event is recorded House contact. Not Memory.
// authority_label is always forced to 'cross_room_event_not_memory'.

import { NextRequest, NextResponse } from 'next/server'
import {
  createCrossRoomEvent,
  listCrossRoomEvents,
  validateCreateInput,
} from '@/lib/cross-room-events'

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const validation = validateCreateInput(body)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const { event, error } = await createCrossRoomEvent(validation.data)

  if (error || !event) {
    return NextResponse.json({ error: error ?? 'Unknown error' }, { status: 500 })
  }

  return NextResponse.json({ event }, { status: 201 })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const room_id = searchParams.get('room_id') || undefined
  const room_type = searchParams.get('room_type') || undefined
  const presence_id = searchParams.get('presence_id') || undefined
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 20, 100) : 20

  const events = await listCrossRoomEvents({ room_id, room_type, presence_id, limit })

  return NextResponse.json({ events, count: events.length })
}
