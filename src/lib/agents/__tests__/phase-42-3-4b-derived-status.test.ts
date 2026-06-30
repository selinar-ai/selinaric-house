/**
 * Phase 42.3.4b — pure contract: decision validation + derived approval status.
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-4b-derived-status.test.ts
 */

import { isValidDecision, deriveApprovalStatus, APPROVAL_DECISIONS } from '../maintenance/contract'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }

console.log('\n── decision vocabulary ──')
assert(APPROVAL_DECISIONS.length === 3, 'three decisions')
for (const d of ['approved', 'rejected', 'revoked']) assert(isValidDecision(d), `valid: ${d}`)
for (const d of ['applied', 'queued', 'approve', '', 'APPROVED', null, 7]) assert(!isValidDecision(d), `rejected: ${String(d)}`)

console.log('\n── derived status = latest by event_sequence (not array order, not timestamp) ──')
assert(deriveApprovalStatus([]) === 'none', 'no events → none')
assert(deriveApprovalStatus([{ event_sequence: 1, decision: 'approved' }]) === 'approved', 'single approved → approved')
// out-of-order array: latest sequence wins regardless of position
assert(deriveApprovalStatus([
  { event_sequence: 3, decision: 'revoked' },
  { event_sequence: 1, decision: 'approved' },
  { event_sequence: 2, decision: 'rejected' },
]) === 'revoked', 'highest sequence wins regardless of array order')
// approve → revoke → revoked (not active)
assert(deriveApprovalStatus([
  { event_sequence: 10, decision: 'approved' },
  { event_sequence: 11, decision: 'revoked' },
]) === 'revoked', 'approve then revoke → revoked')
// revoke → re-approve → approved
assert(deriveApprovalStatus([
  { event_sequence: 10, decision: 'approved' },
  { event_sequence: 11, decision: 'revoked' },
  { event_sequence: 12, decision: 'approved' },
]) === 'approved', 're-approve after revoke → approved')
assert(deriveApprovalStatus([{ event_sequence: 5, decision: 'rejected' }]) === 'rejected', 'rejected → rejected')

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
