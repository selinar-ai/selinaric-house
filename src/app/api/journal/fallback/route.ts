import { NextRequest, NextResponse } from 'next/server'
import { maybeFallbackJournalEntry } from '@/lib/journal'

/**
 * Journal quiet_day fallback cron.
 * Runs at 11:30pm Melbourne time (13:30 UTC AEST / 12:30 UTC AEDT).
 * If no journal entry exists for either presence today, writes a quiet_day entry.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
  }

  try {
    const [ariResult, eliResult] = await Promise.all([
      maybeFallbackJournalEntry('ari', apiKey).catch(err => {
        console.error('[journal/fallback] Ari failed:', err)
        return null
      }),
      maybeFallbackJournalEntry('eli', apiKey).catch(err => {
        console.error('[journal/fallback] Eli failed:', err)
        return null
      }),
    ])

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      results: [
        { presence: 'ari', written: ariResult !== null },
        { presence: 'eli', written: eliResult !== null },
      ],
    })
  } catch (err) {
    console.error('[journal/fallback] Cron error:', err)
    return NextResponse.json({ error: 'Fallback failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
