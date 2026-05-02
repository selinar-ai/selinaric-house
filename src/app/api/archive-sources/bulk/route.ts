// Phase 27D — Bulk actions for archive_sources (Past Conversations)
//
// POST { action, ids, deletePendingDrafts? }
//   action: 'mark_reviewed' | 'mark_skipped' | 'remove'
//   ids: string[]                           (max 100)
//   deletePendingDrafts?: boolean           (only applied for 'remove' action)
//
// All actions are soft-delete only. approved Archive Entries are never touched.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const VALID_ACTIONS = new Set(['mark_reviewed', 'mark_skipped', 'remove'])

export async function POST(request: NextRequest) {
  const supabase = getSupabase()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { action, ids, deletePendingDrafts } = body

  if (!action || !VALID_ACTIONS.has(action as string)) {
    return NextResponse.json({ error: 'action must be mark_reviewed | mark_skipped | remove' }, { status: 400 })
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 })
  }
  if (ids.length > 100) {
    return NextResponse.json({ error: 'Maximum 100 ids per request' }, { status: 400 })
  }

  const now = new Date().toISOString()

  if (action === 'mark_reviewed') {
    const { error } = await supabase
      .from('archive_sources')
      .update({ review_status: 'reviewed', updated_at: now, updated_by: 'tara' })
      .in('id', ids as string[])
      .is('deleted_at', null)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ updated: ids.length, action })
  }

  if (action === 'mark_skipped') {
    const { error } = await supabase
      .from('archive_sources')
      .update({ review_status: 'skipped', updated_at: now, updated_by: 'tara' })
      .in('id', ids as string[])
      .is('deleted_at', null)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ updated: ids.length, action })
  }

  // action === 'remove' — soft delete
  const { data: deleted, error: delError } = await supabase
    .from('archive_sources')
    .update({ deleted_at: now, updated_at: now, updated_by: 'tara' })
    .in('id', ids as string[])
    .is('deleted_at', null)
    .select('id')

  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

  const deletedIds = (deleted ?? []).map((r: { id: string }) => r.id)
  let draftsDeleted = 0

  if (deletePendingDrafts && deletedIds.length > 0) {
    const { data: removedDrafts } = await supabase
      .from('archive_entry_drafts')
      .update({ deleted_at: now, updated_at: now })
      .in('source_id', deletedIds)
      .eq('draft_status', 'pending_review')
      .is('deleted_at', null)
      .select('id')

    draftsDeleted = removedDrafts?.length ?? 0
  }

  return NextResponse.json({ deleted: deletedIds.length, draftsDeleted, action })
}
