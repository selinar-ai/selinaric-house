// Phase 27A — Archive item PATCH + DELETE
// PATCH — update status, visibility, category, eligibility, review_notes, updated_by
//         Eligibility flags blocked if canonical_status !== 'canonical'
// DELETE — soft delete only: sets deleted_at = now()
//
// Phase 27D audit patch: any canonical_status change that constitutes a Memory
// workflow step (confirm_memory, reject_memory, demote_memory, mark_candidate,
// restore_candidate) is logged to archive_memory_events after the update.
// Audit failure is logged but never causes the PATCH to fail.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canToggleEligibility, type ArchiveItem, type CanonicalStatus } from '@/lib/archives'
import { deriveMemoryAuditAction } from '@/lib/archive-memory'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Fields that may be patched through this endpoint
const PATCHABLE_FIELDS = new Set([
  'canonical_status',
  'visibility',
  'category',
  'sensitivity',
  'eligible_for_recall',
  'eligible_for_embedding',
  'eligible_for_graph',
  'review_notes',
  'updated_by',
  'title',
  'excerpt',
  'import_label',
  'source_document',
  'source_date',
])

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

  // Fetch current item to enforce eligibility guard
  const { data: current, error: fetchError } = await supabase
    .from('archive_items')
    .select('canonical_status, deleted_at')
    .eq('id', id)
    .single()

  if (fetchError || !current) {
    return NextResponse.json({ error: 'Archive item not found' }, { status: 404 })
  }
  if (current.deleted_at) {
    return NextResponse.json({ error: 'Cannot update a deleted archive item' }, { status: 410 })
  }

  // Build patch — only allow safe fields
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of Object.keys(body)) {
    if (!PATCHABLE_FIELDS.has(key)) continue
    patch[key] = body[key]
  }

  // Eligibility guard: if request tries to set any eligibility flag to true,
  // the item (after this patch) must be canonical.
  // We check against the INCOMING canonical_status if it's being changed, else the current one.
  const incomingStatus = (patch.canonical_status ?? current.canonical_status) as string
  const eligibilityKeys = ['eligible_for_recall', 'eligible_for_embedding', 'eligible_for_graph']
  for (const key of eligibilityKeys) {
    if (patch[key] === true && incomingStatus !== 'canonical') {
      return NextResponse.json(
        { error: `${key} may only be true when canonical_status is 'canonical'` },
        { status: 422 }
      )
    }
  }

  // If status is being changed away from 'canonical', clear all eligibility flags
  if (
    patch.canonical_status &&
    patch.canonical_status !== 'canonical' &&
    current.canonical_status === 'canonical'
  ) {
    patch.eligible_for_recall = false
    patch.eligible_for_embedding = false
    patch.eligible_for_graph = false
  }

  // Phase 30B: when confirming as canonical via single-item PATCH,
  // auto-set eligible_for_recall=true (routing flag, not truth flag)
  if (
    patch.canonical_status === 'canonical' &&
    current.canonical_status !== 'canonical'
  ) {
    patch.eligible_for_recall = true
  }

  if (Object.keys(patch).length === 1) {
    // Only updated_at — nothing useful to update
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('archive_items')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ─── Audit log: memory workflow step ────────────────────────────────────────
  // Only fires when canonical_status changed AND the transition is a recognised
  // Memory workflow step. Audit failure is non-fatal.
  if (
    patch.canonical_status &&
    patch.canonical_status !== current.canonical_status
  ) {
    const auditAction = deriveMemoryAuditAction(
      current.canonical_status as CanonicalStatus,
      patch.canonical_status as CanonicalStatus
    )
    if (auditAction) {
      const { error: auditError } = await supabase
        .from('archive_memory_events')
        .insert({
          archive_item_id: id,
          from_status:     current.canonical_status,
          to_status:       patch.canonical_status as string,
          action:          auditAction,
          reason:          null,
          created_by:      'tara',
          created_at:      new Date().toISOString(),
        })
      if (auditError) {
        console.error('[archives/id] audit insert failed:', auditError.message)
      }
    }
  }

  return NextResponse.json({ item: data as ArchiveItem })
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabase()
  const { id } = await context.params

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Soft delete only — set deleted_at
  const { data, error } = await supabase
    .from('archive_items')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)  // only delete if not already deleted
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Item not found or already deleted' }, { status: 404 })

  return NextResponse.json({ deleted: true, id })
}
