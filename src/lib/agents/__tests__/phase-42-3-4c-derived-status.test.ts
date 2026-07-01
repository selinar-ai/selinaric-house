/**
 * Phase 42.3.4c — pure contract: derived apply status.
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-4c-derived-status.test.ts
 */

import { deriveApplyStatus, APPLY_OUTCOMES } from '../maintenance/contract'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }

console.log('\n── outcome vocabulary ──')
assert(APPLY_OUTCOMES.length === 2, 'two outcomes')
assert(APPLY_OUTCOMES.includes('applied' as never) && APPLY_OUTCOMES.includes('rolled_back' as never), 'applied + rolled_back')
assert(!(APPLY_OUTCOMES as readonly string[]).includes('failed'), "no 'failed' outcome")

console.log('\n── derived apply status = latest by event_sequence (not array order, not timestamp) ──')
assert(deriveApplyStatus([]) === 'none', 'no events → none')
assert(deriveApplyStatus([{ event_sequence: 1, outcome: 'applied' }]) === 'applied', 'single applied → applied')
assert(deriveApplyStatus([
  { event_sequence: 2, outcome: 'rolled_back' },
  { event_sequence: 1, outcome: 'applied' },
]) === 'rolled_back', 'highest sequence wins regardless of array order')
// applied → rolled_back → re-applied
assert(deriveApplyStatus([
  { event_sequence: 10, outcome: 'applied' },
  { event_sequence: 11, outcome: 'rolled_back' },
  { event_sequence: 12, outcome: 'applied' },
]) === 'applied', 're-applied after rollback → applied')
assert(deriveApplyStatus([
  { event_sequence: 10, outcome: 'applied' },
  { event_sequence: 11, outcome: 'rolled_back' },
]) === 'rolled_back', 'applied then rolled_back → rolled_back')

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
