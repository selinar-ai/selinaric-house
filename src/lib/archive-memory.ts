// Phase 29A + 30B — Memory promotion helpers + Eligibility governance
//
// canonical_status is the single Memory authority. This file provides:
//   - workflow action definitions
//   - canonical_status mappings for each action
//   - human-readable labels for the Memory workflow view
//   - elevated sensitivity definition (for extra confirmation)
//   - Phase 30B: eligibility audit + recall backfill helpers
//
// Memory workflow:
//   mark_candidate    → canonical_status = 'canonical_candidate'
//   confirm_memory    → canonical_status = 'canonical'
//   reject_memory     → canonical_status = 'archive_only'
//   demote_memory     → canonical_status = 'needs_review'
//   restore_candidate → canonical_status = 'canonical_candidate'
//
// Recall law (unchanged):
//   Manual recall = canonical + canonical_candidate
//   Auto-recall   = canonical only
//
// Eligibility law (Phase 30B):
//   eligible_for_recall is a routing flag only.
//   Setting it true does not bypass owner_presence, visibility, archive_name,
//   sensitivity gates, scope separation, auto-recall quality thresholds,
//   or sacred/elevated conditional rules (Phase 28F).
//   canonical_status remains the only Memory authority.
//
// Sensitivity values (schema-confirmed — migration 019):
//   'ordinary' | 'private' | 'sacred' | 'sensitive' | 'technical'
//   Default: 'private'
//   Elevated (requires extra confirmation): 'sacred' | 'sensitive' | 'technical'

import type { CanonicalStatus } from '@/lib/archives'

export type MemoryBulkAction =
  | 'mark_candidate'
  | 'confirm_memory'
  | 'reject_memory'
  | 'demote_memory'
  | 'restore_candidate'
  | 'hold_pending'

export const MEMORY_BULK_ACTIONS: MemoryBulkAction[] = [
  'mark_candidate',
  'confirm_memory',
  'reject_memory',
  'demote_memory',
  'restore_candidate',
  'hold_pending',
]

// Allowed from-states (canonical_status values) for each action
export const MEMORY_ACTION_SOURCES: Record<MemoryBulkAction, CanonicalStatus[]> = {
  mark_candidate:    ['staged', 'needs_review', 'duplicate', 'superseded', 'archive_only', 'excluded'],
  confirm_memory:    ['canonical_candidate', 'staged', 'needs_review'],
  reject_memory:     ['canonical_candidate', 'canonical', 'staged', 'needs_review'],
  demote_memory:     ['canonical'],
  restore_candidate: ['archive_only', 'excluded', 'needs_review'],
  hold_pending:      ['canonical_candidate', 'staged', 'needs_review'],
}

// Resulting canonical_status for each action.
// hold_pending is null — it preserves the current status (no transition).
export const MEMORY_ACTION_TARGET: Record<MemoryBulkAction, CanonicalStatus | null> = {
  mark_candidate:    'canonical_candidate',
  confirm_memory:    'canonical',
  reject_memory:     'archive_only',
  demote_memory:     'needs_review',
  restore_candidate: 'canonical_candidate',
  hold_pending:      null,
}

// Sensitivities that require extra confirmation before Memory promotion.
// Confirmed values (migration 019): ordinary | private | sacred | sensitive | technical
// Default: 'private'. Elevated = beyond ordinary/private.
export const ELEVATED_SENSITIVITIES: string[] = ['sacred', 'sensitive', 'technical']

// ─── Helpers ────────────────────────────────────────────────────────────────��─

export function isMemory(canonicalStatus: string | null | undefined): boolean {
  return canonicalStatus === 'canonical'
}

export function isMemoryCandidate(canonicalStatus: string | null | undefined): boolean {
  return canonicalStatus === 'canonical_candidate'
}

export function isRejectedForMemory(canonicalStatus: string | null | undefined): boolean {
  return canonicalStatus === 'archive_only'
}

/**
 * The set of canonical_status values that can appear as the *target* of a
 * memory audit event. Used by routes to decide whether to fetch pre-update
 * statuses before a bulk update.
 */
export const MEMORY_AUDIT_TARGET_STATUSES: ReadonlySet<CanonicalStatus> = new Set(
  Object.values(MEMORY_ACTION_TARGET).filter((v): v is CanonicalStatus => v !== null)
)

/**
 * Derive the MemoryBulkAction that describes a canonical_status transition,
 * or null if the transition is not a recognised memory workflow step.
 *
 * restore_candidate is checked before mark_candidate because both have
 * canonical_candidate as their target but narrower vs. broader from-sets;
 * we want the more-specific action name for archive_only / excluded sources.
 */
const AUDIT_ACTION_ORDER: MemoryBulkAction[] = [
  'restore_candidate',
  'confirm_memory',
  'reject_memory',
  'demote_memory',
  'mark_candidate',
]

export function deriveMemoryAuditAction(
  from: CanonicalStatus,
  to: CanonicalStatus
): MemoryBulkAction | null {
  if (from === to) return null
  for (const action of AUDIT_ACTION_ORDER) {
    if (
      MEMORY_ACTION_TARGET[action] === to &&
      (MEMORY_ACTION_SOURCES[action] as readonly string[]).includes(from)
    ) {
      return action
    }
  }
  return null
}

/**
 * Human-readable Memory workflow label for a canonical_status value.
 * Only covers the Memory-relevant states; falls back to the value itself.
 */
export function memoryWorkflowLabel(canonicalStatus: string | null | undefined): string {
  switch (canonicalStatus) {
    case 'canonical':          return 'Confirmed Memory'
    case 'canonical_candidate':return 'Memory Candidate'
    case 'archive_only':       return 'Archive Only'
    default:                   return 'Not Memory'
  }
}

/** Human-readable label for a MemoryBulkAction. */
export function memoryActionLabel(action: string): string {
  switch (action) {
    case 'confirm_memory':    return 'Confirmed as Memory'
    case 'reject_memory':     return 'Rejected for Memory'
    case 'mark_candidate':    return 'Marked as candidate'
    case 'demote_memory':     return 'Demoted from Memory'
    case 'restore_candidate': return 'Restored as candidate'
    case 'hold_pending':      return 'Held / kept pending'
    default:                  return action
  }
}

// ─── Phase 30B: Eligibility governance helpers ──────────────────────────────

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export interface EligibilityAuditResult {
  total_canonical: number
  canonical_recall_ineligible: number
  canonical_recall_eligible: number
  by_archive:     Record<string, number>
  by_owner:       Record<string, number>
  by_visibility:  Record<string, number>
  by_sensitivity: Record<string, number>
  by_category:    Record<string, number>
  sample_entries: { id: string; title: string; archive_name: string; sensitivity: string; category: string }[]
}

export interface EligibilityApplyResult {
  updated: number
  already_eligible: number
  total_canonical: number
  sample_titles: string[]
}

export async function getRecallEligibilityAudit(): Promise<EligibilityAuditResult> {
  const supabase = getSupabase()

  const { data: canonical, error } = await supabase
    .from('archive_items')
    .select('id, title, archive_name, owner_presence, visibility, sensitivity, category, eligible_for_recall')
    .eq('canonical_status', 'canonical')
    .is('deleted_at', null)

  if (error || !canonical) {
    console.error('[eligibility-audit] fetch error:', error?.message)
    return {
      total_canonical: 0, canonical_recall_ineligible: 0, canonical_recall_eligible: 0,
      by_archive: {}, by_owner: {}, by_visibility: {}, by_sensitivity: {}, by_category: {},
      sample_entries: [],
    }
  }

  const ineligible = canonical.filter(i => !i.eligible_for_recall)

  const countBy = (items: typeof ineligible, key: string) => {
    const counts: Record<string, number> = {}
    for (const item of items) {
      const val = (item as Record<string, unknown>)[key] as string ?? 'unknown'
      counts[val] = (counts[val] ?? 0) + 1
    }
    return counts
  }

  return {
    total_canonical:             canonical.length,
    canonical_recall_ineligible: ineligible.length,
    canonical_recall_eligible:   canonical.length - ineligible.length,
    by_archive:    countBy(ineligible, 'archive_name'),
    by_owner:      countBy(ineligible, 'owner_presence'),
    by_visibility: countBy(ineligible, 'visibility'),
    by_sensitivity:countBy(ineligible, 'sensitivity'),
    by_category:   countBy(ineligible, 'category'),
    sample_entries: ineligible.slice(0, 15).map(i => ({
      id: i.id, title: i.title, archive_name: i.archive_name,
      sensitivity: i.sensitivity, category: i.category,
    })),
  }
}

export async function applyRecallEligibilityBackfill(): Promise<EligibilityApplyResult> {
  const supabase = getSupabase()
  const now = new Date().toISOString()

  // Fetch IDs + titles of canonical entries that are currently ineligible
  const { data: targets, error: fetchErr } = await supabase
    .from('archive_items')
    .select('id, title, archive_name, owner_presence, visibility, sensitivity, category')
    .eq('canonical_status', 'canonical')
    .eq('eligible_for_recall', false)
    .is('deleted_at', null)

  if (fetchErr || !targets) {
    console.error('[eligibility-backfill] fetch error:', fetchErr?.message)
    return { updated: 0, already_eligible: 0, total_canonical: 0, sample_titles: [] }
  }

  if (targets.length === 0) {
    const { count } = await supabase
      .from('archive_items')
      .select('id', { count: 'exact', head: true })
      .eq('canonical_status', 'canonical')
      .is('deleted_at', null)
    return { updated: 0, already_eligible: count ?? 0, total_canonical: count ?? 0, sample_titles: [] }
  }

  const targetIds = targets.map(t => t.id)

  const { error: updateErr } = await supabase
    .from('archive_items')
    .update({ eligible_for_recall: true, updated_at: now, updated_by: 'phase-30b-backfill' })
    .in('id', targetIds)

  if (updateErr) {
    console.error('[eligibility-backfill] update error:', updateErr.message)
    return { updated: 0, already_eligible: 0, total_canonical: 0, sample_titles: [] }
  }

  // Count total canonical after update
  const { count: totalCanonical } = await supabase
    .from('archive_items')
    .select('id', { count: 'exact', head: true })
    .eq('canonical_status', 'canonical')
    .is('deleted_at', null)

  const sampleTitles = targets.slice(0, 10).map(t => t.title)

  // Breakdown for audit log
  const countBy = (key: string) => {
    const counts: Record<string, number> = {}
    for (const t of targets) {
      const val = (t as Record<string, unknown>)[key] as string ?? 'unknown'
      counts[val] = (counts[val] ?? 0) + 1
    }
    return counts
  }

  // Log to archive_eligibility_events
  await supabase.from('archive_eligibility_events').insert({
    event_type:     'recall_backfill',
    items_affected: targets.length,
    items_scanned:  (totalCanonical ?? 0),
    breakdown: {
      by_archive:    countBy('archive_name'),
      by_owner:      countBy('owner_presence'),
      by_visibility: countBy('visibility'),
      by_sensitivity:countBy('sensitivity'),
      by_category:   countBy('category'),
    },
    sample_titles: sampleTitles,
    created_by: 'tara',
    created_at: now,
  }).then(({ error: logErr }) => {
    if (logErr) console.error('[eligibility-backfill] audit log error:', logErr.message)
  })

  return {
    updated: targets.length,
    already_eligible: (totalCanonical ?? 0) - targets.length,
    total_canonical: totalCanonical ?? 0,
    sample_titles: sampleTitles,
  }
}
