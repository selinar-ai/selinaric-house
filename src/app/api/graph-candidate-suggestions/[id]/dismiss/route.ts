// Phase 37H.2 — Dismiss a graph-assisted candidate suggestion
//
// POST /api/graph-candidate-suggestions/[id]/dismiss
//
// Transitions: pending_review → dismissed
// Writes ONLY to graph_candidate_suggestions + graph_candidate_suggestion_events.
// Does not write to archive_items, held_truths, or any other table.

import { NextRequest, NextResponse } from 'next/server'
import { dismissCandidateSuggestion } from '@/lib/graph/candidateSuggestionService'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Missing suggestion id' }, { status: 400 })
  }

  let reason: string | undefined
  try {
    const body = await request.json()
    if (typeof body.reason === 'string') {
      reason = body.reason.trim() || undefined
    }
  } catch {
    // Empty body is fine — reason is optional
  }

  const result = await dismissCandidateSuggestion(id, reason)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ success: true, suggestion: result.suggestion })
}
