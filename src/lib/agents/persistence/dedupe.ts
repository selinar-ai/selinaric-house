/**
 * Phase 42.3.3a — dedupe key. Pure. Deterministic.
 *
 * The dedupe key identifies one logical finding across reruns. The store enforces
 * active-only uniqueness on (domain, dedupe_key, test_owned) where deleted_at is null.
 */

import { createHash } from 'crypto'

export function computeDedupeKey(
  domain: string,
  capabilityId: string,
  issueCode: string,
  targetTable: string,
  targetId: string,
): string {
  return createHash('sha256')
    .update([domain, capabilityId, issueCode, targetTable, targetId].join(':'))
    .digest('hex')
}
