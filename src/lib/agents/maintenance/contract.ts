/**
 * Phase 42.3.3b — Maintenance Room contract (pure, shared by routes + UI + tests)
 *
 * Review/triage-only. The single mutation anywhere is a finding's review_state
 * (+ reviewed_by/reviewed_at). `reviewed_by` is a SERVER-DERIVED constant — the House
 * is single-user (Tara), so the authenticated House session IS Tara. Never client-supplied.
 */

export const REVIEW_STATES = ['open', 'acknowledged', 'dismissed'] as const
export type ReviewState = (typeof REVIEW_STATES)[number]

export function isValidReviewState(s: unknown): s is ReviewState {
  return typeof s === 'string' && (REVIEW_STATES as readonly string[]).includes(s)
}

/** Server-derived reviewer identity. Single-user House → the authenticated session is Tara. */
export const REVIEWED_BY = 'tara' as const

export const FINDINGS_RPC = 'agent_findings_list'
export const RUNS_RPC = 'agent_runs_list'
export const SET_REVIEW_STATE_RPC = 'agent_finding_set_review_state'

// Phase 42.3.4a — remedy-plan representation (read + record + test cleanup only; NO apply).
export const REMEDY_PLANS_LIST_RPC = 'agent_remedy_plans_list'
export const REMEDY_PLAN_RECORD_RPC = 'agent_remedy_plan_record'
export const REMEDY_PLANS_CLEANUP_RPC = 'agent_remedy_plans_cleanup_test'

export type FindingsFilter = {
  domain: string | null
  review_state: string | null
  detection_status: string | null
}

export function parseFindingsFilter(params: URLSearchParams): FindingsFilter {
  const norm = (v: string | null) => (v && v.trim().length > 0 ? v.trim() : null)
  return {
    domain: norm(params.get('domain')),
    review_state: norm(params.get('review_state')),
    detection_status: norm(params.get('detection_status')),
  }
}
