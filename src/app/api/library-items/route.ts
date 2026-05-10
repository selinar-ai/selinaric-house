// Phase 33B — Library Items API
//
// GET    /api/library-items       — list with filters
// POST   /api/library-items       — create item (with One Crown guard)
// PATCH  /api/library-items       — update item (with One Crown guard)
// DELETE /api/library-items       — delete item
//
// Reading is not remembering. The Library may store and display material.
// It may classify authority. It may not canonise Memory.

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// ─── One Crown Guard ────────────────────────────────────────────────────────
// canonical_memory is only valid when backed by canonical Archive proof.

async function verifyCanonicalMemory(
  supabase: ReturnType<typeof getSupabase>,
  authorityStatus: string,
  archiveItemId: string | null | undefined,
): Promise<{ valid: boolean; warning?: string }> {
  if (authorityStatus !== 'canonical_memory') {
    return { valid: true }
  }

  if (!archiveItemId) {
    return {
      valid: false,
      warning: 'canonical_memory label rejected: missing canonical Archive proof. Saved as archive_only.',
    }
  }

  const { data, error } = await supabase
    .from('archive_items')
    .select('canonical_status')
    .eq('id', archiveItemId)
    .single()

  if (error || !data || data.canonical_status !== 'canonical') {
    return {
      valid: false,
      warning: 'canonical_memory label rejected: missing canonical Archive proof. Saved as archive_only.',
    }
  }

  return { valid: true }
}

function downgradeCanonicalMemory(body: Record<string, unknown>) {
  return {
    ...body,
    authority_status: 'archive_only',
    derived_canonical_status: null,
    archive_item_id: null,
  }
}

// ─── GET ────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  const params = request.nextUrl.searchParams

  let query = supabase
    .from('library_items')
    .select('*')
    .order('created_at', { ascending: false })

  const collection = params.get('collection')
  if (collection) query = query.eq('collection', collection)

  const itemType = params.get('item_type')
  if (itemType) query = query.eq('item_type', itemType)

  const authorityStatus = params.get('authority_status')
  if (authorityStatus) query = query.eq('authority_status', authorityStatus)

  const presenceScope = params.get('presence_scope')
  if (presenceScope) query = query.eq('presence_scope', presenceScope)

  const phaseCode = params.get('phase_code')
  if (phaseCode) query = query.eq('phase_code', phaseCode)

  const search = params.get('search')?.trim()

  if (search) {
    // Search items directly + items with matching attachment extracted text
    // Phase 1: direct item field search
    query = query.or(
      `title.ilike.%${search}%,description.ilike.%${search}%,content_text.ilike.%${search}%,phase_label.ilike.%${search}%,phase_code.ilike.%${search}%`
    )
  }

  const { data, error } = await query

  if (error) {
    console.error('[library-items] GET error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let items = data ?? []

  // Phase 2: if searching, also find items via extracted attachment text
  // Search cleaned_extracted_text first (better OCR), then fall back to extracted_text
  let attachmentMatches: Record<string, string[]> | undefined
  if (search) {
    const { data: fileMatches } = await supabase
      .from('library_item_files')
      .select('library_item_id, file_name')
      .eq('extraction_status', 'extracted')
      .or(`cleaned_extracted_text.ilike.%${search}%,extracted_text.ilike.%${search}%`)

    if (fileMatches && fileMatches.length > 0) {
      // Build attachment match map
      attachmentMatches = {}
      for (const fm of fileMatches) {
        if (!attachmentMatches[fm.library_item_id]) {
          attachmentMatches[fm.library_item_id] = []
        }
        attachmentMatches[fm.library_item_id].push(fm.file_name)
      }

      // Find item IDs not already in results
      const existingIds = new Set(items.map(i => i.id))
      const missingIds = Object.keys(attachmentMatches).filter(id => !existingIds.has(id))

      if (missingIds.length > 0) {
        // Fetch the missing items (apply same filters except search)
        let extraQuery = supabase
          .from('library_items')
          .select('*')
          .in('id', missingIds)
          .order('created_at', { ascending: false })

        if (collection) extraQuery = extraQuery.eq('collection', collection)
        if (authorityStatus) extraQuery = extraQuery.eq('authority_status', authorityStatus)
        if (presenceScope) extraQuery = extraQuery.eq('presence_scope', presenceScope)

        const { data: extraItems } = await extraQuery
        if (extraItems) {
          items = [...items, ...extraItems]
        }
      }
    }
  }

  return NextResponse.json({
    items,
    ...(attachmentMatches ? { attachment_matches: attachmentMatches } : {}),
  })
}

// ─── POST ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = getSupabase()
  let body: Record<string, unknown>

  try {
    body = await request.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.title || typeof body.title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }
  if (!body.collection || typeof body.collection !== 'string') {
    return NextResponse.json({ error: 'collection is required' }, { status: 400 })
  }
  if (!body.item_type || typeof body.item_type !== 'string') {
    return NextResponse.json({ error: 'item_type is required' }, { status: 400 })
  }

  // One Crown guard
  let warning: string | undefined
  const check = await verifyCanonicalMemory(
    supabase,
    String(body.authority_status ?? 'library_reference'),
    body.archive_item_id as string | null | undefined,
  )
  if (!check.valid) {
    body = downgradeCanonicalMemory(body)
    warning = check.warning
  }

  const insertPayload = {
    title: body.title,
    description: body.description ?? null,
    collection: body.collection,
    item_type: body.item_type,
    phase_label: body.phase_label ?? null,
    phase_code: body.phase_code ?? null,
    phase_number: body.phase_number ?? null,
    authority_status: body.authority_status ?? 'library_reference',
    presence_scope: body.presence_scope ?? 'house',
    source_url: body.source_url ?? null,
    file_path: body.file_path ?? null,
    content_text: body.content_text ?? null,
    external_doc_id: body.external_doc_id ?? null,
    tags: Array.isArray(body.tags) ? body.tags : [],
    archive_item_id: body.archive_item_id ?? null,
    derived_canonical_status: body.derived_canonical_status ?? null,
  }

  const { data, error } = await supabase
    .from('library_items')
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    console.error('[library-items] POST error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ item: data, ...(warning ? { warning } : {}) }, { status: 201 })
}

// ─── PATCH ──────────────────────────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  const supabase = getSupabase()
  let body: Record<string, unknown>

  try {
    body = await request.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const id = body.id as string | undefined
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  // One Crown guard (if authority_status is being updated)
  let warning: string | undefined
  if (body.authority_status) {
    const check = await verifyCanonicalMemory(
      supabase,
      String(body.authority_status),
      body.archive_item_id as string | null | undefined,
    )
    if (!check.valid) {
      body = downgradeCanonicalMemory(body)
      warning = check.warning
    }
  }

  // Build update payload — only include fields that are present
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  const allowedFields = [
    'title', 'description', 'collection', 'item_type',
    'phase_label', 'phase_code', 'phase_number',
    'authority_status', 'presence_scope',
    'source_url', 'file_path', 'content_text', 'external_doc_id',
    'tags', 'archive_item_id', 'derived_canonical_status',
  ]

  for (const field of allowedFields) {
    if (field in body) {
      updatePayload[field] = body[field]
    }
  }

  const { data, error } = await supabase
    .from('library_items')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[library-items] PATCH error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ item: data, ...(warning ? { warning } : {}) })
}

// ─── DELETE ─────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  const supabase = getSupabase()
  let body: Record<string, unknown>

  try {
    body = await request.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const id = body.id as string | undefined
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('library_items')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[library-items] DELETE error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: true })
}
