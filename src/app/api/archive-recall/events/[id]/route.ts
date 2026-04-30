// Phase 28B — Recall Event detail (debug/admin)
// GET /api/archive-recall/events/[id]
// Returns a single recall event with its associated feedback rows.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  if (!id) {
    return NextResponse.json({ error: 'Event ID required' }, { status: 400 })
  }

  const supabase = getSupabase()

  const { data: event, error: eventErr } = await supabase
    .from('archive_recall_events')
    .select('id, presence_id, session_id, query, normalised_query, match_quality, entries_returned, entry_ids, created_at')
    .eq('id', id)
    .single()

  if (eventErr || !event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const { data: feedback, error: feedbackErr } = await supabase
    .from('archive_recall_feedback')
    .select('id, archive_item_id, rating, created_at, updated_at')
    .eq('recall_event_id', id)
    .order('created_at', { ascending: true })

  if (feedbackErr) {
    console.error('[recall-events/id] feedback fetch error:', feedbackErr.message)
  }

  return NextResponse.json({ event, feedback: feedback ?? [] })
}
