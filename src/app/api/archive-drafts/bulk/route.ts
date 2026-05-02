// Phase 27D — Bulk actions for archive_entry_drafts
//
// POST { action, ids }
//   action: 'reject' | 'archive_only' | 'delete_pending'
//   ids: string[]  (max 100)
//
// reject        — sets draft_status = 'rejected' (no archive entry created)
// archive_only  — sets draft_status = 'archive_only' (no archive entry created)
// delete_pending — soft-deletes pending_review drafts only
//
// Bulk approve intentionally omitted from v1 — individual review remains required.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const VALID_ACTIONS = new Set(['reject', 'archive_only', 'delete_pending'])

export async function POST(request: NextRequest) {
  const supabase = getSupabase()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { action, ids } = body

  if (!action || !VALID_ACTIONS.has(action as string)) {
    return NextResponse.json({ error: 'action must be reject | archive_only | delete_pending' }, { status: 400 })
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 })
  }
  if (ids.length > 100) {
    return NextResponse.json({ error: 'Maximum 100 ids per request' }, { status: 400 })
  }

  const now = new Date().toISOString()

  if (action === 'reject') {
    const { data, error } = await supabase
      .from('archive_entry_drafts')
      .update({ draft_status: 'rejected', updated_at: now })
      .in('id', ids as string[])
      .eq('draft_status', 'pending_review')
      .is('deleted_at', null)
      .select('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ updated: (data ?? []).length, action })
  }

  if (action === 'archive_only') {
    const { data, error } = await supabase
      .from('archive_entry_drafts')
      .update({ draft_status: 'archive_only', updated_at: now })
      .in('id', ids as string[])
      .eq('draft_status', 'pending_review')
      .is('deleted_at', null)
      .select('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ updated: (data ?? []).length, action })
  }

  // action === 'delete_pending' — soft delete pending drafts only
  const { data, error } = await supabase
    .from('archive_entry_drafts')
    .update({ deleted_at: now, updated_at: now })
    .in('id', ids as string[])
    .eq('draft_status', 'pending_review')
    .is('deleted_at', null)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: (data ?? []).length, action })
}
