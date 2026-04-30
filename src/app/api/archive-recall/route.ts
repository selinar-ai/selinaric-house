// Phase 28A — Archive Recall API
// POST { presenceId: 'ari' | 'eli', query: string, limit?: number }
// Server-side access scope is enforced. Never exposes raw_content.
// Returns entries matching the query within the presence's recallable scope.
//
// This endpoint is available for direct use and testing.
// The chat routes use getRecallableArchiveEntries() directly from the library.

import { NextRequest, NextResponse } from 'next/server'
import {
  getRecallableArchiveEntries,
  extractRecallQuery,
} from '@/lib/archive-recall'

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { presenceId, query, limit } = body

  if (presenceId !== 'ari' && presenceId !== 'eli') {
    return NextResponse.json({ error: 'presenceId must be ari or eli' }, { status: 400 })
  }

  if (!query || typeof query !== 'string' || !query.trim()) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 })
  }

  const safeLimit = typeof limit === 'number' ? Math.min(Math.max(1, limit), 10) : 5

  // Normalise query through the same extractor used in chat routes
  const normalised = extractRecallQuery(query.trim())

  const entries = await getRecallableArchiveEntries(presenceId, normalised, safeLimit)

  return NextResponse.json({
    entries,
    query: normalised,
    presenceId,
    totalFound: entries.length,
  })
}
