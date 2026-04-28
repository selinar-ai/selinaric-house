// Phase 27B — Archive Sources API
// GET  ?archive_name=velvet|violet|house  — list sources by archive
//      ?review_status=pending|reviewed|extracted — optional filter
//      Always excludes soft-deleted rows
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
const VALID_REVIEW_STATUSES: ReviewStatus[] = ['pending', 'reviewed', 'extracted']
const MAX_CONTENT_CHARS = 500_000

export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  const { searchParams } = new URL(request.url)
  const archiveName = searchParams.get('archive_name')
  const reviewStatus = searchParams.get('review_status')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100)

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

  if (archiveName) query = query.eq('archive_name', archiveName)
  if (reviewStatus) query = query.eq('review_status', reviewStatus)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ sources: data ?? [] })
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
