// Phase 22B.1 — Build archive endpoint
// POST { buildId, reason? }
//
// Soft-deletes a build: sets desk_status = 'Archived', stamps archived_at,
// stores optional reason. Does NOT delete any rows or orphan history.
//
// Only Tara (manual user action) should call this.
// Presences never trigger archival silently.
//
// After archival:
// - Build is excluded from all active Desk and Workshop queries
// - Build history preserves the full audit trail
// - Related build_history events are not modified

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logBuildEvent } from '@/lib/build-history'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key)
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase()
  const body = await request.json()
  const { buildId, reason } = body

  if (!buildId) {
    return NextResponse.json({ error: 'buildId required' }, { status: 400 })
  }

  // Fetch current build
  const { data: current, error: fetchError } = await supabase
    .from('builds')
    .select('id, build_id, desk_status, workshop_status')
    .eq('id', buildId)
    .single()

  if (fetchError || !current) {
    return NextResponse.json({ error: 'Build not found' }, { status: 404 })
  }

  if (current.desk_status === 'Archived') {
    return NextResponse.json({ error: 'Build is already archived' }, { status: 409 })
  }

  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('builds')
    .update({
      desk_status:     'Archived',
      archived_at:     now,
      archived_reason: reason?.trim() || null,
      updated_at:      now,
    })
    .eq('id', buildId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Log archive event (non-blocking)
  logBuildEvent({
    buildId,
    eventType:      'archived',
    prevDeskStatus: current.desk_status,
    nextDeskStatus: 'Archived',
    prevWorkshopStatus: current.workshop_status ?? null,
    nextWorkshopStatus: current.workshop_status ?? null,
    actor:          'tara',
    note:           reason?.trim() || undefined,
  }).catch(() => {})

  return NextResponse.json({ build: data })
}
