/**
 * Phase 42.3.1 — Library pack: read-only inspectors
 *
 * Five L1 (deterministic) inspectors that REUSE the shipped Phase 41.17 helper
 * detection logic as pure functions, and map each detected issue into the generic
 * kernel envelope (AgentFinding). They emit the exact shipped issue codes.
 *
 * ── Boundaries (hard) ────────────────────────────────────────────────────────
 *   * PURE. No I/O, no Supabase, no DB, no LLM, no fetch, no clock.
 *   * Reuses only the helpers' `detect*` functions — NOT the draft builders — so
 *     no helper-output draft is ever constructed and helper_outputs is never read
 *     or written.
 *   * FILE BODY IS NEVER READ. The metadata inspector needs file-text presence;
 *     it derives that from `extraction_char_count` only (a synthetic non-empty
 *     marker stands in for "text present"). No `extracted_text` is read.
 *   * Clean sentinels (`no_*_found`) are NOT findings — the `detect*` functions
 *     never return them, and a defensive filter drops any that appear.
 *   * `severity` / `review_burden` are REPORT-ONLY ephemeral grouping labels —
 *     they are not durable helper-output issue codes or fields.
 */

import type { HelperPresenceScope } from '../../../helpers/helperContract'
import {
  detectItemIssues,
  detectFileIssues,
  type LibraryItemSnapshot,
  type LibraryItemFileSnapshot,
} from '../../../helpers/libraryMetadataHelper'
import {
  detectPhaseMetadataIssue,
  detectSourceMaterialIssue,
  type LibraryDocItemSnapshot,
} from '../../../helpers/libraryDocumentationHelper'
import {
  detectContentHealthIssues,
  type ContentHealthItemSnapshot,
  type ContentHealthFileSnapshot,
} from '../../../helpers/libraryContentHealthHelper'
import {
  detectSourceReferenceIssues,
  type SourceRefItemSnapshot,
  type SourceRefFileSnapshot,
} from '../../../helpers/sourceReferenceIntegrityHelper'
import {
  detectPhaseMetadataIncompleteIssue,
  detectSupersededLinkIssue,
  type DocCompletenessItemSnapshot,
} from '../../../helpers/documentationCompletenessHelper'

import type {
  AgentFinding,
  Inspector,
  IssueSeverity,
  ReviewBurden,
} from '../../kernel/types'
import {
  CAPABILITY_BY_HELPER,
  LIBRARY_DOMAIN,
  type LibraryFileRecord,
  type LibraryFindingPayload,
  type LibraryHelperType,
  type LibraryItemRecord,
  type LibraryScopeInput,
} from './payloads'
import { trimSurroundingSpaces } from './remedy'

// ─────────────────────────────────────────────────────────────────────────────
// Mapping helpers
// ─────────────────────────────────────────────────────────────────────────────

/** The structural shape the helpers' (unexported) DetectedIssue satisfies. */
type RawDetectedIssue = {
  issue_code: string
  issue_label: string
  observed_state: Record<string, unknown>
  suggested_next_step: string
  deterministic_reason: string
  checked_fields: string[]
  source_refs: { source_surface: string; source_id: string }[]
}

/** Synthetic, content-free marker meaning "extracted text is present" (never real text). */
const TEXT_PRESENT_MARKER = 'present'

/** Report-only ephemeral severity per issue code. NOT a durable helper field. */
const SEVERITY_BY_ISSUE: Record<string, IssueSeverity> = {
  file_storage_reference_broken: 'high',
  source_url_malformed: 'medium',
  item_file_path_without_file_record: 'medium',
  item_no_source_material: 'medium',
  file_content_truncated: 'medium',
  file_flagged_needs_review: 'medium',
  phase_doc_missing_phase_metadata: 'low',
  phase_doc_incomplete_phase_metadata: 'low',
  superseded_item_missing_archive_link: 'low',
  item_title_untrimmed: 'low',
  item_title_weak: 'low',
  item_summary_missing: 'low',
  file_extraction_not_run: 'low',
  file_extracted_but_empty: 'low',
  file_extraction_no_text: 'low',
  item_tags_missing: 'info',
}

function severityFor(issueCode: string): IssueSeverity {
  return SEVERITY_BY_ISSUE[issueCode] ?? 'low'
}

function burdenFor(severity: IssueSeverity): ReviewBurden {
  if (severity === 'high') return 'high'
  if (severity === 'medium') return 'medium'
  return 'low'
}

/** A clean-sentinel issue_code is informational ("no issues") — never a finding. */
function isSentinel(issueCode: string): boolean {
  return issueCode.startsWith('no_')
}

function titleLookup(items: LibraryItemRecord[]): (id: string) => string | undefined {
  const byId = new Map(items.map((i) => [i.id, i.title]))
  return (id) => byId.get(id)
}

function toFinding(
  issue: RawDetectedIssue,
  helper: LibraryHelperType,
  titleOf: (id: string) => string | undefined,
): AgentFinding<LibraryFindingPayload> {
  const primary = issue.source_refs[0]
  const itemRef = issue.source_refs.find((r) => r.source_surface === 'library_item')
  const table =
    primary?.source_surface === 'library_item_file' ? 'library_item_files' : 'library_items'
  const severity = severityFor(issue.issue_code)

  return {
    domain: LIBRARY_DOMAIN,
    capability_id: CAPABILITY_BY_HELPER[helper],
    issue_code: issue.issue_code,
    target_ref: {
      table,
      id: primary?.source_id ?? '',
      label: itemRef ? titleOf(itemRef.source_id) : undefined,
    },
    severity,
    review_burden: burdenFor(severity),
    summary: issue.issue_label,
    payload: {
      issue_label: issue.issue_label,
      deterministic_reason: issue.deterministic_reason,
      suggested_next_step: issue.suggested_next_step,
      checked_fields: issue.checked_fields,
      observed_state: issue.observed_state,
      source_helper: helper,
    },
  }
}

function presenceScope(item: LibraryItemRecord): HelperPresenceScope {
  return item.presence_scope as HelperPresenceScope
}

/**
 * Phase 42.3.4a — pure detector for the first-hand remedy. Fires only when an item's
 * title carries surrounding ASCII spaces (U+0020) AND the space-trimmed form is non-empty.
 * Uses the shared `trimSurroundingSpaces` helper — byte-exact with SQL `btrim(x, ' ')` —
 * NOT JavaScript `.trim()`, so tab/newline-surrounded titles do NOT fire in v1. Booleans
 * only in observed_state — the raw title is never echoed (the remedy plan, built
 * separately, captures the exact value). No inference, no write, no authority field.
 */
function detectUntrimmedTitle(item: LibraryItemRecord): RawDetectedIssue | null {
  const title = item.title
  if (title == null) return null
  const trimmed = trimSurroundingSpaces(title)
  if (trimmed.length === 0) return null
  if (title === trimmed) return null
  return {
    issue_code: 'item_title_untrimmed',
    issue_label: 'Library item title has surrounding ASCII spaces',
    observed_state: { title_present: true, has_surrounding_space: true, trimmed_nonempty: true },
    suggested_next_step:
      'A deterministic remedy can remove the surrounding ASCII spaces from this title (review-only until approved).',
    deterministic_reason:
      'title is non-blank, differs from its surrounding-ASCII-space-trimmed form, and the trimmed title is non-empty.',
    checked_fields: ['title'],
    source_refs: [{ source_surface: 'library_item', source_id: item.id }],
  }
}

function filesFor(item: LibraryItemRecord, files: LibraryFileRecord[]): LibraryFileRecord[] {
  return files.filter((f) => f.library_item_id === item.id)
}

// ─────────────────────────────────────────────────────────────────────────────
// Inspectors
// ─────────────────────────────────────────────────────────────────────────────

/** library.metadata — title/summary/tags quality + file-extraction state. */
const metadataInspector: Inspector<LibraryScopeInput, LibraryFindingPayload> = {
  id: 'library.metadata',
  domain: LIBRARY_DOMAIN,
  issue_codes: [
    'item_title_weak',
    'item_summary_missing',
    'item_tags_missing',
    'file_extraction_not_run',
    'file_extracted_but_empty',
    'file_extraction_no_text',
  ],
  level: 'L1',
  tables_read: ['library_items', 'library_item_files'],
  run(input) {
    const titleOf = titleLookup(input.items)
    const out: AgentFinding<LibraryFindingPayload>[] = []
    for (const item of input.items) {
      const itemSnap: LibraryItemSnapshot = {
        id: item.id,
        title: item.title,
        description: item.description,
        tags: item.tags ?? [],
        presence_scope: presenceScope(item),
        collection: item.collection,
        item_type: item.item_type,
      }
      for (const issue of detectItemIssues(itemSnap)) {
        out.push(toFinding(issue, 'library_metadata_helper', titleOf))
      }
      for (const f of filesFor(item, input.files)) {
        // File-text PRESENCE is derived from extraction_char_count only; the file
        // body (extracted_text) is never read. A synthetic marker stands in.
        const hasText = (f.extraction_char_count ?? 0) > 0
        const fileSnap: LibraryItemFileSnapshot = {
          id: f.id,
          library_item_id: f.library_item_id,
          file_name: f.file_name,
          file_type: f.file_type,
          extraction_status: f.extraction_status,
          extracted_text: hasText ? TEXT_PRESENT_MARKER : null,
          extraction_char_count: f.extraction_char_count,
        }
        for (const issue of detectFileIssues(itemSnap, fileSnap)) {
          out.push(toFinding(issue, 'library_metadata_helper', titleOf))
        }
      }
    }
    return out.filter((f) => !isSentinel(f.issue_code))
  },
}

/** library.documentation — phase-metadata-all-null + no-source-material. */
const documentationInspector: Inspector<LibraryScopeInput, LibraryFindingPayload> = {
  id: 'library.documentation',
  domain: LIBRARY_DOMAIN,
  issue_codes: ['phase_doc_missing_phase_metadata', 'item_no_source_material'],
  level: 'L1',
  tables_read: ['library_items', 'library_item_files'],
  run(input) {
    const titleOf = titleLookup(input.items)
    const out: AgentFinding<LibraryFindingPayload>[] = []
    for (const item of input.items) {
      const snap: LibraryDocItemSnapshot = {
        id: item.id,
        collection: item.collection,
        presence_scope: presenceScope(item),
        phase_code: item.phase_code,
        phase_number: item.phase_number,
        phase_label: item.phase_label,
        file_path: item.file_path,
        source_url: item.source_url,
        content_text: item.content_text,
      }
      const fileCount = filesFor(item, input.files).length
      const detected = [detectPhaseMetadataIssue(snap), detectSourceMaterialIssue(snap, fileCount)]
      for (const issue of detected) {
        if (issue) out.push(toFinding(issue, 'library_documentation_helper', titleOf))
      }
    }
    return out.filter((f) => !isSentinel(f.issue_code))
  },
}

/** library.content_health — truncated extraction + needs_review (file metadata only). */
const contentHealthInspector: Inspector<LibraryScopeInput, LibraryFindingPayload> = {
  id: 'library.content_health',
  domain: LIBRARY_DOMAIN,
  issue_codes: ['file_content_truncated', 'file_flagged_needs_review'],
  level: 'L1',
  tables_read: ['library_items', 'library_item_files'],
  run(input) {
    const titleOf = titleLookup(input.items)
    const out: AgentFinding<LibraryFindingPayload>[] = []
    for (const item of input.items) {
      const itemSnap: ContentHealthItemSnapshot = {
        id: item.id,
        presence_scope: presenceScope(item),
      }
      const fileSnaps: ContentHealthFileSnapshot[] = filesFor(item, input.files).map((f) => ({
        id: f.id,
        library_item_id: f.library_item_id,
        extraction_status: f.extraction_status,
        extraction_truncated: f.extraction_truncated,
        needs_review: f.needs_review,
      }))
      for (const issue of detectContentHealthIssues(itemSnap, fileSnaps)) {
        out.push(toFinding(issue, 'library_content_health_helper', titleOf))
      }
    }
    return out.filter((f) => !isSentinel(f.issue_code))
  },
}

/** library.source_integrity — malformed url + claimed-file-without-record + broken storage. */
const sourceIntegrityInspector: Inspector<LibraryScopeInput, LibraryFindingPayload> = {
  id: 'library.source_integrity',
  domain: LIBRARY_DOMAIN,
  issue_codes: [
    'source_url_malformed',
    'item_file_path_without_file_record',
    'file_storage_reference_broken',
  ],
  level: 'L1',
  tables_read: ['library_items', 'library_item_files'],
  run(input) {
    const titleOf = titleLookup(input.items)
    const out: AgentFinding<LibraryFindingPayload>[] = []
    for (const item of input.items) {
      const itemSnap: SourceRefItemSnapshot = {
        id: item.id,
        presence_scope: presenceScope(item),
        source_url: item.source_url,
        file_path: item.file_path,
      }
      const fileSnaps: SourceRefFileSnapshot[] = filesFor(item, input.files).map((f) => ({
        id: f.id,
        library_item_id: f.library_item_id,
        file_path: f.file_path,
        storage_bucket: f.storage_bucket,
      }))
      for (const issue of detectSourceReferenceIssues(itemSnap, fileSnaps)) {
        out.push(toFinding(issue, 'source_reference_integrity_helper', titleOf))
      }
    }
    return out.filter((f) => !isSentinel(f.issue_code))
  },
}

/** library.doc_completeness — partial phase metadata + superseded-missing-archive-link. */
const docCompletenessInspector: Inspector<LibraryScopeInput, LibraryFindingPayload> = {
  id: 'library.doc_completeness',
  domain: LIBRARY_DOMAIN,
  issue_codes: ['phase_doc_incomplete_phase_metadata', 'superseded_item_missing_archive_link'],
  level: 'L1',
  tables_read: ['library_items'],
  run(input) {
    const titleOf = titleLookup(input.items)
    const out: AgentFinding<LibraryFindingPayload>[] = []
    for (const item of input.items) {
      const snap: DocCompletenessItemSnapshot = {
        id: item.id,
        presence_scope: presenceScope(item),
        collection: item.collection,
        phase_code: item.phase_code,
        phase_number: item.phase_number,
        phase_label: item.phase_label,
        authority_status: item.authority_status,
        archive_item_id: item.archive_item_id,
      }
      const detected = [detectPhaseMetadataIncompleteIssue(snap), detectSupersededLinkIssue(snap)]
      for (const issue of detected) {
        if (issue) out.push(toFinding(issue, 'documentation_completeness_helper', titleOf))
      }
    }
    return out.filter((f) => !isSentinel(f.issue_code))
  },
}

/** library.title_trim — first-hand remedy detector: title carries surrounding whitespace. */
const titleTrimInspector: Inspector<LibraryScopeInput, LibraryFindingPayload> = {
  id: 'library.title_trim',
  domain: LIBRARY_DOMAIN,
  issue_codes: ['item_title_untrimmed'],
  level: 'L1',
  tables_read: ['library_items'],
  run(input) {
    const titleOf = titleLookup(input.items)
    const out: AgentFinding<LibraryFindingPayload>[] = []
    for (const item of input.items) {
      const issue = detectUntrimmedTitle(item)
      if (issue) out.push(toFinding(issue, 'library_metadata_helper', titleOf))
    }
    return out.filter((f) => !isSentinel(f.issue_code))
  },
}

/** The full Library inspector set, in stable order. */
export const libraryInspectors: Inspector<LibraryScopeInput, LibraryFindingPayload>[] = [
  metadataInspector,
  documentationInspector,
  contentHealthInspector,
  sourceIntegrityInspector,
  docCompletenessInspector,
  titleTrimInspector,
]
