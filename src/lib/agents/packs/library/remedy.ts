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
