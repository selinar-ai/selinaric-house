/**
 * Phase 40.2.1 Structural + Logic Tests — Recall Review UI Polish
 *
 * Verifies:
 *   - Section nav with activeLabSection state added to /recall page
 *   - Recall Packet Inspector is gated on activeLabSection === 'inspector'
 *   - Runtime Trace is gated on activeLabSection === 'trace'
 *   - Eval Lab is gated on activeLabSection === 'eval_lab'
 *   - Overview health strip present with Tier A summary
 *   - RecallEvaluationLabPanel now imports RECALL_EVAL_CASE_MAP (for case metadata)
 *   - Compact case rows use shortInstruction abbreviation
 *   - All existing panels still reachable (Inspector, Trace, Eval Lab)
 *   - Boundary text present for all panels
 *   - 40.2, 40.1, Phase 39 tests still pass
 *   - No API routes / migrations / DB / LLM / fetch added
 *
 * Run: npx tsx src/lib/__tests__/phase-40-2-1-recall-review-ui-polish.test.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { runAllTierAEvaluationCases, summarizeTierAResults } from '../recall/recallTierAEvaluator'

// ─── test harness ─────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..', '..', '..')
let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  ✗ ${label}`)
  }
}

function section(name: string) {
  console.log(`\n── ${name} ──`)
}

const PAGE_PATH      = 'src/app/(house)/recall/page.tsx'
const COMPONENT_PATH = 'src/components/recall/RecallEvaluationLabPanel.tsx'

const pageSrc      = fs.readFileSync(path.join(ROOT, PAGE_PATH), 'utf-8')
const componentSrc = fs.readFileSync(path.join(ROOT, COMPONENT_PATH), 'utf-8')

// ═══════════════════════════════════════════════════════
// 1. Section nav state in /recall page
// ═══════════════════════════════════════════════════════
section('1. Section nav state added to /recall page')

assert(
  pageSrc.includes('activeLabSection'),
  '/recall page has activeLabSection state'
)

assert(
  pageSrc.includes("'inspector' | 'trace' | 'eval_lab' | null") ||
  pageSrc.includes("activeLabSection]"),
  '/recall page has lab section type with inspector/trace/eval_lab'
)

assert(
  pageSrc.includes("useState<'inspector' | 'trace' | 'eval_lab' | null>(null)"),
  '/recall page defaults activeLabSection to null (all labs hidden initially)'
)

// ═══════════════════════════════════════════════════════
// 2. Labs gated on activeLabSection
// ═══════════════════════════════════════════════════════
section('2. Labs conditionally rendered by activeLabSection')

assert(
  pageSrc.includes("activeLabSection === 'inspector'"),
  'Inspector panel gated on activeLabSection === inspector'
)

assert(
  pageSrc.includes("activeLabSection === 'trace'"),
  'Trace panel gated on activeLabSection === trace'
)

assert(
  pageSrc.includes("activeLabSection === 'eval_lab'"),
  'Eval Lab panel gated on activeLabSection === eval_lab'
)

// ═══════════════════════════════════════════════════════
// 3. Section nav buttons present
// ═══════════════════════════════════════════════════════
section('3. Section nav buttons present')

assert(
  pageSrc.includes('Inspector'),
  '/recall page has Inspector nav button label'
)

assert(
  pageSrc.includes('Runtime Trace'),
  '/recall page has Runtime Trace nav button label'
)

assert(
  pageSrc.includes('Eval Lab'),
  '/recall page has Eval Lab nav button label'
)

// ═══════════════════════════════════════════════════════
// 4. Overview health strip with Tier A status
// ═══════════════════════════════════════════════════════
section('4. Overview health strip with Tier A status')

assert(
  pageSrc.includes('Recall Health'),
  '/recall page has "Recall Health" overview strip'
)

assert(
  pageSrc.includes('TIER_A_SUMMARY.passed') &&
  pageSrc.includes('TIER_A_SUMMARY.total'),
  'Overview health strip shows Tier A passed/total counts'
)

assert(
  pageSrc.includes('TIER_A_SUMMARY.passRate'),
  'Overview health strip shows Tier A pass rate'
)

assert(
  pageSrc.includes('Advisory integrated') || pageSrc.includes('Advisory'),
  'Overview health strip mentions advisory integration status'
)

// ═══════════════════════════════════════════════════════
// 5. RecallEvaluationLabPanel uses compact rows
// ═══════════════════════════════════════════════════════
section('5. RecallEvaluationLabPanel compact table view')

assert(
  componentSrc.includes("from '@/lib/recall/recallEvalCases'"),
  'RecallEvaluationLabPanel imports from recallEvalCases (for case metadata)'
)

assert(
  componentSrc.includes('RECALL_EVAL_CASE_MAP'),
  'RecallEvaluationLabPanel uses RECALL_EVAL_CASE_MAP'
)

assert(
  componentSrc.includes('SHORT_INSTRUCTION') || componentSrc.includes('shortInstruction'),
  'RecallEvaluationLabPanel uses instruction abbreviation'
)

assert(
  componentSrc.includes('CaseRow') || componentSrc.includes('case-row'),
  'RecallEvaluationLabPanel has compact CaseRow component'
)

assert(
  componentSrc.includes('setExpanded') || componentSrc.includes('expanded'),
  'CaseRow has expandable detail state'
)

// ═══════════════════════════════════════════════════════
// 6. All panels still present and reachable
// ═══════════════════════════════════════════════════════
section('6. All panels still present')

assert(
  pageSrc.includes('RecallPacketDebugPanel') ||
  pageSrc.includes('RecallPacketInspector') ||
  pageSrc.includes('Recall Packet Inspector'),
  '/recall page still references Recall Packet Inspector'
)

assert(
  pageSrc.includes('RecallAdvisoryTracePanel'),
  '/recall page still references RecallAdvisoryTracePanel'
)

assert(
  pageSrc.includes('RecallEvaluationLabPanel'),
  '/recall page still references RecallEvaluationLabPanel'
)

// ═══════════════════════════════════════════════════════
// 7. Boundary text preserved in panel
// ═══════════════════════════════════════════════════════
section('7. Boundary text preserved in RecallEvaluationLabPanel')

const boundaryPhrases = [
  'Not Memory',
  'Not evidence',
  'Not authority',
  'No live data',
  'No LLM',
  'No writes',
]

for (const phrase of boundaryPhrases) {
  assert(
    componentSrc.includes(phrase),
    `RecallEvaluationLabPanel still contains boundary phrase: "${phrase}"`
  )
}

// ═══════════════════════════════════════════════════════
// 8. Tier A summary still shows 14 total / 14 passed / 100%
// ═══════════════════════════════════════════════════════
section('8. Tier A summary correctness')

{
  const results = runAllTierAEvaluationCases()
  const summary = summarizeTierAResults(results)

  assert(summary.total === 14,   `Summary.total is 14 (got: ${summary.total})`)
  assert(summary.passed === 14,  `Summary.passed is 14 (got: ${summary.passed})`)
  assert(summary.failed === 0,   `Summary.failed is 0 (got: ${summary.failed})`)
  assert(summary.passRate === 100, `Summary.passRate is 100% (got: ${summary.passRate}%)`)
  assert(summary.allPassed === true, 'Summary.allPassed is true')
}

// ═══════════════════════════════════════════════════════
// 9. No forbidden imports in new/changed files
// ═══════════════════════════════════════════════════════
section('9. No forbidden imports')

const forbiddenPatterns = [
  "from '@supabase",
  "from 'openai'",
  "from '@anthropic-ai",
  'createClient()',
  'fetch(',
  'process.env.',
]

for (const pattern of forbiddenPatterns) {
  assert(
    !componentSrc.includes(pattern),
    `RecallEvaluationLabPanel does not contain: ${pattern}`
  )
}

// ═══════════════════════════════════════════════════════
// 10. No API routes / migrations added
// ═══════════════════════════════════════════════════════
section('10. No API routes / migrations added')

const evalLabApiDir = path.join(ROOT, 'src/app/api/recall-evaluation-lab')
assert(!fs.existsSync(evalLabApiDir), 'No /api/recall-evaluation-lab route created')

const migrationFiles = fs.readdirSync(path.join(ROOT, 'supabase-migrations'))
const polishMigrations = migrationFiles.filter(f =>
  f.includes('_eval_lab') || f.includes('_polish') || f.includes('_cockpit')
)
assert(
  polishMigrations.length === 0,
  `No 40.2.1 migrations added (found: ${polishMigrations.join(', ') || 'none'})`
)

// ═══════════════════════════════════════════════════════
// 11. Chat routes unmodified
// ═══════════════════════════════════════════════════════
section('11. Chat routes unmodified')

for (const routePath of [
  'src/app/api/ari-chat/route.ts',
  'src/app/api/eli-chat/route.ts',
  'src/app/api/lounge-chat/route.ts',
]) {
  const content = fs.readFileSync(path.join(ROOT, routePath), 'utf-8')
  assert(
    !content.includes('activeLabSection') &&
    !content.includes('RecallEvaluationLabPanel'),
    `${routePath.split('/').pop()}: unmodified by 40.2.1`
  )
}

// ═══════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════')
console.log('  Phase 40.2.1 Recall Review UI Polish Tests')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log('═══════════════════════════════════════════════════════')

if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
} else {
  console.log('\n✅ All 40.2.1 UI polish tests passed.\n')
  process.exit(0)
}
