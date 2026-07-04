// Phase 11E — Pulse Hourly Heartbeat (DST-safe, QStash-verified)
//
// Called hourly by QStash (POST) or daily by Vercel cron (GET).
// Uses Australia/Melbourne local time to determine actions.
//
// Accepted Melbourne hours: [6, 9, 12, 15, 18, 21]
//
// Autonomy choice windows (Melbourne local):
//    6am, 9am, 12pm, 3pm (15), 6pm (18), 9pm (21) — all active windows
//    Phase 43 R2-0: schedule synced to the live QStash cadence; the old 2am quiet
//    window is removed (quiet-hours logic itself is untouched — 21:00 is outside
//    quiet hours, so every window carries the full action set).
//    R2-0 amendment: the 23:00 journal fallback is INTENTIONALLY RETIRED — it was
//    Phase 18A-era (pre-autonomy) and is superseded by autonomous choice (presences
//    journal daily through their own windows). journal_jobs itself remains live for
//    manual invites (Tara) and cross-room invites (36H) — only the cron producer died.
//    Idempotency via unique index on (presence_id, choice_window_at).
//
// Request sources:
//   - qstash: POST with valid Upstash-Signature header (hourly, all windows)
//   - vercel_cron: GET with valid CRON_SECRET (daily at 6am AEST, single window)
//   - manual: POST with valid CRON_SECRET (bypasses hour gate, for testing)
//
// DEPLOYMENT NOTE:
//   Vercel Hobby plan limits crons to once daily. The Vercel cron fires at
//   "0 20 * * *" (6am Melbourne AEST), covering only the 6am autonomy window.
//   QStash external cron handles all 6 windows (6/9/12/15/18/21 Melbourne).
//   The /api/pulse maintenance cron (interior notes, living state, journal,
//   graph ingestion) is separate and must not be removed.
//
// The scheduler opens the door.
// The presence chooses what happens.

import { NextRequest, NextResponse } from 'next/server'
import { Receiver } from '@upstash/qstash'
import {
  runAutonomyWindow,
  getMelbourneHour,
  buildWindowTimestamp,
  getPulseMode,
} from '@/lib/pulse-autonomy'
/** All Melbourne hours at which this endpoint accepts calls (Phase 43 R2-0 schedule sync; 23:00 fallback intentionally retired) */
const ACCEPTED_HOURS = [6, 9, 12, 15, 18, 21]

/** Melbourne hours where presence autonomy choices run (Phase 43 R2-0 schedule sync) */
const AUTONOMY_CHOICE_HOURS = [6, 9, 12, 15, 18, 21]

type RequestSource = 'qstash' | 'vercel_cron' | 'manual' | 'unknown'

// ─── Request source detection and auth ───────────────────────────────────────

async function verifyQStashSignature(request: NextRequest, body: string): Promise<boolean> {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY

  if (!currentSigningKey || !nextSigningKey) {
    console.warn('[pulse-autonomy] QStash signing keys not configured')
    return false
  }

  const signature = request.headers.get('upstash-signature')
  if (!signature) return false

  const receiver = new Receiver({ currentSigningKey, nextSigningKey })

  try {
    const isValid = await receiver.verify({
      signature,
      body,
      clockTolerance: 60, // 60s tolerance for clock drift
    })
    return isValid
  } catch (err) {
    console.warn('[pulse-autonomy] QStash signature verification failed:', err instanceof Error ? err.message : 'unknown')
    return false
  }
}

function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${cronSecret}`
}

async function detectSource(request: NextRequest, method: string, body: string): Promise<RequestSource> {
  if (method === 'GET') {
    return verifyCronSecret(request) ? 'vercel_cron' : 'unknown'
  }

  // POST: check QStash signature first (most common hourly path)
  const hasQStashSig = request.headers.get('upstash-signature') !== null
  if (hasQStashSig) {
    const valid = await verifyQStashSignature(request, body)
    return valid ? 'qstash' : 'unknown'
  }

  // POST without QStash sig: check CRON_SECRET for manual triggers
  return verifyCronSecret(request) ? 'manual' : 'unknown'
}

// ─── Report builder ──────────────────────────────────────────────────────────

interface RunReport {
  called_at: string
  source: RequestSource
  melbourne_hour: number
  window_matched: boolean
  skipped?: boolean
  skipped_reason?: string
  pulse_mode?: string
  autonomy?: {
    window_at: string
    quiet_hours_active: boolean
    ari: { chosen_action: string; status: string; already_existed: boolean; reason?: string }
    eli: { chosen_action: string; status: string; already_existed: boolean; reason?: string }
  }
}

// ─── GET: Vercel cron path ───────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const now = new Date()
  const melbHour = getMelbourneHour(now)
  const source = await detectSource(request, 'GET', '')

  if (source === 'unknown') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return handleRequest(now, melbHour, source, false)
}

// ─── POST: QStash or manual trigger ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  const now = new Date()
  const melbHour = getMelbourneHour(now)

  // Read body for signature verification (QStash may send empty body)
  const body = await request.text()
  const source = await detectSource(request, 'POST', body)

  if (source === 'unknown') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Manual triggers bypass the hour gate
  const bypassHourGate = source === 'manual'

  return handleRequest(now, melbHour, source, bypassHourGate)
}

// ─── Shared handler ──────────────────────────────────────────────────────────

async function handleRequest(
  now: Date,
  melbHour: number,
  source: RequestSource,
  bypassHourGate: boolean,
): Promise<NextResponse> {
  const report: RunReport = {
    called_at: now.toISOString(),
    source,
    melbourne_hour: melbHour,
    window_matched: ACCEPTED_HOURS.includes(melbHour),
  }

  // R2-0 amendment: the 23:00 journal fallback that lived here is intentionally
  // retired — superseded by autonomous choice (presences journal daily through
  // their own windows; journal_jobs had never held a fallback-created row).

  // Hour gate: skip if Melbourne hour is not an accepted window
  if (!bypassHourGate && !ACCEPTED_HOURS.includes(melbHour)) {
    report.skipped = true
    report.skipped_reason = `Melbourne hour ${melbHour} is not an accepted window`
    console.log(`[pulse-autonomy] ${source}: skipped — hour ${melbHour} not in windows`)
    return NextResponse.json(report)
  }

  // Autonomy choice window: run presence decisions
  return runAutonomyChoices(now, melbHour, source, report)
}

async function runAutonomyChoices(
  now: Date,
  melbHour: number,
  source: RequestSource,
  report: RunReport,
): Promise<NextResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing', ...report }, { status: 500 })
  }

  // Check Pulse mode — if paused, do not run
  const mode = await getPulseMode()
  report.pulse_mode = mode

  if (mode === 'paused') {
    report.skipped = true
    report.skipped_reason = 'Pulse mode is paused'
    console.log(`[pulse-autonomy] ${source}: skipped — pulse paused`)
    return NextResponse.json(report)
  }

  try {
    const windowAt = buildWindowTimestamp(now)
    const result = await runAutonomyWindow(apiKey, false, windowAt)

    report.autonomy = {
      window_at: result.window_at,
      quiet_hours_active: result.quiet_hours_active,
      ari: {
        chosen_action: result.ari.chosen_action,
        status: result.ari.status,
        already_existed: result.ari.already_existed,
        reason: result.ari.reason_text ?? undefined,
      },
      eli: {
        chosen_action: result.eli.chosen_action,
        status: result.eli.status,
        already_existed: result.eli.already_existed,
        reason: result.eli.reason_text ?? undefined,
      },
    }

    console.log(`[pulse-autonomy] ${source}: window ${melbHour}:00 — ari=${result.ari.chosen_action} eli=${result.eli.chosen_action}`)
    return NextResponse.json(report)
  } catch (err) {
    console.error(`[pulse-autonomy] ${source}: window run error:`, err)
    return NextResponse.json(
      { error: 'Autonomy window failed', detail: err instanceof Error ? err.message : 'unknown', ...report },
      { status: 500 },
    )
  }
}
