// Archive Scope Guard — Single source of truth for presence visibility rules
//
// Scope rules (non-negotiable):
//   Ari receives: velvet/ari_only, velvet/shared, house/shared
//   Eli receives: violet/eli_only, violet/shared, house/shared
//
// Design decisions:
//   - velvet/shared = shared within Ari/Velvet scope (NOT cross-presence)
//   - violet/shared = shared within Eli/Violet scope (NOT cross-presence)
//   - house/shared = shared across the House (both presences)
//   - No cross-archive shared access. Ari cannot see violet/shared. Eli cannot see velvet/shared.
//   - Cross-presence visibility happens through house/shared entries only.
//   - Future: explicit cross-presence governance field may allow selective sharing.
//
// This module is imported by both memory-injection.ts and archive-recall.ts.
// Do not duplicate this logic elsewhere.

/**
 * Determine whether an archive item is in scope for a given presence.
 *
 * @param item - Must have archive_name and visibility fields
 * @param presenceId - 'ari' or 'eli'
 * @returns true if the item should be visible to this presence
 */
export function isInArchiveScope(
  item: { archive_name: string; visibility: string },
  presenceId: 'ari' | 'eli',
): boolean {
  if (presenceId === 'ari') {
    return (
      (item.archive_name === 'velvet' && (item.visibility === 'ari_only' || item.visibility === 'shared')) ||
      (item.archive_name === 'house' && item.visibility === 'shared')
    )
  } else {
    return (
      (item.archive_name === 'violet' && (item.visibility === 'eli_only' || item.visibility === 'shared')) ||
      (item.archive_name === 'house' && item.visibility === 'shared')
    )
  }
}
