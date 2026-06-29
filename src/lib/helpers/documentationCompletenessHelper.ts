/**
 * Phase 41.17.2 — Deterministic Documentation Completeness Helper
 *
 * The v1 `documentation_completeness_helper`. Pure and deterministic: given a
 * typed snapshot of a SINGLE Library item, it detects documentation-COMPLETENESS
 * gaps that are checkable from that one item's own columns, and returns inert
 * helper output drafts.
 *
 * ── Why a separate helper (not an extension of the documentation helper) ──────
 *   The documentation helper checks documentation *structure* — including the
 *   all-null phase-metadata case (a dev-doc item carrying NO phase metadata at
 *   all). This helper checks documentation *completeness*: a dev-doc item whose
 *   phase metadata is PARTIAL (some fields present, some missing), and a
 *   superseded item with no archive link. The two helpers' findings are disjoint
 *   by design — this helper deliberately does NOT fire on the all-null case (that
 *   is the documentation helper's territory) and does NOT fire when all three
 *   phase fields are present — so a single item is never double-flagged for the
 *   same concern, and dedupe (keyed on helper_type) keeps each queue clean.
 *
 * ── Boundaries (hard) ────────────────────────────────────────────────────────
 *   * PURE. No I/O, no async, no DB, no Supabase, no Anthropic/OpenAI, no fetch,
 *     no embeddings, no library_chunks, no chat retrieval, no prompt context.
 *   * READ-ONLY toward Library. It inspects a snapshot; it NEVER repairs,
 *     rewrites, links, promotes, or routes anything.
 *   * Output is TRACE, not truth. Every draft is not_memory / not_evidence /
 *     prompt_eligible:false / authority_changed:false / human_review_required.
 *   * It reads only the `library_item` source surface — NO files at all (it does
 *     not read library_item_file). It never reads helper_output (C1).
 *   * No apply path. The retry-extraction apply control is hard-scoped to the
 *     metadata helper; a documentation-completeness output is review-only, always.
 *
 * A visible miss is safer than a hidden authority leak: only checks that are
 * deterministically true from a single item's own columns are made. No history
 * rewriting, no closure-record-as-authority, and no multi-phase / cross-item
 * inference — all out of scope.
 *
 * Phase 41.17.2 is pure functions + unit fixtures only. The DB read + INSERT live
 * in the separate manual CLI (scripts/run-documentation-completeness-helper.ts),
 * which reuses the sealed writer unchanged.
 */

import {
  type HelperOutputDraft,
  type HelperSourceRef,
  type HelperSuggestedAction,
  type HelperPresenceScope,
  validateHelperOutputDraft,
} from './helperContract'

// ─────────────────────────────────────────────────────────────────────────────
// INPUT SNAPSHOT — the exact (and only) Library fields this helper reads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A read-only snapshot of a `library_items` row. Only the completeness fields
 * this helper inspects are present — deliberately minimal so callers cannot feed
 * (and the helper cannot read) body text, retrieval, chunks, tags, or fields it
 * has no business touching.
 *
 * `collection` and the three `phase_*` fields drive the partial-phase-metadata
 * check; `authority_status` / `archive_item_id` drive the superseded-link check.
 */
export type DocCompletenessItemSnapshot = {
  id: string
  presence_scope: HelperPresenceScope
  collection: string
  phase_code: string | null
  phase_number: number | null
  phase_label: string | null
  authority_status: string
  archive_item_id: string | null
}

export type InspectOptions = {
  /**
   * When true, a clean item (no issues) yields one `no_action` deterministic
   * check row (for explicit verification/audit). Default false — a clean item
   * yields NO output, to keep the ledger quiet.
   */
  emitNoActionWhenClean?: boolean
  /** When true, produced drafts are tagged test_owned (for test inserts). */
  testOwned?: boolean
}

// The one collection expected to carry phase metadata structurally.
const DEVELOPMENT_DOCUMENTATION = 'development_documentation'

/** The only two findings this helper may ever emit (Phase 41.17.2). */
export const DOCUMENTATION_COMPLETENESS_ISSUE_CODES = [
  'phase_doc_incomplete_phase_metadata',
  'superseded_item_missing_archive_link',
] as const

// ─────────────────────────────────────────────────────────────────────────────
// DETECTED ISSUE (internal) — one issue → one helper output
// ─────────────────────────────────────────────────────────────────────────────

type DetectedIssue = {
  issue_code: string
  issue_label: string
  suggested_action: HelperSuggestedAction
  observed_state: Record<string, unknown>
  suggested_next_step: string
  deterministic_reason: string
  checked_fields: string[]
  source_refs: HelperSourceRef[]
}

// ─────────────────────────────────────────────────────────────────────────────
// DETECTION RULES (deterministic, single-item, low-risk)
// ─────────────────────────────────────────────────────────────────────────────

function isBlank(s: string | null | undefined): boolean {
  return s == null || s.trim().length === 0
}

function itemRef(item: DocCompletenessItemSnapshot): HelperSourceRef {
  return { source_surface: 'library_item', source_id: item.id }
}

/**
 * Development-documentation item with PARTIAL phase metadata. Fires only when the
 * collection is `development_documentation` AND, of the three phase fields
 * {phase_code non-blank, phase_number non-null, phase_label non-blank}, at least
 * ONE is present AND at least ONE is missing. Deliberately does NOT fire when all
 * three are missing (the documentation helper's all-null case) and does NOT fire
 * when all three are present. Pure.
 */
export function detectPhaseMetadataIncompleteIssue(
  item: DocCompletenessItemSnapshot,
): DetectedIssue | null {
  if (item.collection !== DEVELOPMENT_DOCUMENTATION) return null

  const codePresent = !isBlank(item.phase_code)
  const numberPresent = item.phase_number != null
  const labelPresent = !isBlank(item.phase_label)

  const presentCount = [codePresent, numberPresent, labelPresent].filter(Boolean).length
  // PARTIAL = at least one present AND at least one missing (1 or 2 of 3).
  if (presentCount === 0 || presentCount === 3) return null

  return {
    issue_code: 'phase_doc_incomplete_phase_metadata',
    issue_label: 'Development-documentation item carries incomplete phase metadata',
    suggested_action: 'prepare_review_note',
    observed_state: {
      collection: item.collection,
      phase_code_present: codePresent,
      phase_number_present: numberPresent,
      phase_label_present: labelPresent,
    },
    suggested_next_step:
      'A human should review whether this phase document should carry the missing phase_code / phase_number / phase_label.',
    deterministic_reason:
      'collection is development_documentation and phase metadata is partial: at least one of phase_code, phase_number, phase_label is present and at least one is missing.',
    checked_fields: ['collection', 'phase_code', 'phase_number', 'phase_label'],
    source_refs: [itemRef(item)],
  }
}

/**
 * Superseded item with no archive link: authority_status is `superseded` and
 * archive_item_id is null/blank. Pure.
 */
export function detectSupersededLinkIssue(
  item: DocCompletenessItemSnapshot,
): DetectedIssue | null {
  if (item.authority_status !== 'superseded') return null
  if (!isBlank(item.archive_item_id)) return null

  return {
    issue_code: 'superseded_item_missing_archive_link',
    issue_label: 'Superseded library item has no archive link',
    suggested_action: 'prepare_review_note',
    observed_state: {
      authority_status: item.authority_status,
      archive_item_id_present: false,
    },
    suggested_next_step:
      'A human should review whether this superseded item should carry an archive_item_id linking it to its archive record.',
    deterministic_reason:
      'authority_status is superseded and archive_item_id is empty.',
    checked_fields: ['authority_status', 'archive_item_id'],
    source_refs: [itemRef(item)],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAFT CONSTRUCTION
// ─────────────────────────────────────────────────────────────────────────────

const HELPER_TYPE = 'documentation_completeness_helper' as const
const HELPER_CREATED_BY = 'system_candidate' as const

function issueToDraft(
  issue: DetectedIssue,
  presenceScope: HelperPresenceScope,
  options: InspectOptions,
): HelperOutputDraft {
  return {
    helper_type: HELPER_TYPE,
    source_refs: issue.source_refs,
    presence_scope: presenceScope,
    output_status: 'deterministic_check',
    suggested_action: issue.suggested_action,
    suggestion_payload: {
      issue_code: issue.issue_code,
      issue_label: issue.issue_label,
      observed_state: issue.observed_state,
      suggested_next_step: issue.suggested_next_step,
      deterministic_reason: issue.deterministic_reason,
      checked_fields: issue.checked_fields,
    },
    confidence_label: 'structural',
    human_review_required: true,
    not_memory: true,
    not_evidence: true,
    prompt_eligible: false,
    authority_changed: false,
    review_routed: false,
    created_by: HELPER_CREATED_BY,
    test_owned: options.testOwned ?? false,
  }
}

function cleanItemNoActionDraft(
  item: DocCompletenessItemSnapshot,
  options: InspectOptions,
): HelperOutputDraft {
  return {
    helper_type: HELPER_TYPE,
    source_refs: [itemRef(item)],
    presence_scope: item.presence_scope,
    output_status: 'deterministic_check',
    suggested_action: 'no_action',
    suggestion_payload: {
      // Distinct from every other helper's clean sentinel so the helpers'
      // issue-code spaces never overlap.
      issue_code: 'no_documentation_completeness_issues_found',
      issue_label: 'No documentation-completeness gaps detected',
      observed_state: { checked: true },
      suggested_next_step: 'No action required.',
      deterministic_reason: 'All deterministic documentation-completeness checks passed.',
      checked_fields: [
        'collection',
        'phase_code',
        'phase_number',
        'phase_label',
        'authority_status',
        'archive_item_id',
      ],
    },
    confidence_label: 'structural',
    human_review_required: true,
    not_memory: true,
    not_evidence: true,
    prompt_eligible: false,
    authority_changed: false,
    review_routed: false,
    created_by: HELPER_CREATED_BY,
    test_owned: options.testOwned ?? false,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ENTRY — inspect ONE Library item (the item only; NO files)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inspect a single Library item; return inert helper output drafts (one per
 * detected completeness gap). Deterministic: same input → same output. Every
 * returned draft is validated against the 41.1 contract; an invalid draft is a
 * bug and throws.
 *
 * NOTE: the signature is (item, options) ONLY — there is no files parameter. This
 * helper reads the `library_item` surface alone. There is no all-items path —
 * bulk processing is out of scope.
 */
export function inspectDocumentationCompleteness(
  item: DocCompletenessItemSnapshot,
  options: InspectOptions = {},
): HelperOutputDraft[] {
  const detected: (DetectedIssue | null)[] = [
    detectPhaseMetadataIncompleteIssue(item),
    detectSupersededLinkIssue(item),
  ]
  const issues = detected.filter((i): i is DetectedIssue => i !== null)

  let drafts: HelperOutputDraft[]
  if (issues.length === 0) {
    drafts = options.emitNoActionWhenClean ? [cleanItemNoActionDraft(item, options)] : []
  } else {
    drafts = issues.map((issue) => issueToDraft(issue, item.presence_scope, options))
  }

  // Contract is the source of truth: every produced draft must validate.
  for (const draft of drafts) {
    const result = validateHelperOutputDraft(draft)
    if (!result.valid) {
      throw new Error(
        `documentationCompletenessHelper produced an invalid draft: ${result.errors.join('; ')}`,
      )
    }
  }

  return drafts
}
