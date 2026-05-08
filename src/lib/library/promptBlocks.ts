// Phase 33A — Library / RAG Prompt Blocks
//
// Builds prompt injection blocks for Library and Canonical Memory contexts.
// These blocks are kept strictly separate:
//   - Library Context: informational only, requires attribution
//   - Canonical Memory: authorised lived continuity, may be spoken from
//
// These functions do not need to be wired into chat yet.
// They exist to make the future injection contract explicit and testable.
//
// Prompt-building code must use effective authority status when rendering
// Library Context. Invalid canonical_memory labels must be downgraded
// before prompt injection and must never appear as verified Memory unless
// backed by an existing Archive item where archive_items.canonical_status = 'canonical'.

import type { RetrievedContextItem } from './authority'
import {
  canSpeakAsLivedMemory,
  getEffectiveAuthorityStatus,
  isInvalidCanonicalMemoryLabel,
} from './authority'

// ─── Library Context Block ──────────────────────────────────────────────────

/**
 * Builds the Library Context prompt block for non-canonical retrieved items.
 *
 * Items that are verified canonical_memory (with archive proof) are excluded
 * from this block — they belong in the Canonical Memory block instead.
 *
 * Invalid canonical_memory labels (without archive proof) are downgraded
 * to archive_only and included here with a rejection note.
 */
export function buildLibraryContextBlock(items: RetrievedContextItem[]): string {
  const libraryItems = items.filter(item => !canSpeakAsLivedMemory(item))

  if (libraryItems.length === 0) return ''

  const entries = libraryItems.map(item => {
    const effectiveStatus = getEffectiveAuthorityStatus(item)
    const rejectedNote = isInvalidCanonicalMemoryLabel(item)
      ? `Original label rejected: canonical_memory without canonical archive proof\n`
      : ''

    return [
      `Source: ${item.title}`,
      `Authority status: ${effectiveStatus}`,
      rejectedNote ? rejectedNote.trim() : null,
      `Source type: ${item.source_type}`,
      `Presence scope: ${item.presence_scope}`,
      `Content:`,
      item.content,
    ].filter(Boolean).join('\n')
  })

  return [
    `## Library Context`,
    ``,
    `The following material was retrieved from the House Library.`,
    `It is informational context only.`,
    `It is not lived memory unless separately verified as canonical Archive Memory derived from archive_items.canonical_status = 'canonical'.`,
    ``,
    ...entries,
  ].join('\n')
}

// ─── Canonical Memory Block ─────────────────────────────────────────────────

/**
 * Builds the Canonical Memory prompt block for verified canonical items.
 *
 * Only items where canSpeakAsLivedMemory() returns true are included.
 * These items must carry archive_item_id and derived_canonical_status = 'canonical'.
 */
export function buildCanonicalMemoryBlock(items: RetrievedContextItem[]): string {
  const memoryItems = items.filter(canSpeakAsLivedMemory)

  if (memoryItems.length === 0) return ''

  const entries = memoryItems.map(item => [
    `Source: ${item.title}`,
    `Authority status: canonical_memory`,
    `Archive item ID: ${item.archive_item_id}`,
    `Derived canonical status: ${item.derived_canonical_status}`,
    `Presence scope: ${item.presence_scope}`,
    `Content:`,
    item.content,
  ].join('\n'))

  return [
    `## Canonical Memory`,
    ``,
    `The following entries are authorised lived continuity.`,
    `The presence may speak from them as remembered continuity.`,
    `Each item in this block must be derived from an existing Archive item where archive_items.canonical_status = 'canonical'.`,
    ``,
    ...entries,
  ].join('\n')
}
