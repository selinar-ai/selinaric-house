// POST /api/timeline-drafts/keep
// Tara keeps a pending draft, optionally with edited text.
// Creates permanent Timeline entry + version 1, marks draft kept.

import { NextRequest, NextResponse } from 'next/server'
import { keepTimelineDraft } from '@/lib/timeline-drafts'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { draft_id, edited_text, edit_reason } = body as {
      draft_id:      string
      edited_text?:  string
      edit_reason?:  string
    }

    if (!draft_id || typeof draft_id !== 'string') {
      return NextResponse.json({ error: 'draft_id is required' }, { status: 400 })
    }

    const result = await keepTimelineDraft(draft_id, edited_text, edit_reason)

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }

    return NextResponse.json({ entry: result.entry, draft: result.draft })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
