/**
 * Phase 41.3 — Deterministic Library Documentation / Metadata Helper
 *
 * The first v1 helper (`library_metadata_helper`). Pure and deterministic:
 * given typed snapshots of a single Library item and its attached files, it
 * detects documentation/extraction gaps and returns inert helper output drafts.
 *
 * ── Boundaries (hard) ────────────────────────────────────────────────────────
 *   * PURE. No I/O, no async, no DB, no Supabase, no Anthropic/OpenAI, no fetch,
 *     no embeddings, no library_chunks, no chat retrieval, no prompt context.
 *   * READ-ONLY toward Library. It inspects snapshots; it NEVER repairs,
 *     rewrites, indexes, retrieves, embeds, promotes, or routes anything.
 *   * Output is TRACE, not truth. Every draft is not_memory / not_evidence /
 *     prompt_eligible:false / authority_changed:false / human_review_required.
 *   * It reads only the `library_item` and `library_item_file` source surfaces.
 *     It never reads helper_output as input (C1).
 *   * It never sets review_routed=true and never sets reviewed_by (those are not
 *     even fields on HelperOutputDraft). Routing to review is a later phase.
 *
 * A visible miss is safer than a hidden authority leak: when a check is not
 * deterministically safe (e.g. staleness, for which the House has no
 * convention), the helper does nothing rather than guess.
 *
 * 41.3 is pure functions + unit fixtures only. There is intentionally NO DB
 * insert wrapper and NO route here — persistence is a separate, later, governed
 * step. This phase proves the helper can exist safely.
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
 * A read-only snapshot of a `library_items` row. Only the fields the helper
 * actually inspects are present — deliberately minimal so callers cannot feed
 * (and the helper cannot read) body text, retrieval, chunks, or authority
 * fields it has no business touching.
 *
 * Fields read: id, title, description (the "summary"), tags, presence_scope.
 * `collection` / `item_type` are carried for review context only (not gated on).
 */
export type LibraryItemSnapshot = {
  id: string
  title: string
  description: string | null
  tags: string[]
  presence_scope: HelperPresenceScope
  collection?: string
  item_type?: string
}

/**
 * A read-only snapshot of a `library_item_files` row. The helper inspects
 * extraction *state* only — it checks whether text exists, never reads or copies
 * the text itself.
 *
 * Fields read: id, library_item_id, file_name, file_type, extraction_status,
 * and the presence/length of extracted_text (via extraction_char_count and a
 * boolean emptiness check — never the content).
 */
export type LibraryItemFileSnapshot = {
  id: string
  library_item_id: string
  file_name: string
  file_type: string
  extraction_status: string
  extracted_text: string | null
  extraction_char_count: number | null
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
// DETECTION RULES (deterministic, low-risk)
// ─────────────────────────────────────────────────────────────────────────────

const MIN_TITLE_LENGTH = 3
const OBSERVED_CLIP = 200

/** Generic placeholder titles that signal "not really titled". Lowercased. */
const PLACEHOLDER_TITLES: readonly string[] = [
  'untitled',
  'new item',
  'new document',
  'document',
  'no title',
  'tbd',
  'todo',
]

/** Clip a string so observed_state can never carry large body text or secrets. */
function clip(s: string): string {
  return s.length > OBSERVED_CLIP ? `${s.slice(0, OBSERVED_CLIP)}…` : s
}

function isBlank(s: string | null | undefined): boolean {
  return s == null || s.trim().length === 0
}

function itemRef(item: LibraryItemSnapshot): HelperSourceRef {
  return { source_surface: 'library_item', source_id: item.id }
}

function fileRef(file: LibraryItemFileSnapshot): HelperSourceRef {
  return { source_surface: 'library_item_file', source_id: file.id }
}

/** Item-level documentation gaps. Pure. */
export function detectItemIssues(item: LibraryItemSnapshot): DetectedIssue[] {
  const issues: DetectedIssue[] = []
  const trimmedTitle = (item.title ?? '').trim()

  // Weak / placeholder / missing title.
  const titleIsBlank = trimmedTitle.length === 0
  const titleIsPlaceholder = PLACEHOLDER_TITLES.includes(trimmedTitle.toLowerCase())
  const titleTooShort = trimmedTitle.length > 0 && trimmedTitle.length < MIN_TITLE_LENGTH
  if (titleIsBlank || titleIsPlaceholder || titleTooShort) {
    issues.push({
      issue_code: 'item_title_weak',
      issue_label: 'Library item title is missing, placeholder, or too short',
      suggested_action: 'normalise_title',
      observed_state: {
        title_length: trimmedTitle.length,
        title_is_blank: titleIsBlank,
        title_is_placeholder: titleIsPlaceholder,
        title_preview: clip(trimmedTitle),
      },
      suggested_next_step: 'A human should review and set a descriptive title.',
      deterministic_reason: titleIsBlank
        ? 'Trimmed title is empty.'
        : titleIsPlaceholder
          ? 'Title matches a known placeholder.'
          : `Trimmed title is shorter than ${MIN_TITLE_LENGTH} characters.`,
      checked_fields: ['title'],
      source_refs: [itemRef(item)],
    })
  }

  // Missing summary (description). The helper FLAGS the gap; it never drafts a
  // summary (no deterministic-safe summary exists without reading body text).
  if (isBlank(item.description)) {
    issues.push({
      issue_code: 'item_summary_missing',
      issue_label: 'Library item has no summary (description)',
      suggested_action: 'add_summary',
      observed_state: { description_present: false },
      suggested_next_step: 'A human should add a short summary/description.',
      deterministic_reason: 'description is null or empty.',
      checked_fields: ['description'],
      source_refs: [itemRef(item)],
    })
  }

  // Missing tags.
  if (!Array.isArray(item.tags) || item.tags.length === 0) {
    issues.push({
      issue_code: 'item_tags_missing',
      issue_label: 'Library item has no tags',
      suggested_action: 'add_tags',
      observed_state: { tag_count: Array.isArray(item.tags) ? item.tags.length : 0 },
      suggested_next_step: 'A human should add tags (no tags are invented automatically).',
      deterministic_reason: 'tags array is empty.',
      checked_fields: ['tags'],
      source_refs: [itemRef(item)],
    })
  }

  return issues
}

/** File-level extraction gaps. Pure. Reads extraction STATE, never the text. */
export function detectFileIssues(
  item: LibraryItemSnapshot,
  file: LibraryItemFileSnapshot,
): DetectedIssue[] {
  const issues: DetectedIssue[] = []
  const status = file.extraction_status
  // File issues carry both the file ref (primary) and the item ref (context).
  const refs: HelperSourceRef[] = [fileRef(file), itemRef(item)]

  if (status === 'not_started' || status === 'processing') {
    issues.push({
      issue_code: 'file_extraction_not_run',
      issue_label: 'Attachment text extraction has not completed',
      suggested_action: 'check_extraction_status',
      observed_state: { extraction_status: status, file_type: file.file_type },
      suggested_next_step: 'A human should check why extraction has not completed.',
      deterministic_reason: `extraction_status is '${status}'.`,
      checked_fields: ['extraction_status'],
      source_refs: refs,
    })
    return issues
  }

  const statusSaysNoText =
    status === 'empty' || status === 'failed' || status === 'unsupported'
  const extractedButEmpty =
    status === 'extracted' &&
    (isBlank(file.extracted_text) || (file.extraction_char_count ?? 0) === 0)

  if (statusSaysNoText || extractedButEmpty) {
    issues.push({
      issue_code: extractedButEmpty ? 'file_extracted_but_empty' : 'file_extraction_no_text',
      issue_label: 'Attachment has no usable extracted text',
      suggested_action: 'flag_missing_attachment_text',
      observed_state: {
        extraction_status: status,
        extraction_char_count: file.extraction_char_count ?? 0,
        // Boolean only — the text itself is never copied into the payload.
        has_extracted_text: !isBlank(file.extracted_text),
        file_type: file.file_type,
      },
      suggested_next_step: 'A human should review whether this attachment needs re-extraction.',
      deterministic_reason: extractedButEmpty
        ? "extraction_status is 'extracted' but no text/char_count is present."
        : `extraction_status is '${status}'.`,
      checked_fields: ['extraction_status', 'extracted_text', 'extraction_char_count'],
      source_refs: refs,
    })
  }

  return issues
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAFT CONSTRUCTION
// ─────────────────────────────────────────────────────────────────────────────

const HELPER_CREATED_BY = 'system_candidate' as const

function issueToDraft(
  issue: DetectedIssue,
  presenceScope: HelperPresenceScope,
  options: InspectOptions,
): HelperOutputDraft {
  return {
    helper_type: 'library_metadata_helper',
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
  item: LibraryItemSnapshot,
  options: InspectOptions,
): HelperOutputDraft {
  return {
    helper_type: 'library_metadata_helper',
    source_refs: [itemRef(item)],
    presence_scope: item.presence_scope,
    output_status: 'deterministic_check',
    suggested_action: 'no_action',
    suggestion_payload: {
      issue_code: 'no_issues_found',
      issue_label: 'No documentation gaps detected',
      observed_state: { checked: true },
      suggested_next_step: 'No action required.',
      deterministic_reason: 'All deterministic checks passed.',
      checked_fields: ['title', 'description', 'tags'],
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
// PUBLIC ENTRY — inspect ONE Library item (+ its files)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inspect a single Library item and its attached files; return inert helper
 * output drafts (one per detected issue). Deterministic: same input → same
 * output. Every returned draft is validated against the 41.1 contract; if the
 * builder ever produced an invalid draft that is a bug and throws.
 *
 * NOTE: operates on ONE item at a time by design. There is no all-items path in
 * 41.3 — bulk processing of production Library is out of scope.
 */
export function inspectLibraryItem(
  item: LibraryItemSnapshot,
  files: LibraryItemFileSnapshot[] = [],
  options: InspectOptions = {},
): HelperOutputDraft[] {
  const issues: DetectedIssue[] = [
    ...detectItemIssues(item),
    ...files
      .filter((f) => f.library_item_id === item.id)
      .flatMap((f) => detectFileIssues(item, f)),
  ]

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
        `libraryMetadataHelper produced an invalid draft: ${result.errors.join('; ')}`,
      )
    }
  }

  return drafts
}
