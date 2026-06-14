/**
 * Phase 41.8 — Helper Review Scalability Contract
 *
 * Follows:
 *   docs/phase-41-0-helper-architecture-alignment-report.md
 *   docs/phase-41-0a-helper-boundary-tightening.md
 *   src/lib/helpers/helperContract.ts (41.1)
 *   src/lib/helpers/helperReviewActions.ts (41.6)
 *   docs/phase-41-7-helper-review-state-schema-closure.md
 *
 * CONTRACT / TYPE-MODEL layer only. NO DB, NO schema, NO migration, NO route,
 * NO UI, NO queue, NO execution, NO mutation, NO prompt assembly, NO LLM, NO
 * automation. Every function here is pure and deterministic.
 *
 * ── Purpose ──────────────────────────────────────────────────────────────────
 * Price the review friction. This classifies a helper output's review *burden*
 * — risk class, priority, review mode, batch eligibility, sampling, escalation —
 * so review queues can later be PREPARED. It does not approve, accept, apply,
 * route, or move authority. Friction remains by design; this phase only meters
 * it.
 *
 * ── Laws ─────────────────────────────────────────────────────────────────────
 *   Risk class is triage, not truth.
 *   Priority is queue ordering, not authority.
 *   Batch eligibility is permission to GROUP review work later, not to approve it.
 *   Sampling is audit support, not automatic trust.
 *   Escalation is a warning, not a decision.
 *   Human review remains required wherever authority may move.
 *   Authority-critical work is never batch-approved.
 *   When unsure, classify UPWARD.
 */

import type { HelperType, HelperSuggestedAction } from './helperContract'

// ─────────────────────────────────────────────────────────────────────────────
// RISK CLASS
// ─────────────────────────────────────────────────────────────────────────────

export type HelperRiskClass = 'low' | 'medium' | 'high' | 'authority_critical'

export const ALL_HELPER_RISK_CLASSES: readonly HelperRiskClass[] = [
  'low',
  'medium',
  'high',
  'authority_critical',
]

export function isHelperRiskClass(value: string): value is HelperRiskClass {
  return (ALL_HELPER_RISK_CLASSES as readonly string[]).includes(value)
}

export const HELPER_RISK_CLASS_MEANING: Record<HelperRiskClass, string> = {
  low: 'Metadata hygiene or display/readiness issue. No authority movement possible.',
  medium: 'Requires Tara’s attention but does not directly affect Memory, evidence, prompts, or truth.',
  high: 'May affect important interpretation, sensitive context, scope boundaries, or review workload.',
  authority_critical: 'Touches or could influence Memory, Archive truth, prompt eligibility, reasoning evidence, graph authority, recall authority, sensitive identity/persona boundaries, or any crown-bearing surface.',
}

// ─────────────────────────────────────────────────────────────────────────────
// REVIEW PRIORITY (queue ordering only)
// ─────────────────────────────────────────────────────────────────────────────

export type HelperReviewPriority = 'routine' | 'normal' | 'elevated' | 'urgent'

export const ALL_HELPER_REVIEW_PRIORITIES: readonly HelperReviewPriority[] = [
  'routine',
  'normal',
  'elevated',
  'urgent',
]

export function isHelperReviewPriority(value: string): value is HelperReviewPriority {
  return (ALL_HELPER_REVIEW_PRIORITIES as readonly string[]).includes(value)
}

// ─────────────────────────────────────────────────────────────────────────────
// REVIEW MODE
// ─────────────────────────────────────────────────────────────────────────────

export type HelperReviewMode =
  | 'no_review_needed'
  | 'batch_review_allowed'
  | 'individual_review_required'
  | 'two_gate_review_required'

export const ALL_HELPER_REVIEW_MODES: readonly HelperReviewMode[] = [
  'no_review_needed',
  'batch_review_allowed',
  'individual_review_required',
  'two_gate_review_required',
]

export function isHelperReviewMode(value: string): value is HelperReviewMode {
  return (ALL_HELPER_REVIEW_MODES as readonly string[]).includes(value)
}

export const HELPER_REVIEW_MODE_MEANING: Record<HelperReviewMode, string> = {
  no_review_needed: 'Only allowed when the helper produced no actionable issue or a deterministic clean result.',
  batch_review_allowed: 'Low-risk items may later be grouped for Tara review under explicit batch rules.',
  individual_review_required: 'Must be reviewed one at a time.',
  two_gate_review_required: 'Authority-critical items require a separate governed review path; ordinary helper review cannot handle them.',
}

// ─────────────────────────────────────────────────────────────────────────────
// ESCALATION REASONS (warnings — they do not route or escalate anything)
// ─────────────────────────────────────────────────────────────────────────────

export type HelperEscalationReason =
  | 'sensitive_scope'
  | 'authority_surface'
  | 'memory_implication'
  | 'archive_implication'
  | 'prompt_implication'
  | 'reasoning_evidence_implication'
  | 'graph_implication'
  | 'recall_implication'
  | 'library_mutation_implication'
  | 'conflicting_sources'
  | 'missing_provenance'
  | 'unsupported_inference'
  | 'bulk_review_not_allowed'
  | 'human_judgement_required'

export const ALL_HELPER_ESCALATION_REASONS: readonly HelperEscalationReason[] = [
  'sensitive_scope',
  'authority_surface',
  'memory_implication',
  'archive_implication',
  'prompt_implication',
  'reasoning_evidence_implication',
  'graph_implication',
  'recall_implication',
  'library_mutation_implication',
  'conflicting_sources',
  'missing_provenance',
  'unsupported_inference',
  'bulk_review_not_allowed',
  'human_judgement_required',
]

export function isHelperEscalationReason(value: string): value is HelperEscalationReason {
  return (ALL_HELPER_ESCALATION_REASONS as readonly string[]).includes(value)
}

// ─────────────────────────────────────────────────────────────────────────────
// FORBIDDEN / AUTHORITY-LIKE ACTIONS — always force authority_critical
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Authority-like action tokens. If a helper output's suggested_action is one of
 * these, the classifier forces authority_critical + two-gate. These are not part
 * of the HelperSuggestedAction vocabulary (41.1) and must never be batchable.
 */
export const FORBIDDEN_SCALABILITY_ACTIONS = [
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
  'bulk_approve',
  'bulk_apply',
] as const

export function isForbiddenScalabilityAction(value: string): boolean {
  return (FORBIDDEN_SCALABILITY_ACTIONS as readonly string[]).includes(value)
}

// ─────────────────────────────────────────────────────────────────────────────
// LIBRARY METADATA HELPER ACTION → RISK TIER
// ─────────────────────────────────────────────────────────────────────────────

/** Low-risk metadata/readiness actions (batch-eligible candidates). */
export const LIBRARY_LOW_RISK_ACTIONS: readonly HelperSuggestedAction[] = [
  'review_metadata',
  'normalise_title',
  'add_summary',
  'add_tags',
  'check_extraction_status',
  'flag_missing_attachment_text',
  'no_action',
]

/** Medium-risk actions — individual review preferred (e.g. staleness, later). */
export const LIBRARY_MEDIUM_RISK_ACTIONS: readonly HelperSuggestedAction[] = [
  'flag_stale_document',
]

// ─────────────────────────────────────────────────────────────────────────────
// INPUT — the facts the classifier reasons over (advisory, read-only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What the classifier needs about a helper output. These mirror existing helper
 * facts; the classifier never mutates them. The invariant flags are passed in so
 * the classifier can REFUSE to treat anything unsafe as low-risk/batchable — it
 * never changes them.
 */
export type ReviewBurdenInput = {
  helper_type: string
  suggested_action: string
  source_surfaces: string[]
  // Invariant flags as stored (read-only — classifier never alters these).
  not_memory: boolean
  not_evidence: boolean
  prompt_eligible: boolean
  authority_changed: boolean
  // Optional triage hints.
  sensitive_scope?: boolean
  unsupported_inference?: boolean
  conflicting_sources?: boolean
  /** True when this output is a clean no-issue deterministic check. */
  clean_no_issue?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT — the advisory review-burden classification
// ─────────────────────────────────────────────────────────────────────────────

export type ReviewBurden = {
  risk_class: HelperRiskClass
  review_priority: HelperReviewPriority
  review_mode: HelperReviewMode
  batch_eligible: boolean
  sample_required: boolean
  escalation_required: boolean
  escalation_reasons: HelperEscalationReason[]
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFIER (pure) — classify UPWARD on any doubt
// ─────────────────────────────────────────────────────────────────────────────

function pushReason(reasons: HelperEscalationReason[], r: HelperEscalationReason) {
  if (!reasons.includes(r)) reasons.push(r)
}

/**
 * Classify a helper output's review burden. Deterministic. Defaults are the
 * SAFE (highest-friction) ones; the classifier only relaxes toward low-risk /
 * batch-eligible when every safety condition holds for the one v1 helper type.
 *
 * It NEVER changes authority flags, review_state, or anything else — it returns
 * an advisory ReviewBurden only.
 */
export function classifyReviewBurden(input: ReviewBurdenInput): ReviewBurden {
  const escalation_reasons: HelperEscalationReason[] = []

  // ── Unsafe-by-construction conditions → authority_critical, two-gate ──
  const flagsUnsafe =
    input.not_memory !== true ||
    input.not_evidence !== true ||
    input.prompt_eligible !== false ||
    input.authority_changed !== false

  const forbiddenAction = isForbiddenScalabilityAction(input.suggested_action)

  // Any forbidden source surface (helper_output, prompt_text, reasoning_*,
  // archive metadata used as evidence, etc.) maps to an authority implication.
  const surfaceReasons = surfaceImplications(input.source_surfaces)

  // Unknown OR deferred helper type → never inherits low-risk behaviour.
  const helperKnownV1 = input.helper_type === 'library_metadata_helper'

  // ── Hard authority_critical gate ──
  if (flagsUnsafe || forbiddenAction || surfaceReasons.length > 0 || !helperKnownV1) {
    if (flagsUnsafe) pushReason(escalation_reasons, 'authority_surface')
    if (forbiddenAction) pushReason(escalation_reasons, 'authority_surface')
    if (!helperKnownV1) pushReason(escalation_reasons, 'human_judgement_required')
    for (const r of surfaceReasons) pushReason(escalation_reasons, r)
    pushReason(escalation_reasons, 'bulk_review_not_allowed')
    return authorityCritical(escalation_reasons)
  }

  // ── From here: known v1 helper (library_metadata_helper), flags safe ──
  if (input.sensitive_scope) pushReason(escalation_reasons, 'sensitive_scope')
  if (input.conflicting_sources) pushReason(escalation_reasons, 'conflicting_sources')
  if (input.unsupported_inference) pushReason(escalation_reasons, 'unsupported_inference')
  // Provenance: a library helper output must cite at least one library surface.
  const hasProvenance = input.source_surfaces.length > 0
  if (!hasProvenance) pushReason(escalation_reasons, 'missing_provenance')

  const sensitiveOrUnsupported =
    !!input.sensitive_scope || !!input.unsupported_inference || !!input.conflicting_sources || !hasProvenance

  const isLowAction = (LIBRARY_LOW_RISK_ACTIONS as readonly string[]).includes(input.suggested_action)
  const isMediumAction = (LIBRARY_MEDIUM_RISK_ACTIONS as readonly string[]).includes(input.suggested_action)

  // Clean no-issue deterministic check → no review needed (still inert).
  if (input.clean_no_issue && input.suggested_action === 'no_action' && !sensitiveOrUnsupported) {
    return {
      risk_class: 'low',
      review_priority: 'routine',
      review_mode: 'no_review_needed',
      batch_eligible: false, // nothing to batch — there is no actionable issue
      sample_required: false,
      escalation_required: false,
      escalation_reasons: [],
    }
  }

  // Sensitive/unsupported/conflicting/missing-provenance → escalate to high.
  if (sensitiveOrUnsupported) {
    pushReason(escalation_reasons, 'human_judgement_required')
    pushReason(escalation_reasons, 'bulk_review_not_allowed')
    return {
      risk_class: 'high',
      review_priority: 'elevated',
      review_mode: 'individual_review_required',
      batch_eligible: false,
      sample_required: false,
      escalation_required: true,
      escalation_reasons,
    }
  }

  // Medium-risk action (e.g. staleness) → individual review, not batchable.
  if (isMediumAction) {
    return {
      risk_class: 'medium',
      review_priority: 'normal',
      review_mode: 'individual_review_required',
      batch_eligible: false,
      sample_required: false,
      escalation_required: false,
      escalation_reasons,
    }
  }

  // Low-risk metadata/readiness action → batch-eligible candidate.
  if (isLowAction) {
    return {
      risk_class: 'low',
      review_priority: 'routine',
      review_mode: 'batch_review_allowed',
      batch_eligible: true,
      sample_required: true, // batch items are sampled for audit support
      escalation_required: false,
      escalation_reasons: [],
    }
  }

  // Unknown action for a known helper → classify upward (medium, individual).
  pushReason(escalation_reasons, 'human_judgement_required')
  return {
    risk_class: 'medium',
    review_priority: 'normal',
    review_mode: 'individual_review_required',
    batch_eligible: false,
    sample_required: false,
    escalation_required: false,
    escalation_reasons,
  }
}

function authorityCritical(reasons: HelperEscalationReason[]): ReviewBurden {
  return {
    risk_class: 'authority_critical',
    review_priority: 'urgent',
    review_mode: 'two_gate_review_required',
    batch_eligible: false,
    sample_required: false,
    escalation_required: true,
    escalation_reasons: reasons,
  }
}

/** Map source surfaces to authority-implication escalation reasons. */
function surfaceImplications(surfaces: string[]): HelperEscalationReason[] {
  const out: HelperEscalationReason[] = []
  for (const s of surfaces ?? []) {
    switch (s) {
      case 'helper_output':
        pushReason(out, 'authority_surface') // helper-output-as-source — never batchable
        break
      case 'prompt_text':
        pushReason(out, 'prompt_implication')
        break
      case 'reasoning_output':
      case 'reasoning_audit_trail':
        pushReason(out, 'reasoning_evidence_implication')
        break
      case 'graph_proposal_metadata':
      case 'graph_node_metadata':
      case 'graph_edge_metadata':
        pushReason(out, 'graph_implication')
        break
      case 'archive_item_metadata':
        pushReason(out, 'archive_implication')
        break
      case 'feedback_event':
      case 'sandbox_response':
      case 'identity_kernel':
      case 'secret_or_credential':
      case 'raw_chat_message':
      case 'lounge_message':
      case 'private_journal_content':
        pushReason(out, 'sensitive_scope')
        break
      // library_item / library_item_file / recall_eval_case / workshop_build_metadata
      // carry no authority implication on their own.
      default:
        break
    }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// BATCH ELIGIBILITY — independent re-check (defence in depth)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A ReviewBurden is batch-eligible ONLY when every safe condition holds. This is
 * a second, independent gate over the classifier output + the original input, so
 * batch eligibility can never be true for anything risky.
 */
export function isBatchEligible(input: ReviewBurdenInput, burden: ReviewBurden): boolean {
  return (
    burden.batch_eligible === true &&
    burden.risk_class === 'low' &&
    burden.review_mode === 'batch_review_allowed' &&
    burden.escalation_required === false &&
    input.helper_type === 'library_metadata_helper' &&
    input.not_memory === true &&
    input.not_evidence === true &&
    input.prompt_eligible === false &&
    input.authority_changed === false &&
    !isForbiddenScalabilityAction(input.suggested_action) &&
    (LIBRARY_LOW_RISK_ACTIONS as readonly string[]).includes(input.suggested_action) &&
    surfaceImplications(input.source_surfaces).length === 0 &&
    !input.sensitive_scope &&
    !input.unsupported_inference &&
    !input.conflicting_sources
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFERRED / UNKNOWN HELPER DEFAULT — never permissive by accident
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default review burden for any helper type that is not the one v1 helper. Used
 * so deferred/future helpers do not inherit low-risk behaviour. Always
 * authority_critical + two-gate + not batch-eligible.
 */
export function defaultBurdenForHelperType(helperType: HelperType | string): ReviewBurden {
  if (helperType === 'library_metadata_helper') {
    // Even the v1 helper's *default* (absent a specific output) is conservative.
    return {
      risk_class: 'medium',
      review_priority: 'normal',
      review_mode: 'individual_review_required',
      batch_eligible: false,
      sample_required: false,
      escalation_required: false,
      escalation_reasons: [],
    }
  }
  return authorityCritical(['human_judgement_required', 'bulk_review_not_allowed'])
}
