// Phase 27A — Archives API
// GET  ?archive_name=velvet|violet|house  — list by archive (Velvet / Violet tabs)
//      ?visibility=shared                 — list all shared items (House tab)
//      Always excludes soft-deleted rows (deleted_at IS NULL)
// POST { title, raw_content, ...defaults } — create new archive item
//      Defaults per tab are applied server-side; client passes tab context.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  VELVET_DEFAULTS,
  VIOLET_DEFAULTS,
  HOUSE_DEFAULTS,
  type ArchiveName,
  type ArchiveVisibility,
  type ArchiveCategory,
  type Sensitivity,
} from '@/lib/archives'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const VALID_ARCHIVE_NAMES: ArchiveName[] = ['velvet', 'violet', 'house']
const VALID_VISIBILITIES: ArchiveVisibility[] = ['ari_only', 'eli_only', 'shared', 'tara_only']

export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  const { searchParams } = new URL(request.url)
  const archiveName = searchParams.get('archive_name')
  const visibility = searchParams.get('visibility')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 200)

  // Validate filters
  if (archiveName && !VALID_ARCHIVE_NAMES.includes(archiveName as ArchiveName)) {
    return NextResponse.json({ error: 'Invalid archive_name' }, { status: 400 })
  }
  if (visibility && !VALID_VISIBILITIES.includes(visibility as ArchiveVisibility)) {
    return NextResponse.json({ error: 'Invalid visibility' }, { status: 400 })
  }

  let query = supabase
    .from('archive_items')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (archiveName) query = query.eq('archive_name', archiveName)
  if (visibility) query = query.eq('visibility', visibility)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ items: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { tab, title, raw_content, excerpt, import_label, source_document, source_date, category, sensitivity } = body

  // tab determines which defaults to apply
  const defaults =
    tab === 'velvet' ? VELVET_DEFAULTS :
    tab === 'violet' ? VIOLET_DEFAULTS :
    tab === 'house'  ? HOUSE_DEFAULTS  : null

  if (!defaults) {
    return NextResponse.json({ error: 'tab must be velvet | violet | house' }, { status: 400 })
  }

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }
  if (!raw_content || typeof raw_content !== 'string' || !raw_content.trim()) {
    return NextResponse.json({ error: 'raw_content is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('archive_items')
    .insert({
      ...defaults,
      title: (title as string).trim(),
      raw_content: (raw_content as string).trim(),
      excerpt: typeof excerpt === 'string' && excerpt.trim() ? excerpt.trim() : null,
      import_label: typeof import_label === 'string' && import_label.trim() ? import_label.trim() : null,
      source_document: typeof source_document === 'string' && source_document.trim() ? source_document.trim() : null,
      source_date: typeof source_date === 'string' && source_date.trim() ? source_date.trim() : null,
      category: (category as ArchiveCategory) || 'uncategorized',
      sensitivity: (sensitivity as Sensitivity) || 'private',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ item: data }, { status: 201 })
}
