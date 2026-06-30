/**
 * Phase 42.3.3a — reconciliation guard. Pure. Decides ONLY whether a run is
 * permitted to reconcile (mark same-scope absent findings `not_redetected`).
 *
 * The set-based marking itself happens inside the ingest RPC (server-side), which
 * re-enforces these same guards. This pure predicate keeps the rule unit-testable.
 *
 * Rules (per Ari):
 *   - capped runs never reconcile (they did not see everything);
 *   - a fingerprint is required;
 *   - a manual_batch must carry an exact item-list hash fingerprint (`batch:`…).
 */

export type ReconcileGuardInput = {
  scope_type: string
  scope_fingerprint: string
  capped: boolean
}

export function reconcileAllowed(g: ReconcileGuardInput): boolean {
  if (g.capped) return false
  if (!g.scope_fingerprint || g.scope_fingerprint.length === 0) return false
  if (g.scope_type === 'manual_batch' && !g.scope_fingerprint.startsWith('batch:')) return false
  return true
}
