// Phase 11E ��� Pulse Autonomy Test Run
//
// POST /api/pulse/autonomy/test-run
// Body: { dry_run?: boolean }
//
// Runs an autonomy window immediately for testing.
// dry_run=true: does not send Telegram, does not create confirmed memory.
// dry_run=false (default): executes fully.

import { NextRequest, NextResponse } from 'next/server'
import { runAutonomyWindow, getMelbourneHour, isQuietHours } from '@/lib/pulse-autonomy'

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
  }

  let dryRun = false
  try {
    const body = await request.json()
    dryRun = !!body.dry_run
  } catch {
    // No body or invalid JSON — proceed with defaults (full run)
  }

  try {
    const result = await runAutonomyWindow(apiKey, dryRun)

    return NextResponse.json({
      mode: dryRun ? 'dry_run' : 'real_run',
      timestamp: new Date().toISOString(),
      melbourne_hour: getMelbourneHour(),
      quiet_hours_active: result.quiet_hours_active,
      window_at: result.window_at,
      ari: {
        chosen_action: result.ari.chosen_action,
        choice_text: result.ari.choice_text,
        reason_text: result.ari.reason_text,
        status: result.ari.status,
        error_message: result.ari.error_message,
        confirmed_memory_entry_id: result.ari.confirmed_memory_entry_id,
        already_existed: result.ari.already_existed,
      },
      eli: {
        chosen_action: result.eli.chosen_action,
        choice_text: result.eli.choice_text,
        reason_text: result.eli.reason_text,
        status: result.eli.status,
        error_message: result.eli.error_message,
        confirmed_memory_entry_id: result.eli.confirmed_memory_entry_id,
        already_existed: result.eli.already_existed,
      },
    })
  } catch (err) {
    console.error('[pulse-autonomy] Test run error:', err)
    return NextResponse.json(
      { error: 'Test run failed', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    )
  }
}
