// POST /api/timeline-entries/edit
// Tara edits a kept Timeline entry. Versioned — creates a new version record.
// Increments current_version. Previous content preserved.

import { NextRequest, NextResponse } from 'next/server'
import { editTimelineEntry } from '@/lib/timeline-drafts'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { timeline_entry_id, new_content, edit_reason } = body as {
      timeline_entry_id: string
      new_content:       string
      edit_reason:       string
    }

    if (!timeline_entry_id || typeof timeline_entry_id !== 'string') {
      return NextResponse.json({ error: 'timeline_entry_id is required' }, { status: 400 })
    }
    if (!new_content || typeof new_content !== 'string' || !new_content.trim()) {
      return NextResponse.json({ error: 'new_content is required' }, { status: 400 })
    }
    if (!edit_reason || typeof edit_reason !== 'string' || !edit_reason.trim()) {
      return NextResponse.json({ error: 'edit_reason is required' }, { status: 400 })
    }

    const result = await editTimelineEntry(timeline_entry_id, new_content, edit_reason)

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }

    return NextResponse.json({ ok: true, version: result.version })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
