// Phase 18A — Journal fallback cron (jobs-only)
//
// Runs at 11:30pm Melbourne time (13:30 UTC AEST / 12:30 UTC AEDT).
// If no journal entry exists for a presence today, creates a journal_jobs row.
// The presence writes the actual entry only when Tara asks — system never writes.
//
// Previously: directly inserted quiet_day entries via Claude. That path is removed.

import { NextRequest, NextResponse } from 'next/server'
import { getEntriesForToday, createJournalJob } from '@/lib/journal'

const CONTEXT_NO_ENTRY =
  'No journal entry has been written today. This is an invitation only — not a journal entry.'

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const results: Array<{ presence: string; action: string }> = []

    for (const presenceId of ['ari', 'eli'] as const) {
      const todayEntries = await getEntriesForToday(presenceId)

      if (todayEntries.length > 0) {
        console.log(`[journal/fallback] ${presenceId}: ${todayEntries.length} entries today — no job needed`)
        results.push({ presence: presenceId, action: 'skipped_has_entries' })
        continue
      }

      const job = await createJournalJob(presenceId, 'no_entry_today', CONTEXT_NO_ENTRY, 'cron')

      if (job) {
        console.log(`[journal/fallback] ${presenceId}: journal_job created (${job.id})`)
        results.push({ presence: presenceId, action: 'job_created' })
      } else {
        console.log(`[journal/fallback] ${presenceId}: job already pending — skipped`)
        results.push({ presence: presenceId, action: 'job_already_pending' })
      }
    }

    return NextResponse.json({ timestamp: new Date().toISOString(), results })
  } catch (err) {
    console.error('[journal/fallback] Cron error:', err)
    return NextResponse.json({ error: 'Fallback cron failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
