// Phase 33E — Library Extraction Jobs API
//
// GET /api/library-extraction-jobs?file_id=X  — list jobs for a file
//
// Extraction is not Memory. Library media content is Library material only.

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  const fileId = request.nextUrl.searchParams.get('file_id')

  if (!fileId) {
    return NextResponse.json({ error: 'file_id is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('library_extraction_jobs')
    .select('*')
    .eq('file_id', fileId)
    .order('requested_at', { ascending: false })

  if (error) {
    console.error('[library-extraction-jobs] GET error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ jobs: data ?? [] })
}
