// Phase 28A + 28B — Archive Recall API
// POST { presenceId: 'ari' | 'eli', query: string, limit?: number, sessionId?: string }
// Server-side access scope is enforced. Never exposes raw_content.
// Returns entries matching the query within the presence's recallable scope.
// Phase 28B: logs recall event, returns recallEventId and matchQuality.
//
// This endpoint is available for direct use and testing.
// The chat routes use getRecallableArchiveEntries() directly from the library.

import { NextRequest, NextResponse } from 'next/server'
import {
  getRecallableArchiveEntries,
  extractRecallQuery,
  getMatchQuality,
  logRecallEvent,
} from '@/lib/archive-recall'

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { presenceId, query, limit, sessionId } = body

  if (presenceId !== 'ari' && presenceId !== 'eli') {
    return NextResponse.json({ error: 'presenceId must be ari or eli' }, { status: 400 })
  }

  if (!query || typeof query !== 'string' || !query.trim()) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 })
  }

  const safeLimit = typeof limit === 'number' ? Math.min(Math.max(1, limit), 10) : 5

  // Normalise query through the same extractor used in chat routes
  const normalisedQuery = extractRecallQuery(query.trim()) || query.trim()

  const entries = await getRecallableArchiveEntries(presenceId, normalisedQuery, safeLimit)

  const matchQuality = getMatchQuality(
    entries[0]?.rank_score ?? 0,
    entries.map(e => e.rank_score)
  )

  const recallEventId = await logRecallEvent({
    presence_id:      presenceId,
    session_id:       typeof sessionId === 'string' ? sessionId : null,
    query:            query.trim(),
    normalised_query: normalisedQuery,
    match_quality:    matchQuality,
    entries_returned: entries.length,
    entry_ids:        entries.map(e => e.id),
  })

  return NextResponse.json({
    entries,
    query: normalisedQuery,
    presenceId,
    totalFound:     entries.length,
    matchQuality,
    recallEventId,
  })
}
