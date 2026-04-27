import { NextRequest, NextResponse } from 'next/server'
import { getJournalEntries, deleteJournalEntry } from '@/lib/journal'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const presence = searchParams.get('presence')
  const filter = searchParams.get('filter') ?? 'all'

  if (!presence || !['ari', 'eli'].includes(presence)) {
    return NextResponse.json({ error: 'Invalid presence' }, { status: 400 })
  }

  try {
    const entries = await getJournalEntries(presence, { filter, limit: 50 })
    return NextResponse.json({ entries })
  } catch (err) {
    console.error('[api/journal] GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch journal entries' }, { status: 500 })
  }
}

// DELETE ?id=uuid — hard-delete a journal entry (Tara only; used to remove legacy system-generated entries)
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  try {
    const ok = await deleteJournalEntry(id)
    if (!ok) {
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[api/journal] DELETE error:', err)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
