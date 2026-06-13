/**
 * Phase 41.4 — Helper Output Review Surface presenter (pure)
 *
 * Pure, dependency-free view logic for the read-only Helper Review surface.
 * No I/O, no React, no DB. The page and the API route both lean on these so the
 * boundary wording and rendering rules are testable without a DOM.
 *
 * This is a VISIBILITY layer. It shows helper labour; it never accepts,
 * promotes, routes, injects, or mutates anything. Review visibility is not
 * review approval.
 */

import { isHelperReviewState } from './helperReviewActions'

// ─────────────────────────────────────────────────────────────────────────────
// FIXED COPY — boundary language Tara must always see
// ─────────────────────────────────────────────────────────────────────────────

export const HELPER_REVIEW_TITLE = 'Helper Review'
export const HELPER_REVIEW_SUBTITLE = 'Helper labour, not authority.'

export const HELPER_REVIEW_BOUNDARY_TEXT =
  'Helper outputs are draft-only review aids. They are not Memory, not evidence, ' +
  'not prompt authority, and do not change Library, Archive, or graph truth.'

export const HELPER_REVIEW_EMPTY_PRIMARY = 'No helper outputs yet.'
export const HELPER_REVIEW_EMPTY_SECONDARY =
  'This surface will show draft-only helper labour after a separately authorised ' +
  'helper run. Nothing here is Memory, evidence, or prompt authority.'

export const SOFT_DELETED_LABEL = 'Soft-deleted trace'

/** Library schema uses `description` as the summary-like field. Never invent one. */
export const SUMMARY_FIELD_LABEL = 'Description / summary'

// ─────────────────────────────────────────────────────────────────────────────
// ROW SHAPE (what the GET API returns / the page consumes)
// ─────────────────────────────────────────────────────────────────────────────

export type HelperOutputSourceRef = {
  source_surface: string
  source_id: string
}

export type HelperOutputRow = {
  id: string
  helper_type: string
  output_status: string
  suggested_action: string
  confidence_label: string
  presence_scope: string
  created_by: string
  created_at: string | null
  not_memory: boolean
  not_evidence: boolean
  prompt_eligible: boolean
  authority_changed: boolean
  human_review_required: boolean
  review_routed: boolean
  reviewed_by: string | null
  reviewed_at: string | null
  source_refs: HelperOutputSourceRef[]
  suggestion_payload: unknown
  deleted_at: string | null
  /**
   * Persisted review-support state (Phase 41.7). Optional/back-compatible: until
   * the migration is run and the API selects the column, this is absent and the
   * surface shows the default. Display-only — there is no review control here.
   */
  review_state?: string | null
}

/** The default review state for any helper output (Phase 41.6/41.7). */
export const DEFAULT_REVIEW_STATE = 'unreviewed'

/**
 * Read-only review state for display. Returns the row's persisted review_state
 * when it is one of the six known states, otherwise falls back to 'unreviewed'.
 * This NEVER changes state — it only chooses what to render.
 */
export function reviewStateForDisplay(row: HelperOutputRow): string {
  const s = row.review_state
  return typeof s === 'string' && isHelperReviewState(s) ? s : DEFAULT_REVIEW_STATE
}

// ─────────────────────────────────────────────────────────────────────────────
// SOFT-DELETE HANDLING — default hides soft-deleted trace
// ─────────────────────────────────────────────────────────────────────────────

export function isSoftDeleted(row: HelperOutputRow): boolean {
  return row.deleted_at != null
}

/** Default view hides soft-deleted rows; `showDeleted` opts them back in. */
export function filterRows(
  rows: HelperOutputRow[],
  opts: { showDeleted?: boolean } = {},
): HelperOutputRow[] {
  return opts.showDeleted ? rows : rows.filter((r) => !isSoftDeleted(r))
}

// ─────────────────────────────────────────────────────────────────────────────
// PROVENANCE — multi-ref, never collapsed
// ─────────────────────────────────────────────────────────────────────────────

export function provenanceSurfaceLabel(surface: string): string {
  switch (surface) {
    case 'library_item':
      return 'Library item'
    case 'library_item_file':
      return 'Library file'
    default:
      return surface
  }
}

export type RenderedProvenanceRef = {
  surface: string
  surfaceLabel: string
  id: string
  /** Readable label (e.g. item title / file name) if safely available, else null. */
  label: string | null
}

/**
 * Expand every source ref into a renderable entry. NEVER collapses multiple refs
 * into one — a file-level issue keeps both its `library_item_file` and
 * `library_item` refs visible.
 */
export function renderedProvenance(
  refs: HelperOutputSourceRef[],
  labels: Record<string, string> = {},
): RenderedProvenanceRef[] {
  return (refs ?? []).map((r) => ({
    surface: r.source_surface,
    surfaceLabel: provenanceSurfaceLabel(r.source_surface),
    id: r.source_id,
    label: labels[r.source_id] ?? null,
  }))
}

/** One-line provenance summary. File + item issues read clearly. */
export function provenanceSummary(refs: HelperOutputSourceRef[]): string {
  const list = refs ?? []
  const hasFile = list.some((r) => r.source_surface === 'library_item_file')
  const hasItem = list.some((r) => r.source_surface === 'library_item')
  if (hasFile && hasItem) return 'Library file + parent Library item'
  const labels = [...new Set(list.map((r) => provenanceSurfaceLabel(r.source_surface)))]
  return labels.join(' + ')
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTHORITY FLAGS — render the boundary so Tara can trust it
// ─────────────────────────────────────────────────────────────────────────────

export type FlagDisplay = {
  key: string
  label: string
  value: boolean
  /** True when the value matches the safe/locked expectation. */
  safe: boolean
}

export function authorityFlags(row: HelperOutputRow): FlagDisplay[] {
  return [
    { key: 'not_memory', label: 'Not Memory', value: row.not_memory, safe: row.not_memory === true },
    { key: 'not_evidence', label: 'Not evidence', value: row.not_evidence, safe: row.not_evidence === true },
    { key: 'prompt_eligible', label: 'Prompt eligible', value: row.prompt_eligible, safe: row.prompt_eligible === false },
    { key: 'authority_changed', label: 'Authority changed', value: row.authority_changed, safe: row.authority_changed === false },
    { key: 'human_review_required', label: 'Human review required', value: row.human_review_required, safe: row.human_review_required === true },
    // review_routed is non-authoritative either way — both values are safe.
    { key: 'review_routed', label: 'Review routed', value: row.review_routed, safe: true },
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// LIBRARY METADATA HELPER PAYLOAD VIEW
// ─────────────────────────────────────────────────────────────────────────────

export function isLibraryMetadataHelper(row: HelperOutputRow): boolean {
  return row.helper_type === 'library_metadata_helper'
}

/** Relabel a checked field — `description` surfaces as "Description / summary". */
export function labelForCheckedField(field: string): string {
  return field === 'description' ? SUMMARY_FIELD_LABEL : field
}

export function labelCheckedFields(fields: string[]): string[] {
  return (fields ?? []).map(labelForCheckedField)
}

export type LibraryMetadataPayloadView = {
  issue_code: string | null
  issue_label: string | null
  suggested_next_step: string | null
  deterministic_reason: string | null
  checked_fields: string[]
  checked_fields_labelled: string[]
  observed_state: Record<string, unknown> | null
}

/** Parse a library_metadata_helper payload defensively. Returns null if not one. */
export function asLibraryMetadataPayload(payload: unknown): LibraryMetadataPayloadView | null {
  if (!payload || typeof payload !== 'object') return null
  const o = payload as Record<string, unknown>
  if (!('issue_code' in o) && !('checked_fields' in o)) return null

  const checked = Array.isArray(o.checked_fields)
    ? (o.checked_fields.filter((x) => typeof x === 'string') as string[])
    : []

  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

  return {
    issue_code: str(o.issue_code),
    issue_label: str(o.issue_label),
    suggested_next_step: str(o.suggested_next_step),
    deterministic_reason: str(o.deterministic_reason),
    checked_fields: checked,
    checked_fields_labelled: labelCheckedFields(checked),
    observed_state:
      o.observed_state && typeof o.observed_state === 'object'
        ? (o.observed_state as Record<string, unknown>)
        : null,
  }
}
