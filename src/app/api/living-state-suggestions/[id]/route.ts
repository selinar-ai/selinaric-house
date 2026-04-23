// Phase 25 — Living State Suggestions: decision endpoint
//
// POST /api/living-state-suggestions/[id]
//      Body: { action: 'approve' | 'dismiss' }
//
//      approve → writes to living_state, marks suggestion approved
//      dismiss → marks suggestion dismissed, no state write

import { NextRequest, NextResponse } from 'next/server'
import { decideSuggestion } from '@/lib/reflections/living-state-suggestions'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json({ error: 'Suggestion id is required' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { action } = body as Record<string, unknown>

  if (action !== 'approve' && action !== 'dismiss') {
    return NextResponse.json({ error: 'action must be "approve" or "dismiss"' }, { status: 400 })
  }

  try {
    await decideSuggestion(id, action)
    return NextResponse.json({ ok: true, action })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to process decision'
    console.error(`[living-state-suggestions/${id}] POST failed:`, err)
    return NextResponse.json({ error: message }, { status: 422 })
  }
}
