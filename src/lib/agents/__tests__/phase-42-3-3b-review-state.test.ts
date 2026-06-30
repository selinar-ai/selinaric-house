/**
 * Phase 42.3.3b — contract (pure): review-state validation + filter parsing + reviewed_by.
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-3b-review-state.test.ts
 */

import { isValidReviewState, parseFindingsFilter, REVIEW_STATES, REVIEWED_BY } from '../maintenance/contract'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }

assert(REVIEW_STATES.length === 3, 'three review states')
for (const s of ['open', 'acknowledged', 'dismissed']) assert(isValidReviewState(s), `valid: ${s}`)
for (const s of ['applied', 'approved', 'remedied', '', 'OPEN', null, 42]) assert(!isValidReviewState(s), `rejected: ${String(s)}`)
assert(REVIEWED_BY === 'tara', 'reviewed_by server-derived constant is tara')

const f = parseFindingsFilter(new URLSearchParams('domain=library&review_state=open&detection_status=active'))
assert(f.domain === 'library' && f.review_state === 'open' && f.detection_status === 'active', 'parses all filters')
const empty = parseFindingsFilter(new URLSearchParams(''))
assert(empty.domain === null && empty.review_state === null && empty.detection_status === null, 'absent filters → null (no filter)')
const blank = parseFindingsFilter(new URLSearchParams('domain=%20'))
assert(blank.domain === null, 'whitespace filter → null')

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
