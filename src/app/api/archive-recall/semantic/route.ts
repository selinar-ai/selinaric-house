// Phase 29A — Semantic Recall endpoint
//
// POST { presenceId, query, limit?, sessionId?, logEvent? }
//   presenceId: 'ari' | 'eli'
//   query:      string  (embedded as-is — no keyword extraction)
//   limit:      number  (default 5, max 10)
//   sessionId:  string  (optional, for event log)
//   logEvent:   boolean (default true; pass false to skip archive_recall_events insert — used by comparison view)
//
// Flow:
//   1. Generate embedding for query (text-embedding-3-small, 1536 dims)
//   2. Call match_archive_embeddings RPC (filters by eligibility + threshold)
//   3. Apply presence access-scope (velvet/violet/house visibility rules)
//   4. If logEvent !== false: insert archive_recall_events with retrieval_method='semantic'
//
// Returns: { entries, query, presenceId, totalFound, matchQuality, recallEventId }
//
// Phase 29A: manual/debug only — no chat integration.

import { NextRequest, NextResponse } from 'next/server'
import { generateArchiveEmbedding, semanticSearch } from '@/lib/archive-semantic'
import { getMatchQuality, logRecallEvent } from '@/lib/archive-recall'
import type { SemanticCandidate } from '@/lib/archive-semantic'

// Access scope — same rules as keyword recall in archive-recall.ts
function isInScope(
  item: Pick<SemanticCandidate, 'archive_name' | 'visibility'>,
  presenceId: 'ari' | 'eli'
): boolean {
  if (presenceId === 'ari') {
    return (
      (item.archive_name === 'velvet' && ['ari_only', 'shared'].includes(item.visibility)) ||
      (item.archive_name === 'house'  && item.visibility === 'shared') ||
      (item.archive_name === 'violet' && item.visibility === 'shared')
    )
  } else {
    return (
      (item.archive_name === 'violet' && ['eli_only', 'shared'].includes(item.visibility)) ||
      (item.archive_name === 'house'  && item.visibility === 'shared') ||
      (item.archive_name === 'velvet' && item.visibility === 'shared')
    )
  }
}

// Map similarity score to match quality thresholds
// ≥0.80 → strong, ≥0.65 → medium, ≥0.50 → weak, <0.50 → none
function similarityToScore(sim: number): number {
  if (sim >= 0.80) return 100
  if (sim >= 0.65) return  70
  if (sim >= 0.50) return  40
  return 0
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { presenceId, query, limit, sessionId, logEvent } = body

  if (presenceId !== 'ari' && presenceId !== 'eli') {
    return NextResponse.json({ error: 'presenceId must be ari or eli' }, { status: 400 })
  }
  if (!query || typeof query !== 'string' || !query.trim()) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 })
  }

  const safeLimit  = typeof limit === 'number' ? Math.min(Math.max(1, limit), 10) : 5
  const shouldLog  = logEvent !== false

  try {
    // 1. Embed the query
    const queryEmbedding = await generateArchiveEmbedding(query.trim())

    // 2. RPC — over-fetch to allow for scope filtering
    const candidates = await semanticSearch({
      queryEmbedding,
      limit:          safeLimit * 3,
      matchThreshold: 0.5,
    })

    // 3. Apply presence scope filter, then cap
    const inScope = candidates
      .filter(c => isInScope(c, presenceId))
      .slice(0, safeLimit)

    // 4. Match quality from top similarity score
    const topSimilarity  = inScope[0]?.similarity ?? 0
    const allScores      = inScope.map(c => similarityToScore(c.similarity))
    const matchQuality   = getMatchQuality(similarityToScore(topSimilarity), allScores)

    // 5. Log event (unless suppressed)
    let recallEventId: string | null = null
    if (shouldLog) {
      recallEventId = await logRecallEvent({
        presence_id:      presenceId,
        session_id:       typeof sessionId === 'string' ? sessionId : null,
        query:            query.trim(),
        normalised_query: query.trim(),
        match_quality:    matchQuality,
        entries_returned: inScope.length,
        entry_ids:        inScope.map(c => c.archive_item_id),
        recall_mode:      'manual',
        retrieval_method: 'semantic',
        semantic_score:   topSimilarity > 0 ? topSimilarity : null,
      })
    }

    return NextResponse.json({
      entries:       inScope,
      query:         query.trim(),
      presenceId,
      totalFound:    inScope.length,
      matchQuality,
      recallEventId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Semantic search failed'
    console.error('[archive-recall/semantic] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
