// Phase 24 — Reflections process endpoint
// POST { presenceId?, limit? }
//      Processes pending reflection jobs and returns results.
//      presenceId filters to one presence (Ari or Eli only — never both at once).
//      limit caps jobs per call (default 5, max 10).
//
// This is a manual trigger endpoint for v1. Autonomous scheduling is Phase 25+.

import { NextRequest, NextResponse } from 'next/server'
import { processPendingJobs } from '@/lib/reflections/process-reflection-job'

export async function POST(request: NextRequest) {
  let body: { presenceId?: string; limit?: number } = {}
  try {
    body = await request.json()
  } catch {
    // Body is optional — default to all pending, limit 5
  }

  const { presenceId, limit } = body

  if (presenceId && !['ari', 'eli'].includes(presenceId)) {
    return NextResponse.json({ error: 'presenceId must be ari or eli' }, { status: 400 })
  }

  const safeLimit = Math.min(
    typeof limit === 'number' && limit > 0 ? limit : 5,
    10
  )

  try {
    const results = await processPendingJobs(
      presenceId as 'ari' | 'eli' | undefined,
      safeLimit
    )

    const completed = results.filter(r => r.status === 'completed').length
    const failed = results.filter(r => r.status === 'failed').length

    return NextResponse.json({
      processed: results.length,
      completed,
      failed,
      results,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
