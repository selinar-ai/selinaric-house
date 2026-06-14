/**
 * Phase 41.12 — Tara-only Helper Review Mutation (pure planner)
 *
 * The deterministic, side-effect-free core of the single-row review mutation
 * path. It validates the request shape, maps a humble workflow action to an
 * existing Phase 41.6 review state, and decides whether the transition is legal
 * — returning either a plan or an HTTP-coded rejection. It performs NO I/O.
 *
 * Governing principle: review state is workflow metadata, not authority. A
 * review action does NOT approve, apply, promote, remember, evidence, route, or
 * mutate any authority-bearing surface. The actor is Tara, one row at a time.
 *
 * Mapping (Phase 41.12 smallest-safe-path, approved):
 *   mark_reviewed_no_action → viewed
 *   dismiss_not_useful      → dismissed   (terminal)
 *   needs_followup          → needs_action
 * (defer_review is NOT in v1; no `deferred` state exists.)
 */

import {
  isHelperReviewState,
  isAllowedTransition,
  type HelperReviewState,
} from './helperReviewActions'

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW ACTION VOCABULARY (closed) — humble language only
// ─────────────────────────────────────────────────────────────────────────────

export type HelperReviewWorkflowAction =
  | 'mark_reviewed_no_action'
  | 'dismiss_not_useful'
  | 'needs_followup'

export const HELPER_REVIEW_WORKFLOW_ACTIONS: readonly HelperReviewWorkflowAction[] = [
  'mark_reviewed_no_action',
  'dismiss_not_useful',
  'needs_followup',
]

export function isHelperReviewWorkflowAction(value: string): value is HelperReviewWorkflowAction {
  return (HELPER_REVIEW_WORKFLOW_ACTIONS as readonly string[]).includes(value)
}

/** action → target persisted review state (all existing Phase 41.6 states). */
export const WORKFLOW_ACTION_TARGET_STATE: Record<HelperReviewWorkflowAction, HelperReviewState> = {
  mark_reviewed_no_action: 'viewed',
  dismiss_not_useful: 'dismissed',
  needs_followup: 'needs_action',
}

/**
 * Authority-like action tokens that must be rejected if received. Not part of
 * the workflow vocabulary and runtime-rejected so an `as any` still fails.
 */
export const FORBIDDEN_WORKFLOW_ACTIONS = [
  'approve',
  'accept',
  'apply',
  'confirm',
  'promote',
  'make_memory',
  'remember',
  'make_evidence',
  'send_to_prompt',
  'route_to_reasoning',
  'send_to_graph',
  'make_candidate',
  'auto_fix',
  'bulk_approve',
  'bulk_apply',
] as const

export function isForbiddenWorkflowAction(value: string): boolean {
  return (FORBIDDEN_WORKFLOW_ACTIONS as readonly string[]).includes(value)
}

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST-BODY PARSING (single row only — no arrays, no batch, no extra ids)
// ─────────────────────────────────────────────────────────────────────────────

export type ParsedReviewRequest = {
  action: HelperReviewWorkflowAction
  expectedReviewState?: string
}

export type ParseResult =
  | { ok: true; value: ParsedReviewRequest }
  | { ok: false; status: 400; code: string; reason: string }

/**
 * Parse + shape-validate the request body. Rejects arrays, batch/multi-id
 * shapes, and unknown/forbidden actions. `note` is accepted but IGNORED (no
 * review_note column in v1 — B1).
 */
export function parseReviewRequestBody(body: unknown): ParseResult {
  if (Array.isArray(body)) {
    return { ok: false, status: 400, code: 'BATCH_NOT_ALLOWED', reason: 'Request body must not be an array' }
  }
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, code: 'INVALID_BODY', reason: 'Request body must be a single object' }
  }
  const o = body as Record<string, unknown>

  // Defensive: the target row id comes ONLY from the path. Reject body ids.
  if ('id' in o || 'ids' in o || 'helper_output_id' in o || 'helper_output_ids' in o) {
    return { ok: false, status: 400, code: 'MULTIPLE_IDS_NOT_ALLOWED', reason: 'Target id must come from the path only' }
  }

  const action = o.action
  if (typeof action !== 'string') {
    return { ok: false, status: 400, code: 'INVALID_ACTION', reason: 'action must be a string' }
  }
  if (isForbiddenWorkflowAction(action)) {
    return { ok: false, status: 400, code: 'FORBIDDEN_ACTION', reason: `action '${action}' is not a workflow action` }
  }
  if (!isHelperReviewWorkflowAction(action)) {
    return { ok: false, status: 400, code: 'INVALID_ACTION', reason: `action '${action}' is not in the allowed vocabulary` }
  }

  const expected = o.expectedReviewState
  if (expected !== undefined && typeof expected !== 'string') {
    return { ok: false, status: 400, code: 'INVALID_EXPECTED_STATE', reason: 'expectedReviewState must be a string' }
  }

  return { ok: true, value: { action, expectedReviewState: expected as string | undefined } }
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTATION PLAN — decide legality (no I/O); the route executes atomically
// ─────────────────────────────────────────────────────────────────────────────

export type ReviewMutationRow = {
  id: string
  review_state: string
  deleted_at: string | null
}

export type ReviewMutationPlan =
  | {
      ok: true
      action: HelperReviewWorkflowAction
      previous_state: HelperReviewState
      new_state: HelperReviewState
    }
  | { ok: false; status: 400 | 404 | 409 | 422; code: string; reason: string }

/**
 * Decide whether a parsed action may be applied to the given row. Pure. The
 * route fetches the row, calls this, and only executes the atomic DB apply when
 * `ok: true`. Optimistic concurrency: if `expectedReviewState` is supplied and
 * does not match the row, returns 409 (no silent overwrite).
 */
export function planHelperReviewMutation(args: {
  action: HelperReviewWorkflowAction
  expectedReviewState?: string
  row: ReviewMutationRow | null
}): ReviewMutationPlan {
  const { action, expectedReviewState, row } = args

  if (!row) {
    return { ok: false, status: 404, code: 'HELPER_OUTPUT_NOT_FOUND', reason: 'Helper output not found' }
  }
  if (row.deleted_at != null) {
    return { ok: false, status: 422, code: 'HELPER_OUTPUT_DELETED', reason: 'Soft-deleted helper outputs are read-only' }
  }
  if (!isHelperReviewState(row.review_state)) {
    return { ok: false, status: 422, code: 'INVALID_CURRENT_STATE', reason: 'Current review_state is not a known state' }
  }

  // Optimistic concurrency (D1): client-supplied expected state must match.
  if (expectedReviewState !== undefined && expectedReviewState !== row.review_state) {
    return { ok: false, status: 409, code: 'REVIEW_STATE_CHANGED', reason: 'Review state changed since it was read' }
  }

  const previous_state = row.review_state as HelperReviewState
  const new_state = WORKFLOW_ACTION_TARGET_STATE[action]

  // Same-state no-op is not a legal transition (e.g. re-marking viewed as viewed
  // is not in the allow-list); terminal `dismissed` rejects everything.
  if (!isAllowedTransition(previous_state, new_state)) {
    return {
      ok: false,
      status: 422,
      code: 'TRANSITION_NOT_ALLOWED',
      reason: `Transition ${previous_state} → ${new_state} is not allowed`,
    }
  }

  return { ok: true, action, previous_state, new_state }
}
