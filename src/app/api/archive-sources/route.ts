// Phase 27B + 27D — Archive Sources API
// GET  ?archive_name=velvet|violet|house  — list sources by archive
//      ?review_status=pending|reviewed|extracted|skipped — optional filter
//      ?source_origin=chatgpt|claude|house|manual|unknown — optional filter
//      ?search=text — filter by title / source_document (client-side friendly; returned in full)
//      Always excludes soft-deleted rows
//      Phase 27D: response includes draft_count, pending_draft_count, entry_count per source
// POST { tab, title, raw_content, source_date?, source_document?, notes? }
//      Defaults applied server-side from tab. char_count computed on insert.
//      Max content: 500,000 characters (storage limit; extraction limit is separate).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  VELVET_SOURCE_DEFAULTS,
  VIOLET_SOURCE_DEFAULTS,
  HOUSE_SOURCE_DEFAULTS,
  type ArchiveName,
  type ReviewStatus,
} from '@/lib/archives'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const VALID_ARCHIVE_NAMES: ArchiveName[] = ['velvet', 'violet', 'house']
const VALID_REVIEW_STATUSES: ReviewStatus[] = ['pending', 'reviewed', 'extracted', 'skipped']
const MAX_CONTENT_CHARS = 500_000

export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  const { searchParams } = new URL(request.url)
  const archiveName   = searchParams.get('archive_name')
  const reviewStatus  = searchParams.get('review_status')
  const sourceOrigin  = searchParams.get('source_origin')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 200)

  if (archiveName && !VALID_ARCHIVE_NAMES.includes(archiveName as ArchiveName)) {
    return NextResponse.json({ error: 'Invalid archive_name' }, { status: 400 })
  }
  if (reviewStatus && !VALID_REVIEW_STATUSES.includes(reviewStatus as ReviewStatus)) {
    return NextResponse.json({ error: 'Invalid review_status' }, { status: 400 })
  }

  let query = supabase
    .from('archive_sources')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (archiveName)  query = query.eq('archive_name', archiveName)
  if (reviewStatus) query = query.eq('review_status', reviewStatus)
  if (sourceOrigin) query = query.eq('source_origin', sourceOrigin)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const sources = data ?? []

  // Phase 27D — enrich with curation counts
  if (sources.length === 0) {
    return NextResponse.json({ sources: [] })
  }

  const sourceIds = sources.map((s: { id: string }) => s.id)

  const [draftResult, entryResult] = await Promise.all([
    supabase
      .from('archive_entry_drafts')
      .select('source_id, draft_status')
      .in('source_id', sourceIds)
      .is('deleted_at', null),
    supabase
      .from('archive_items')
      .select('source_id')
      .in('source_id', sourceIds)
      .is('deleted_at', null)
      .not('source_id', 'is', null),
  ])

  // Build count maps
  const draftTotal: Record<string, number>   = {}
  const draftPending: Record<string, number> = {}
  for (const d of (draftResult.data ?? []) as { source_id: string; draft_status: string }[]) {
    draftTotal[d.source_id]  = (draftTotal[d.source_id]  ?? 0) + 1
    if (d.draft_status === 'pending_review') {
      draftPending[d.source_id] = (draftPending[d.source_id] ?? 0) + 1
    }
  }
  const entryTotal: Record<string, number> = {}
  for (const e of (entryResult.data ?? []) as { source_id: string | null }[]) {
    if (e.source_id) entryTotal[e.source_id] = (entryTotal[e.source_id] ?? 0) + 1
  }

  const enriched = sources.map((s: { id: string }) => ({
    ...s,
    draft_count:         draftTotal[s.id]   ?? 0,
    pending_draft_count: draftPending[s.id] ?? 0,
    entry_count:         entryTotal[s.id]   ?? 0,
  }))

  return NextResponse.json({ sources: enriched })
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { tab, title, raw_content, source_date, source_document, notes } = body

  const defaults =
    tab === 'velvet' ? VELVET_SOURCE_DEFAULTS :
    tab === 'violet' ? VIOLET_SOURCE_DEFAULTS :
    tab === 'house'  ? HOUSE_SOURCE_DEFAULTS  : null

  if (!defaults) {
    return NextResponse.json({ error: 'tab must be velvet | violet | house' }, { status: 400 })
  }

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }
  if (!raw_content || typeof raw_content !== 'string' || !raw_content.trim()) {
    return NextResponse.json({ error: 'raw_content is required' }, { status: 400 })
  }

  const trimmedContent = (raw_content as string).trim()
  if (trimmedContent.length > MAX_CONTENT_CHARS) {
    return NextResponse.json(
      { error: `raw_content exceeds ${MAX_CONTENT_CHARS.toLocaleString()} character storage limit` },
      { status: 422 }
    )
  }

  const { data, error } = await supabase
    .from('archive_sources')
    .insert({
      ...defaults,
      title: (title as string).trim(),
      raw_content: trimmedContent,
      char_count: trimmedContent.length,
      source_date: typeof source_date === 'string' && source_date.trim() ? source_date.trim() : null,
      source_document: typeof source_document === 'string' && source_document.trim() ? source_document.trim() : null,
      notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ source: data }, { status: 201 })
}
