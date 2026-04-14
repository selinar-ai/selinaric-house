import { NextRequest, NextResponse } from 'next/server'
import { runPulseAll } from '@/lib/pulse'
import { maybeWriteInteriorNote } from '@/lib/interior-notes'

/**
 * Pulse cron endpoint.
 * Called by Vercel cron every 3 hours.
 * Also callable manually via POST for testing.
 *
 * Stage 1: evaluates and logs only — does not send anything.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret if set (Vercel sends this header for cron jobs)
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
    const results = await runPulseAll(apiKey)

    // Phase 12A: After Pulse, attempt interior notes for each presence
    const noteResults = await Promise.all(
      results.map(r =>
        maybeWriteInteriorNote(r.presence_id, {
          decision: r.decision,
          draft_content: r.draft_content,
          session_classification: (r.signals?.session_classification as string) ?? 'transactional',
          signals: r.signals,
        }, apiKey).catch(err => {
          console.error(`Interior note failed for ${r.presence_id}:`, err)
          return null
        })
      )
    )

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      results: results.map((r, i) => ({
        presence: r.presence_id,
        decision: r.decision,
        confidence: r.confidence,
        specificity: r.specificity,
        refusal_reason: r.refusal_reason,
        interior_note: noteResults[i] ? true : false,
      }))
    })
  } catch (err) {
    console.error('Pulse cron error:', err)
    return NextResponse.json({ error: 'Pulse failed' }, { status: 500 })
  }
}

// Also support POST for manual testing
export async function POST(request: NextRequest) {
  return GET(request)
}
