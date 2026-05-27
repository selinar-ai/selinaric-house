// Graph authority helpers.
// Graph authority is not Memory authority.

import type { GraphAuthorityStatus } from './types'

/**
 * Returns true if the given authority status requires a source reference.
 * Only workspace_only is allowed without a source.
 */
export function requiresSourceReference(
  authorityStatus: GraphAuthorityStatus
): boolean {
  switch (authorityStatus) {
    case 'canonical_supported':
    case 'candidate':
    case 'held_truth':
    case 'archive_supported':
    case 'library_reference':
    case 'inferred':
      return true
    case 'rejected':
    case 'superseded':
      // Previously sourced items should retain their source.
      // Enforcement: required if the item was previously sourced.
      // In practice, treat as required — items don't lose sources on status change.
      return true
    case 'workspace_only':
      return false
  }
}

/**
 * Returns true if the given authority status is allowed to exist without any
 * source reference at all. Only workspace_only qualifies.
 */
export function isAuthorityAllowedWithoutSource(
  authorityStatus: GraphAuthorityStatus
): boolean {
  return authorityStatus === 'workspace_only'
}
