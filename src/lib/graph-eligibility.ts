/**
 * Gate A1 — bulk graph-eligibility contract (pure; shared by route + UI + tests)
 *
 * eligible_for_graph is the ontology intake gate (wired in Gate A-R). This module
 * validates bulk payloads FAIL-CLOSED before any write. Marking is Tara's authority,
 * exercised only through her auth-gated surface; helpers/agents/LLMs never touch it.
 */

export const GRAPH_ELIGIBILITY_BULK_MAX = 100

export const BULK_ELIGIBILITY_ACTIONS = ['mark', 'unmark'] as const
export type BulkEligibilityAction = (typeof BULK_ELIGIBILITY_ACTIONS)[number]

export type BulkEligibilityValidation =
  | { ok: true; ids: string[]; action: BulkEligibilityAction }
  | { ok: false; code: string; status: number }

/** Validate a bulk payload. Every rejection happens before any DB access. Pure. */
export function validateBulkEligibilityPayload(body: unknown): BulkEligibilityValidation {
  const action = (body as { action?: unknown } | null)?.action
  if (action !== 'mark' && action !== 'unmark') {
    return { ok: false, code: 'INVALID_ACTION', status: 400 }
  }
  const rawIds = (body as { ids?: unknown } | null)?.ids
  if (!Array.isArray(rawIds) || !rawIds.every((x) => typeof x === 'string' && x.trim() !== '')) {
    return { ok: false, code: 'INVALID_IDS', status: 400 }
  }
  const ids = rawIds.map((x) => x.trim())
  if (ids.length === 0) return { ok: false, code: 'EMPTY_IDS', status: 400 }
  if (new Set(ids).size !== ids.length) return { ok: false, code: 'DUPLICATE_IDS', status: 400 }
  if (ids.length > GRAPH_ELIGIBILITY_BULK_MAX) return { ok: false, code: 'TOO_MANY_IDS', status: 400 }
  const expected = (body as { expected_count?: unknown } | null)?.expected_count
  if (typeof expected !== 'number' || expected !== ids.length) {
    return { ok: false, code: 'COUNT_MISMATCH', status: 400 }
  }
  return { ok: true, ids, action }
}
