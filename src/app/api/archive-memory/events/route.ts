// Phase 30 — Audit trail for archive memory events.
// GET /api/archive-memory/events?item_id=<uuid>
// Returns recent archive_memory_events for a single archive item.
// Read-only. Does not change canonical_status or any other field.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET(request: NextRequest) {
  const itemId = request.nextUrl.searchParams.get('item_id')
  if (!itemId) {
    return NextResponse.json({ error: 'item_id required' }, { status: 400 })
  }

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('archive_memory_events')
    .select('id, from_status, to_status, action, reason, created_by, created_at')
    .eq('archive_item_id', itemId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ events: data ?? [] })
}
