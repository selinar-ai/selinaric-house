// Phase 28B — Recall Feedback API
// POST { recallEventId, archiveItemId?, rating: 'helpful' | 'not_helpful' }
//
// Upserts one feedback row per (event, optional entry).
// Last-click-wins: submitting a different rating replaces the previous one.
// Partial unique indexes enforce the one-row-per-slot constraint:
//   idx_recall_feedback_entry   — per-entry rows (archive_item_id IS NOT NULL)
//   idx_recall_feedback_overall — overall rows   (archive_item_id IS NULL)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { recallEventId, archiveItemId, rating } = body

  if (!recallEventId || typeof recallEventId !== 'string') {
    return NextResponse.json({ error: 'recallEventId required' }, { status: 400 })
  }
  if (rating !== 'helpful' && rating !== 'not_helpful') {
    return NextResponse.json({ error: 'rating must be helpful or not_helpful' }, { status: 400 })
  }
  if (archiveItemId !== undefined && archiveItemId !== null && typeof archiveItemId !== 'string') {
    return NextResponse.json({ error: 'archiveItemId must be a string or null' }, { status: 400 })
  }

  const itemId: string | null = (typeof archiveItemId === 'string' && archiveItemId) ? archiveItemId : null
  const supabase = getSupabase()

  // Manual upsert via select → update or insert.
  // Partial unique indexes aren't directly addressable via Supabase JS onConflict,
  // so we do an explicit check-then-act. Race conditions are benign here — last write wins.
  const existingQuery = itemId
    ? supabase
        .from('archive_recall_feedback')
        .select('id')
        .eq('recall_event_id', recallEventId)
        .eq('archive_item_id', itemId)
        .maybeSingle()
    : supabase
        .from('archive_recall_feedback')
        .select('id')
        .eq('recall_event_id', recallEventId)
        .is('archive_item_id', null)
        .maybeSingle()

  const { data: existing, error: fetchErr } = await existingQuery

  if (fetchErr) {
    console.error('[recall-feedback] fetch error:', fetchErr.message)
    return NextResponse.json({ error: 'Failed to check existing feedback' }, { status: 500 })
  }

  if (existing) {
    // Update existing row
    const { data: updated, error: updateErr } = await supabase
      .from('archive_recall_feedback')
      .update({ rating, updated_at: new Date().toISOString() })
      .eq('id', (existing as { id: string }).id)
      .select('id, rating')
      .single()

    if (updateErr) {
      console.error('[recall-feedback] update error:', updateErr.message)
      return NextResponse.json({ error: 'Failed to update feedback' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, id: (updated as { id: string; rating: string }).id, rating: (updated as { id: string; rating: string }).rating })
  } else {
    // Insert new row
    const { data: inserted, error: insertErr } = await supabase
      .from('archive_recall_feedback')
      .insert({
        recall_event_id: recallEventId,
        archive_item_id: itemId,
        rating,
      })
      .select('id, rating')
      .single()

    if (insertErr) {
      console.error('[recall-feedback] insert error:', insertErr.message)
      return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, id: (inserted as { id: string; rating: string }).id, rating: (inserted as { id: string; rating: string }).rating })
  }
}
