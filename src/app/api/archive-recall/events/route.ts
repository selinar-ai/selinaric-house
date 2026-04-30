// Phase 28B — Recall Events list (debug/admin)
// GET ?presenceId=ari|eli&limit=20
// Returns recent recall events in descending order, no feedback included.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const presenceId = searchParams.get('presenceId')
  const limitParam = searchParams.get('limit')
  const limit = Math.min(Math.max(1, parseInt(limitParam ?? '20', 10) || 20), 100)

  const supabase = getSupabase()

  let query = supabase
    .from('archive_recall_events')
    .select('id, presence_id, session_id, query, normalised_query, match_quality, entries_returned, entry_ids, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (presenceId === 'ari' || presenceId === 'eli') {
    query = query.eq('presence_id', presenceId)
  }

  const { data, error } = await query

  if (error) {
    console.error('[recall-events] fetch error:', error.message)
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
  }

  return NextResponse.json({ events: data ?? [], total: (data ?? []).length })
}
