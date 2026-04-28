// Phase 27B — Archive Drafts list API
// GET  ?archive_name=velvet|violet|house  — list pending drafts by archive
//      ?source_id=UUID                    — list drafts for a specific source
//      ?draft_status=pending_review|...   — optional status filter
//      Default: draft_status=pending_review, ordered by created_at DESC
//      Always excludes soft-deleted rows

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { ArchiveName, DraftStatus } from '@/lib/archives'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const VALID_ARCHIVE_NAMES: ArchiveName[] = ['velvet', 'violet', 'house']
const VALID_DRAFT_STATUSES: DraftStatus[] = ['pending_review', 'approved', 'rejected', 'merged', 'archive_only']

export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  const { searchParams } = new URL(request.url)
  const archiveName = searchParams.get('archive_name')
  const sourceId = searchParams.get('source_id')
  const draftStatus = searchParams.get('draft_status') ?? 'pending_review'
  const allStatuses = searchParams.get('all_statuses') === 'true'
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 200)

  if (archiveName && !VALID_ARCHIVE_NAMES.includes(archiveName as ArchiveName)) {
    return NextResponse.json({ error: 'Invalid archive_name' }, { status: 400 })
  }
  if (!allStatuses && !VALID_DRAFT_STATUSES.includes(draftStatus as DraftStatus)) {
    return NextResponse.json({ error: 'Invalid draft_status' }, { status: 400 })
  }

  let query = supabase
    .from('archive_entry_drafts')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (archiveName) query = query.eq('archive_name', archiveName)
  if (sourceId) query = query.eq('source_id', sourceId)
  if (!allStatuses) query = query.eq('draft_status', draftStatus)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ drafts: data ?? [] })
}
