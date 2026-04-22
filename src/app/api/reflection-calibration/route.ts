// Phase 24C — GET /api/reflection-calibration
// Returns calibration summary for a presence.
// Query param: presenceId = 'ari' | 'eli'

import { NextRequest, NextResponse } from 'next/server'
import { computeCalibration } from '@/lib/reflections/calibration'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const presenceId = searchParams.get('presenceId')

  if (presenceId !== 'ari' && presenceId !== 'eli') {
    return NextResponse.json(
      { error: 'presenceId must be "ari" or "eli"' },
      { status: 400 }
    )
  }

  try {
    const summary = await computeCalibration(presenceId)
    return NextResponse.json(summary)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[reflection-calibration] GET error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
