// GET /api/timeline-entries/history?entry_id=uuid
// Returns all version records for a given Timeline entry, oldest first.

import { NextRequest, NextResponse } from 'next/server'
import { getTimelineEntryHistory } from '@/lib/timeline-drafts'

export async function GET(request: NextRequest) {
  const entryId = request.nextUrl.searchParams.get('entry_id')

  if (!entryId) {
    return NextResponse.json({ error: 'entry_id is required' }, { status: 400 })
  }

  const versions = await getTimelineEntryHistory(entryId)
  return NextResponse.json({ entry_id: entryId, versions })
}
