// Phase 39.7 — Runtime Recall Advisory Traces API
//
// GET /api/recall-advisory-traces
//
// Returns last N trace rows from runtime_recall_advisory_traces for
// the /recall debug surface. Read-only. No POST route.
//
// Returns metadata counts and instruction labels only.
// No raw content, no source IDs, no Memory IDs, no prompt text.
//
// Authority boundary:
//   Trace data is debug/UI visibility only.
//   It must never be used as a prompt source.
//   It must never become a RecallPacket source surface.
//   It must never be treated as Memory, evidence, or authority.

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Safe columns only — no governance flag columns (always true/false, not useful in UI),
// no error details beyond error_code, no raw content columns.
const SAFE_SELECT = [
  'id',
  'created_at',
  'route_surface',
  'presence_id',
  'room_context',
  'primary_response_instruction',
  'grounding_condition',
  'conflict_count',
  'active_source_count',
  'excluded_source_count',
  'confirmed_memory_count',
  'recent_continuity_count',
  'journal_count',
  'library_count',
  'cross_room_count',
  'archive_recall_count',
  'excluded_scope_count',
  'excluded_low_relevance_count',
  'excluded_expired_count',
  'advisory_inserted',
  'advisory_error',
  'error_code',
].join(', ')

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const presence = searchParams.get('presence')
    const route    = searchParams.get('route')
    const limitRaw = parseInt(searchParams.get('limit') ?? '25')
    const limit    = Math.min(Math.max(1, limitRaw), 50)

    const supabase = getSupabase()
    let query = supabase
      .from('runtime_recall_advisory_traces')
      .select(SAFE_SELECT)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (presence === 'ari' || presence === 'eli') {
      query = query.eq('presence_id', presence)
    }

    if (
      route === 'ari_chat' ||
      route === 'eli_chat' ||
      route === 'lounge_chat'
    ) {
      query = query.eq('route_surface', route)
    }

    const { data, error } = await query

    if (error) {
      console.error('[recall-advisory-traces] Query error:', error.message)
      return NextResponse.json({ traces: [], error: 'query_failed' })
    }

    return NextResponse.json({ traces: data ?? [] })
  } catch (err) {
    console.error('[recall-advisory-traces] Error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ traces: [], error: 'request_failed' })
  }
}
