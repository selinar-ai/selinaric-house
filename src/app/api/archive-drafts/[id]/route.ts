// Phase 27B — Archive Draft item PATCH + DELETE
// PATCH { action: 'approve' | 'reject' | 'edit_approve' | 'merge' | 'archive_only', ...fields }
//   approve      — create archive_item (canonical_candidate or archive_only per suggested), mark merged
//   reject       — mark rejected, no archive_item created
//   edit_approve — update proposed_title/proposed_content first, then approve (creates archive_item)
//   merge        — create archive_item with canonical_status='canonical', mark merged
//   archive_only — create archive_item with canonical_status='archive_only', mark archive_only
//   Also supports: patch review_notes, proposed_title, proposed_content, proposed_category,
//                  proposed_sensitivity, proposed_visibility, suggested_memory_status
// DELETE — soft delete only
// All handlers use Next.js 16 async params pattern.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  suggestedToCanonicalStatus,
  type ArchiveEntryDraft,
  type DraftStatus,
  type ArchiveCategory,
  type Sensitivity,
  type ArchiveVisibility,
  type SuggestedMemoryStatus,
  type CanonicalStatus,
} from '@/lib/archives'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const APPROVAL_ACTIONS = new Set(['approve', 'reject', 'edit_approve', 'merge', 'archive_only'])

const DIRECT_PATCH_FIELDS = new Set([
  'review_notes',
  'proposed_title',
  'proposed_content',
  'proposed_category',
  'proposed_sensitivity',
  'proposed_visibility',
  'suggested_memory_status',
])

// Creates an archive_item from a draft and returns the new item's id
async function createArchiveItemFromDraft(
  supabase: ReturnType<typeof getSupabase>,
  draft: ArchiveEntryDraft,
  canonicalStatus: CanonicalStatus
): Promise<string | null> {
  const isCanonical = canonicalStatus === 'canonical'

  const { data, error } = await supabase
    .from('archive_items')
    .insert({
      archive_name: draft.archive_name,
      owner_presence: draft.owner_presence,
      source_origin: 'house',  // Created by the house system from extraction
      visibility: draft.proposed_visibility,
      title: draft.proposed_title,
      raw_content: draft.proposed_content,
      excerpt: null,
      category: draft.proposed_category,
      canonical_status: canonicalStatus,
      sensitivity: draft.proposed_sensitivity,
      eligible_for_recall: isCanonical,
      eligible_for_embedding: false,
      eligible_for_graph: false,
      import_label: `Extracted by ${draft.extracted_by}`,
      review_notes: draft.extraction_rationale ?? null,
      source_id: draft.source_id ?? null,   // Phase 28E — preserve source traceability
      created_by: 'tara',
      updated_by: 'tara',
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[draft] archive_item creation failed:', error?.message)
    return null
  }
  return data.id
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

  // Fetch current draft
  const { data: current, error: fetchError } = await supabase
    .from('archive_entry_drafts')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (fetchError || !current) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  const draft = current as ArchiveEntryDraft
  const action = body.action as string | undefined

  // --- Action-based handlers ---
  if (action) {
    if (!APPROVAL_ACTIONS.has(action)) {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }

    if (action === 'reject') {
      const { data, error } = await supabase
        .from('archive_entry_drafts')
        .update({
          draft_status: 'rejected' as DraftStatus,
          review_notes: typeof body.review_notes === 'string' ? body.review_notes : draft.review_notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ draft: data })
    }

    // For approve, edit_approve, merge, archive_only — create archive_item
    let canonicalStatus: CanonicalStatus

    if (action === 'merge') {
      canonicalStatus = 'canonical'
    } else if (action === 'archive_only') {
      canonicalStatus = 'archive_only'
    } else {
      // approve or edit_approve: use suggested_memory_status mapping
      const suggested = (body.suggested_memory_status ?? draft.suggested_memory_status) as SuggestedMemoryStatus
      canonicalStatus = suggestedToCanonicalStatus(suggested)
    }

    // Apply field edits for edit_approve
    const updatedDraft = { ...draft }
    if (action === 'edit_approve') {
      if (typeof body.proposed_title === 'string' && body.proposed_title.trim()) {
        updatedDraft.proposed_title = body.proposed_title.trim()
      }
      if (typeof body.proposed_content === 'string' && body.proposed_content.trim()) {
        updatedDraft.proposed_content = body.proposed_content.trim()
      }
      if (body.proposed_category) updatedDraft.proposed_category = body.proposed_category as ArchiveCategory
      if (body.proposed_sensitivity) updatedDraft.proposed_sensitivity = body.proposed_sensitivity as Sensitivity
      if (body.proposed_visibility) updatedDraft.proposed_visibility = body.proposed_visibility as ArchiveVisibility
    }

    // Create archive_item
    const archiveItemId = await createArchiveItemFromDraft(supabase, updatedDraft, canonicalStatus)
    if (!archiveItemId) {
      return NextResponse.json({ error: 'Failed to create archive item from draft' }, { status: 500 })
    }

    const finalDraftStatus: DraftStatus = action === 'archive_only' ? 'archive_only' : 'merged'

    const { data, error } = await supabase
      .from('archive_entry_drafts')
      .update({
        ...updatedDraft,
        draft_status: finalDraftStatus,
        archive_item_id: archiveItemId,
        review_notes: typeof body.review_notes === 'string' ? body.review_notes : draft.review_notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ draft: data, archive_item_id: archiveItemId })
  }

  // --- Direct field patch (no action) ---
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of Object.keys(body)) {
    if (!DIRECT_PATCH_FIELDS.has(key)) continue
    patch[key] = body[key] === '' ? null : body[key]
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('archive_entry_drafts')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ draft: data })
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabase()
  const { id } = await context.params

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('archive_entry_drafts')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Draft not found or already deleted' }, { status: 404 })

  return NextResponse.json({ deleted: true, id })
}
