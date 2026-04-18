import { NextRequest, NextResponse } from 'next/server'
import { clearContinuity, type ContinuityRoom } from '@/lib/continuity-store'

const VALID_ROOMS: ContinuityRoom[] = ['ari', 'eli', 'watchtower']

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const room = searchParams.get('room') as ContinuityRoom | null

  if (!room || !VALID_ROOMS.includes(room)) {
    return NextResponse.json({ error: 'Invalid room. Must be: ari | eli | watchtower' }, { status: 400 })
  }

  clearContinuity(room)
  return NextResponse.json({ cleared: true, room })
}
