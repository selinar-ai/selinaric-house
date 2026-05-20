// Phase 35D — Lounge Surface Toggle
//
// PATCH /api/lounge-thread/surface
// Body: { threadId: string }
//
// Toggles between 'default' and 'inner' surface mode.
// Does not create visible messages. Does not rewrite history.

import { NextRequest, NextResponse } from 'next/server'
import { toggleSurface } from '@/lib/lounge'

export async function PATCH(request: NextRequest) {
  try {
    const { threadId } = await request.json()

    if (!threadId || typeof threadId !== 'string') {
      return NextResponse.json({ error: 'threadId required' }, { status: 400 })
    }

    const updated = await toggleSurface(threadId)

    return NextResponse.json({
      threadId: updated.id,
      surface: updated.current_surface,
    })
  } catch (error) {
    console.error('[lounge-surface] Error:', error)
    return NextResponse.json({ error: 'Failed to toggle surface' }, { status: 500 })
  }
}
