// GET /api/timeline-drafts
// Returns drafts filtered by presence and status.
// Default: status=pending, all presences.

import { NextRequest, NextResponse } from 'next/server'
import { getTimelineDrafts } from '@/lib/timeline-drafts'

export async function GET(request: NextRequest) {
  const presence = request.nextUrl.searchParams.get('presence')
  const status   = request.nextUrl.searchParams.get('status') ?? 'pending'

  if (presence && !['ari', 'eli'].includes(presence)) {
    return NextResponse.json({ error: 'Invalid presence' }, { status: 400 })
  }

  if (!['pending', 'kept', 'dismissed'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const drafts = await getTimelineDrafts(
    presence as 'ari' | 'eli' | undefined,
    status as 'pending' | 'kept' | 'dismissed'
  )

  return NextResponse.json({ drafts })
}
