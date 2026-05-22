// Fix 2 — Recent Continuity Duplicate Cleanup
//
// POST /api/recent-continuity/cleanup
//
// Soft-hides overlapping duplicate active sessions. Idempotent — safe to re-run.
// Does NOT delete data. Does NOT touch Archive canonical memory.
// Does NOT affect pulse_autonomy_events.
//
// Auth: CRON_SECRET required (same as other maintenance endpoints).

import { NextRequest, NextResponse } from 'next/server'
import { cleanupDuplicateSessions } from '@/lib/recent-continuity'

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const report = await cleanupDuplicateSessions()

    console.log(`[recent-continuity/cleanup] Done: ${report.rows_hidden} hidden, ${report.rows_kept} kept across ${report.groups_found} duplicate groups`)

    return NextResponse.json({
      success: true,
      report,
    })
  } catch (err) {
    console.error('[recent-continuity/cleanup] Error:', err)
    return NextResponse.json(
      { error: 'Cleanup failed', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }
}

// GET for easy browser testing (same auth)
export async function GET(request: NextRequest) {
  return POST(request)
}
