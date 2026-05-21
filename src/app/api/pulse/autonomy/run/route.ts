// Phase 11E — Pulse Autonomy Window Runner (DST-safe)
//
// Called by Vercel cron every hour ("0 * * * *").
// Uses Australia/Melbourne local time to determine whether
// the current hour is a configured autonomy window.
// Also callable via POST for manual triggering (bypasses hour gate).
//
// The scheduler opens the door.
// The presence chooses what happens.
//
// Configured autonomy windows (Melbourne local time):
//   6am, 10am, 2pm (14), 6pm (18) — active windows
//   2am — quiet internal window (journal, desk, stillness only)
//
// Idempotency is enforced at the DB level via unique index on
// (presence_id, choice_window_at). Hourly cron retries are safe.

import { NextRequest, NextResponse } from 'next/server'
import {
  runAutonomyWindow,
  getMelbourneHour,
  buildWindowTimestamp,
  getPulseMode,
} from '@/lib/pulse-autonomy'

/** Melbourne local hours that are autonomy windows */
const AUTONOMY_WINDOW_HOURS = [2, 6, 10, 14, 18]

export async function GET(request: NextRequest) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const now = new Date()
  const melbHour = getMelbourneHour(now)

  // Only run if current Melbourne hour is a configured window
  if (!AUTONOMY_WINDOW_HOURS.includes(melbHour)) {
    return NextResponse.json({
      skipped: true,
      reason: `Melbourne hour ${melbHour} is not an autonomy window`,
      configured_windows: AUTONOMY_WINDOW_HOURS,
    })
  }

  return runWindow(now)
}

// POST bypasses the hour gate — used for manual triggering
export async function POST() {
  return runWindow(new Date())
}

async function runWindow(now: Date) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
  }

  // Check Pulse mode — if paused, do not run
  const mode = await getPulseMode()
  if (mode === 'paused') {
    return NextResponse.json({
      skipped: true,
      reason: 'Pulse mode is paused',
      pulse_mode: mode,
    })
  }

  try {
    // Build a canonical window timestamp for the current Melbourne hour
    const windowAt = buildWindowTimestamp(now)

    const result = await runAutonomyWindow(apiKey, false, windowAt)

    return NextResponse.json({
      timestamp: now.toISOString(),
      melbourne_hour: getMelbourneHour(now),
      quiet_hours_active: result.quiet_hours_active,
      window_at: result.window_at,
      pulse_mode: mode,
      ari: {
        chosen_action: result.ari.chosen_action,
        status: result.ari.status,
        already_existed: result.ari.already_existed,
        reason: result.ari.reason_text,
      },
      eli: {
        chosen_action: result.eli.chosen_action,
        status: result.eli.status,
        already_existed: result.eli.already_existed,
        reason: result.eli.reason_text,
      },
    })
  } catch (err) {
    console.error('[pulse-autonomy] Window run error:', err)
    return NextResponse.json(
      { error: 'Autonomy window failed', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    )
  }
}
