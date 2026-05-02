// Phase 29A — Memory Promotion bulk route
//
// POST /api/archive-memory/bulk
// Body: { action, ids, reason?, confirmedRisk? }
//
// Sets canonical_status (the single Memory authority) per the workflow mapping:
//   mark_candidate    → canonical_candidate
//   confirm_memory    → canonical
//   reject_memory     → archive_only
//   demote_memory     → needs_review
//   restore_candidate → canonical_candidate
//
// Separate route from /api/archives/bulk because Memory promotion has
// higher consequence than ordinary status/category/sensitivity edits.
// Every successful status change is audit-logged to archive_memory_events.
//
// Elevated sensitivities (schema-confirmed — migration 019):
//   'sacred' | 'sensitive' | 'technical'
//   Default sensitivity: 'private' — ordinary + private are non-elevated.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  MEMORY_BULK_ACTIONS,
  MEMORY_ACTION_SOURCES,
  MEMORY_ACTION_TARGET,
  ELEVATED_SENSITIVITIES,
  type MemoryBulkAction,
} from '@/lib/archive-memory'
import type { CanonicalStatus } from '@/lib/archives'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { action, ids, reason, confirmedRisk } = body

  // ─── Validate action ───────────────────────────────────────────────────────
  if (!action || !MEMORY_BULK_ACTIONS.includes(action as MemoryBulkAction)) {
    return NextResponse.json(
      { success: false, error: `action must be one of: ${MEMORY_BULK_ACTIONS.join(', ')}` },
      { status: 400 }
    )
  }

  // ─── Validate ids ──────────────────────────────────────────────────────────
  if (!ids || !Array.isArray(ids)) {
    return NextResponse.json({ success: false, error: 'ids must be an array' }, { status: 400 })
  }
  if (ids.length < 1 || ids.length > 100) {
    return NextResponse.json({ success: false, error: 'ids must contain 1–100 items' }, { status: 400 })
  }
  if (!ids.every(id => typeof id === 'string')) {
    return NextResponse.json({ success: false, error: 'all ids must be strings' }, { status: 400 })
  }
  if (reason !== undefined && typeof reason !== 'string') {
    return NextResponse.json({ success: false, error: 'reason must be a string if provided' }, { status: 400 })
  }

  const typedAction   = action as MemoryBulkAction
  const typedIds      = ids as string[]
  const safeReason    = typeof reason === 'string' ? reason.trim() || null : null

  const supabase = getSupabase()

  // ─── Fetch existing rows ────────────────────────────────────────────────────
  const { data: existing, error: fetchError } = await supabase
    .from('archive_items')
    .select('id, title, canonical_status, sensitivity, source_id')
    .in('id', typedIds)
    .is('deleted_at', null)

  if (fetchError || !existing) {
    return NextResponse.json(
      { success: false, error: fetchError?.message ?? 'Failed to fetch entries' },
      { status: 500 }
    )
  }

  if (existing.length === 0) {
    return NextResponse.json(
      { success: false, error: 'No matching entries found' },
      { status: 404 }
    )
  }

  // ─── Filter to rows with allowed canonical_status for this action ──────────
  const allowedFromStatuses = MEMORY_ACTION_SOURCES[typedAction]
  const eligible = existing.filter(e =>
    allowedFromStatuses.includes(e.canonical_status as CanonicalStatus)
  )

  if (eligible.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: `No selected entries are in a valid state for '${typedAction}'. ` +
               `Allowed from: ${allowedFromStatuses.join(', ')}.`,
      },
      { status: 422 }
    )
  }

  // ─── Extra safety: sensitive entry check for confirm_memory ───────────────
  if (typedAction === 'confirm_memory' && !confirmedRisk) {
    const sensitiveEntries = eligible.filter(e =>
      ELEVATED_SENSITIVITIES.includes(e.sensitivity)
    )
    if (sensitiveEntries.length > 0) {
      return NextResponse.json(
        {
          success: false,
          requiresConfirmation: true,
          warning: `${sensitiveEntries.length} selected entr${sensitiveEntries.length === 1 ? 'y is' : 'ies are'} sensitive. ` +
                   `Confirm before marking as Memory.`,
          sensitiveCount: sensitiveEntries.length,
        },
        { status: 200 }
      )
    }
  }

  const toStatus  = MEMORY_ACTION_TARGET[typedAction]   // canonical_status value to set
  const now       = new Date().toISOString()
  const eligibleIds = eligible.map(e => e.id)

  // ─── Update canonical_status ───────────────────────────────────────────────
  const { error: updateError } = await supabase
    .from('archive_items')
    .update({
      canonical_status: toStatus,
      updated_at:       now,
      updated_by:       'tara',
    })
    .in('id', eligibleIds)

  if (updateError) {
    return NextResponse.json(
      { success: false, error: updateError.message },
      { status: 500 }
    )
  }

  // ─── Audit log — one row per changed entry ─────────────────────────────────
  // from_status and to_status are canonical_status values.
  const auditRows = eligible.map(e => ({
    archive_item_id: e.id,
    from_status:     e.canonical_status as string,
    to_status:       toStatus as string,
    action:          typedAction,
    reason:          safeReason,
    created_by:      'tara',
    created_at:      now,
  }))

  const { error: auditError } = await supabase
    .from('archive_memory_events')
    .insert(auditRows)

  if (auditError) {
    // Update already committed — log and continue; don't fail the response
    console.error('[archive-memory/bulk] audit insert failed:', auditError.message)
  }

  return NextResponse.json({
    success:   true,
    updated:   eligibleIds.length,
    action:    typedAction,
    to_status: toStatus,
    skipped:   existing.length - eligibleIds.length,
  })
}
