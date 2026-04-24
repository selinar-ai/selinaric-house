// Phase 26B — Interior State API
//
// GET /api/interior-state?presenceId=eli|ari
//
// Returns a live InteriorRead computed deterministically from House signals.
// No model calls. Fast enough for background fetch from InteriorShell.
//
// Falls back to a 500 error on exception — the client falls back to mock data.

import { NextRequest, NextResponse } from 'next/server'
import { computeInteriorState } from '@/lib/interior/interior-engine'

export async function GET(request: NextRequest) {
  const presenceId = request.nextUrl.searchParams.get('presenceId')

  if (presenceId !== 'ari' && presenceId !== 'eli') {
    return NextResponse.json(
      { error: 'presenceId must be "ari" or "eli"' },
      { status: 400 }
    )
  }

  try {
    const read = await computeInteriorState(presenceId)
    return NextResponse.json(read)
  } catch (error) {
    console.error(`[interior-state] Computation failed for ${presenceId}:`, error)
    return NextResponse.json(
      { error: 'Interior state computation failed' },
      { status: 500 }
    )
  }
}
