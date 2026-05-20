// Phase 35D — Lounge Messages API
//
// GET /api/lounge-messages — Fetch messages for the active thread
// Returns thread info + messages

import { NextResponse } from 'next/server'
import { getOrCreateActiveThread, getThreadMessages } from '@/lib/lounge'

export async function GET() {
  try {
    const thread = await getOrCreateActiveThread()
    const messages = await getThreadMessages(thread.id)

    return NextResponse.json({
      thread: {
        id: thread.id,
        surface: thread.current_surface,
        status: thread.status,
      },
      messages,
    })
  } catch (error) {
    console.error('[lounge-messages] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch Lounge messages' }, { status: 500 })
  }
}
