// Phase 21 — Workshop actions API
// POST { buildId, action } — workshop decisions: approve | return | hold | reclassify
// Action 'approve' → desk_status: Committed, workshop_status: Committed
// Action 'return'  → desk_status: Returned for Edits, workshop_status: Returned
// Action 'hold'    → workshop_status: Held (desk unchanged)
// Action 'reopen'  → workshop_status: Ready to Commit (undo hold)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key)
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase()
  const body = await request.json()
  const { buildId, action, returnNotes } = body

  if (!buildId || !action) {
    return NextResponse.json({ error: 'buildId and action required' }, { status: 400 })
  }

  const now = new Date().toISOString()
  let patch: Record<string, unknown> = { updated_at: now }

  switch (action) {
    case 'approve':
      patch = {
        ...patch,
        desk_status: 'Committed',
        workshop_status: 'Committed',
      }
      break

    case 'return':
      patch = {
        ...patch,
        desk_status: 'Returned for Edits',
        workshop_status: 'Returned',
        // Optionally store return notes in the review bundle
        ...(returnNotes ? {
          forgekeeper_review: {
            _return_notes: returnNotes,
          }
        } : {}),
      }
      break

    case 'hold':
      patch = {
        ...patch,
        workshop_status: 'Held',
      }
      break

    case 'reopen':
      patch = {
        ...patch,
        workshop_status: 'Ready to Commit',
      }
      break

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }

  // For return with notes: merge into existing review rather than overwriting
  if (action === 'return' && returnNotes) {
    // Fetch current review first
    const { data: current } = await supabase
      .from('builds')
      .select('forgekeeper_review')
      .eq('id', buildId)
      .single()

    const existingReview = current?.forgekeeper_review ?? {}
    patch.forgekeeper_review = {
      ...existingReview,
      _return_notes: returnNotes,
      _returned_at: now,
    }
  }

  const { data, error } = await supabase
    .from('builds')
    .update(patch)
    .eq('id', buildId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ build: data })
}
