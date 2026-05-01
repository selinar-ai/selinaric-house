// Phase 28B + 28C + 28D — Recall Events list
// GET /api/archive-recall/events
//
// Query params:
//   presenceId?    'ari' | 'eli'
//   matchQuality?  'strong' | 'medium' | 'weak' | 'none'
//   mode?          'manual' | 'auto'  (Phase 28D)
//   hasFeedback?   'true' | 'false'
//   needsAttention? 'true'  (events with any not_helpful feedback)
//   q?             search string — matched against query + normalised_query
//   limit?         default 50, max 100
//   offset?        default 0
//
// Response includes feedback_summary per event.
// "Needs attention" = any feedback with rating = not_helpful.
//
// Actual schema field names (from migration 025 + 026):
//   archive_recall_events: id, presence_id, session_id, query, normalised_query,
//                          match_quality, entries_returned, entry_ids, created_at,
//                          recall_mode, auto_reason
//   archive_recall_feedback: id, recall_event_id, archive_item_id, rating, created_at, updated_at

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

  const presenceId    = searchParams.get('presenceId')
  const matchQuality  = searchParams.get('matchQuality')
  const mode          = searchParams.get('mode')
  const hasFeedback   = searchParams.get('hasFeedback')
  const needsAttention = searchParams.get('needsAttention')
  const q             = searchParams.get('q')?.trim() || null

  const safeLimit  = Math.min(Math.max(1, parseInt(searchParams.get('limit')  ?? '50', 10) || 50), 100)
  const safeOffset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10) || 0)

  const supabase = getSupabase()

  // ── Fetch events (up to 200 before post-filtering) ──────────────────────────
  // eslint-disable-next-line prefer-const
  let eventsQ = supabase
    .from('archive_recall_events')
    .select('id, presence_id, session_id, query, normalised_query, match_quality, recall_mode, auto_reason, entries_returned, entry_ids, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (presenceId === 'ari' || presenceId === 'eli') {
    eventsQ = eventsQ.eq('presence_id', presenceId)
  }
  if (matchQuality && ['strong', 'medium', 'weak', 'none'].includes(matchQuality)) {
    eventsQ = eventsQ.eq('match_quality', matchQuality)
  }
  if (mode && (mode === 'manual' || mode === 'auto')) {
    eventsQ = eventsQ.eq('recall_mode', mode)
  }
  if (q) {
    eventsQ = eventsQ.or(`query.ilike.%${q}%,normalised_query.ilike.%${q}%`)
  }

  const { data: rawEvents, error: eventsErr } = await eventsQ

  if (eventsErr) {
    console.error('[recall-events] fetch error:', eventsErr.message)
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
  }

  const events = rawEvents ?? []

  // ── Fetch all feedback for these events ─────────────────────────────────────
  type FeedbackRow = { id: string; recall_event_id: string; archive_item_id: string | null; rating: string; created_at: string }
  let allFeedback: FeedbackRow[] = []

  if (events.length > 0) {
    const eventIds = events.map(e => (e as { id: string }).id)
    const { data: fbData, error: fbErr } = await supabase
      .from('archive_recall_feedback')
      .select('id, recall_event_id, archive_item_id, rating, created_at')
      .in('recall_event_id', eventIds)

    if (fbErr) {
      console.error('[recall-events] feedback fetch error:', fbErr.message)
    } else {
      allFeedback = (fbData ?? []) as FeedbackRow[]
    }
  }

  // ── Compute per-event feedback summary ───────────────────────────────────────
  type FeedbackSummary = { total: number; helpful: number; not_helpful: number; has_attention: boolean }
  const summaryMap: Record<string, FeedbackSummary> = {}

  for (const fb of allFeedback) {
    if (!summaryMap[fb.recall_event_id]) {
      summaryMap[fb.recall_event_id] = { total: 0, helpful: 0, not_helpful: 0, has_attention: false }
    }
    const s = summaryMap[fb.recall_event_id]
    s.total++
    if (fb.rating === 'helpful') s.helpful++
    else if (fb.rating === 'not_helpful') { s.not_helpful++; s.has_attention = true }
  }

  const EMPTY_SUMMARY: FeedbackSummary = { total: 0, helpful: 0, not_helpful: 0, has_attention: false }

  type EventRow = {
    id: string
    presence_id: string
    session_id: string | null
    query: string
    normalised_query: string
    match_quality: string
    recall_mode: string
    auto_reason: string | null
    entries_returned: number
    entry_ids: string[]
    created_at: string
    feedback_summary: FeedbackSummary
  }

  // ── Attach summary + post-filter ────────────────────────────────────────────
  let withSummary: EventRow[] = (events as EventRow[]).map(e => ({
    ...e,
    feedback_summary: summaryMap[e.id] ?? EMPTY_SUMMARY,
  }))

  if (hasFeedback === 'true')    withSummary = withSummary.filter(e => e.feedback_summary.total > 0)
  if (hasFeedback === 'false')   withSummary = withSummary.filter(e => e.feedback_summary.total === 0)
  if (needsAttention === 'true') withSummary = withSummary.filter(e => e.feedback_summary.has_attention)

  // ── Summary stats (pre-pagination, for top cards) ────────────────────────────
  const stats = {
    total:          withSummary.length,
    strong:         withSummary.filter(e => e.match_quality === 'strong').length,
    weak_or_none:   withSummary.filter(e => e.match_quality === 'weak' || e.match_quality === 'none').length,
    has_attention:  withSummary.filter(e => e.feedback_summary.has_attention).length,
  }

  const total = withSummary.length
  const page  = withSummary.slice(safeOffset, safeOffset + safeLimit)

  return NextResponse.json({ events: page, total, stats })
}
