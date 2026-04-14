import { NextRequest, NextResponse } from 'next/server'
import { getLivingState } from '@/lib/living-state'

/**
 * Phase 13: Living State API
 *
 * GET — Returns current living state for a presence
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const presenceId = searchParams.get('presence')

  if (!presenceId || !['ari', 'eli'].includes(presenceId)) {
    return NextResponse.json({ error: 'Valid presence parameter required (ari or eli)' }, { status: 400 })
  }

  const state = await getLivingState(presenceId)

  if (!state) {
    return NextResponse.json({ state: null })
  }

  return NextResponse.json({ state })
}
