// Phase 33A — Library / RAG Authority Boundary
//
// Reading is not remembering.
// Retrieval is not Memory.
// RAG context is not lived continuity.
//
// One Crown Rule:
//   Lived Memory authority comes from archive_items.canonical_status = 'canonical'.
//   canonical_memory is a retrieval/speech classification label only.
//   It must always be derived from existing canonical Archive Memory.
//   The Library/RAG layer may classify retrieved context, but it must not canonise Memory.

// ─── Authority Status ───────────────────────────────────────────────────────

export type AuthorityStatus =
  | 'library_reference'
  | 'technical_reference'
  | 'validation_record'
  | 'thread_handoff'
  | 'ui_request'
  | 'architecture_law'
  | 'archive_only'
  | 'canonical_candidate'
  | 'canonical_memory'
  | 'superseded'

// ─── Presence Scope ─────────────────────────────────────────────────────────

export type PresenceScope =
  | 'ari'
  | 'eli'
  | 'shared'
  | 'house'
  | 'none'

// ─── Retrieved Context Item ─────────────────────────────────────────────────

export type RetrievedContextItem = {
  id: string
  title: string
  source_type: string
  authority_status: AuthorityStatus
  presence_scope: PresenceScope
  provenance?: string
  content: string
  created_at?: string
  updated_at?: string

  /**
   * Required only when authority_status === 'canonical_memory'.
   *
   * These fields prove the canonical_memory retrieval label is derived
   * from existing Archive authority, not independently assigned by
   * the Library/RAG layer.
   */
  archive_item_id?: string
  derived_canonical_status?: 'canonical'
}

// ─── One Crown Rule ─────────────────────────────────────────────────────────

/**
 * One Crown Rule:
 *
 * Lived Memory authority does not come from authority_status alone.
 * It comes from an existing Archive item where:
 *
 *   archive_items.canonical_status = 'canonical'
 *
 * Therefore canonical_memory is only valid when it carries proof
 * of the linked canonical Archive item.
 */
export function canSpeakAsLivedMemory(item: RetrievedContextItem): boolean {
  return (
    item.authority_status === 'canonical_memory' &&
    Boolean(item.archive_item_id) &&
    item.derived_canonical_status === 'canonical'
  )
}

/**
 * Detects an invalid canonical_memory retrieval label.
 *
 * This protects against a Library/RAG item being incorrectly spoken from
 * as lived Memory without proof from canonical Archive authority.
 */
export function isInvalidCanonicalMemoryLabel(item: RetrievedContextItem): boolean {
  return item.authority_status === 'canonical_memory' && !canSpeakAsLivedMemory(item)
}

/**
 * Returns the effective authority status that should be rendered
 * into prompt context.
 *
 * Invalid canonical_memory labels are downgraded before prompt injection
 * so the model never sees unverified canonical_memory inside Library Context.
 */
export function getEffectiveAuthorityStatus(item: RetrievedContextItem): AuthorityStatus {
  if (isInvalidCanonicalMemoryLabel(item)) {
    return 'archive_only'
  }
  return item.authority_status
}

/**
 * Returns true if the item requires source attribution when spoken from.
 * All items except verified canonical_memory require attribution.
 */
export function requiresAttribution(item: RetrievedContextItem): boolean {
  return !canSpeakAsLivedMemory(item)
}

/**
 * Returns true if the item represents current authority (not superseded).
 */
export function isCurrentAuthority(item: RetrievedContextItem): boolean {
  return getEffectiveAuthorityStatus(item) !== 'superseded'
}
