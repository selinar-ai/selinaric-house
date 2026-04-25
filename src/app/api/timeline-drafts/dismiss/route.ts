// POST /api/timeline-drafts/dismiss
// Tara dismisses a pending draft. No Timeline entry is created.
// Draft remains in DB for audit; removed from Pending view.

import { NextRequest, NextResponse } from 'next/server'
import { dismissTimelineDraft } from '@/lib/timeline-drafts'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { draft_id } = body as { draft_id: string }

    if (!draft_id || typeof draft_id !== 'string') {
      return NextResponse.json({ error: 'draft_id is required' }, { status: 400 })
    }

    const result = await dismissTimelineDraft(draft_id)

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
