// Phase 22B — Build history API
// GET ?buildId=uuid  — returns all history events for a build, ascending order

import { NextRequest, NextResponse } from 'next/server'
import { getBuildHistory } from '@/lib/build-history'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const buildId = searchParams.get('buildId')

  if (!buildId) {
    return NextResponse.json({ error: 'buildId required' }, { status: 400 })
  }

  const events = await getBuildHistory(buildId)
  return NextResponse.json({ events })
}
