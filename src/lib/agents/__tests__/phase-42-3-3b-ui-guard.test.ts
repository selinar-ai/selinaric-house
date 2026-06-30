/**
 * Phase 42.3.3b — UI guard: the Maintenance Room exposes review/triage actions only.
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-3b-ui-guard.test.ts
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }

const rel = 'src/app/(house)/agents/page.tsx'
if (!fs.existsSync(rel)) { console.log(`✗ not found: ${rel}`); process.exit(1) }
// Strip comments first — the guard must inspect rendered UI, not the doc header (which
// deliberately names the forbidden controls to document their absence).
const src = fs.readFileSync(rel, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '')

console.log('\n── review/triage actions present ──')
for (const label of ['Acknowledge', 'Dismiss', 'Reopen']) assert(src.includes(label), `has ${label} action`)

console.log('\n── no hands / action-implying controls ──')
// 'Approve' is NOT forbidden here as of Phase 42.3.4b: approval is a sanctioned authority
// decision (Approve/Reject/Revoke), not execution. Every EXECUTION-implying control stays banned.
for (const forbidden of ['Apply', 'Remedy', 'Re-run', 'Generate', 'LLM', 'Fix']) {
  assert(!src.includes(forbidden), `no "${forbidden}" control`)
}

console.log('\n── boundary banner present ──')
assert(src.includes('Review surface only') && src.includes('it may not act'), 'boundary banner present')

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
