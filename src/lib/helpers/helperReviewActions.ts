/**
 * Phase 41.6 — Helper Output Review Actions Contract
 *
 * Follows:
 *   docs/phase-41-0-helper-architecture-alignment-report.md
 *   docs/phase-41-0a-helper-boundary-tightening.md
 *   src/lib/helpers/helperContract.ts (41.1)
 *   supabase-migrations/074_helper_outputs.sql (41.2 — reviewed_by v1 = 'tara' only)
 *
 * CONTRACT / TYPE-MODEL layer only. NO DB, NO writes, NO migration, NO route,
 * NO UI, NO mutation, NO prompt assembly, NO LLM, NO automation. Every function
 * here is pure and deterministic. This defines HOW Tara may later respond to a
 * helper output; it does not let the House act on that response.
 *
 * ── Laws ─────────────────────────────────────────────────────────────────────
 *   Reviewing a helper output is not accepting it as true.
 *   Dismissing a helper output is not deletion.
 *   Marking a helper output useful is not authority movement.
 *   A helper suggestion may inform Tara. Only Tara governs action.
 *
 * A review action records Tara's response to helper labour. It NEVER touches the
 * invariant flags (not_memory / not_evidence / prompt_eligible /
 * authority_changed / human_review_required), never makes output prompt-visible,
 * never creates Memory/evidence, and never applies a suggestion.
 */

// ─────────────────────────────────────────────────────────────────────────────
// REVIEW ACTION VOCABULARY (closed) — review-support only, no truth-crowning
// ─────────────────────────────────────────────────────────────────────────────

export type HelperReviewAction =
  | 'mark_viewed'
  | 'dismiss'
  | 'mark_useful'
  | 'needs_library_action'
  | 'needs_human_decision'

export const ALL_HELPER_REVIEW_ACTIONS: readonly HelperReviewAction[] = [
  'mark_viewed',
  'dismiss',
  'mark_useful',
  'needs_library_action',
  'needs_human_decision',
]

export function isHelperReviewAction(value: string): value is HelperReviewAction {
  return (ALL_HELPER_REVIEW_ACTIONS as readonly string[]).includes(value)
}

/**
 * Authority-like actions that must NEVER exist in the helper review vocabulary.
 * These are not part of HelperReviewAction (so they cannot be typed), and are
 * ALSO rejected at runtime so an `as any` cast still fails.
 */
export const FORBIDDEN_HELPER_REVIEW_ACTIONS = [
  'accept',
  'approve',
  'promote',
  'apply',
  'remember',
  'make_memory',
  'make_evidence',
  'send_to_prompt',
  'route_to_reasoning',
  'auto_fix',
  'bulk_accept',
  'bulk_dismiss',
  'mark_all_useful',
  'dismiss_all',
] as const
export type ForbiddenHelperReviewAction = (typeof FORBIDDEN_HELPER_REVIEW_ACTIONS)[number]

export function isForbiddenHelperReviewAction(value: string): boolean {
  return (FORBIDDEN_HELPER_REVIEW_ACTIONS as readonly string[]).includes(value)
}

// ─────────────────────────────────────────────────────────────────────────────
// REVIEW STATE VOCABULARY (closed) — review-support states only
// ─────────────────────────────────────────────────────────────────────────────

export type HelperReviewState =
  | 'unreviewed'
  | 'viewed'
  | 'dismissed'
  | 'useful'
  | 'needs_action'
  | 'needs_decision'

export const ALL_HELPER_REVIEW_STATES: readonly HelperReviewState[] = [
  'unreviewed',
  'viewed',
  'dismissed',
  'useful',
  'needs_action',
  'needs_decision',
]

export function isHelperReviewState(value: string): value is HelperReviewState {
  return (ALL_HELPER_REVIEW_STATES as readonly string[]).includes(value)
}

/** Plain-English meaning of each review state. Documentation, not behaviour. */
export const HELPER_REVIEW_STATE_MEANING: Record<HelperReviewState, string> = {
  unreviewed: 'The helper output has not been inspected by Tara.',
  viewed: 'Tara has seen it. No action or truth decision is implied.',
  dismissed: 'Tara does not want to act on this helper output. The trace remains preserved unless separately soft-deleted.',
  useful: 'Tara found it useful as review support. This does not make it true, authoritative, evidence, or prompt-eligible.',
  needs_action: 'Tara may need to take a separate governed action elsewhere (e.g. editing Library metadata manually).',
  needs_decision: 'It raises something requiring Tara’s judgement, but no decision has yet been made.',
}

/**
 * Interpretations a review action must NEVER carry. Documented + asserted so the
 * contract can never be read as authority movement.
 */
export const REVIEW_ACTION_DOES_NOT_MEAN = [
  'memory_creation',
  'archive_truth',
  'evidence_creation',
  'prompt_eligibility',
  'library_mutation',
  'graph_approval',
  'reasoning_evidence',
  'recall_authority',
  'automatic_fix',
  'helper_self_approval',
  'bulk_approval',
] as const

// ─────────────────────────────────────────────────────────────────────────────
// ACTION → RESULTING STATE
// ─────────────────────────────────────────────────────────────────────────────

export const REVIEW_ACTION_TARGET_STATE: Record<HelperReviewAction, HelperReviewState> = {
  mark_viewed: 'viewed',
  dismiss: 'dismissed',
  mark_useful: 'useful',
  needs_library_action: 'needs_action',
  needs_human_decision: 'needs_decision',
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSITION RULES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Allowed state transitions. `dismissed` is terminal in v1 (no revive). There is
 * deliberately no transition to any authority-like state (approved / accepted /
 * prompt_eligible / memory / evidence) — those states do not exist here at all.
 */
export const ALLOWED_REVIEW_TRANSITIONS: Record<HelperReviewState, readonly HelperReviewState[]> = {
  unreviewed: ['viewed', 'dismissed', 'useful', 'needs_action', 'needs_decision'],
  viewed: ['dismissed', 'useful', 'needs_action', 'needs_decision'],
  useful: ['needs_action', 'needs_decision'],
  needs_action: ['dismissed'],
  needs_decision: ['dismissed'],
  dismissed: [], // terminal in v1 — revive requires a separate future phase
}

export function isAllowedTransition(from: HelperReviewState, to: HelperReviewState): boolean {
  if (!isHelperReviewState(from) || !isHelperReviewState(to)) return false
  return ALLOWED_REVIEW_TRANSITIONS[from].includes(to)
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTOR RULES — Tara-only in v1 (mirrors the 074 reviewed_by = 'tara' CHECK)
// ─────────────────────────────────────────────────────────────────────────────

export type HelperReviewer = 'tara'

export const ALLOWED_HELPER_REVIEWERS: readonly HelperReviewer[] = ['tara']

export const FORBIDDEN_HELPER_REVIEWERS = [
  'ari',
  'eli',
  'helper',
  'system',
  'auto',
  'cron',
  'unknown',
] as const

export function isAllowedHelperReviewer(value: string): value is HelperReviewer {
  return value === 'tara'
}

// ─────────────────────────────────────────────────────────────────────────────
// INVARIANT-FLAG IMMUTABILITY — review never touches authority
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The authority flags a review action must leave EXACTLY as-is. A review action
 * carries no flag changes; this is the locked expectation the validator checks.
 */
export type HelperReviewImmutableFlags = {
  not_memory: true
  not_evidence: true
  prompt_eligible: false
  authority_changed: false
  human_review_required: true
}

export const REVIEW_LOCKED_FLAGS: HelperReviewImmutableFlags = {
  not_memory: true,
  not_evidence: true,
  prompt_eligible: false,
  authority_changed: false,
  human_review_required: true,
}

type FlagBag = {
  not_memory?: unknown
  not_evidence?: unknown
  prompt_eligible?: unknown
  authority_changed?: unknown
  human_review_required?: unknown
}

/**
 * Assert a proposed review outcome did not move any authority flag. Compares the
 * before/after flag bags; any drift is a violation.
 */
export function reviewPreservesAuthorityFlags(before: FlagBag, after: FlagBag): boolean {
  return (
    before.not_memory === after.not_memory &&
    before.not_evidence === after.not_evidence &&
    before.prompt_eligible === after.prompt_eligible &&
    before.authority_changed === after.authority_changed &&
    before.human_review_required === after.human_review_required &&
    // And the after-state must still match the locked safe values.
    after.not_memory === true &&
    after.not_evidence === true &&
    after.prompt_eligible === false &&
    after.authority_changed === false &&
    after.human_review_required === true
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// REVIEW ACTION REQUEST + VALIDATION (single-target only — no bulk)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single review-action request. Exactly one target helper output id. There is
 * no array of ids and no "all" form — bulk review is unrepresentable.
 */
export type HelperReviewActionRequest = {
  action: HelperReviewAction
  reviewer: HelperReviewer
  /** The single helper_outputs row id under review. */
  helper_output_id: string
  /** The current review state of that row. */
  current_state: HelperReviewState
}

export type HelperReviewValidationResult = {
  valid: boolean
  /** The state the row would move to if applied. Present only when valid. */
  next_state?: HelperReviewState
  errors: string[]
}

/**
 * Validate a single review-action request. Pure. Does NOT apply anything — it
 * only decides whether the action would be a legal, Tara-authored, single-target
 * transition that moves no authority. There is no execution here.
 */
export function validateHelperReviewAction(
  request: HelperReviewActionRequest,
): HelperReviewValidationResult {
  const errors: string[] = []

  // Action must be in the closed, non-authority vocabulary.
  if (isForbiddenHelperReviewAction(request.action as string)) {
    errors.push(`action '${request.action}' is a forbidden authority-like action`)
  } else if (!isHelperReviewAction(request.action as string)) {
    errors.push(`action '${String(request.action)}' is not a known review action`)
  }

  // Reviewer must be Tara (mirrors the DB reviewed_by v1 constraint).
  if (!isAllowedHelperReviewer(request.reviewer as string)) {
    errors.push(`reviewer '${String(request.reviewer)}' is not allowed (v1: 'tara' only)`)
  }

  // Single target id required.
  if (typeof request.helper_output_id !== 'string' || request.helper_output_id.length === 0) {
    errors.push('helper_output_id must be a single non-empty id')
  }

  // Current state must be a known review state.
  if (!isHelperReviewState(request.current_state as string)) {
    errors.push(`current_state '${String(request.current_state)}' is not a known review state`)
    return { valid: false, errors }
  }

  // The action's target state must be a legal transition from the current state.
  if (isHelperReviewAction(request.action as string)) {
    const target = REVIEW_ACTION_TARGET_STATE[request.action]
    if (!isAllowedTransition(request.current_state, target)) {
      errors.push(`transition ${request.current_state} → ${target} is not allowed`)
    } else if (errors.length === 0) {
      return { valid: true, next_state: target, errors }
    }
  }

  return { valid: false, errors }
}
