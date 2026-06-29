/**
 * Phase 41.17.2 — Deterministic Source Reference Integrity Helper
 *
 * A v1 helper (`source_reference_integrity_helper`). Pure and deterministic:
 * given a typed snapshot of a single Library item (and snapshots of its attached
 * files), it detects missing / broken / mismatched SOURCE REFERENCES and returns
 * inert helper output drafts.
 *
 * ── Why a separate helper (not an extension of an existing one) ───────────────
 *   The metadata helper checks documentation *quality*; the documentation helper
 *   checks documentation *structure*. This helper checks source-reference
 *   *integrity*: is the item's source_url a real http/https URL, does an item that
 *   claims a file_path actually have a file record, and does each attached file
 *   carry a usable storage pointer? Every helper's issue-code space is disjoint by
 *   design, so a single item is never double-flagged for the same concern, and
 *   dedupe (keyed on helper_type) keeps each helper's review queue clean.
 *
 * ── Boundaries (hard) ────────────────────────────────────────────────────────
 *   * PURE. No I/O, no async, no DB, no Supabase, no Anthropic/OpenAI, no fetch,
 *     no embeddings, no library_chunks, no chat retrieval, no prompt context.
 *   * DETECT-ONLY toward Library. It inspects a snapshot; it NEVER rewrites,
 *     relinks, deletes, moves, or otherwise touches authority.
 *   * NO NETWORK. "Stale" / reachability is intentionally NOT checked — that would
 *     require a network call, which is forbidden. URL validity is a pure parse,
 *     never a request.
 *   * Output is TRACE, not truth. Every draft is not_memory / not_evidence /
 *     prompt_eligible:false / authority_changed:false / human_review_required.
 *   * It reads only the `library_item` and `library_item_file` source surfaces
 *     (metadata fields only — never file content). It never reads helper_output (C1).
 *   * No apply path. The retry-extraction apply control is hard-scoped to the
 *     metadata helper; a source-reference output is review-only, always.
 *
 * A visible miss is safer than a hidden authority leak: only checks that are
 * deterministically true from a single item's own columns (plus its files'
 * metadata) are made. Cross-item / network reasoning is out of scope.
 *
 * Phase 41.17.2 is pure functions + unit fixtures only. The DB read + INSERT live
 * in the separate manual CLI (scripts/run-source-reference-integrity-helper.ts),
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
// INPUT SNAPSHOTS — the exact (and only) Library fields this helper reads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A read-only snapshot of a `library_items` row. Only the source-reference fields
 * this helper inspects are present — deliberately minimal so callers cannot feed
 * (and the helper cannot read) body text, retrieval, chunks, tags, or authority
 * fields it has no business touching.
 *
 * `source_url` drives the malformed-URL check; `file_path` (presence only) plus
 * the attached-file snapshots drive the claimed-file and broken-storage checks.
 */
export type SourceRefItemSnapshot = {
  id: string
  presence_scope: HelperPresenceScope
  source_url: string | null
  file_path: string | null
}

/**
 * A read-only snapshot of a `library_item_files` row. Only id + parent id +
 * storage pointer metadata — the helper inspects file *metadata*, never file
 * content.
 */
export type SourceRefFileSnapshot = {
  id: string
  library_item_id: string
  file_path: string | null
  storage_bucket: string | null
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

/** The only three findings this helper may ever emit (Phase 41.17.2, Ari). */
export const SOURCE_REFERENCE_INTEGRITY_ISSUE_CODES = [
  'source_url_malformed',
  'item_file_path_without_file_record',
  'file_storage_reference_broken',
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

function itemRef(item: SourceRefItemSnapshot): HelperSourceRef {
  return { source_surface: 'library_item', source_id: item.id }
}

function fileRef(f: SourceRefFileSnapshot): HelperSourceRef {
  return { source_surface: 'library_item_file', source_id: f.id }
}

/**
 * Whether a string is a valid http/https URL. PURE — parses with `new URL`, never
 * makes a request. A relative path, a bare word, or a non-http(s) scheme is not a
 * valid source URL.
 */
function isValidHttpUrl(s: string): boolean {
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Item-level: source_url is present (non-blank) but is not a valid http/https
 * URL. Pure parse only — reachability ("stale") is never checked. The raw URL
 * value is NEVER stored in observed_state — booleans only.
 */
export function detectMalformedSourceUrl(item: SourceRefItemSnapshot): DetectedIssue | null {
  if (isBlank(item.source_url)) return null
  if (isValidHttpUrl(item.source_url as string)) return null

  return {
    issue_code: 'source_url_malformed',
    issue_label: 'Library item source_url is not a valid http/https URL',
    suggested_action: 'prepare_review_note',
    observed_state: {
      // Booleans only — the raw source_url value is deliberately NOT stored.
      source_url_present: true,
      malformed: true,
    },
    suggested_next_step:
      'A human should review whether this item\'s source_url should be corrected or removed.',
    deterministic_reason:
      'source_url is non-blank and does not parse as an http or https URL.',
    checked_fields: ['source_url'],
    source_refs: [itemRef(item)],
  }
}

/**
 * Item-level: the item claims a file_path (non-blank) but has ZERO attached file
 * records. Pure; file presence is a count of file snapshots only.
 */
export function detectItemFilePathWithoutFileRecord(
  item: SourceRefItemSnapshot,
  files: SourceRefFileSnapshot[],
): DetectedIssue | null {
  if (isBlank(item.file_path)) return null
  if (files.length > 0) return null

  return {
    issue_code: 'item_file_path_without_file_record',
    issue_label: 'Library item claims a file_path but has no attached file record',
    suggested_action: 'prepare_review_note',
    observed_state: {
      file_path_present: true,
      attached_file_count: 0,
    },
    suggested_next_step:
      'A human should review whether the claimed file is missing, or the file_path is stale and should be cleared.',
    deterministic_reason:
      'file_path is non-blank on the item but the item has zero attached file records.',
    checked_fields: ['file_path', 'library_item_files'],
    source_refs: [itemRef(item)],
  }
}

/**
 * AGGREGATE file-level: any attached file whose file_path is blank OR
 * storage_bucket is blank carries a broken storage pointer. ONE finding per item
 * (covering every broken file) so the 4-field dedupe key never collides. The
 * source_refs are [itemRef, ...each broken fileRef]; observed_state records the
 * broken-file count and the broken file ids. Pure; file metadata only.
 */
export function detectBrokenFileStorageReferences(
  item: SourceRefItemSnapshot,
  files: SourceRefFileSnapshot[],
): DetectedIssue | null {
  const broken = files.filter((f) => isBlank(f.file_path) || isBlank(f.storage_bucket))
  if (broken.length === 0) return null

  return {
    issue_code: 'file_storage_reference_broken',
    issue_label: 'One or more attached files have a broken storage reference',
    suggested_action: 'prepare_review_note',
    observed_state: {
      broken_file_count: broken.length,
      file_ids: broken.map((f) => f.id),
    },
    suggested_next_step:
      'A human should review whether these files\' storage pointers (file_path / storage_bucket) need repair or re-upload.',
    deterministic_reason:
      'at least one attached file has a blank file_path or a blank storage_bucket.',
    checked_fields: ['library_item_files.file_path', 'library_item_files.storage_bucket'],
    source_refs: [itemRef(item), ...broken.map((f) => fileRef(f))],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAFT CONSTRUCTION
// ─────────────────────────────────────────────────────────────────────────────

const HELPER_TYPE = 'source_reference_integrity_helper' as const
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
  item: SourceRefItemSnapshot,
  options: InspectOptions,
): HelperOutputDraft {
  return {
    helper_type: HELPER_TYPE,
    source_refs: [itemRef(item)],
    presence_scope: item.presence_scope,
    output_status: 'deterministic_check',
    suggested_action: 'no_action',
    suggestion_payload: {
      // Distinct from every other helper's clean sentinel so the issue-code
      // spaces never overlap.
      issue_code: 'no_source_reference_issues_found',
      issue_label: 'No source-reference integrity issues detected',
      observed_state: { checked: true },
      suggested_next_step: 'No action required.',
      deterministic_reason: 'All deterministic source-reference checks passed.',
      checked_fields: [
        'source_url',
        'file_path',
        'library_item_files.file_path',
        'library_item_files.storage_bucket',
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
// DETECTION ENTRY — produce the raw issues for ONE item (+ its files)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run every deterministic source-reference check against ONE item (and the files
 * belonging to it). Returns the detected issues (no drafts). Pure. Files are
 * filtered to this item by library_item_id before any check runs.
 */
export function detectSourceReferenceIssues(
  item: SourceRefItemSnapshot,
  files: SourceRefFileSnapshot[] = [],
): DetectedIssue[] {
  const ownFiles = files.filter((f) => f.library_item_id === item.id)

  const detected: (DetectedIssue | null)[] = [
    detectMalformedSourceUrl(item),
    detectItemFilePathWithoutFileRecord(item, ownFiles),
    detectBrokenFileStorageReferences(item, ownFiles),
  ]
  return detected.filter((i): i is DetectedIssue => i !== null)
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ENTRY — inspect ONE Library item (+ its file snapshots)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inspect a single Library item; return inert helper output drafts (one per
 * detected source-reference gap). Deterministic: same input → same output. Every
 * returned draft is validated against the 41.1 contract; an invalid draft is a
 * bug and throws.
 *
 * `files` is filtered to this item's files (by library_item_id). There is no
 * all-items path — bulk processing is out of scope.
 */
export function inspectSourceReferenceIntegrity(
  item: SourceRefItemSnapshot,
  files: SourceRefFileSnapshot[] = [],
  options: InspectOptions = {},
): HelperOutputDraft[] {
  const issues = detectSourceReferenceIssues(item, files)

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
        `sourceReferenceIntegrityHelper produced an invalid draft: ${result.errors.join('; ')}`,
      )
    }
  }

  return drafts
}
