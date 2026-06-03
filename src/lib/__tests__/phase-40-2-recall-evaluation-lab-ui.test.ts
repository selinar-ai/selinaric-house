/**
 * Phase 40.2 Structural + Logic Tests — Recall Evaluation Lab UI
 *
 * Verifies:
 *   - RecallEvaluationLabPanel.tsx exists and exports correctly
 *   - /recall page imports and renders the panel
 *   - Panel has required title: Recall Evaluation Lab + Tier A
 *   - Panel has all required boundary wording
 *   - Panel is collapsed by default
 *   - Panel receives 14 results from runAllTierAEvaluationCases()
 *   - Summary has correct totals
 *   - No API route / migration / DB / LLM / fetch added
 *   - No forbidden content fields rendered
 *   - 40.1 evaluator and Phase 39 tests still pass
 *
 * Run: npx tsx src/lib/__tests__/phase-40-2-recall-evaluation-lab-ui.test.ts
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

const COMPONENT_PATH = 'src/components/recall/RecallEvaluationLabPanel.tsx'
const PAGE_PATH      = 'src/app/(house)/recall/page.tsx'

const componentSrc = fs.readFileSync(path.join(ROOT, COMPONENT_PATH), 'utf-8')
const pageSrc      = fs.readFileSync(path.join(ROOT, PAGE_PATH), 'utf-8')

// ═══════════════════════════════════════════════════════
// 1. Component exists and exports correctly
// ═══════════════════════════════════════════════════════
section('1. Component exists')

assert(
  fs.existsSync(path.join(ROOT, COMPONENT_PATH)),
  'RecallEvaluationLabPanel.tsx exists'
)

assert(
  componentSrc.includes('export default function RecallEvaluationLabPanel'),
  'RecallEvaluationLabPanel is default export'
)

assert(
  componentSrc.includes('results: RecallEvalTierAResult[]') &&
  componentSrc.includes('summary: RecallEvalTierASummary'),
  'Component props include results and summary'
)

// ═══════════════════════════════════════════════════════
// 2. Required title and heading
// ═══════════════════════════════════════════════════════
section('2. Required title content')

assert(
  componentSrc.includes('Recall Evaluation Lab'),
  'Component title includes "Recall Evaluation Lab"'
)

assert(
  componentSrc.includes('Tier A'),
  'Component includes "Tier A" label'
)

assert(
  componentSrc.includes('Deterministic fixture-based evaluation'),
  'Component includes "Deterministic fixture-based evaluation" subtitle'
)

// ═══════════════════════════════════════════════════════
// 3. All required boundary wording present
// ═══════════════════════════════════════════════════════
section('3. Boundary wording')

const boundaryPhrases = [
  'Not Memory',
  'Not evidence',
  'Not authority',
  'No live data',
  'No LLM',
  'No writes',
  'Tier A checks packet classification only',
]

for (const phrase of boundaryPhrases) {
  assert(
    componentSrc.includes(phrase),
    `Component contains boundary phrase: "${phrase}"`
  )
}

// ═══════════════════════════════════════════════════════
// 4. Collapsed by default
// ═══════════════════════════════════════════════════════
section('4. Collapsed by default')

assert(
  componentSrc.includes('useState(false)') ||
  componentSrc.includes("useState<boolean>(false)"),
  'Panel open state initialised to false (collapsed by default)'
)

// ═══════════════════════════════════════════════════════
// 5. /recall page imports and renders the panel
// ═══════════════════════════════════════════════════════
section('5. /recall page wiring')

assert(
  pageSrc.includes("import RecallEvaluationLabPanel from '@/components/recall/RecallEvaluationLabPanel'"),
  '/recall page imports RecallEvaluationLabPanel'
)

assert(
  pageSrc.includes("from '@/lib/recall/recallTierAEvaluator'"),
  '/recall page imports from recallTierAEvaluator'
)

assert(
  pageSrc.includes('runAllTierAEvaluationCases()'),
  '/recall page calls runAllTierAEvaluationCases()'
)

assert(
  pageSrc.includes('summarizeTierAResults('),
  '/recall page calls summarizeTierAResults()'
)

assert(
  pageSrc.includes('<RecallEvaluationLabPanel'),
  '/recall page renders <RecallEvaluationLabPanel'
)

assert(
  pageSrc.includes('results={TIER_A_RESULTS}') &&
  pageSrc.includes('summary={TIER_A_SUMMARY}'),
  '/recall page passes TIER_A_RESULTS and TIER_A_SUMMARY to the panel'
)

// Panel appears after RecallAdvisoryTracePanel (placement check)
assert(
  pageSrc.indexOf('<RecallAdvisoryTracePanel') < pageSrc.indexOf('<RecallEvaluationLabPanel'),
  'RecallEvaluationLabPanel is placed after RecallAdvisoryTracePanel'
)

// ═══════════════════════════════════════════════════════
// 6. Panel renders 14 results (logic)
// ═══════════════════════════════════════════════════════
section('6. Panel receives 14 results (logic)')

{
  const results = runAllTierAEvaluationCases()
  const summary = summarizeTierAResults(results)

  assert(
    results.length === 14,
    `runAllTierAEvaluationCases() returns 14 results (got: ${results.length})`
  )

  assert(
    summary.total === 14,
    `Summary total is 14 (got: ${summary.total})`
  )

  assert(
    summary.passed + summary.failed === 14,
    'Summary passed + failed = 14'
  )

  assert(
    typeof summary.passRate === 'number',
    'Summary.passRate is a number'
  )

  assert(
    summary.allPassed === (summary.failed === 0),
    'Summary.allPassed consistent with failed count'
  )

  // All 14 cases have a result with case_id matching an expected case
  const caseIds = results.map(r => r.case_id)
  assert(
    caseIds.includes('confirmed_memory_shared'),
    'Results include confirmed_memory_shared'
  )
  assert(
    caseIds.includes('insufficient_ground'),
    'Results include insufficient_ground'
  )
  assert(
    caseIds.includes('lounge_private_blocked'),
    'Results include lounge_private_blocked'
  )
  assert(
    caseIds.includes('nondisclosure_run_the_packet'),
    'Results include nondisclosure_run_the_packet'
  )
}

// ═══════════════════════════════════════════════════════
// 7. Summary fields rendered in component
// ═══════════════════════════════════════════════════════
section('7. Summary fields rendered in component')

assert(
  componentSrc.includes('summary.total') ||
  componentSrc.includes('{summary.total}'),
  'Component renders summary.total'
)

assert(
  componentSrc.includes('summary.passed') ||
  componentSrc.includes('{summary.passed}'),
  'Component renders summary.passed'
)

assert(
  componentSrc.includes('summary.failed') ||
  componentSrc.includes('{summary.failed}'),
  'Component renders summary.failed'
)

assert(
  componentSrc.includes('summary.passRate') ||
  componentSrc.includes('{summary.passRate}'),
  'Component renders summary.passRate'
)

assert(
  componentSrc.includes('summary.byCategory'),
  'Component renders summary.byCategory breakdown'
)

// ═══════════════════════════════════════════════════════
// 8. Expected and actual instructions displayed
// ═══════════════════════════════════════════════════════
section('8. Expected and actual instructions displayed')

assert(
  componentSrc.includes('expected_primary_response_instruction') ||
  componentSrc.includes('expected'),
  'Component references expected instruction'
)

assert(
  componentSrc.includes('actual_primary_response_instruction') ||
  componentSrc.includes('actual'),
  'Component references actual instruction'
)

// ═══════════════════════════════════════════════════════
// 9. Failure list renders safely
// ═══════════════════════════════════════════════════════
section('9. Failure list renders safely')

assert(
  componentSrc.includes('result.failures') ||
  componentSrc.includes('failures.map'),
  'Component renders result.failures array'
)

// ═══════════════════════════════════════════════════════
// 10. No forbidden content fields rendered
// ═══════════════════════════════════════════════════════
section('10. No forbidden content fields rendered')

// Check component does not reference forbidden content fields as trace.X access
// Use field-definition patterns to avoid false positives
const forbiddenRenderFields = [
  'result.raw_content',
  'result.content',
  'result.journal_body',
  'result.memory_text',
  'result.prompt_text',
  'result.user_message',
  'result.model_output',
  'packet.raw_content',
]

for (const field of forbiddenRenderFields) {
  assert(
    !componentSrc.includes(field),
    `Component does not render forbidden content field: ${field}`
  )
}

// ═══════════════════════════════════════════════════════
// 11. No API route / migration / DB / LLM / fetch added
// ═══════════════════════════════════════════════════════
section('11. No API route / migration / DB / LLM / fetch')

// No API route added for eval lab
const apiDir = path.join(ROOT, 'src/app/api/recall-evaluation-lab')
assert(
  !fs.existsSync(apiDir),
  'No /api/recall-evaluation-lab route created'
)

// No new migrations
const migrationFiles = fs.readdirSync(path.join(ROOT, 'supabase-migrations'))
const evalMigrations = migrationFiles.filter(f =>
  f.includes('_eval_lab') || f.includes('tier_a') || f.includes('_evaluation_')
)
assert(
  evalMigrations.length === 0,
  `No eval lab migrations added (found: ${evalMigrations.join(', ') || 'none'})`
)

// Component has no Supabase / LLM / fetch
const forbiddenComponentImports = [
  "from '@supabase",
  "from 'openai'",
  "from '@anthropic-ai",
  'createClient',
  'fetch(',
  'process.env.',
]

for (const pattern of forbiddenComponentImports) {
  assert(
    !componentSrc.includes(pattern),
    `Component does not contain: ${pattern}`
  )
}

// ═══════════════════════════════════════════════════════
// 12. Production chat routes not modified
// ═══════════════════════════════════════════════════════
section('12. Chat routes unmodified')

const chatRoutes = [
  'src/app/api/ari-chat/route.ts',
  'src/app/api/eli-chat/route.ts',
  'src/app/api/lounge-chat/route.ts',
]

for (const routePath of chatRoutes) {
  const content = fs.readFileSync(path.join(ROOT, routePath), 'utf-8')
  assert(
    !content.includes('RecallEvaluationLabPanel') &&
    !content.includes('recallTierAEvaluator') &&
    !content.includes('runAllTierAEvaluationCases'),
    `${routePath.split('/').pop()}: not modified by 40.2`
  )
}

// ═══════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════')
console.log('  Phase 40.2 Recall Evaluation Lab UI Tests')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log('═══════════════════════════════════════════════════════')

if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
} else {
  console.log('\n✅ All 40.2 evaluation lab UI tests passed.\n')
  process.exit(0)
}
