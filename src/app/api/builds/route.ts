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
      .order('created_at', { ascending: false })

    if (!includeHistory) {
      // Active: exclude terminal-only builds from the active tab
      // (history tab shows all; active tab hides Committed)
      query = query.neq('desk_status', 'Committed')
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ builds: data ?? [] })
  }

  // Workshop: all builds with a workshop_status (submitted builds)
  const { data, error } = await supabase
    .from('builds')
    .select('*')
    .not('workshop_status', 'is', null)
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
    changed_files,
    affected_surfaces,
    risks,
    tests_run,
    verify_focus,
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
      changed_files: changed_files || [],
      affected_surfaces: affected_surfaces || [],
      risks: risks || [],
      tests_run: tests_run || ['none_yet'],
      verify_focus: verify_focus || [],
      desk_status: 'Draft',
      workshop_status: null,
      consultation: null,
      forgekeeper_review: null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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

  // Always stamp updated_at
  const patch: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() }

  const { data, error } = await supabase
    .from('builds')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ build: data })
}
