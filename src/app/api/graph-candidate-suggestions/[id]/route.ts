// Phase 37H.3 — Graph-Assisted Candidate Suggestion Detail (GET only)
//
// Returns hydrated evidence detail for a single suggestion.
// Read-only. No writes. No mutations.
// Graph assistance explains evidence. Graph assistance does not create authority.

import { NextRequest, NextResponse } from 'next/server'
import { hydrateCandidateSuggestion } from '@/lib/graph/candidateSuggestionService'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Missing suggestion id' }, { status: 400 })
  }

  const hydrated = await hydrateCandidateSuggestion(id)

  if (!hydrated) {
    return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 })
  }

  return NextResponse.json(hydrated)
}
