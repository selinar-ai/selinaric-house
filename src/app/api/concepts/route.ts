// Phase 22A — Desk Concepts API
// GET  ?presenceId=ari           — active concepts (pending + discussion)
// GET  ?presenceId=ari&history=true — all concepts
// POST                           — create concept (with frequency + lane enforcement)
// PATCH                          — update status (approve / reject / discussion)
//                                  approve + buildId sets related_build_id

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  getConceptPrefix,
  formatConceptId,
  activeConceptCount,
  CONCEPT_STATUS_ACTIVE,
  type DeskConcept,
} from '@/lib/concepts'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key)
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  const { searchParams } = new URL(request.url)
  const presenceId = searchParams.get('presenceId')
  const includeHistory = searchParams.get('history') === 'true'

  if (!presenceId || !['ari', 'eli'].includes(presenceId)) {
    return NextResponse.json({ error: 'presenceId required (ari|eli)' }, { status: 400 })
  }

  let query = supabase
    .from('desk_concepts')
    .select('*')
    .eq('presence_id', presenceId)
    .order('created_at', { ascending: false })

  if (!includeHistory) {
    query = query.in('status', CONCEPT_STATUS_ACTIVE)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ concepts: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase()
  const body = await request.json()
  const { presenceId, title, proposed, why, expected_scope, urgency } = body

  // --- Validation ---
  if (!presenceId || !['ari', 'eli'].includes(presenceId)) {
    return NextResponse.json({ error: 'Invalid presenceId' }, { status: 400 })
  }
  if (!title?.trim() || !proposed?.trim() || !why?.trim()) {
    return NextResponse.json({ error: 'title, proposed, and why are required' }, { status: 400 })
  }
  if (!['ari_only', 'eli_only', 'shared_house'].includes(expected_scope)) {
    return NextResponse.json({ error: 'Invalid expected_scope' }, { status: 400 })
  }

  // --- Frequency rule: max 1 pending concept per desk ---
  const { data: existing } = await supabase
    .from('desk_concepts')
    .select('id, status')
    .eq('presence_id', presenceId)
    .in('status', CONCEPT_STATUS_ACTIVE)

  if (activeConceptCount((existing ?? []) as DeskConcept[]) > 0) {
    return NextResponse.json(
      { error: 'An active concept already exists on this Desk. Resolve it before creating a new one.' },
      { status: 409 }
    )
  }

  // --- Generate concept ID ---
  const { count } = await supabase
    .from('desk_concepts')
    .select('*', { count: 'exact', head: true })
    .eq('presence_id', presenceId)

  const prefix = getConceptPrefix(presenceId as 'ari' | 'eli')
  const concept_id = formatConceptId(prefix, (count ?? 0) + 1)

  // --- Create ---
  const { data, error } = await supabase
    .from('desk_concepts')
    .insert({
      concept_id,
      presence_id: presenceId,
      title: title.trim(),
      proposed: proposed.trim(),
      why: why.trim(),
      expected_scope,
      urgency: urgency ?? 'medium',
      status: 'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ concept: data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = getSupabase()
  const body = await request.json()
  const { id, status, related_build_id } = body

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (!['approved', 'rejected', 'discussion'].includes(status)) {
    return NextResponse.json({ error: 'status must be approved | rejected | discussion' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  }
  if (related_build_id) updates.related_build_id = related_build_id

  const { data, error } = await supabase
    .from('desk_concepts')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ concept: data })
}
