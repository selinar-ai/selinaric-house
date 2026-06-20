// Phase 11E — Pulse Autonomy Events API
//
// GET /api/pulse/autonomy/events?presence=ari|eli&limit=12
// Returns recent autonomy events with Tara response data.

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
  const presence = searchParams.get('presence')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '12', 10), 50)

  const supabase = getSupabase()

  let query = supabase
    .from('pulse_autonomy_events')
    .select('*')
    .order('choice_window_at', { ascending: false })
    .limit(limit)

  if (presence === 'ari' || presence === 'eli') {
    query = query.eq('presence_id', presence)
  }

  const { data: events, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch Tara responses for telegram events
  const telegramEventIds = (events ?? [])
    .filter(e => e.chosen_action === 'telegram')
    .map(e => e.id)

  const responses: Record<string, { text: string; received_at: string }[]> = {}
  if (telegramEventIds.length > 0) {
    const { data: taraResponses } = await supabase
      .from('pulse_telegram_responses')
      .select('pulse_autonomy_event_id, tara_response_text, received_at')
      .in('pulse_autonomy_event_id', telegramEventIds)
      .order('received_at', { ascending: true })

    if (taraResponses) {
      for (const r of taraResponses) {
        const eid = r.pulse_autonomy_event_id
        if (!responses[eid]) responses[eid] = []
        responses[eid].push({
          text: r.tara_response_text,
          received_at: r.received_at,
        })
      }
    }
  }

  // Phase 11F — enrich house_deposit events with their linked Noticeboard item
  // (UI preview + "Open on Noticeboard" link). This is a UI surface only; the
  // deposit content is never injected into any presence prompt.
  const depositEventIds = (events ?? [])
    .filter(e => e.chosen_action === 'house_deposit')
    .map(e => e.id)

  const deposits: Record<string, { id: string; content: string; status: string; note_kind: string }> = {}
  if (depositEventIds.length > 0) {
    const { data: items } = await supabase
      .from('house_noticeboard_items')
      .select('id, content, status, note_kind, source_event_id')
      .in('source_event_id', depositEventIds)
      .eq('source_type', 'pulse_house_deposit')

    if (items) {
      for (const it of items) {
        if (it.source_event_id) {
          deposits[it.source_event_id] = {
            id: it.id,
            content: it.content,
            status: it.status,
            note_kind: it.note_kind,
          }
        }
      }
    }
  }

  // Enrich events with responses + linked deposit (if any)
  const enriched = (events ?? []).map(e => ({
    ...e,
    tara_responses: responses[e.id] ?? [],
    noticeboard_item: deposits[e.id] ?? null,
  }))

  return NextResponse.json({ events: enriched })
}
