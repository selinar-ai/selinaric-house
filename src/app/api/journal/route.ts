import { NextRequest, NextResponse } from 'next/server'
import { getJournalEntries } from '@/lib/journal'

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
