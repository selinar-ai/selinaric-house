// POST /api/timeline-drafts/create
// Internal route: presences propose Timeline drafts through this endpoint.
// Timeline Gate is enforced — requires passed_count >= 2.
// Duplicate prevention and frequency limits are also applied.

import { NextRequest, NextResponse } from 'next/server'
import { createTimelineDraft } from '@/lib/timeline-drafts'
import type { GateResults, CreateDraftInput } from '@/lib/timeline-drafts'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      presence,
      draft_text,
      significance,
      entry_type,
      source_context,
      decision_reason,
      gate_results,
    } = body as {
      presence:         unknown
      draft_text:       unknown
      significance:     unknown
      entry_type:       unknown
      source_context?:  Record<string, unknown>
      decision_reason?: string
      gate_results:     GateResults
    }

    // Validate required fields
    if (!presence || !['ari', 'eli'].includes(presence as string)) {
      return NextResponse.json({ error: 'presence must be "ari" or "eli"' }, { status: 400 })
    }
    if (!draft_text || typeof draft_text !== 'string' || !draft_text.trim()) {
      return NextResponse.json({ error: 'draft_text is required' }, { status: 400 })
    }
    if (!significance || !['foundational', 'significant', 'standard'].includes(significance as string)) {
      return NextResponse.json({ error: 'Invalid significance' }, { status: 400 })
    }
    if (!entry_type || typeof entry_type !== 'string') {
      return NextResponse.json({ error: 'entry_type is required' }, { status: 400 })
    }
    if (!gate_results || typeof gate_results.passed_count !== 'number') {
      return NextResponse.json({ error: 'gate_results with passed_count required' }, { status: 400 })
    }
    if (gate_results.passed_count < 2) {
      return NextResponse.json(
        { error: 'Timeline Gate failed. passed_count must be >= 2.' },
        { status: 422 }
      )
    }

    const input: CreateDraftInput = {
      presence:         presence as 'ari' | 'eli',
      draft_text:       draft_text.trim(),
      significance:     significance as 'foundational' | 'significant' | 'standard',
      entry_type:       entry_type as string,
      source_context,
      decision_reason,
      gate_results,
    }

    const result = await createTimelineDraft(input)

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }

    return NextResponse.json({ draft: result.draft }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
