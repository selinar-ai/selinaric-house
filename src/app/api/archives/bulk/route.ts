// Phase 27D — Bulk actions for archive_items (Archive Entries)
//
// POST { action, ids, value }
//   action: 'set_status' | 'set_category' | 'set_sensitivity'
//   ids:    string[]  (max 100)
//   value:  string    (validated server-side)
//
// set_status:      updates canonical_status; Memory ('canonical') requires confirmation on client,
//                  server enforces no auto-eligibility changes (those are per-item only)
// set_category:    updates category
// set_sensitivity: updates sensitivity
//
// Soft delete not included in bulk — use individual remove from ArchiveItemCard.
//
// Phase 27D audit patch: for set_status targeting a memory-relevant canonical_status,
// pre-fetches current statuses and inserts archive_memory_events rows (one per item
// whose status actually changes and whose transition is a recognised memory step).
// Audit failure is logged but never causes the bulk action to fail.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { CanonicalStatus, ArchiveCategory, Sensitivity } from '@/lib/archives'
import { deriveMemoryAuditAction, MEMORY_AUDIT_TARGET_STATUSES } from '@/lib/archive-memory'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const VALID_STATUSES: CanonicalStatus[] = [
  'staged', 'needs_review', 'canonical_candidate', 'canonical',
  'duplicate', 'superseded', 'archive_only', 'excluded',
]
const VALID_CATEGORIES: ArchiveCategory[] = [
  'relational_truth', 'identity_record', 'architectural_history', 'poetic_symbolic',
  'governance_law', 'ritual_practice', 'health_care', 'house_environment',
  'personal_context', 'superseded', 'uncategorized',
]
const VALID_SENSITIVITIES: Sensitivity[] = ['ordinary', 'private', 'sacred', 'sensitive', 'technical']

export async function POST(request: NextRequest) {
  const supabase = getSupabase()

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { action, ids, value } = body

  if (!['set_status', 'set_category', 'set_sensitivity'].includes(action as string)) {
    return NextResponse.json({ error: 'action must be set_status | set_category | set_sensitivity' }, { status: 400 })
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 })
  }
  if (ids.length > 100) {
    return NextResponse.json({ error: 'Maximum 100 ids per request' }, { status: 400 })
  }
  if (!value || typeof value !== 'string') {
    return NextResponse.json({ error: 'value is required' }, { status: 400 })
  }

  const now = new Date().toISOString()

  if (action === 'set_status') {
    if (!VALID_STATUSES.includes(value as CanonicalStatus)) {
      return NextResponse.json({ error: `Invalid status: ${value}` }, { status: 400 })
    }

    // ─── Pre-fetch current statuses for memory audit ─────────────────────────
    // Only needed when the target status can appear in a memory audit event.
    const toStatus = value as CanonicalStatus
    const needsAudit = MEMORY_AUDIT_TARGET_STATUSES.has(toStatus)
    const priorStatuses: Record<string, string> = {}

    if (needsAudit) {
      const { data: existing } = await supabase
        .from('archive_items')
        .select('id, canonical_status')
        .in('id', ids as string[])
        .is('deleted_at', null)
      for (const row of existing ?? []) {
        priorStatuses[row.id] = row.canonical_status
      }
    }

    // ─── Update ───────────────────────────────────────────────────────────────
    const { data, error } = await supabase
      .from('archive_items')
      .update({ canonical_status: value, updated_at: now, updated_by: 'tara' })
      .in('id', ids as string[])
      .is('deleted_at', null)
      .select('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // ─── Audit log ────────────────────────────────────────────────────────────
    if (needsAudit && (data ?? []).length > 0) {
      const auditRows = (data ?? [])
        .map(row => {
          const fromStatus = priorStatuses[row.id]
          if (!fromStatus || fromStatus === value) return null
          const auditAction = deriveMemoryAuditAction(fromStatus as CanonicalStatus, toStatus)
          if (!auditAction) return null
          return {
            archive_item_id: row.id,
            from_status:     fromStatus,
            to_status:       value,
            action:          auditAction,
            reason:          null,
            created_by:      'tara',
            created_at:      now,
          }
        })
        .filter(Boolean)

      if (auditRows.length > 0) {
        const { error: auditError } = await supabase
          .from('archive_memory_events')
          .insert(auditRows)
        if (auditError) {
          console.error('[archives/bulk] audit insert failed:', auditError.message)
        }
      }
    }

    return NextResponse.json({ updated: (data ?? []).length, action, value })
  }

  if (action === 'set_category') {
    if (!VALID_CATEGORIES.includes(value as ArchiveCategory)) {
      return NextResponse.json({ error: `Invalid category: ${value}` }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('archive_items')
      .update({ category: value, updated_at: now, updated_by: 'tara' })
      .in('id', ids as string[])
      .is('deleted_at', null)
      .select('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ updated: (data ?? []).length, action, value })
  }

  // action === 'set_sensitivity'
  if (!VALID_SENSITIVITIES.includes(value as Sensitivity)) {
    return NextResponse.json({ error: `Invalid sensitivity: ${value}` }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('archive_items')
    .update({ sensitivity: value, updated_at: now, updated_by: 'tara' })
    .in('id', ids as string[])
    .is('deleted_at', null)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ updated: (data ?? []).length, action, value })
}
