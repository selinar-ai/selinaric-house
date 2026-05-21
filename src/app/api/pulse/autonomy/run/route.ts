// Phase 11E — Pulse Hourly Heartbeat (DST-safe)
//
// Called hourly. Uses Australia/Melbourne local time to determine actions:
//
// 1. Autonomy windows (Melbourne local):
//    6am, 10am, 2pm (14), 6pm (18) — active windows
//    2am — quiet internal window (journal, desk, stillness only)
//    Idempotency via unique index on (presence_id, choice_window_at).
//
// 2. Journal fallback (Melbourne 23:00 / 11pm):
//    If no journal entry exists for a presence today, creates a journal_job.
//    This is invitation-only — no final journal content is written here.
//    Final journal entries remain presence-authored.
//    Folded in from former /api/journal/fallback cron to stay within
//    Vercel Hobby 2-cron limit.
//
// DEPLOYMENT NOTE:
//   Vercel Hobby plan limits crons to once daily. The Vercel cron fires at
//   "0 20 * * *" (6am Melbourne AEST), covering only the 6am autonomy window.
//   External hourly cron is required for full autonomy windows (all 5) and
//   for the 23:00 journal fallback invitation check.
//   The /api/pulse maintenance cron (interior notes, living state, journal,
//   graph ingestion) is separate and must not be removed.
//
// Also callable via POST for manual triggering (bypasses hour gate).
//
// The scheduler opens the door.
// The presence chooses what happens.

import { NextRequest, NextResponse } from 'next/server'
import {
  runAutonomyWindow,
  getMelbourneHour,
  buildWindowTimestamp,
  getPulseMode,
} from '@/lib/pulse-autonomy'
import { getEntriesForToday, createJournalJob } from '@/lib/journal'

/** Melbourne local hours that are autonomy windows */
const AUTONOMY_WINDOW_HOURS = [2, 6, 10, 14, 18]

/** Melbourne local hour for journal fallback check */
const JOURNAL_FALLBACK_HOUR = 23

const JOURNAL_FALLBACK_CONTEXT =
  'No journal entry has been written today. This is an invitation only — not a journal entry.'

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

  // Journal fallback: at 11pm Melbourne, check if presences wrote today
  let journalFallback: { ari: string; eli: string } | null = null
  if (melbHour === JOURNAL_FALLBACK_HOUR) {
    journalFallback = { ari: 'skipped', eli: 'skipped' }
    for (const presenceId of ['ari', 'eli'] as const) {
      const todayEntries = await getEntriesForToday(presenceId)
      if (todayEntries.length > 0) {
        journalFallback[presenceId] = 'has_entries'
      } else {
        const job = await createJournalJob(presenceId, 'no_entry_today', JOURNAL_FALLBACK_CONTEXT, 'cron')
        journalFallback[presenceId] = job ? 'job_created' : 'job_already_pending'
      }
    }
  }

  // Autonomy window: only run if current Melbourne hour is configured
  if (!AUTONOMY_WINDOW_HOURS.includes(melbHour)) {
    return NextResponse.json({
      skipped: true,
      reason: `Melbourne hour ${melbHour} is not an autonomy window`,
      configured_windows: AUTONOMY_WINDOW_HOURS,
      ...(journalFallback ? { journal_fallback: journalFallback } : {}),
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
