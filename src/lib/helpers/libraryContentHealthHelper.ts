/**
 * Phase 41.17.2 — Deterministic Library Content-Health Helper
 *
 * The third v1 helper (`library_content_health_helper`). Pure and deterministic:
 * given a typed snapshot of a single Library item and snapshots of its attached
 * files, it detects extraction/content-USABILITY problems the metadata helper does
 * NOT cover, and returns inert helper output drafts.
 *
 * ── Why a separate helper (not an extension of the metadata helper) ───────────
 *   The metadata helper owns the "no text" cases (extraction not run / extracted
 *   but empty / no text). This helper owns the COMPLETENESS/health signals on a
 *   file that DID extract: was the extraction truncated, and is a file explicitly
 *   flagged needs_review. The two helpers' findings are disjoint by design, so a
 *   single item is never double-flagged for the same concern, and dedupe (which is
 *   keyed on helper_type) keeps each helper's review queue clean.
 *
 * ── Boundaries (hard) ────────────────────────────────────────────────────────
 *   * PURE. No I/O, no async, no DB, no Supabase, no Anthropic/OpenAI, no fetch,
 *     no embeddings, no library_chunks, no chat retrieval, no prompt context.
 *   * READ-ONLY toward Library. It inspects a snapshot; it NEVER repairs,
 *     rewrites, links, promotes, routes, or re-extracts anything.
 *   * FILE METADATA ONLY. It reads extraction_status / extraction_truncated /
 *     needs_review — it NEVER reads or references the extracted_text content. The
 *     extracted body is out of scope, by construction.
 *   * Output is TRACE, not truth. Every draft is not_memory / not_evidence /
 *     prompt_eligible:false / authority_changed:false / human_review_required.
 *   * It reads only the `library_item` / `library_item_file` source surfaces. It
 *     never reads helper_output (C1).
 *   * No apply path. The retry-extraction apply control is hard-scoped to the
 *     metadata helper (Phase 42.2.1); a content-health output is review-only.
 *
 * A visible miss is safer than a hidden authority leak: only checks that are
 * deterministically true from a single item's files' own metadata columns are
 * made. Cross-item or content-aware reasoning is out of scope.
 *
 * Phase 41.17.2 is pure functions + unit fixtures only. The DB read + INSERT live
 * in the separate manual CLI (scripts/run-library-content-health-helper.ts), which
 * reuses the sealed writer unchanged.
 */

import {
  type HelperOutputDraft,
  type HelperSourceRef,
  type HelperSuggestedAction,
  type HelperPresenceScope,
  validateHelperOutputDraft,
} from './helperContract'

// ─────────────────────────────────────────────────────────────────────────────
// INPUT SNAPSHOTS — the exact (and only) Library fields this helper reads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A read-only snapshot of a `library_items` row. Only the fields this helper
 * needs — deliberately minimal so callers cannot feed (and the helper cannot read)
 * body text, retrieval, chunks, tags, or authority fields it has no business
 * touching. The item is the parent of the files being inspected.
 */
export type ContentHealthItemSnapshot = {
  id: string
  presence_scope: HelperPresenceScope
}

/**
 * A read-only snapshot of a `library_item_files` row. METADATA ONLY — there is
 * deliberately no `extracted_text` field, so the helper cannot read file content.
 * The three booleans/status drive the two health checks.
 */
export type ContentHealthFileSnapshot = {
  id: string
  library_item_id: string
  extraction_status: string
  extraction_truncated: boolean
  needs_review: boolean
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

/** The status string that marks a file as having been extracted. */
const EXTRACTION_STATUS_EXTRACTED = 'extracted'

/** The only two findings this helper may ever emit (Phase 41.17.2, Ari). */
export const LIBRARY_CONTENT_HEALTH_ISSUE_CODES = [
  'file_content_truncated',
  'file_flagged_needs_review',
] as const

// ─────────────────────────────────────────────────────────────────────────────
// DETECTED ISSUE (internal) — one issue → one helper output (AGGREGATE per item)
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

function itemRef(item: ContentHealthItemSnapshot): HelperSourceRef {
  return { source_surface: 'library_item', source_id: item.id }
}

function fileRef(f: ContentHealthFileSnapshot): HelperSourceRef {
  return { source_surface: 'library_item_file', source_id: f.id }
}

/** Files that belong to this item (the only files this helper may consider). */
function filesForItem(
  item: ContentHealthItemSnapshot,
  files: ContentHealthFileSnapshot[],
): ContentHealthFileSnapshot[] {
  return files.filter((f) => f.library_item_id === item.id)
}

/**
 * AGGREGATE check: any file belonging to this item that extracted but was
 * truncated (extraction_status === 'extracted' && extraction_truncated === true).
 * At most ONE finding per item — the item ref plus one ref per truncated file —
 * so the 4-field dedupe key never collides within a run. Pure. Reads file
 * METADATA only (status + the truncated flag); never the extracted text.
 */
export function detectTruncatedFiles(
  item: ContentHealthItemSnapshot,
  files: ContentHealthFileSnapshot[],
): DetectedIssue | null {
  const truncated = filesForItem(item, files).filter(
    (f) => f.extraction_status === EXTRACTION_STATUS_EXTRACTED && f.extraction_truncated === true,
  )
  if (truncated.length === 0) return null

  return {
    issue_code: 'file_content_truncated',
    issue_label: 'Attached file(s) extracted but truncated',
    suggested_action: 'prepare_review_note',
    observed_state: {
      truncated_file_count: truncated.length,
      file_ids: truncated.map((f) => f.id),
    },
    suggested_next_step:
      'A human should review whether the truncated extraction(s) need to be re-run for complete content.',
    deterministic_reason:
      'one or more attached files have extraction_status=extracted and extraction_truncated=true.',
    checked_fields: ['extraction_status', 'extraction_truncated'],
    source_refs: [itemRef(item), ...truncated.map(fileRef)],
  }
}

/**
 * AGGREGATE check: any file belonging to this item explicitly flagged
 * needs_review === true. At most ONE finding per item — the item ref plus one ref
 * per flagged file — so the 4-field dedupe key never collides within a run. Pure.
 * Reads the needs_review flag only; never the extracted text.
 */
export function detectNeedsReviewFiles(
  item: ContentHealthItemSnapshot,
  files: ContentHealthFileSnapshot[],
): DetectedIssue | null {
  const flagged = filesForItem(item, files).filter((f) => f.needs_review === true)
  if (flagged.length === 0) return null

  return {
    issue_code: 'file_flagged_needs_review',
    issue_label: 'Attached file(s) flagged needs_review',
    suggested_action: 'prepare_review_note',
    observed_state: {
      needs_review_file_count: flagged.length,
      file_ids: flagged.map((f) => f.id),
    },
    suggested_next_step:
      'A human should review the file(s) explicitly flagged needs_review and decide on next steps.',
    deterministic_reason: 'one or more attached files have needs_review=true.',
    checked_fields: ['needs_review'],
    source_refs: [itemRef(item), ...flagged.map(fileRef)],
  }
}

/**
 * Detect all content-health issues for one item (aggregate, deterministic). At
 * most one finding per issue_code per item. Pure.
 */
export function detectContentHealthIssues(
  item: ContentHealthItemSnapshot,
  files: ContentHealthFileSnapshot[] = [],
): DetectedIssue[] {
  const detected: (DetectedIssue | null)[] = [
    detectTruncatedFiles(item, files),
    detectNeedsReviewFiles(item, files),
  ]
  return detected.filter((i): i is DetectedIssue => i !== null)
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAFT CONSTRUCTION
// ─────────────────────────────────────────────────────────────────────────────

const HELPER_TYPE = 'library_content_health_helper' as const
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
  item: ContentHealthItemSnapshot,
  options: InspectOptions,
): HelperOutputDraft {
  return {
    helper_type: HELPER_TYPE,
    source_refs: [itemRef(item)],
    presence_scope: item.presence_scope,
    output_status: 'deterministic_check',
    suggested_action: 'no_action',
    suggestion_payload: {
      // Distinct from the other helpers' clean sentinels so the helpers'
      // issue-code spaces never overlap.
      issue_code: 'no_content_health_issues_found',
      issue_label: 'No content-health issues detected',
      observed_state: { checked: true },
      suggested_next_step: 'No action required.',
      deterministic_reason: 'All deterministic content-health checks passed.',
      checked_fields: ['extraction_status', 'extraction_truncated', 'needs_review'],
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
// PUBLIC ENTRY — inspect ONE Library item (+ snapshots of its files)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inspect a single Library item; return inert helper output drafts (one per
 * detected content-health issue — aggregated, so at most one draft per issue_code
 * per item). Deterministic: same input → same output. Every returned draft is
 * validated against the 41.1 contract; an invalid draft is a bug and throws.
 *
 * `files` is filtered to this item's files; only their metadata columns
 * (extraction_status / extraction_truncated / needs_review) are read — never the
 * extracted text. There is no all-items path — bulk processing is out of scope.
 */
export function inspectLibraryContentHealth(
  item: ContentHealthItemSnapshot,
  files: ContentHealthFileSnapshot[] = [],
  options: InspectOptions = {},
): HelperOutputDraft[] {
  const issues = detectContentHealthIssues(item, files)

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
        `libraryContentHealthHelper produced an invalid draft: ${result.errors.join('; ')}`,
      )
    }
  }

  return drafts
}
