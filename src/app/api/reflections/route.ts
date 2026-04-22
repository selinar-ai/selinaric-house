// Phase 24 / 24A — Reflections API
// GET  ?presenceId=ari|eli&type=pattern|lesson|tension|model_update&limit=20
//      Returns stored reflections with latest feedback label and review status.
//      Newest first. Optional reflection_type filter.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { VALID_REFLECTION_TYPES, type ReflectionType } from '@/lib/reflections/reflection-types'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const presenceId = searchParams.get('presenceId')
  const reflectionType = searchParams.get('type')
  const reviewStatus = searchParams.get('reviewStatus')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100)

  if (!presenceId || !['ari', 'eli'].includes(presenceId)) {
    return NextResponse.json({ error: 'presenceId required (ari|eli)' }, { status: 400 })
  }

  if (reflectionType && !VALID_REFLECTION_TYPES.includes(reflectionType as ReflectionType)) {
    return NextResponse.json(
      { error: `type must be one of: ${VALID_REFLECTION_TYPES.join(', ')}` },
      { status: 400 }
    )
  }

  const supabase = getSupabase()

  // Join with reflection_feedback so the UI can show review state without a second call
  let query = supabase
    .from('reflections')
    .select(`
      *,
      reflection_feedback (
        id,
        feedback_label,
        created_at
      )
    `)
    .eq('presence_id', presenceId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (reflectionType) {
    query = query.eq('reflection_type', reflectionType)
  }
  if (reviewStatus && ['unreviewed', 'reviewed'].includes(reviewStatus)) {
    query = query.eq('review_status', reviewStatus)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ reflections: data ?? [] })
}
