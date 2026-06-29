/**
 * Phase 42.3.1 — Library pack: shared contracts
 *
 * Library-specific types for the Library tenant of the Governance Kernel. Per the
 * generic-seams rule, ALL Library specifics live here in the typed payload + the
 * read-only record shapes — never in the kernel envelope.
 *
 * ── Boundaries (hard) ────────────────────────────────────────────────────────
 *   * Records are METADATA ONLY. There is deliberately no file `extracted_text`
 *     field — file body content is never read (Phase 42.3.1, §9). File text
 *     presence is derived from `extraction_char_count` alone.
 *   * PURE contracts. No I/O, no Supabase, no DB, no LLM.
 */

export const LIBRARY_DOMAIN = 'library'

/** Scan-scope caps for one read-only report (Phase 42.3.1). */
export const MAX_ITEMS_PER_REPORT = 100
export const MAX_FILES_SCANNED = 500

/** The shipped helper whose deterministic detection logic an inspector reuses. */
export type LibraryHelperType =
  | 'library_metadata_helper'
  | 'library_documentation_helper'
  | 'library_content_health_helper'
  | 'source_reference_integrity_helper'
  | 'documentation_completeness_helper'

/** Library inspector capability ids (stable, report-level). */
export const CAPABILITY_BY_HELPER: Record<LibraryHelperType, string> = {
  library_metadata_helper: 'library.metadata',
  library_documentation_helper: 'library.documentation',
  library_content_health_helper: 'library.content_health',
  source_reference_integrity_helper: 'library.source_integrity',
  documentation_completeness_helper: 'library.doc_completeness',
}

/** The domain-typed payload — where every Library specific lives. */
export type LibraryFindingPayload = {
  issue_label: string
  deterministic_reason: string
  suggested_next_step: string
  checked_fields: string[]
  observed_state: Record<string, unknown>
  source_helper: LibraryHelperType
}

/**
 * Read-only snapshot of a `library_items` row (metadata only). Carries the union
 * of fields the five Library inspectors inspect. `content_text` presence is read
 * by the documentation inspector; the report never echoes its value.
 */
export type LibraryItemRecord = {
  id: string
  title: string
  description: string | null
  tags: string[] | null
  presence_scope: string
  collection: string
  item_type: string
  phase_code: string | null
  phase_number: number | null
  phase_label: string | null
  source_url: string | null
  file_path: string | null
  content_text: string | null
  authority_status: string
  archive_item_id: string | null
}

/**
 * Read-only snapshot of a `library_item_files` row (METADATA ONLY). There is no
 * `extracted_text` field by construction — file body content is never read. Text
 * presence is conveyed by `extraction_char_count` only.
 */
export type LibraryFileRecord = {
  id: string
  library_item_id: string
  file_name: string
  file_type: string
  file_path: string | null
  storage_bucket: string | null
  extraction_status: string
  extraction_char_count: number | null
  extraction_truncated: boolean
  needs_review: boolean
}

/** The input bundle a Library inspector runs over (already-fetched, read-only). */
export type LibraryScopeInput = {
  items: LibraryItemRecord[]
  files: LibraryFileRecord[]
}

export type LibraryScopeDescriptor =
  | { type: 'item'; itemId: string }
  | { type: 'collection'; collection: string }
  | { type: 'items_with_files' }
  | { type: 'manual_batch'; itemIds: string[] }
  | { type: 'whole_library' }
