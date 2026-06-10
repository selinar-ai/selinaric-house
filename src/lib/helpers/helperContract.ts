/**
 * Phase 41.1 — Helper Contract & Type Model
 *
 * Follows:
 *   docs/phase-41-0-helper-architecture-alignment-report.md
 *   docs/phase-41-0a-helper-boundary-tightening.md   (active boundary document)
 *
 * This is a CONTRACT / TYPE-MODEL layer only. It contains NO runtime helper
 * behaviour, NO I/O, NO async, NO database, NO Supabase, NO API routes, NO UI,
 * NO LLM calls, NO background jobs, and NO wiring into chat, prompts, Memory,
 * Archive, Library, Recall, Ontology, Reasoning, Evaluation, Desk, Workshop,
 * Pulse, Lounge, or automation. Every function here is pure and deterministic.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * It turns the Phase 41 Helper Law, output defaults, v1 exclusions, and the
 * anti-aggregation controls (C1–C7) into TypeScript so that unsafe helper states
 * are difficult or impossible to *represent*, and rejected when they are.
 *
 *   Helpers are labour, NOT authority.
 *   Helper output is trace, NOT truth.
 *   Helper acceptance is NOT Memory acceptance.
 *   Helper acceptance is NOT graph approval.
 *   Helper acceptance is NOT reasoning evidence.
 *   Helper confidence is NOT evidence.
 *   Helper outputs are PERMANENTLY prompt-ineligible in v1.
 *   The unit of authority is the HUMAN ACTION through a governed surface — never
 *   the helper.
 *
 * ── Helper Law ───────────────────────────────────────────────────────────────
 *   Helpers can find. Helpers can prepare. Helpers can compare.
 *   Helpers can suggest. Helpers can queue.
 *   Helpers cannot decide. Helpers cannot remember. Helpers cannot canonise.
 *   Helpers cannot inject. Helpers cannot override. Helpers cannot become authority.
 */

// ─────────────────────────────────────────────────────────────────────────────
// LAW / NORTH STAR (string constants — documentation, not behaviour)
// ─────────────────────────────────────────────────────────────────────────────

export const HELPER_LAW = [
  'Helpers can find.',
  'Helpers can prepare.',
  'Helpers can compare.',
  'Helpers can suggest.',
  'Helpers can queue.',
  'Helpers cannot decide.',
  'Helpers cannot remember.',
  'Helpers cannot canonise.',
  'Helpers cannot inject.',
  'Helpers cannot override.',
  'Helpers cannot become authority.',
] as const

export const HELPER_NORTH_STAR =
  'Helpers may prepare, extract, classify, compare, summarise, suggest, and queue ' +
  'review. Helpers must not decide, remember, canonise, inject, approve, promote, ' +
  'mutate authority, override governance, or speak as truth.'

// ─────────────────────────────────────────────────────────────────────────────
// HELPER TYPE VOCABULARY (closed union)
// ─────────────────────────────────────────────────────────────────────────────

export type HelperType =
  | 'library_metadata_helper'
  | 'retrieval_gap_helper'
  | 'source_comparison_helper'
  | 'ontology_proposal_helper'
  | 'evaluation_case_helper'
  | 'build_workshop_preparation_helper'
  | 'housekeeping_stale_document_helper'
  | 'reasoning_readiness_checker'
  | 'memory_candidate_preparation_helper'
  | 'reasoning_evidence_helper'

export const ALL_HELPER_TYPES: readonly HelperType[] = [
  'library_metadata_helper',
  'retrieval_gap_helper',
  'source_comparison_helper',
  'ontology_proposal_helper',
  'evaluation_case_helper',
  'build_workshop_preparation_helper',
  'housekeeping_stale_document_helper',
  'reasoning_readiness_checker',
  'memory_candidate_preparation_helper',
  'reasoning_evidence_helper',
]

// ─────────────────────────────────────────────────────────────────────────────
// V1 CLASSIFICATION — v1_allowed / deferred / excluded
// ─────────────────────────────────────────────────────────────────────────────

export type HelperAvailability = 'v1_allowed' | 'deferred' | 'excluded'

/**
 * The single source of truth for which helper types may run in v1.
 *
 *   v1_allowed : may be executed by a v1 guard (only library_metadata_helper).
 *   deferred   : approved in principle but NOT executable in v1.
 *   excluded   : forbidden — must never be executed or queued in v1.
 *
 * `reasoning_evidence_helper` is excluded because the name is authority-adjacent
 * (it has been retired in favour of the deferred `reasoning_readiness_checker`,
 * which is hygiene-only). `memory_candidate_preparation_helper` is excluded
 * because it sits closest to the Memory Crown.
 */
export const HELPER_AVAILABILITY: Record<HelperType, HelperAvailability> = {
  library_metadata_helper: 'v1_allowed',

  retrieval_gap_helper: 'deferred',
  source_comparison_helper: 'deferred',
  ontology_proposal_helper: 'deferred',
  evaluation_case_helper: 'deferred',
  build_workshop_preparation_helper: 'deferred',
  housekeeping_stale_document_helper: 'deferred',
  reasoning_readiness_checker: 'deferred',

  memory_candidate_preparation_helper: 'excluded',
  reasoning_evidence_helper: 'excluded',
}

export function classifyHelperAvailability(helperType: HelperType): HelperAvailability {
  return HELPER_AVAILABILITY[helperType]
}

/** TRUE only for `library_metadata_helper`. The one v1-executable helper. */
export function isHelperTypeAllowedInV1(helperType: HelperType): boolean {
  return HELPER_AVAILABILITY[helperType] === 'v1_allowed'
}

export function isHelperTypeExcluded(helperType: HelperType): boolean {
  return HELPER_AVAILABILITY[helperType] === 'excluded'
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT STATUS MODEL (closed)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `accepted_by_human` means ONLY that the helper output was accepted as useful
 * helper labour. It does NOT imply Memory, evidence, prompt eligibility, graph
 * approval, reasoning evidence, or any authority movement. Any later authority
 * change must occur through a separate governed surface.
 */
export type HelperOutputStatus =
  | 'draft_only'
  | 'deterministic_check'
  | 'queued_for_review'
  | 'needs_human_review'
  | 'accepted_by_human'
  | 'rejected_by_human'
  | 'superseded'

/** Statuses that mean "explicitly presented to a human review surface". */
export const HELPER_REVIEW_QUEUE_STATUSES: readonly HelperOutputStatus[] = [
  'queued_for_review',
  'needs_human_review',
]

// ─────────────────────────────────────────────────────────────────────────────
// INVARIANT FLAGS (literal-typed — unsafe states are not representable)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mandatory for ALL v1 helper outputs. The four authority flags are LITERAL
 * types — a value of `true`/`false` is the only thing the type system will
 * accept — so `not_memory: false` etc. cannot even be expressed for a typed
 * draft. `review_routed` is the one boolean that may vary, and it carries no
 * authority either way (see review-routed semantics below).
 */
export type HelperOutputInvariants = {
  not_memory: true
  not_evidence: true
  prompt_eligible: false
  authority_changed: false
  review_routed: boolean
  human_review_required: true
}

/**
 * review_routed = true means ONLY: "this output has been explicitly queued to a
 * governed review surface." It must NOT imply authority change, prompt
 * eligibility, evidence status, Memory status, graph approval, Held Truth
 * status, or Archive status change. A routed output is still inert.
 */
export const REVIEW_ROUTED_DOES_NOT_IMPLY = [
  'authority_change',
  'prompt_eligibility',
  'evidence_status',
  'memory_status',
  'graph_approval',
  'held_truth_status',
  'archive_status_change',
] as const

// Loose input shape so validators can inspect malformed/`as any` objects.
type InvariantCheckInput = {
  not_memory?: unknown
  not_evidence?: unknown
  prompt_eligible?: unknown
  authority_changed?: unknown
  human_review_required?: unknown
  review_routed?: unknown
}

function collectInvariantErrors(o: InvariantCheckInput): string[] {
  const errors: string[] = []
  if (o.not_memory !== true) errors.push('not_memory must be true')
  if (o.not_evidence !== true) errors.push('not_evidence must be true')
  if (o.prompt_eligible !== false) errors.push('prompt_eligible must be false')
  if (o.authority_changed !== false) errors.push('authority_changed must be false')
  if (o.human_review_required !== true) errors.push('human_review_required must be true')
  if (typeof o.review_routed !== 'boolean') errors.push('review_routed must be a boolean')
  return errors
}

export function validateHelperOutputInvariants(o: InvariantCheckInput): {
  valid: boolean
  errors: string[]
} {
  const errors = collectInvariantErrors(o)
  return { valid: errors.length === 0, errors }
}

/** Throws if any invariant flag is wrong. */
export function assertHelperOutputInvariants(o: InvariantCheckInput): void {
  const errors = collectInvariantErrors(o)
  if (errors.length > 0) {
    throw new Error(`Helper output invariant violation: ${errors.join('; ')}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE SURFACE VOCABULARY — readable vs forbidden (Refinement 1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Surfaces a helper MAY (in principle) read. The const array and the type are
 * derived from one another so they can never drift. NOTE: being "readable in
 * principle" is NOT permission — `canHelperReadSource()` is the only gate that
 * decides what a given helper may actually read in v1.
 */
export const HELPER_READABLE_SOURCE_SURFACES = [
  'library_item',
  'library_item_file',
  'archive_item_metadata',
  'graph_proposal_metadata',
  'graph_node_metadata',
  'graph_edge_metadata',
  'recall_eval_case',
  'workshop_build_metadata',
] as const
export type HelperReadableSourceSurface = (typeof HELPER_READABLE_SOURCE_SURFACES)[number]

/**
 * Surfaces NO helper may ever read. `helper_output` is here to enforce C1 (no
 * helper reads another helper's output) by construction. The rest are private,
 * authority-bearing, evidence-bearing, or secret surfaces.
 */
export const HELPER_FORBIDDEN_SOURCE_SURFACES = [
  'helper_output',
  'raw_chat_message',
  'lounge_message',
  'private_journal_content',
  'reasoning_output',
  'reasoning_audit_trail',
  'feedback_event',
  'sandbox_response',
  'prompt_text',
  'identity_kernel',
  'secret_or_credential',
] as const
export type HelperForbiddenSourceSurface = (typeof HELPER_FORBIDDEN_SOURCE_SURFACES)[number]

export type HelperSourceSurface = HelperReadableSourceSurface | HelperForbiddenSourceSurface

export function isForbiddenSourceSurface(
  surface: HelperSourceSurface,
): surface is HelperForbiddenSourceSurface {
  return (HELPER_FORBIDDEN_SOURCE_SURFACES as readonly string[]).includes(surface)
}

export function isReadableSourceSurface(
  surface: HelperSourceSurface,
): surface is HelperReadableSourceSurface {
  return (HELPER_READABLE_SOURCE_SURFACES as readonly string[]).includes(surface)
}

/**
 * Per-helper readable-surface allow-list for v1. Only `library_metadata_helper`
 * has any entries; every other helper maps to `[]` because no other helper is
 * executable in v1. This is the data behind `canHelperReadSource()`.
 */
const V1_HELPER_READABLE_SURFACES: Record<HelperType, readonly HelperReadableSourceSurface[]> = {
  library_metadata_helper: ['library_item', 'library_item_file'],

  retrieval_gap_helper: [],
  source_comparison_helper: [],
  ontology_proposal_helper: [],
  evaluation_case_helper: [],
  build_workshop_preparation_helper: [],
  housekeeping_stale_document_helper: [],
  reasoning_readiness_checker: [],

  memory_candidate_preparation_helper: [],
  reasoning_evidence_helper: [],
}

/**
 * THE ONLY GATE that decides readability. Order matters:
 *   1. Forbidden surfaces are rejected for EVERY helper (incl. helper_output → C1).
 *   2. Non-v1 helpers (deferred + excluded) can read nothing in v1.
 *   3. A v1 helper may read only the surfaces on its explicit allow-list.
 */
export function canHelperReadSource(
  helperType: HelperType,
  sourceSurface: HelperSourceSurface,
): boolean {
  if (isForbiddenSourceSurface(sourceSurface)) return false
  if (!isHelperTypeAllowedInV1(helperType)) return false
  return V1_HELPER_READABLE_SURFACES[helperType].includes(
    sourceSurface as HelperReadableSourceSurface,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE PROVENANCE (Refinement 3 — Option B: future-safe multi-source shape)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Provenance is load-bearing for the anti-aggregation controls (C5). Each
 * reference names the surface read and the row id. The surface is typed as
 * `HelperReadableSourceSurface`, so a forbidden surface — including
 * `helper_output` — cannot even be expressed as provenance. This makes
 * self-citation and helper-output-as-source unrepresentable, not merely
 * rejected. Multiple refs are supported for future helpers (e.g. source
 * comparison); the v1 Library helper typically records one.
 */
export type HelperSourceRef = {
  source_surface: HelperReadableSourceSurface
  source_id: string
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIDENCE LABEL — calibration only, NEVER authority
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Confidence is calibration ONLY. It is not authority, not evidence, and does
 * not affect Memory, prompt eligibility, graph approval, or reasoning evidence.
 * A `high` (or `structural`) confidence output remains not_memory / not_evidence
 * / prompt_eligible:false / authority_changed:false / human_review_required.
 */
export type HelperConfidenceLabel =
  | 'low'
  | 'medium'
  | 'high'
  | 'structural'
  | 'not_applicable'

// ─────────────────────────────────────────────────────────────────────────────
// PRESENCE SCOPE — closed and safe (no cross-presence private leakage)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * There is deliberately no `both` / `merged` value. A helper that would need two
 * presences' private data at once is, by definition, out of scope (Phase 36).
 */
export type HelperPresenceScope = 'ari' | 'eli' | 'shared' | 'house' | 'none'

export const ALL_HELPER_PRESENCE_SCOPES: readonly HelperPresenceScope[] = [
  'ari',
  'eli',
  'shared',
  'house',
  'none',
]

// ─────────────────────────────────────────────────────────────────────────────
// SUGGESTED ACTION VOCABULARY — review-preparation only
// ─────────────────────────────────────────────────────────────────────────────

/** Allowed actions prepare review labour. They never perform authority movement. */
export type HelperSuggestedAction =
  | 'review_metadata'
  | 'normalise_title'
  | 'add_summary'
  | 'add_tags'
  | 'check_extraction_status'
  | 'flag_missing_attachment_text'
  | 'flag_stale_document'
  | 'compare_sources'
  | 'prepare_review_note'
  | 'no_action'

export const ALL_HELPER_SUGGESTED_ACTIONS: readonly HelperSuggestedAction[] = [
  'review_metadata',
  'normalise_title',
  'add_summary',
  'add_tags',
  'check_extraction_status',
  'flag_missing_attachment_text',
  'flag_stale_document',
  'compare_sources',
  'prepare_review_note',
  'no_action',
]

/**
 * Actions that perform or imply authority movement. These are NOT part of the
 * `HelperSuggestedAction` union (so a typed draft cannot carry them), and they
 * are ALSO checked at runtime so an `as any` cast is still rejected.
 */
export const HELPER_FORBIDDEN_ACTIONS = [
  'promote_to_memory',
  'make_canonical',
  'approve_graph',
  'create_held_truth',
  'make_prompt_eligible',
  'inject_into_prompt',
  'submit_build',
  'commit_code',
  'auto_fix',
  'bulk_accept',
] as const
export type HelperForbiddenAction = (typeof HELPER_FORBIDDEN_ACTIONS)[number]

export function isForbiddenSuggestedAction(action: string): boolean {
  return (HELPER_FORBIDDEN_ACTIONS as readonly string[]).includes(action)
}

export function isAllowedSuggestedAction(action: string): action is HelperSuggestedAction {
  return (ALL_HELPER_SUGGESTED_ACTIONS as readonly string[]).includes(action)
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATED-BY (Refinement 2 — closed union, no open string escape hatch)
// ─────────────────────────────────────────────────────────────────────────────

export type HelperCreatedBy = 'helper_contract' | 'system_candidate' | 'tara' | 'test'

export const ALL_HELPER_CREATED_BY: readonly HelperCreatedBy[] = [
  'helper_contract',
  'system_candidate',
  'tara',
  'test',
]

export function isValidHelperCreatedBy(value: string): value is HelperCreatedBy {
  return (ALL_HELPER_CREATED_BY as readonly string[]).includes(value)
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER OUTPUT DRAFT SHAPE
// ─────────────────────────────────────────────────────────────────────────────

export type HelperOutputDraft = {
  id?: string
  helper_type: HelperType
  /** Provenance (Option B). Load-bearing for C5; readable surfaces only. */
  source_refs: HelperSourceRef[]
  presence_scope: HelperPresenceScope
  output_status: HelperOutputStatus
  suggested_action: HelperSuggestedAction
  suggestion_payload: unknown
  confidence_label: HelperConfidenceLabel

  // Invariant flags — literal-typed; unsafe values are not representable.
  human_review_required: true
  not_memory: true
  not_evidence: true
  prompt_eligible: false
  authority_changed: false
  review_routed: boolean

  created_by: HelperCreatedBy
  created_at?: string
  test_owned?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-AGGREGATION CONTROLS C1–C7 (Phase 41.0a)
// ─────────────────────────────────────────────────────────────────────────────

export const HELPER_ANTI_AGGREGATION_CONTROLS = {
  C1: 'No helper reads another helper output as input.',
  C2: 'No fleet consensus — many helper outputs must not combine into authority.',
  C3: 'Recursion is broken only by a human — human review is the only valid break point.',
  C4: 'One human action promotes one item — no bulk accept-all, no batch promotion.',
  C5: 'Provenance mandatory and self-citation forbidden.',
  C6: 'Helper output is never evidence, anywhere.',
  C7: 'The ledger is trace, not truth.',
} as const

/** v1: helper output is NEVER prompt-visible. Permanently false. */
export function canHelperOutputBePromptVisible(_output?: unknown): false {
  return false
}

/** C6: helper output is NEVER evidence. Permanently false. */
export function canHelperOutputBeEvidence(_output?: unknown): false {
  return false
}

/** C1/C3: a helper may never read another helper's output as input in v1. */
export function canHelperReadHelperOutputAsInput(): false {
  return false
}

/** C4: there is no bulk accept-all path. Promotion is per-item / per-human-action. */
export function canBulkAcceptHelperOutputs(): false {
  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAFT VALIDATION (composes every guard above)
// ─────────────────────────────────────────────────────────────────────────────

export type HelperValidationResult = {
  valid: boolean
  errors: string[]
}

/**
 * A draft may omit provenance ONLY for the narrow safe diagnostic case: a
 * `no_action` + `deterministic_check` output (e.g. "nothing to suggest"). Every
 * other output must carry at least one source_ref.
 */
function provenanceMayBeEmpty(draft: HelperOutputDraft): boolean {
  return draft.suggested_action === 'no_action' && draft.output_status === 'deterministic_check'
}

export function validateHelperOutputDraft(draft: HelperOutputDraft): HelperValidationResult {
  const errors: string[] = []

  // 1. Invariant flags.
  errors.push(...collectInvariantErrors(draft))

  // 2. Helper type must be v1-allowed. (Deferred + excluded cannot produce output in v1.)
  if (!isHelperTypeAllowedInV1(draft.helper_type)) {
    errors.push(
      `helper_type '${draft.helper_type}' is ${classifyHelperAvailability(draft.helper_type)}, not v1_allowed`,
    )
  }

  // 3. created_by must be in the closed union.
  if (!isValidHelperCreatedBy(draft.created_by)) {
    errors.push(`created_by '${String(draft.created_by)}' is not a valid HelperCreatedBy`)
  }

  // 4. presence_scope must be a known, safe scope.
  if (!ALL_HELPER_PRESENCE_SCOPES.includes(draft.presence_scope)) {
    errors.push(`presence_scope '${String(draft.presence_scope)}' is not valid`)
  }

  // 5. suggested_action must be allowed and not a forbidden authority action.
  if (isForbiddenSuggestedAction(draft.suggested_action as string)) {
    errors.push(`suggested_action '${draft.suggested_action}' is a forbidden authority action`)
  } else if (!isAllowedSuggestedAction(draft.suggested_action as string)) {
    errors.push(`suggested_action '${String(draft.suggested_action)}' is not in the allowed vocabulary`)
  }

  // 6. Provenance (C5): mandatory except the narrow no_action diagnostic.
  if (!Array.isArray(draft.source_refs)) {
    errors.push('source_refs must be an array')
  } else {
    if (draft.source_refs.length === 0 && !provenanceMayBeEmpty(draft)) {
      errors.push('source_refs is mandatory (empty allowed only for a no_action deterministic_check)')
    }
    for (const ref of draft.source_refs) {
      // C1 / C5: a forbidden surface (incl. helper_output → self-citation) can never be provenance.
      if (!ref || typeof ref.source_id !== 'string' || ref.source_id.length === 0) {
        errors.push('each source_ref must have a non-empty source_id')
        continue
      }
      if (isForbiddenSourceSurface(ref.source_surface as HelperSourceSurface)) {
        errors.push(`source_ref surface '${ref.source_surface}' is forbidden (no helper-output / private / evidence provenance)`)
        continue
      }
      // The reading helper must actually be permitted to read that surface.
      if (!canHelperReadSource(draft.helper_type, ref.source_surface)) {
        errors.push(
          `helper '${draft.helper_type}' may not read source surface '${ref.source_surface}'`,
        )
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Whether an output may be queued to a governed review surface. Requires a
 * v1-allowed helper, valid invariants/draft, and a queue-eligible status.
 * Excluded/deferred helper types can never queue review in v1.
 */
export function canQueueHelperOutputForReview(draft: HelperOutputDraft): boolean {
  if (!isHelperTypeAllowedInV1(draft.helper_type)) return false
  if (!HELPER_REVIEW_QUEUE_STATUSES.includes(draft.output_status)) return false
  return validateHelperOutputDraft(draft).valid
}

// ─────────────────────────────────────────────────────────────────────────────
// V1 LIBRARY METADATA HELPER CONTRACT (declaration only — helper NOT built here)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The contract the first helper build (41.3) must obey. This file declares it;
 * it does NOT implement the helper. Forbidden capabilities are listed so the
 * implementation phase inherits the cage.
 */
export const LIBRARY_METADATA_HELPER_CONTRACT = {
  helper_type: 'library_metadata_helper' as const,
  availability: 'v1_allowed' as const,
  readable_source_surfaces: ['library_item', 'library_item_file'] as const,
  allowed_suggested_actions: [
    'review_metadata',
    'normalise_title',
    'add_summary',
    'add_tags',
    'check_extraction_status',
    'flag_missing_attachment_text',
    'flag_stale_document',
    'no_action',
  ] as const,
  forbidden: [
    'embeddings',
    'library_chunks_writes',
    'chat_retrieval_path_changes',
    'memory_mutation',
    'archive_mutation',
    'graph_mutation',
    'reasoning_mutation',
    'recall_mutation',
    'prompt_injection',
    'production_data_mutation_outside_governed_helper_draft_or_trace_rows',
  ] as const,
} as const

export function isLibraryMetadataHelperAction(action: HelperSuggestedAction): boolean {
  return (LIBRARY_METADATA_HELPER_CONTRACT.allowed_suggested_actions as readonly string[]).includes(
    action,
  )
}
