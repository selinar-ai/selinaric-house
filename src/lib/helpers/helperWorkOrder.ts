/**
 * Phase 42.2.1 — Delegated work-order core (pure)
 *
 * The deterministic, testable heart of the first delegated action,
 * `retry_extraction`. PURE: no I/O, no DB, no fetch, no extraction. The route
 * (`/api/helpers/outputs/[id]/delegate/retry-extraction`) supplies all I/O and
 * calls into here for: deciding whether an output is delegatable, finding the one
 * target file, building the work order, shaping before/after snapshots, the
 * action-specific field whitelist, and the allowed status transitions.
 *
 * ── Law ──────────────────────────────────────────────────────────────────────
 *   A delegated apply is LABOUR, not authority. The executor may only ever touch
 *   the one whitelisted surface (a library_item_file's extraction state). It may
 *   NOT reach Library authority fields, tags/title/description, archive links,
 *   canonical fields, or any other surface — by payload or by accident. Nothing
 *   here becomes Memory, evidence, prompt authority, Graph truth, or Archive
 *   truth. Tara's approval is the only thing that moves an arm.
 */

import type { HelperOutputRow } from './helperReviewPresenter'

export const RETRY_EXTRACTION = 'retry_extraction'
export const DELEGATABLE_TARGET_SURFACE = 'library_item_file'

// ── Workshop copy (delegated apply — extraction retry only) ──
export const WORKSHOP_DELEGATE_RETRY_LABEL = 'Approve & retry extraction'
export const WORKSHOP_ROLLBACK_LABEL = 'Roll back'
export const WORKSHOP_APPLY_TRACE_TITLE = 'Apply trace'
export const WORKSHOP_DELEGATE_CAPTION =
  'Approve authorises the helper to retry extraction for this one file, under ' +
  'audit and reversible. It does not move authority, Memory, evidence, prompt ' +
  'visibility, Graph truth, or Archive truth.'

/** The one issue code that is delegatable in this slice (Ari). */
export const DELEGATABLE_EXTRACTION_ISSUE = 'file_extraction_not_run'

// ─────────────────────────────────────────────────────────────────────────────
// Action contract — the whitelist the executor must obey
// ─────────────────────────────────────────────────────────────────────────────

/** The ONLY fields the executor may write to the target library_item_file. */
export const ALLOWED_EXTRACTION_WRITE_FIELDS = [
  'extraction_status',
  'extracted_text',
  'extracted_at',
  'extraction_error',
  'extraction_char_count',
  'extraction_truncated',
  'extraction_method',
] as const

/** Hard-forbidden fields — never reachable by the executor, by any payload. */
export const FORBIDDEN_WRITE_FIELDS = [
  'authority_status',
  'derived_canonical_status',
  'archive_item_id',
  'tags',
  'title',
  'description',
  'collection',
  'item_type',
  'library_item_id',
  'id',
] as const

export const RETRY_EXTRACTION_CONTRACT = {
  action_type: RETRY_EXTRACTION,
  tier: 3,
  allowed_target_surface: DELEGATABLE_TARGET_SURFACE,
  allowed_operation: 'retry/run extraction for one library_item_file',
  allowed_write_fields: ALLOWED_EXTRACTION_WRITE_FIELDS,
  forbidden_write_fields: FORBIDDEN_WRITE_FIELDS,
} as const

/**
 * Guard: every key of an extraction update payload must be in the allowed set.
 * Throws on the first key outside the whitelist — the executor cannot mutate a
 * Library authority field (or anything else) by payload accident.
 */
export function assertOnlyExtractionFields(payload: Record<string, unknown>): void {
  const allowed = new Set<string>(ALLOWED_EXTRACTION_WRITE_FIELDS)
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) {
      throw new Error(`retry_extraction executor may not write field '${key}' (action whitelist)`)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Delegatability + target — derived from the helper output (read-only)
// ─────────────────────────────────────────────────────────────────────────────

function issueCodeOf(row: HelperOutputRow): string | null {
  const p = row.suggestion_payload
  if (p && typeof p === 'object' && !Array.isArray(p)) {
    const c = (p as Record<string, unknown>).issue_code
    if (typeof c === 'string') return c
  }
  return null
}

/**
 * True only for the one delegatable extraction output: the deterministic
 * library_metadata_helper `file_extraction_not_run` issue, not soft-deleted,
 * with exactly one library_item_file source ref. Everything else (tags, title,
 * other extraction issues, anything authority-bearing) returns false.
 */
export function isDelegatableExtractionOutput(row: HelperOutputRow): boolean {
  if (row.helper_type !== 'library_metadata_helper') return false
  if (row.deleted_at != null) return false
  if (issueCodeOf(row) !== DELEGATABLE_EXTRACTION_ISSUE) return false
  if (row.suggested_action !== 'check_extraction_status') return false
  return extractionFileTarget(row) !== null
}

/** The single library_item_file target id, or null if not exactly one. */
export function extractionFileTarget(row: HelperOutputRow): string | null {
  const files = (row.source_refs ?? []).filter((r) => r.source_surface === DELEGATABLE_TARGET_SURFACE)
  return files.length === 1 ? files[0].source_id : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Work order build (lazy — created at Tara's approval click)
// ─────────────────────────────────────────────────────────────────────────────

export type WorkOrderInsert = {
  helper_output_id: string
  action_type: string
  target_surface: string
  target_id: string
  tier: number
  status: 'approved'
  proposed_change: Record<string, unknown>
  approved_by: 'tara'
  approved_at: string
  not_memory: true
  not_evidence: true
  prompt_eligible: false
  authority_changed: false
  test_owned: boolean
}

/**
 * Build the work-order insert for a delegatable extraction output. Created
 * lazily at approval, so it is born `approved` (approved_by = tara). Throws if
 * the row is not delegatable — the route must check first.
 */
export function buildRetryExtractionWorkOrder(row: HelperOutputRow, nowIso: string, testOwned = false): WorkOrderInsert {
  if (!isDelegatableExtractionOutput(row)) {
    throw new Error('helperWorkOrder: output is not a delegatable extraction issue')
  }
  const targetId = extractionFileTarget(row)
  if (!targetId) throw new Error('helperWorkOrder: no single library_item_file target')
  return {
    helper_output_id: row.id,
    action_type: RETRY_EXTRACTION,
    target_surface: DELEGATABLE_TARGET_SURFACE,
    target_id: targetId,
    tier: 3,
    status: 'approved',
    proposed_change: { action: RETRY_EXTRACTION },
    approved_by: 'tara',
    approved_at: nowIso,
    not_memory: true,
    not_evidence: true,
    prompt_eligible: false,
    authority_changed: false,
    test_owned: testOwned === true,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshots — extraction STATE only (never the text content)
// ─────────────────────────────────────────────────────────────────────────────

export type ExtractionFileState = {
  extraction_status?: string | null
  extracted_text?: string | null
  extraction_char_count?: number | null
  extraction_error?: string | null
  extraction_method?: string | null
  extraction_truncated?: boolean | null
  extracted_at?: string | null
}

export type ExtractionSnapshot = {
  extraction_status: string | null
  extracted_text_present: boolean
  extracted_text_length: number
  extraction_char_count: number | null
  extraction_error: string | null
  // Exact prior scalar metadata — captured for BIT-EXACT rollback. These are not
  // body content; restore returns each field to precisely its prior value (no
  // rollback marker), so a rolled-back Library row is indistinguishable from one
  // whose extraction never ran.
  extraction_method: string | null
  extraction_truncated: boolean | null
  extracted_at: string | null
}

/**
 * Capture the file's extraction STATE. Records the *presence and length* of
 * extracted_text — never the text itself — so the audit can never carry Library
 * body content. Also captures the exact prior scalar metadata the executor
 * mutates, so rollback can restore bit-exactly. Used for before/after snapshots.
 */
export function buildExtractionSnapshot(file: ExtractionFileState): ExtractionSnapshot {
  const text = typeof file.extracted_text === 'string' ? file.extracted_text : ''
  return {
    extraction_status: file.extraction_status ?? null,
    extracted_text_present: text.length > 0,
    extracted_text_length: text.length,
    extraction_char_count: typeof file.extraction_char_count === 'number' ? file.extraction_char_count : null,
    extraction_error: file.extraction_error ?? null,
    extraction_method: file.extraction_method ?? null,
    extraction_truncated: typeof file.extraction_truncated === 'boolean' ? file.extraction_truncated : null,
    extracted_at: file.extracted_at ?? null,
  }
}

/**
 * Build the BIT-EXACT restore payload from a before-snapshot — the exact prior
 * value of every extraction field the executor mutates, with NO rollback marker.
 * Returns only whitelisted extraction fields (passes assertOnlyExtractionFields).
 *
 * This slice rolls back only the not-run precondition (`file_extraction_not_run`),
 * where there was no prior extracted text — so extracted_text restores to null.
 * If the snapshot shows prior text was present, restore is refused: the audit
 * never stored body content, so it cannot be faithfully reconstructed here.
 */
export function buildExtractionRestore(before: ExtractionSnapshot): Record<string, unknown> {
  if (before.extracted_text_present) {
    throw new Error('retry_extraction rollback: prior extracted text present — bit-exact restore unsupported in this slice')
  }
  return {
    extraction_status: before.extraction_status,
    extracted_text: null,
    extracted_at: before.extracted_at,
    extraction_error: before.extraction_error,
    extraction_char_count: before.extraction_char_count,
    extraction_truncated: before.extraction_truncated,
    extraction_method: before.extraction_method,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Status transitions (mirror the DB record RPC guard)
// ─────────────────────────────────────────────────────────────────────────────

export type WorkOrderStatus = 'proposed' | 'approved' | 'applied' | 'failed' | 'rejected' | 'rolled_back'

const ALLOWED_TRANSITIONS: Record<string, readonly WorkOrderStatus[]> = {
  proposed: ['approved', 'rejected'],
  approved: ['applied', 'failed'],
  applied: ['rolled_back'],
  failed: [],
  rejected: [],
  rolled_back: [],
}

export function isAllowedTransition(from: string, to: WorkOrderStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to)
}
