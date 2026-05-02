// Phase 29A — Embedding Backfill endpoint
//
// GET  — returns preview (counts): open, no auth
// POST — runs backfill: requires Authorization: Bearer <CRON_SECRET>
//
// GET response: { total_eligible, total_already_embedded, to_embed, elevated_sensitivity_count }
// POST body:    { confirmedSensitive?: boolean }
//   confirmedSensitive: if false (default), elevated-sensitivity items are skipped.
//   If true, all eligible items including elevated (sacred | sensitive | technical) are embedded.
//
// POST response: { processed, skipped, errors }
//
// The UI execute button uses the Server Action (actions.ts) — CRON_SECRET never touches browser.
// This POST endpoint is for external/manual triggering only.

import { NextRequest, NextResponse } from 'next/server'
import { getEmbedBackfillPreview, runEmbedBackfillLogic } from '@/lib/archive-semantic'

export async function GET() {
  try {
    const preview = await getEmbedBackfillPreview()
    return NextResponse.json(preview)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Preview failed'
    console.error('[embed-backfill] GET error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // Auth: CRON_SECRET required
  const cronSecret  = process.env.CRON_SECRET
  const authHeader  = request.headers.get('authorization')

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    // body is optional — use defaults
  }

  const confirmedSensitive = body.confirmedSensitive === true

  try {
    const result = await runEmbedBackfillLogic(confirmedSensitive)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Backfill failed'
    console.error('[embed-backfill] POST error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
