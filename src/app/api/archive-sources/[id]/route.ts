// Phase 27B — Archive Source item GET + PATCH + DELETE
// GET    — fetch single source
// PATCH  — update title, notes, review_status, source_date, source_document, updated_by
// DELETE — soft delete (deleted_at = now())
// All handlers use Next.js 16 async params pattern.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { ReviewStatus } from '@/lib/archives'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const PATCHABLE_FIELDS = new Set([
  'title',
  'notes',
  'review_status',
  'source_date',
  'source_document',
  'updated_by',
])

const VALID_REVIEW_STATUSES: ReviewStatus[] = ['pending', 'reviewed', 'extracted']

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabase()
  const { id } = await context.params

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('archive_sources')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Archive source not found' }, { status: 404 })
  }

  return NextResponse.json({ source: data })
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabase()
  const { id } = await context.params

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Check item exists and is not deleted
  const { data: current, error: fetchError } = await supabase
    .from('archive_sources')
    .select('id, deleted_at')
    .eq('id', id)
    .single()

  if (fetchError || !current) {
    return NextResponse.json({ error: 'Archive source not found' }, { status: 404 })
  }
  if (current.deleted_at) {
    return NextResponse.json({ error: 'Cannot update a deleted archive source' }, { status: 410 })
  }

  // Validate review_status if provided
  if (body.review_status && !VALID_REVIEW_STATUSES.includes(body.review_status as ReviewStatus)) {
    return NextResponse.json({ error: 'Invalid review_status' }, { status: 400 })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of Object.keys(body)) {
    if (!PATCHABLE_FIELDS.has(key)) continue
    patch[key] = body[key] === '' ? null : body[key]
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('archive_sources')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ source: data })
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabase()
  const { id } = await context.params
  const { searchParams } = new URL(request.url)
  const deleteDrafts = searchParams.get('deleteDrafts') === 'true'

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('archive_sources')
    .update({ deleted_at: now, updated_at: now, updated_by: 'tara' })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Source not found or already deleted' }, { status: 404 })

  // Optionally soft-delete pending drafts from this source
  let draftsDeleted = 0
  if (deleteDrafts) {
    const { data: deletedDrafts } = await supabase
      .from('archive_entry_drafts')
      .update({ deleted_at: now, updated_at: now })
      .eq('source_id', id)
      .eq('draft_status', 'pending_review')
      .is('deleted_at', null)
      .select('id')

    draftsDeleted = deletedDrafts?.length ?? 0
  }

  return NextResponse.json({ deleted: true, id, draftsDeleted })
}
