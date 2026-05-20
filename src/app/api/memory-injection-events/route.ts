// Phase 35C — Memory Injection Events API (Observability)
//
// GET /api/memory-injection-events?presenceId=ari|eli&limit=20
//
// Returns recent memory injection events for diagnostics.
// Tara can see why confirmed memories were or were not injected.

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
  const limitStr = searchParams.get('limit')
  const limit = Math.min(Math.max(1, parseInt(limitStr ?? '20', 10) || 20), 50)

  const supabase = getSupabase()

  let query = supabase
    .from('memory_injection_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (presenceId === 'ari' || presenceId === 'eli') {
    query = query.eq('presence_id', presenceId)
  }

  const { data, error } = await query

  if (error) {
    console.error('[memory-injection-events] fetch error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ events: data ?? [] })
}
