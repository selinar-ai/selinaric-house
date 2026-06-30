/**
 * Phase 42.3.4a — title-trim remedy-plan builder (pure).
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-4a-builder.test.ts
 */

import { buildTitleTrimPlan, REMEDY_ACTION_TITLE_TRIM, trimSurroundingSpaces } from '../packs/library/remedy'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }

const plan = buildTitleTrimPlan({ findingId: 'f1', targetId: 'item1', currentTitle: '  Hello World  ' })

console.log('\n── plan shape + whitelist ──')
assert(plan !== null, 'builds a plan for an untrimmed title')
assert(plan!.action_type === REMEDY_ACTION_TITLE_TRIM && REMEDY_ACTION_TITLE_TRIM === 'library_title_trim', 'action_type is library_title_trim')
assert(plan!.domain === 'library' && plan!.target_table === 'library_items' && plan!.target_field === 'title', 'domain/table/field are the v1 whitelist')
assert(plan!.finding_id === 'f1' && plan!.target_id === 'item1', 'carries finding + target ids')

console.log('\n── determinism + exact inverse + trim ──')
const again = buildTitleTrimPlan({ findingId: 'f1', targetId: 'item1', currentTitle: '  Hello World  ' })
assert(JSON.stringify(plan) === JSON.stringify(again), 'same input → same plan (deterministic)')
assert(plan!.current_value === '  Hello World  ', 'current_value preserves the exact prior title verbatim (inverse)')
assert(plan!.proposed_value === 'Hello World', 'proposed_value is the exact ASCII-space trim of current')
assert(plan!.proposed_value === trimSurroundingSpaces(plan!.current_value), 'proposed === trimSurroundingSpaces(current) (byte-exact with btrim(x, \' \'))')

console.log('\n── round-trip restores the exact prior value ──')
// proposed -> inverse must restore the original (representation-level proof; apply is 42.3.4c)
assert(plan!.current_value !== plan!.proposed_value, 'a change is represented')
const restored = plan!.current_value // the recorded inverse is the verbatim prior value
assert(restored === '  Hello World  ', 'inverse restores the byte-identical original')

console.log('\n── no-op / unsafe inputs yield no plan ──')
assert(buildTitleTrimPlan({ findingId: 'f', targetId: 't', currentTitle: 'clean' }) === null, 'already-normal → null')
assert(buildTitleTrimPlan({ findingId: 'f', targetId: 't', currentTitle: '   ' }) === null, 'all-space → null (never propose empty)')
assert(buildTitleTrimPlan({ findingId: 'f', targetId: 't', currentTitle: '' }) === null, 'empty → null')
assert(buildTitleTrimPlan({ findingId: 'f', targetId: 't', currentTitle: '\tHi\t' }) === null, 'tab-surrounded → null in v1 (not ASCII space)')
assert(buildTitleTrimPlan({ findingId: 'f', targetId: 't', currentTitle: '\nHi\n' }) === null, 'newline-surrounded → null in v1 (not ASCII space)')

console.log('\n── never targets an authority field ──')
const fields = new Set<string>()
for (const t of ['  a  ', ' b', 'c ', '  multi word  ']) {
  const p = buildTitleTrimPlan({ findingId: 'f', targetId: 't', currentTitle: t })
  if (p) fields.add(p.target_field)
}
assert(fields.size === 1 && fields.has('title'), 'every plan targets only `title` — never an authority field')

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
