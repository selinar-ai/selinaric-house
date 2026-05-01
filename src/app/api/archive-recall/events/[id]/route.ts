// Phase 28B + 28C — Recall Event detail
// GET /api/archive-recall/events/[id]
//
// Returns:
//   event           — the recall event row
//   entries         — resolved archive_items for each entry_id, with per-entry feedback
//                     { id, unavailable: true } for deleted/missing items
//   overall_feedback — feedback rows where archive_item_id IS NULL
//
// Rank score and rank reason are not stored per-entry in the events table (Phase 28B stores
// them only transiently in the chat response). Returns null for both — UI shows placeholder.
//
// Does not query archive_sources or archive_entry_drafts.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const ARCHIVE_DISPLAY: Record<string, string> = {
  velvet: 'Velvet',
  violet: 'Violet',
  house:  'House',
}

const STATUS_LABEL: Record<string, string> = {
  canonical:           'Memory',
  canonical_candidate: 'Memory candidate',
}

// UUID v4 format guard — prevents obviously invalid IDs from hitting DB
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Valid event ID required' }, { status: 400 })
  }

  const supabase = getSupabase()

  // ── Fetch the event ──────────────────────────────────────────────────────────
  const { data: event, error: eventErr } = await supabase
    .from('archive_recall_events')
    .select('id, presence_id, session_id, query, normalised_query, match_quality, recall_mode, auto_reason, entries_returned, entry_ids, created_at')
    .eq('id', id)
    .single()

  if (eventErr || !event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  // ── Fetch all feedback for this event ────────────────────────────────────────
  const { data: feedbackRaw, error: feedbackErr } = await supabase
    .from('archive_recall_feedback')
    .select('id, recall_event_id, archive_item_id, rating, created_at, updated_at')
    .eq('recall_event_id', id)
    .order('created_at', { ascending: true })

  if (feedbackErr) {
    console.error('[recall-events/id] feedback fetch error:', feedbackErr.message)
  }

  type FbRow = { id: string; recall_event_id: string; archive_item_id: string | null; rating: string; created_at: string; updated_at: string }
  const feedback: FbRow[] = (feedbackRaw ?? []) as FbRow[]

  // ── Resolve entry IDs to archive_items ───────────────────────────────────────
  const entryIds: string[] = (
    Array.isArray((event as { entry_ids?: unknown }).entry_ids)
      ? (event as { entry_ids: string[] }).entry_ids
      : []
  ).filter((id: unknown) => typeof id === 'string' && UUID_RE.test(id as string))

  type ArchiveRow = {
    id: string
    title: string
    archive_name: string
    owner_presence: string
    visibility: string
    source_origin: string
    category: string
    canonical_status: string
    sensitivity: string
    source_document: string | null
    source_date: string | null
    excerpt: string | null
  }

  let itemMap: Map<string, ArchiveRow> = new Map()

  if (entryIds.length > 0) {
    const { data: items, error: itemsErr } = await supabase
      .from('archive_items')
      .select('id, title, archive_name, owner_presence, visibility, source_origin, category, canonical_status, sensitivity, source_document, source_date, excerpt')
      .in('id', entryIds)
      .is('deleted_at', null)

    if (itemsErr) {
      console.error('[recall-events/id] items fetch error:', itemsErr.message)
    }

    itemMap = new Map(((items ?? []) as ArchiveRow[]).map(item => [item.id, item]))
  }

  // ── Index per-entry feedback by archive_item_id ───────────────────────────────
  const feedbackByEntry: Record<string, FbRow[]> = {}
  for (const fb of feedback) {
    if (fb.archive_item_id) {
      if (!feedbackByEntry[fb.archive_item_id]) feedbackByEntry[fb.archive_item_id] = []
      feedbackByEntry[fb.archive_item_id].push(fb)
    }
  }

  // ── Build entries array — preserving entry_ids order ──────────────────────────
  const entries = entryIds.map(eid => {
    const item = itemMap.get(eid)
    if (!item) return { id: eid, unavailable: true }

    return {
      id:              item.id,
      title:           item.title,
      archive_name:    item.archive_name,
      archive_label:   ARCHIVE_DISPLAY[item.archive_name] ?? item.archive_name,
      owner_presence:  item.owner_presence,
      visibility:      item.visibility,
      source_origin:   item.source_origin,
      category:        item.category,
      canonical_status: item.canonical_status,
      status_label:    STATUS_LABEL[item.canonical_status] ?? item.canonical_status,
      sensitivity:     item.sensitivity,
      source_document: item.source_document,
      source_date:     item.source_date,
      excerpt:         item.excerpt,
      rank_score:      null,   // not stored per-entry in Phase 28B events table
      rank_reason:     null,   // not stored per-entry in Phase 28B events table
      feedback:        feedbackByEntry[eid] ?? [],
    }
  })

  // ── Overall feedback (archive_item_id IS NULL) ───────────────────────────────
  const overall_feedback = feedback.filter(fb => fb.archive_item_id === null)

  return NextResponse.json({ event, entries, overall_feedback })
}
