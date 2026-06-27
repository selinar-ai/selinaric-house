/**
 * Phase 41.17.1 — Deterministic Library Documentation Helper
 *
 * The second v1 helper (`library_documentation_helper`). Pure and deterministic:
 * given a typed snapshot of a single Library item (and a count of its attached
 * files), it detects documentation-STRUCTURE gaps and returns inert helper
 * output drafts.
 *
 * ── Why a separate helper (not an extension of the metadata helper) ───────────
 *   The metadata helper checks documentation *quality* (title / summary / tags /
 *   extraction). This helper checks documentation *structure*: does a development-
 *   documentation item carry phase metadata, and does an item have any source
 *   material at all? The two helpers' findings are disjoint by design, so a single
 *   item is never double-flagged for the same concern, and dedupe (which is keyed
 *   on helper_type) keeps each helper's review queue clean.
 *
 * ── Boundaries (hard) ────────────────────────────────────────────────────────
 *   * PURE. No I/O, no async, no DB, no Supabase, no Anthropic/OpenAI, no fetch,
 *     no embeddings, no library_chunks, no chat retrieval, no prompt context.
 *   * READ-ONLY toward Library. It inspects a snapshot; it NEVER repairs,
 *     rewrites, links, promotes, or routes anything.
 *   * Output is TRACE, not truth. Every draft is not_memory / not_evidence /
 *     prompt_eligible:false / authority_changed:false / human_review_required.
 *   * It reads only the `library_item` source surface (file presence is consumed
 *     as a count, never as file content). It never reads helper_output (C1).
 *   * No apply path. The retry-extraction apply control is hard-scoped to the
 *     metadata helper; a documentation output is review-only, always.
 *
 * A visible miss is safer than a hidden authority leak: only checks that are
 * deterministically true from a single item's own columns are made. Cross-item
 * sequence reasoning (e.g. "this phase has no closure record") is out of scope.
 *
 * Phase 41.17.1 is pure functions + unit fixtures only. The DB read + INSERT live
 * in the separate manual CLI (scripts/run-library-documentation-helper.ts), which
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
 * A read-only snapshot of a `library_items` row. Only the structural fields this
 * helper inspects are present — deliberately minimal so callers cannot feed (and
 * the helper cannot read) body text, retrieval, chunks, tags, or authority fields
 * it has no business touching.
 *
 * `collection` and the three `phase_*` fields drive the phase-metadata check;
 * `file_path` / `source_url` / `content_text` (presence only) plus the file count
 * drive the source-material check.
 */
export type LibraryDocItemSnapshot = {
  id: string
  collection: string
  presence_scope: HelperPresenceScope
  phase_code: string | null
  phase_number: number | null
  phase_label: string | null
  file_path: string | null
  source_url: string | null
  content_text: string | null
}

/**
 * A read-only snapshot of a `library_item_files` row. Only id + parent id — the
 * helper consumes file *presence* (a count), never file content.
 */
export type LibraryDocFileSnapshot = {
  id: string
  library_item_id: string
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

/** The only two findings this helper may ever emit (Phase 41.17.1, Ari). */
export const LIBRARY_DOCUMENTATION_ISSUE_CODES = [
  'phase_doc_missing_phase_metadata',
  'item_no_source_material',
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

function itemRef(item: LibraryDocItemSnapshot): HelperSourceRef {
  return { source_surface: 'library_item', source_id: item.id }
}

/**
 * Development-documentation item with no phase metadata. Fires only when the
 * collection is `development_documentation` AND all three of phase_code,
 * phase_number, phase_label are empty/null. Pure.
 */
export function detectPhaseMetadataIssue(item: LibraryDocItemSnapshot): DetectedIssue | null {
  if (item.collection !== DEVELOPMENT_DOCUMENTATION) return null

  const missingCode = isBlank(item.phase_code)
  const missingNumber = item.phase_number == null
  const missingLabel = isBlank(item.phase_label)
  if (!(missingCode && missingNumber && missingLabel)) return null

  return {
    issue_code: 'phase_doc_missing_phase_metadata',
    issue_label: 'Development-documentation item carries no phase metadata',
    suggested_action: 'prepare_review_note',
    observed_state: {
      collection: item.collection,
      phase_code_present: !missingCode,
      phase_number_present: !missingNumber,
      phase_label_present: !missingLabel,
    },
    suggested_next_step:
      'A human should review whether this phase document should carry phase_code / phase_number / phase_label.',
    deterministic_reason:
      'collection is development_documentation and phase_code, phase_number, and phase_label are all empty.',
    checked_fields: ['collection', 'phase_code', 'phase_number', 'phase_label'],
    source_refs: [itemRef(item)],
  }
}

/**
 * Item with no source material at all: no file_path, no source_url, no
 * content_text, and zero attached files. Pure. File presence is a count only —
 * file content is never read.
 */
export function detectSourceMaterialIssue(
  item: LibraryDocItemSnapshot,
  fileCount: number,
): DetectedIssue | null {
  const hasFilePath = !isBlank(item.file_path)
  const hasSourceUrl = !isBlank(item.source_url)
  const hasContentText = !isBlank(item.content_text)
  const hasFiles = fileCount > 0
  if (hasFilePath || hasSourceUrl || hasContentText || hasFiles) return null

  return {
    issue_code: 'item_no_source_material',
    issue_label: 'Library item has no source material',
    suggested_action: 'prepare_review_note',
    observed_state: {
      file_path_present: hasFilePath,
      source_url_present: hasSourceUrl,
      content_text_present: hasContentText,
      attached_file_count: fileCount,
    },
    suggested_next_step:
      'A human should review whether this item should have a file, a source URL, or inline content.',
    deterministic_reason:
      'file_path, source_url, and content_text are all empty and the item has zero attached files.',
    checked_fields: ['file_path', 'source_url', 'content_text', 'library_item_files'],
    source_refs: [itemRef(item)],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAFT CONSTRUCTION
// ─────────────────────────────────────────────────────────────────────────────

const HELPER_TYPE = 'library_documentation_helper' as const
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
  item: LibraryDocItemSnapshot,
  options: InspectOptions,
): HelperOutputDraft {
  return {
    helper_type: HELPER_TYPE,
    source_refs: [itemRef(item)],
    presence_scope: item.presence_scope,
    output_status: 'deterministic_check',
    suggested_action: 'no_action',
    suggestion_payload: {
      // Distinct from the metadata helper's clean sentinel so the two helpers'
      // issue-code spaces never overlap.
      issue_code: 'no_documentation_structure_issues_found',
      issue_label: 'No documentation-structure gaps detected',
      observed_state: { checked: true },
      suggested_next_step: 'No action required.',
      deterministic_reason: 'All deterministic documentation-structure checks passed.',
      checked_fields: [
        'collection',
        'phase_code',
        'phase_number',
        'phase_label',
        'file_path',
        'source_url',
        'content_text',
        'library_item_files',
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
// PUBLIC ENTRY — inspect ONE Library item (+ a count of its files)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inspect a single Library item; return inert helper output drafts (one per
 * detected structural gap). Deterministic: same input → same output. Every
 * returned draft is validated against the 41.1 contract; an invalid draft is a
 * bug and throws.
 *
 * `files` is used only to count attachments for this item (the source-material
 * check). There is no all-items path — bulk processing is out of scope.
 */
export function inspectLibraryDocumentation(
  item: LibraryDocItemSnapshot,
  files: LibraryDocFileSnapshot[] = [],
  options: InspectOptions = {},
): HelperOutputDraft[] {
  const fileCount = files.filter((f) => f.library_item_id === item.id).length

  const detected: (DetectedIssue | null)[] = [
    detectPhaseMetadataIssue(item),
    detectSourceMaterialIssue(item, fileCount),
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
        `libraryDocumentationHelper produced an invalid draft: ${result.errors.join('; ')}`,
      )
    }
  }

  return drafts
}
