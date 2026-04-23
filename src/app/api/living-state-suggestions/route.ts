// Phase 25 — Living State Suggestions API
//
// GET  /api/living-state-suggestions?presenceId=eli|ari
//      Returns suggestions for a presence, newest first, with reflection summary.
//
// POST /api/living-state-suggestions
//      Body: { reflectionId: string }
//      Creates a suggestion from an eligible reflection.

import { NextRequest, NextResponse } from 'next/server'
import {
  createSuggestionFromReflection,
  getSuggestionsForPresence,
} from '@/lib/reflections/living-state-suggestions'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const presenceId = searchParams.get('presenceId')

  if (!presenceId || !['ari', 'eli'].includes(presenceId)) {
    return NextResponse.json(
      { error: 'Valid presenceId required (ari or eli)' },
      { status: 400 }
    )
  }

  try {
    const suggestions = await getSuggestionsForPresence(presenceId as 'ari' | 'eli')
    return NextResponse.json({ suggestions })
  } catch (err) {
    console.error('[living-state-suggestions] GET failed:', err)
    return NextResponse.json({ error: 'Failed to load suggestions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { reflectionId } = body as Record<string, unknown>

  if (typeof reflectionId !== 'string' || !reflectionId) {
    return NextResponse.json({ error: 'reflectionId is required' }, { status: 400 })
  }

  try {
    const suggestion = await createSuggestionFromReflection(reflectionId, apiKey)
    return NextResponse.json({ suggestion }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create suggestion'
    console.error('[living-state-suggestions] POST failed:', err)
    return NextResponse.json({ error: message }, { status: 422 })
  }
}
