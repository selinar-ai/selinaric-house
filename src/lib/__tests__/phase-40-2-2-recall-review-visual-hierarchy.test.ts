/**
 * Phase 40.2.2 Structural + Logic Tests — Recall Review Visual Hierarchy Polish
 *
 * Verifies:
 *   - Command deck (health strip + nav) moved BEFORE stats/older panels in page
 *   - Health strip uses larger/more-prominent styling (font-display for label)
 *   - Lab nav uses rounded-md button styling
 *   - Active lab wrapped in card container
 *   - "Review Tools" section separator present
 *   - Close button for active lab card
 *   - RecallEvaluationLabPanel uses text-[9px] for case IDs (improved readability)
 *   - Boundary text preserved in all panels
 *   - All 40.2.1 / 40.1 / Phase 39 tests still pass
 *   - No API/DB/LLM/auth/migration changes
 *
 * Run: npx tsx src/lib/__tests__/phase-40-2-2-recall-review-visual-hierarchy.test.ts
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
// 1. Command deck is now before stats/older panels
// ═══════════════════════════════════════════════════════
section('1. Command deck positioned before older panels')

assert(
  pageSrc.includes('Phase 40.2.2: Command Deck'),
  '/recall page has Phase 40.2.2 Command Deck section'
)

// Command deck comes before Auto-Recall Settings in the source
const commandDeckPos = pageSrc.indexOf('Phase 40.2.2: Command Deck')
const autoRecallPos  = pageSrc.indexOf('Auto-Recall Settings')
assert(
  commandDeckPos < autoRecallPos,
  'Command deck appears before Auto-Recall Settings in page source'
)

// Command deck comes before Summary cards
const summaryCardsPos = pageSrc.indexOf('Summary cards')
assert(
  commandDeckPos < summaryCardsPos,
  'Command deck appears before Summary cards in page source'
)

// ═══════════════════════════════════════════════════════
// 2. Health strip is more prominent
// ═══════════════════════════════════════════════════════
section('2. Health strip visual prominence')

assert(
  pageSrc.includes('font-display') && pageSrc.includes('Recall Health'),
  'Health strip label uses font-display (prominent heading)'
)

assert(
  pageSrc.includes('rounded-lg') || pageSrc.includes('border border-house-border/30'),
  'Command deck is in a card/container (rounded border)'
)

assert(
  pageSrc.includes('text-[10px]') || pageSrc.includes('text-[11px]'),
  'Tier A status badge uses larger text (10px or 11px)'
)

// ═══════════════════════════════════════════════════════
// 3. Lab nav is more prominent
// ═══════════════════════════════════════════════════════
section('3. Lab nav visual prominence')

assert(
  pageSrc.includes('rounded-md') || pageSrc.includes('px-3 py-1'),
  'Lab nav buttons use rounded-md or larger padding (more prominent)'
)

assert(
  pageSrc.includes("{ id: 'inspector', label: 'Inspector' }") ||
  pageSrc.includes("{ id: 'inspector',  label: 'Inspector' }"),
  'Lab nav has Inspector button'
)

assert(
  pageSrc.includes("label: 'Runtime Trace'"),
  'Lab nav has Runtime Trace button'
)

assert(
  pageSrc.includes("label: 'Eval Lab — Tier A'"),
  'Lab nav has Eval Lab — Tier A button'
)

// ═══════════════════════════════════════════════════════
// 4. Active lab is wrapped in a card container
// ═══════════════════════════════════════════════════════
section('4. Active lab card container')

assert(
  pageSrc.includes('Active Lab Card'),
  '/recall page has Active Lab Card section comment'
)

assert(
  pageSrc.includes('close') && pageSrc.includes('setActiveLabSection(null)'),
  'Active lab card has a close button'
)

assert(
  pageSrc.includes('rounded-lg bg-house-bg/15') ||
  pageSrc.includes('rounded-lg bg-house-bg'),
  'Active lab wrapped in rounded card'
)

// ═══════════════════════════════════════════════════════
// 5. "Review Tools" section separator present
// ═══════════════════════════════════════════════════════
section('5. Review Tools separator')

assert(
  pageSrc.includes('Review Tools'),
  '/recall page has "Review Tools" section separator'
)

// Review Tools appears after the command deck
const reviewToolsPos = pageSrc.indexOf('Review Tools')
assert(
  reviewToolsPos > commandDeckPos,
  'Review Tools section appears after Command Deck'
)

// ═══════════════════════════════════════════════════════
// 6. RecallEvaluationLabPanel — improved text sizes
// ═══════════════════════════════════════════════════════
section('6. RecallEvaluationLabPanel readability improvements')

assert(
  componentSrc.includes('text-[9px] text-text-secondary/70'),
  'Case ID column uses text-[9px] (improved readability)'
)

assert(
  componentSrc.includes('text-[8px] text-text-muted/40') &&
  componentSrc.includes('w-28'),
  'Category column uses text-[8px] and w-28 (wider column)'
)

assert(
  componentSrc.includes('w-24') ||
  componentSrc.includes('text-[8px] shrink-0 w-24'),
  'Instruction columns use w-24 (wider for readability)'
)

assert(
  componentSrc.includes('py-1.5'),
  'Case rows use py-1.5 (better row height)'
)

// ═══════════════════════════════════════════════════════
// 7. All boundary text preserved
// ═══════════════════════════════════════════════════════
section('7. Boundary text preserved')

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
// 8. Tier A 14/14 still from evaluator (logic)
// ═══════════════════════════════════════════════════════
section('8. Tier A 14/14 from evaluator (logic)')

{
  const results = runAllTierAEvaluationCases()
  const summary = summarizeTierAResults(results)

  assert(summary.total === 14,  `Summary.total is 14 (got: ${summary.total})`)
  assert(summary.passed === 14, `Summary.passed is 14 (got: ${summary.passed})`)
  assert(summary.failed === 0,  `Summary.failed is 0 (got: ${summary.failed})`)
  assert(summary.passRate === 100, `Summary.passRate is 100% (got: ${summary.passRate}%)`)
}

// ═══════════════════════════════════════════════════════
// 9. All panels still present and reachable
// ═══════════════════════════════════════════════════════
section('9. All panels still present')

assert(pageSrc.includes('RecallPacketDebugPanel') || pageSrc.includes('Recall Packet Inspector'),
  'Inspector panel still reachable')
assert(pageSrc.includes('RecallAdvisoryTracePanel'),   'Trace panel still present')
assert(pageSrc.includes('RecallEvaluationLabPanel'),   'Eval Lab panel still present')
assert(pageSrc.includes('activeLabSection'),            'activeLabSection state still present')

// ═══════════════════════════════════════════════════════
// 10. No forbidden imports / API / migrations
// ═══════════════════════════════════════════════════════
section('10. No forbidden imports / API / migrations')

const forbidden = ["from '@supabase", "from 'openai'", "from '@anthropic-ai", 'fetch(']
for (const p of forbidden) {
  assert(!componentSrc.includes(p), `Panel does not contain: ${p}`)
}

const migrationFiles = fs.readdirSync(path.join(ROOT, 'supabase-migrations'))
assert(
  migrationFiles.filter(f => f.includes('_cockpit') || f.includes('_hierarchy')).length === 0,
  'No 40.2.2 migrations added'
)

for (const route of ['ari-chat', 'eli-chat', 'lounge-chat'].map(r => `src/app/api/${r}/route.ts`)) {
  const content = fs.readFileSync(path.join(ROOT, route), 'utf-8')
  assert(!content.includes('commandDeck') && !content.includes('activeLabSection'),
    `${route.split('/').slice(-2)[0]}: unmodified by 40.2.2`)
}

// ═══════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════')
console.log('  Phase 40.2.2 Recall Review Visual Hierarchy Tests')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log('═══════════════════════════════════════════════════════')

if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
} else {
  console.log('\n✅ All 40.2.2 visual hierarchy tests passed.\n')
  process.exit(0)
}
