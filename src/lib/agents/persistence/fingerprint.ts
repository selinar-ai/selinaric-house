/**
 * Phase 42.3.3a — scope fingerprint. Pure. Deterministic.
 *
 * `scope_fingerprint` makes rerun reconciliation safe: a run is only reconciled
 * against a prior baseline whose domain + run_type + scope_type + scope_fingerprint
 * all match. Deterministic full-scan scopes use a stable token; ref-based scopes use
 * the normalized ref; a manual batch uses an exact item-list hash (so two different
 * batches never share a fingerprint).
 */

import { createHash } from 'crypto'
import type { ScopeForFingerprint } from './types'

/** Scope types treated as deterministic full scans (stable fingerprint per type). */
const FULL_SCAN_SCOPES = new Set(['whole_graph', 'whole_library', 'items_with_files'])

export function computeScopeFingerprint(scope: ScopeForFingerprint): string {
  if (FULL_SCAN_SCOPES.has(scope.scope_type)) {
    return scope.scope_type
  }
  if (scope.scope_type === 'manual_batch') {
    const ids = [...(scope.item_ids ?? [])].map((x) => x.trim()).filter(Boolean).sort()
    return 'batch:' + createHash('sha256').update(ids.join(',')).digest('hex')
  }
  // collection / archive / item — ref-based, normalized.
  return (scope.scope_ref ?? '').trim().toLowerCase()
}
