// Phase 29A + 29D patch — Embedding Backfill endpoint (archive-scoped)
//
// GET  ?archive=velvet|violet|house — returns preview counts for that archive: open, no auth
// POST — runs backfill: requires Authorization: Bearer <CRON_SECRET>
//
// GET response: { total_eligible, total_already_embedded, to_embed, elevated_sensitivity_count }
// POST body:    { confirmedSensitive?: boolean, archiveName?: 'velvet'|'violet'|'house' }
//   confirmedSensitive: if false (default), elevated-sensitivity items are skipped.
//   archiveName: required — restricts backfill to one archive only.
//     No global all-archive execution via this endpoint.
//
// POST response: { processed, skipped, errors, first_error? }
//
// The UI execute button uses the Server Action (actions.ts) — CRON_SECRET never touches browser.
// This POST endpoint is for external/manual triggering only.

import { NextRequest, NextResponse } from 'next/server'
import { getEmbedBackfillPreview, runEmbedBackfillLogic } from '@/lib/archive-semantic'

const VALID_ARCHIVE_NAMES = ['velvet', 'violet', 'house']

export async function GET(request: NextRequest) {
  const archive = request.nextUrl.searchParams.get('archive') ?? undefined

  if (archive && !VALID_ARCHIVE_NAMES.includes(archive)) {
    return NextResponse.json(
      { error: 'archive must be: velvet | violet | house' },
      { status: 400 }
    )
  }

  try {
    const preview = await getEmbedBackfillPreview(archive)
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
  const archiveName = typeof body.archiveName === 'string' && VALID_ARCHIVE_NAMES.includes(body.archiveName)
    ? body.archiveName
    : undefined

  try {
    const result = await runEmbedBackfillLogic(confirmedSensitive, archiveName)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Backfill failed'
    console.error('[embed-backfill] POST error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
