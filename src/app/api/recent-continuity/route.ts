// Phase 35B — Recent Continuity API
//
// GET  /api/recent-continuity?presenceId=eli  — list sessions for Tara inspection
// PATCH /api/recent-continuity                — update session status (tombstone/hide/restore)
//
// NOT Memory. NOT canonical. Tara inspection and correction only.

import { NextRequest, NextResponse } from 'next/server'
import {
  getRecentContinuitySessions,
  updateSessionStatus,
} from '@/lib/recent-continuity'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const presenceId = searchParams.get('presenceId') || undefined

  if (presenceId && presenceId !== 'eli' && presenceId !== 'ari') {
    return NextResponse.json({ error: 'Invalid presenceId' }, { status: 400 })
  }

  const sessions = await getRecentContinuitySessions(presenceId)
  return NextResponse.json({ sessions })
}

export async function PATCH(request: NextRequest) {
  let body: { id?: string; status?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { id, status } = body

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Missing session id' }, { status: 400 })
  }

  const validStatuses = ['active', 'hidden', 'deleted_by_tara']
  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
      { status: 400 },
    )
  }

  const result = await updateSessionStatus(id, status as 'active' | 'hidden' | 'deleted_by_tara')

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
