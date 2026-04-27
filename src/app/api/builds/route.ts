// Phase 21 — Builds API
// GET  ?origin=ari_desk|eli_desk|workshop  — list builds for a desk
// GET  ?id=uuid                            — single build detail
// POST                                     — create new build (auto-generates build_id)
// PATCH                                    — update build (fields or status)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  getOriginPrefix,
  formatBuildId,
  type BuildOrigin,
} from '@/lib/builds'
import { logBuildEvent, originToActor } from '@/lib/build-history'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key)
}

// --- GET ---

export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const origin = searchParams.get('origin')
  const includeHistory = searchParams.get('history') === 'true'

  // Single build fetch
  if (id) {
    const { data, error } = await supabase
      .from('builds')
      .select('*')
      .eq('id', id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    return NextResponse.json({ build: data })
  }

  // List by origin
  if (origin) {
    let query = supabase
      .from('builds')
      .select('*')
      .eq('origin', origin)
      .neq('desk_status', 'Archived')   // archived builds never appear in desk queries
      .order('created_at', { ascending: false })

    if (!includeHistory) {
      // Active: also exclude Committed from the active tab
      // (history tab shows all non-archived; active tab hides Committed too)
      query = query.neq('desk_status', 'Committed')
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ builds: data ?? [] })
  }

  // Workshop: all builds with a workshop_status, excluding archived
  const { data, error } = await supabase
    .from('builds')
    .select('*')
    .not('workshop_status', 'is', null)
    .neq('desk_status', 'Archived')     // archived builds never appear in Workshop
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ builds: data ?? [] })
}

// --- POST: Create a new build ---

export async function POST(request: NextRequest) {
  const supabase = getSupabase()
  const body = await request.json()
  const {
    origin,
    short_name,
    expected_scope,
    summary,
    reason,
    implementation_notes,
    changed_files,
    affected_surfaces,
    risks,
    tests_run,
    verify_focus,
    origin_concept_id,
    origin_concept_short_id,
  } = body

  if (!origin || !short_name) {
    return NextResponse.json({ error: 'origin and short_name required' }, { status: 400 })
  }

  // Generate next build_id for this origin
  const prefix = getOriginPrefix(origin as BuildOrigin)
  const { count } = await supabase
    .from('builds')
    .select('id', { count: 'exact', head: true })
    .like('build_id', `${prefix}-%`)

  const buildId = formatBuildId(prefix, (count ?? 0) + 1)

  const { data, error } = await supabase
    .from('builds')
    .insert({
      build_id: buildId,
      short_name: short_name.trim(),
      origin,
      expected_scope: expected_scope || (origin === 'ari_desk' ? 'ari_only' : origin === 'eli_desk' ? 'eli_only' : 'shared_house'),
      summary: summary || '',
      reason: reason || '',
      implementation_notes: implementation_notes || '',
      changed_files: changed_files || [],
      affected_surfaces: affected_surfaces || [],
      risks: risks || [],
      tests_run: tests_run || ['none_yet'],
      verify_focus: verify_focus || [],
      desk_status: 'Draft',
      workshop_status: null,
      consultation: null,
      forgekeeper_review: null,
      origin_concept_id: origin_concept_id || null,
      origin_concept_short_id: origin_concept_short_id || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log creation event (non-blocking — fire and forget)
  if (data?.id) {
    logBuildEvent({
      buildId: data.id,
      eventType: 'created',
      nextDeskStatus: 'Draft',
      actor: originToActor(origin),
    }).catch(() => {})
  }

  return NextResponse.json({ build: data })
}

// --- PATCH: Update build fields or status ---

export async function PATCH(request: NextRequest) {
  const supabase = getSupabase()
  const body = await request.json()
  const { id, ...updates } = body

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  // Fetch current build when a status-bearing change is incoming, so we can diff
  const isStatusChange = 'desk_status' in updates || 'workshop_status' in updates || 'consultation' in updates
  let prevDeskStatus: string | null = null
  let prevWorkshopStatus: string | null = null
  let prevOrigin: string | null = null

  if (isStatusChange) {
    const { data: current } = await supabase
      .from('builds')
      .select('desk_status, workshop_status, origin')
      .eq('id', id)
      .single()
    if (current) {
      prevDeskStatus = current.desk_status ?? null
      prevWorkshopStatus = current.workshop_status ?? null
      prevOrigin = current.origin ?? null
    }
  }

  // Always stamp updated_at
  const patch: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() }

  const { data, error } = await supabase
    .from('builds')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log the appropriate history event (non-blocking)
  if (data?.id && isStatusChange) {
    const nextDeskStatus: string | null = updates.desk_status ?? prevDeskStatus
    const nextWorkshopStatus: string | null = updates.workshop_status ?? prevWorkshopStatus
    const actor = prevOrigin ? originToActor(prevOrigin) : 'system'

    // Infer event type from the status transition
    type PatchEventType = import('@/lib/build-history').BuildEventType
    let eventType: PatchEventType | null = null

    if (updates.desk_status === 'Ready to Submit') {
      eventType = 'marked_ready'
    } else if (updates.desk_status === 'Sent for Verification') {
      eventType = 'sent_for_verification'
    } else if (updates.consultation) {
      const consultation = updates.consultation as Record<string, unknown>
      const cStatus = consultation?.status as string | undefined
      if (cStatus === 'requested')  eventType = 'consultation_requested'
      else if (cStatus === 'complete') eventType = 'consultation_responded'
      else if (cStatus === 'declined') eventType = 'consultation_declined'
      else                             eventType = 'updated'
    } else {
      eventType = 'updated'
    }

    if (eventType) {
      logBuildEvent({
        buildId: data.id,
        eventType,
        prevDeskStatus,
        nextDeskStatus,
        prevWorkshopStatus,
        nextWorkshopStatus,
        actor,
        note: updates._history_note as string | undefined,
      }).catch(() => {})
    }
  } else if (data?.id && !isStatusChange) {
    // Pure field update — log as 'updated' only if non-trivial fields changed
    const fieldKeys = Object.keys(updates).filter(k => !['updated_at', '_history_note'].includes(k))
    if (fieldKeys.length > 0) {
      logBuildEvent({
        buildId: data.id,
        eventType: 'updated',
        actor: 'system',
        note: `Fields updated: ${fieldKeys.join(', ')}`,
      }).catch(() => {})
    }
  }

  return NextResponse.json({ build: data })
}
