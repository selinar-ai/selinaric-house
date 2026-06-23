// Phase 11F — House Noticeboard item PATCH (Tara review / status)
//
// PATCH /api/noticeboard/[id]   { status: <target> }
//   Tara review controls: mark viewed, pin, release, hide, or route to a
//   Library/Archive review (status-only in this phase). Only the transitions in
//   ALLOWED_STATUS_TRANSITIONS are permitted.
//
// Governance — this route MUST NOT:
//   1. Create Memory.           5. Change canonical status.
//   2. Create Archive entries.  6. Create graph proposals.
//   3. Create Library items.    7. Create helper outputs.
//   4. Change prompt eligibility.
//
// It only ever updates status + review/status metadata (viewed_at / reviewed_at
// / reviewed_by). It NEVER touches content or any authority flag — those columns
// are immutable here and DB CHECK-constrained besides. Routing to a review is a
// status marker only; it does not auto-promote anything.
//
// Uses the Next.js 16 async params pattern.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  isAllowedStatusTransition,
  buildStatusUpdate,
  type HouseNoticeboardStatus,
} from '@/lib/house-noticeboard'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

const VALID_STATUSES: HouseNoticeboardStatus[] = [
  'active',
  'viewed',
  'pinned',
  'released',
  'routed_to_library_review',
  'routed_to_archive_review',
  'hidden',
]

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { status } = (body ?? {}) as { status?: unknown }

  if (typeof status !== 'string' || !(VALID_STATUSES as string[]).includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 },
    )
  }
  const target = status as HouseNoticeboardStatus

  const supabase = getSupabase()

  // Fetch current status to validate the transition.
  const { data: current, error: fetchErr } = await supabase
    .from('house_noticeboard_items')
    .select('id, status')
    .eq('id', id)
    .limit(1)
    .maybeSingle()

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }
  if (!current) {
    return NextResponse.json({ error: 'Noticeboard item not found' }, { status: 404 })
  }

  const from = current.status as HouseNoticeboardStatus
  if (from === target) {
    // No-op transition — return the item unchanged rather than error.
    const { data: unchanged } = await supabase
      .from('house_noticeboard_items')
      .select('*')
      .eq('id', id)
      .single()
    return NextResponse.json({ item: unchanged })
  }

  if (!isAllowedStatusTransition(from, target)) {
    return NextResponse.json(
      { error: `Transition not allowed: ${from} -> ${target}` },
      { status: 409 },
    )
  }

  // Only status + review/status metadata. Never content, never authority flags.
  const update = buildStatusUpdate(target, new Date().toISOString())

  const { data, error } = await supabase
    .from('house_noticeboard_items')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ item: data })
}
