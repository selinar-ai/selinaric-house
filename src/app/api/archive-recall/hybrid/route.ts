// Phase 29C — Hybrid Recall Lab endpoint
//
// POST { presenceId, query, archiveName?, limit? }
//
// Runs three independent retrieval passes:
//   1. Keyword  — existing keyword recall (canonical + canonical_candidate)
//   2. Semantic — gte-small embedding + match_archive_embeddings RPC
//   3. Graph    — ilike text match on approved archive_graph_nodes
//
// Returns: { keyword, semantic, graph, overlap, absence }
// Does NOT log to archive_recall_events (logEvent: false by design).
// Does NOT change canonical_status.
// Does NOT write archive_memory_events.
// Does NOT inject into Ari/Eli chat.
//
// Admin/Lab only. Not callable from chat routes.
// No Claude API calls — pure retrieval and comparison.

import { NextRequest, NextResponse } from 'next/server'
import { runHybridRecall } from '@/lib/archive-hybrid'

const VALID_PRESENCE_IDS  = ['ari', 'eli']
const VALID_ARCHIVE_NAMES = ['velvet', 'violet', 'house']

export async function POST(req: NextRequest) {
  let body: {
    presenceId?:   unknown
    query?:        unknown
    archiveName?:  unknown
    limit?:        unknown
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { presenceId, query, archiveName, limit } = body

  if (!presenceId || typeof presenceId !== 'string' || !VALID_PRESENCE_IDS.includes(presenceId)) {
    return NextResponse.json(
      { error: 'presenceId required: ari | eli' },
      { status: 400 }
    )
  }

  if (!query || typeof query !== 'string' || !query.trim()) {
    return NextResponse.json(
      { error: 'query required and must be a non-empty string' },
      { status: 400 }
    )
  }

  if (archiveName !== undefined && (typeof archiveName !== 'string' || !VALID_ARCHIVE_NAMES.includes(archiveName))) {
    return NextResponse.json(
      { error: 'archiveName must be: velvet | violet | house' },
      { status: 400 }
    )
  }

  const safeLimit = typeof limit === 'number' && limit > 0
    ? Math.min(limit, 20)
    : 10

  try {
    const result = await runHybridRecall({
      presenceId:  presenceId as 'ari' | 'eli',
      query:       query.trim(),
      archiveName: typeof archiveName === 'string' ? archiveName : undefined,
      limit:       safeLimit,
    })
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[archive-recall/hybrid] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
