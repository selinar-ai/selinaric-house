/**
 * Phase 42.3.4a — Library remedy-plan builder (PURE; representation only)
 *
 * The deterministic v1 remedy: trim surrounding whitespace from a library_items.title.
 * This module BUILDS a declarative plan (current → proposed + recorded inverse). It does
 * NOT apply anything, has no DB/IO, no apply capability, and never touches an authority
 * field. Same input → same plan. The exact prior value is preserved verbatim as the
 * inverse for a future (42.3.4c) rollback.
 *
 * ── Boundaries (hard) ────────────────────────────────────────────────────────
 *   * PURE. No I/O, no Supabase, no DB, no LLM, no fetch, no clock, no RNG.
 *   * REPRESENTATION ONLY. There is no apply/execute function here, by design.
 *   * v1 is hard-scoped to `library_title_trim` on `library_items.title`.
 */

// Phase 43.C: the ONE JS definition of "malformed source_url" — reused, not re-stated.
// Pure predicate (URL parse only); importing it keeps this module I/O-free.
import { isValidHttpUrl } from '../../../helpers/sourceReferenceIntegrityHelper'

/** The single whitelisted v1 remedy action. */
export const REMEDY_ACTION_TITLE_TRIM = 'library_title_trim' as const

/**
 * v1 normalisation — remove ONLY surrounding ASCII spaces (U+0020). This is byte-exact
 * with PostgreSQL `btrim(text, ' ')`, so the detector, builder, migration CHECKs, and the
 * record RPC all agree. NOT JavaScript `.trim()` (which also strips tabs/newlines/Unicode
 * whitespace) — broader normalisation is intentionally out of scope for the first hand.
 *   "  Title  " -> "Title"   |   "\tTitle\t" -> unchanged (no plan)   |   "   " -> "" (no plan)
 */
export function trimSurroundingSpaces(s: string): string {
  return s.replace(/^ +/, '').replace(/ +$/, '')
}

/** A deterministic, declarative remedy plan (NOT an apply instruction). */
export type TitleTrimPlanInput = {
  finding_id: string
  domain: 'library'
  action_type: typeof REMEDY_ACTION_TITLE_TRIM
  target_table: 'library_items'
  target_id: string
  target_field: 'title'
  current_value: string // exact prior value — the recorded inverse
  proposed_value: string // exact deterministic new value = current_value.trim()
  deterministic_reason: string
}

/**
 * Build the title-trim remedy plan for one finding + the item's current title.
 * Returns null when there is nothing to do (no change, or the trim would be empty).
 * Deterministic and pure.
 */
export function buildTitleTrimPlan(args: {
  findingId: string
  targetId: string
  currentTitle: string
}): TitleTrimPlanInput | null {
  const trimmed = trimSurroundingSpaces(args.currentTitle)
  if (trimmed.length === 0) return null // never propose an empty title
  if (args.currentTitle === trimmed) return null // only when surrounding ASCII spaces exist

  return {
    finding_id: args.findingId,
    domain: 'library',
    action_type: REMEDY_ACTION_TITLE_TRIM,
    target_table: 'library_items',
    target_id: args.targetId,
    target_field: 'title',
    current_value: args.currentTitle,
    proposed_value: trimmed,
    deterministic_reason:
      'title has surrounding ASCII spaces; the proposed value removes only the leading/trailing ASCII spaces (equivalent to SQL btrim with a space), and the current value is preserved verbatim as the inverse.',
  }
}

// ─── Phase 43.C — Whitelist v2 actions (A1 + A2; representation only, same rules) ──

export const REMEDY_ACTION_PHASE_LABEL_BACKFILL = 'library_phase_label_backfill' as const
export const REMEDY_ACTION_SOURCE_URL_CLEAR = 'library_source_url_clear_non_url' as const

/**
 * The strict development_documentation title convention: "Phase <code> — <label>".
 * RULE (deliberately regex-free so JS and SQL are byte-identical — JS and Postgres ARE
 * disagree on greedy/lazy semantics around multi-dash titles):
 *   1. the title must start with the literal prefix "Phase " (space included);
 *   2. the label is everything AFTER THE FIRST em-dash (U+2014), space-trimmed.
 * Later em-dashes belong to the label. An ordinary hyphen ("Phase 1 - House Shell")
 * has no em-dash → fail closed. Blank remainder → fail closed. SQL twin in migration 090:
 *   title like 'Phase %'  +  btrim(substr(title, position('—' in title) + 1), ' ')
 */
export const PHASE_TITLE_PREFIX = 'Phase ' as const
export const EM_DASH = '—' as const

/** Derive the phase label from a conventional title, or null (fail closed). Pure. */
export function derivePhaseLabelFromTitle(title: string): string | null {
  if (!title.startsWith(PHASE_TITLE_PREFIX)) return null
  const idx = title.indexOf(EM_DASH)
  if (idx < 0) return null
  const label = trimSurroundingSpaces(title.slice(idx + EM_DASH.length))
  return label.length > 0 ? label : null
}

/** A1 — backfill phase_label from the title convention. current_value null = prior SQL NULL. */
export type PhaseLabelBackfillPlanInput = {
  finding_id: string
  domain: 'library'
  action_type: typeof REMEDY_ACTION_PHASE_LABEL_BACKFILL
  target_table: 'library_items'
  target_id: string
  target_field: 'phase_label'
  current_value: string | null // exact prior label (null or blank string) — the recorded inverse
  proposed_value: string // the derived label
  deterministic_reason: string
}

/**
 * Build the A1 plan. Eligible ONLY when: collection is development_documentation,
 * phase_code AND phase_number are present, phase_label is null/blank, and the title
 * matches the strict convention. Anything else → null (fail closed; no guessing).
 * The deterministic_reason CARRIES THE OBSERVED TITLE verbatim — the record RPC
 * verifies this (REASON_MISSING_OBSERVED_TITLE), so plan/audit provenance shows
 * exactly which title produced the label.
 */
export function buildPhaseLabelBackfillPlan(args: {
  findingId: string
  targetId: string
  collection: string | null
  phaseCode: string | null
  phaseNumber: number | null
  currentLabel: string | null
  title: string
}): PhaseLabelBackfillPlanInput | null {
  if (args.collection !== 'development_documentation') return null
  if (!args.phaseCode || trimSurroundingSpaces(args.phaseCode) === '' || args.phaseNumber === null) return null
  if (args.currentLabel !== null && trimSurroundingSpaces(args.currentLabel) !== '') return null
  const label = derivePhaseLabelFromTitle(args.title)
  if (label === null) return null

  return {
    finding_id: args.findingId,
    domain: 'library',
    action_type: REMEDY_ACTION_PHASE_LABEL_BACKFILL,
    target_table: 'library_items',
    target_id: args.targetId,
    target_field: 'phase_label',
    current_value: args.currentLabel,
    proposed_value: label,
    deterministic_reason: `phase_label is null/blank; label derived from observed title: ${args.title}`,
  }
}

/** A2 — clear a non-URL source_url to null. proposed_value is null BY DESIGN (the clear). */
export type SourceUrlClearPlanInput = {
  finding_id: string
  domain: 'library'
  action_type: typeof REMEDY_ACTION_SOURCE_URL_CLEAR
  target_table: 'library_items'
  target_id: string
  target_field: 'source_url'
  current_value: string // the displaced text — preserved byte-exactly as the inverse
  proposed_value: null
  deterministic_reason: string
}

/**
 * Build the A2 plan. Eligible ONLY when source_url is non-blank AND fails the SAME
 * isValidHttpUrl predicate the shipped source-reference helper uses (one definition of
 * "malformed"; the SQL twin in 090 is parity-locked by shared test vectors).
 * CLEAR-to-null only — never moves the text anywhere (Ari decision); the prior value
 * is the recorded inverse and survives in the apply audit.
 */
export function buildSourceUrlClearPlan(args: {
  findingId: string
  targetId: string
  sourceUrl: string | null
}): SourceUrlClearPlanInput | null {
  if (args.sourceUrl === null || trimSurroundingSpaces(args.sourceUrl) === '') return null
  if (isValidHttpUrl(args.sourceUrl)) return null

  return {
    finding_id: args.findingId,
    domain: 'library',
    action_type: REMEDY_ACTION_SOURCE_URL_CLEAR,
    target_table: 'library_items',
    target_id: args.targetId,
    target_field: 'source_url',
    current_value: args.sourceUrl,
    proposed_value: null,
    deterministic_reason:
      'source_url is non-blank and is not a valid http/https URL; the deterministic remedy clears it to null (the column contract holds URLs only), and the prior value is preserved byte-exactly as the inverse.',
  }
}
