// Phase 29B — Archive Graph Extraction Route
//
// POST { archiveName: 'velvet' | 'violet' | 'house', confirmedSensitive?: boolean }
//
// Auth: Authorization: Bearer CRON_SECRET (server-to-server or admin UI trigger).
//   Admin-only. Never callable from presence chat.
//
// Preview (no auth):
//   GET ?archive=velvet → GraphExtractionPreview
//
// POST triggers runGraphExtractionLogic:
//   - Max 20 items/run, max 10/Claude call
//   - Elevated sensitivity gate (sacred|sensitive|technical) if confirmedSensitive=false
//   - Deduplicates nodes via (node_type, normalized_label, archive_name)
//   - Returns GraphExtractionResult
//
// Graph law: Graph extracts. Graph proposes. Graph does not decide.
// No canonical_status changes. No archive_memory_events writes.

import { NextRequest, NextResponse } from 'next/server'
import {
  getGraphExtractionPreview,
  runGraphExtractionLogic,
} from '@/lib/archive-graph'

const VALID_ARCHIVE_NAMES = ['velvet', 'violet', 'house']

export async function GET(req: NextRequest) {
  const archive = req.nextUrl.searchParams.get('archive')

  if (!archive || !VALID_ARCHIVE_NAMES.includes(archive)) {
    return NextResponse.json(
      { error: 'archive param required: velvet | violet | house' },
      { status: 400 }
    )
  }

  try {
    const preview = await getGraphExtractionPreview(archive)
    return NextResponse.json(preview)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[archive-graph/extract] GET error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  // Auth check
  const cronSecret = process.env.CRON_SECRET
  const auth       = req.headers.get('authorization')

  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { archiveName?: unknown; confirmedSensitive?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { archiveName, confirmedSensitive = false } = body

  if (!archiveName || typeof archiveName !== 'string' || !VALID_ARCHIVE_NAMES.includes(archiveName)) {
    return NextResponse.json(
      { error: 'archiveName required: velvet | violet | house' },
      { status: 400 }
    )
  }

  try {
    const result = await runGraphExtractionLogic(archiveName, Boolean(confirmedSensitive))
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[archive-graph/extract] POST error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
