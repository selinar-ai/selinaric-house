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

// Phase 43 (bulk triage) — hard cap on ids per bulk review request. The bulk route
// loops the single-finding RPC; it introduces no new SQL and no new verbs.
export const BULK_REVIEW_MAX_IDS = 200

// Phase 42.3.4a — remedy-plan representation (read + record + test cleanup only; NO apply).
export const REMEDY_PLANS_LIST_RPC = 'agent_remedy_plans_list'
export const REMEDY_PLAN_RECORD_RPC = 'agent_remedy_plan_record'
export const REMEDY_PLANS_CLEANUP_RPC = 'agent_remedy_plans_cleanup_test'

// Phase 42.3.4b — approval AUTHORITY events (append-only; record + list + test cleanup only; NO apply).
export const APPROVALS_LIST_RPC = 'agent_remedy_approvals_list'
export const APPROVAL_RECORD_RPC = 'agent_remedy_approval_record'
export const APPROVAL_CLEANUP_RPC = 'agent_remedy_approval_events_cleanup_test'

// Phase 42.3.4c — the hand: apply / rollback (House-write) + read-only validate + events list.
export const APPLY_RPC = 'agent_remedy_apply'
export const ROLLBACK_RPC = 'agent_remedy_rollback'
export const APPLY_VALIDATE_RPC = 'agent_remedy_apply_validate'
export const APPLY_EVENTS_LIST_RPC = 'agent_remedy_apply_events_list'

export const APPLY_OUTCOMES = ['applied', 'rolled_back'] as const

/** Derived apply status = outcome of the latest apply event by `event_sequence` (deterministic). */
export type ApplyEvent = { event_sequence: number; outcome: string }
export function deriveApplyStatus(events: ApplyEvent[]): 'none' | string {
  if (!events || events.length === 0) return 'none'
  let latest = events[0]
  for (const e of events) if (e.event_sequence > latest.event_sequence) latest = e
  return latest.outcome
}

export const APPROVAL_DECISIONS = ['approved', 'rejected', 'revoked'] as const
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number]
export function isValidDecision(x: unknown): x is ApprovalDecision {
  return typeof x === 'string' && (APPROVAL_DECISIONS as readonly string[]).includes(x)
}

/** Derived approval status = decision of the latest event by `event_sequence` (deterministic). */
export type ApprovalEvent = { event_sequence: number; decision: string }
export function deriveApprovalStatus(events: ApprovalEvent[]): 'none' | string {
  if (!events || events.length === 0) return 'none'
  let latest = events[0]
  for (const e of events) if (e.event_sequence > latest.event_sequence) latest = e
  return latest.decision
}

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
