// Phase 29A — Memory promotion helpers
//
// canonical_status is the single Memory authority. This file provides:
//   - workflow action definitions
//   - canonical_status mappings for each action
//   - human-readable labels for the Memory workflow view
//   - elevated sensitivity definition (for extra confirmation)
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
