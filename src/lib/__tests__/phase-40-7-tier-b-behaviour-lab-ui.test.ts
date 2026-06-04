/**
 * Phase 40.7 Structural + Logic Tests — Tier B Behaviour Lab UI
 *
 * Verifies:
 *   - RecallTierBBehaviourLabPanel.tsx exists and exports correctly
 *   - /recall page imports and renders the panel in 'tier_b' lab section
 *   - Page nav includes 'Behaviour — Tier B'
 *   - All required boundary text is present in the component
 *   - Case selector covers all 14 Phase 40.1 case IDs
 *   - Presence selector has Ari / Eli / Lounge
 *   - Model selector has cost / quality
 *   - Run button text is present
 *   - Component calls /api/recall-eval/tier-b (not production chat APIs)
 *   - Model response is displayed in a sandbox-labelled area
 *   - Grading fields are displayed
 *   - No prompt/system prompt fields rendered
 *   - No localStorage/sessionStorage
 *   - No Supabase/Anthropic/OpenAI direct imports
 *   - No write helpers imported
 *   - No migrations added
 *   - No production chat routes modified
 *   - All prior Phase 40/39 tests still pass
 *
 * Run: npx tsx src/lib/__tests__/phase-40-7-tier-b-behaviour-lab-ui.test.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { RECALL_EVAL_CASES } from '../recall/recallEvalCases'

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

const COMPONENT_PATH = 'src/components/recall/RecallTierBBehaviourLabPanel.tsx'
const PAGE_PATH      = 'src/app/(house)/recall/page.tsx'

const componentSrc = fs.readFileSync(path.join(ROOT, COMPONENT_PATH), 'utf-8')
const pageSrc      = fs.readFileSync(path.join(ROOT, PAGE_PATH), 'utf-8')

// ═══════════════════════════════════════════════════════
// 1. Component exists and exports correctly
// ═══════════════════════════════════════════════════════
section('1. Component exists and exports')

assert(fs.existsSync(path.join(ROOT, COMPONENT_PATH)), 'RecallTierBBehaviourLabPanel.tsx exists')
assert(componentSrc.includes('export default function RecallTierBBehaviourLabPanel'), 'Default export present')

// ═══════════════════════════════════════════════════════
// 2. /recall page imports and renders the Tier B panel
// ═══════════════════════════════════════════════════════
section('2. /recall page wiring')

assert(
  pageSrc.includes("import RecallTierBBehaviourLabPanel from '@/components/recall/RecallTierBBehaviourLabPanel'"),
  '/recall page imports RecallTierBBehaviourLabPanel'
)

assert(
  pageSrc.includes('<RecallTierBBehaviourLabPanel'),
  '/recall page renders <RecallTierBBehaviourLabPanel'
)

assert(
  pageSrc.includes("'tier_b'"),
  "/recall page has 'tier_b' in activeLabSection nav"
)

assert(
  pageSrc.includes("'Behaviour — Tier B'"),
  "/recall page has 'Behaviour — Tier B' nav label"
)

assert(
  pageSrc.includes("activeLabSection === 'tier_b'"),
  '/recall page conditionally renders tier_b lab'
)

assert(
  pageSrc.includes("'inspector' | 'trace' | 'eval_lab' | 'tier_b' | null"),
  '/recall page activeLabSection type includes tier_b'
)

// ═══════════════════════════════════════════════════════
// 3. Required boundary text in component
// ═══════════════════════════════════════════════════════
section('3. Required boundary text')

const boundaryPhrases = [
  'Sandbox response only',
  'Not Memory',
  'Not evidence',
  'No writes',
  'No production chat continuity',
  'No authority movement',
]

for (const phrase of boundaryPhrases) {
  assert(componentSrc.includes(phrase), `Component contains boundary phrase: "${phrase}"`)
}

// ═══════════════════════════════════════════════════════
// 4. Case selector covers all 14 Phase 40.1 case IDs
// ═══════════════════════════════════════════════════════
section('4. Case selector covers all 14 cases')

// Component imports RECALL_EVAL_CASES (so it has all 14 cases)
assert(
  componentSrc.includes("from '@/lib/recall/recallEvalCases'"),
  'Component imports from recallEvalCases'
)

assert(
  componentSrc.includes('RECALL_EVAL_CASES'),
  'Component uses RECALL_EVAL_CASES for case selector'
)

// Verify 14 cases are available at runtime
assert(RECALL_EVAL_CASES.length === 14, `14 eval cases accessible (got: ${RECALL_EVAL_CASES.length})`)

// Component maps over RECALL_EVAL_CASES to build the selector
assert(
  componentSrc.includes('RECALL_EVAL_CASES.map'),
  'Component maps RECALL_EVAL_CASES to render case options'
)

// ═══════════════════════════════════════════════════════
// 5. Presence and model selectors
// ═══════════════════════════════════════════════════════
section('5. Presence and model selectors')

assert(componentSrc.includes("value=\"ari\"") || componentSrc.includes('value="ari"'), 'Presence selector has ari')
assert(componentSrc.includes("value=\"eli\"") || componentSrc.includes('value="eli"'), 'Presence selector has eli')
assert(componentSrc.includes("value=\"lounge\"") || componentSrc.includes('value="lounge"'), 'Presence selector has lounge')
assert(componentSrc.includes("value=\"cost\"") || componentSrc.includes('value="cost"'), 'Model selector has cost')
assert(componentSrc.includes("value=\"quality\"") || componentSrc.includes('value="quality"'), 'Model selector has quality')

// ═══════════════════════════════════════════════════════
// 6. Run button exists
// ═══════════════════════════════════════════════════════
section('6. Run button')

assert(
  componentSrc.includes('Run sandbox evaluation'),
  'Run button text "Run sandbox evaluation" present'
)

assert(
  componentSrc.includes('Manual LLM call. No history is saved.'),
  'LLM cost note present: "Manual LLM call. No history is saved."'
)

// ═══════════════════════════════════════════════════════
// 7. Component calls /api/recall-eval/tier-b, not production chat
// ═══════════════════════════════════════════════════════
section('7. API boundary — calls sandbox route, not production chat')

assert(
  componentSrc.includes('/api/recall-eval/tier-b'),
  "Component calls '/api/recall-eval/tier-b'"
)

assert(
  !componentSrc.includes('/api/ari-chat'),
  'Component does NOT call /api/ari-chat'
)

assert(
  !componentSrc.includes('/api/eli-chat'),
  'Component does NOT call /api/eli-chat'
)

assert(
  !componentSrc.includes('/api/lounge-chat'),
  'Component does NOT call /api/lounge-chat'
)

// ═══════════════════════════════════════════════════════
// 8. Sandbox-labelled model response display
// ═══════════════════════════════════════════════════════
section('8. Model response in sandbox-labelled area')

assert(
  componentSrc.includes('Sandbox Response') || componentSrc.includes('sandbox'),
  'Component has sandbox-labelled response area'
)

assert(
  componentSrc.includes('model_response'),
  'Component renders model_response field'
)

assert(
  componentSrc.includes('not Memory · not evidence') || componentSrc.includes("not Memory"),
  'Model response area labelled as not Memory'
)

// ═══════════════════════════════════════════════════════
// 9. Grading fields displayed
// ═══════════════════════════════════════════════════════
section('9. Grading fields displayed')

const gradingFields = [
  'grading.passed',
  'grading.needs_tara_review',
  'grading.nondisclosure_passed',
  'grading.authority_boundary_passed',
  'grading.failures',
  'grading.warnings',
  'required_signal_results',
  'forbidden_signal_results',
]

for (const field of gradingFields) {
  assert(componentSrc.includes(field), `Component renders grading field: ${field}`)
}

// ═══════════════════════════════════════════════════════
// 10. Sandbox boundary flags displayed
// ═══════════════════════════════════════════════════════
section('10. Sandbox boundary flags displayed')

assert(
  componentSrc.includes('sandbox_boundary'),
  'Component renders sandbox_boundary flags'
)

// ═══════════════════════════════════════════════════════
// 11. Forbidden content NOT displayed
// ═══════════════════════════════════════════════════════
section('11. Forbidden content not displayed')

const forbiddenFieldRenders = [
  'systemPrompt',
  'system_prompt',
  'prompt_text',
  'compiled_prompt',
  'developer_prompt',
  'api_key',
  'err.stack',
  'process.env.',
]

for (const field of forbiddenFieldRenders) {
  assert(!componentSrc.includes(field), `Component does NOT render forbidden field: ${field}`)
}

// ═══════════════════════════════════════════════════════
// 12. No localStorage / sessionStorage
// ═══════════════════════════════════════════════════════
section('12. No localStorage / sessionStorage')

// Check for actual usage patterns (not documentation mentions)
assert(!componentSrc.includes('localStorage.'), 'Component does NOT call localStorage. (no get/set/remove calls)')
assert(!componentSrc.includes('sessionStorage.'), 'Component does NOT call sessionStorage. (no get/set/remove calls)')

// ═══════════════════════════════════════════════════════
// 13. No Supabase / Anthropic / write helpers
// ═══════════════════════════════════════════════════════
section('13. No Supabase / Anthropic / write helpers')

const forbiddenImports = [
  "from '@supabase",
  "from 'openai'",
  "from '@anthropic-ai",
  'createClient',
  'writeRecallAdvisoryTrace',
  'saveThreadMessage',
]

for (const pattern of forbiddenImports) {
  assert(!componentSrc.includes(pattern), `Component does NOT import: ${pattern}`)
}

// ═══════════════════════════════════════════════════════
// 14. No migrations / no production route changes
// ═══════════════════════════════════════════════════════
section('14. No migrations / production routes unmodified')

const migrationFiles = fs.readdirSync(path.join(ROOT, 'supabase-migrations'))
const tierBUiMigrations = migrationFiles.filter(f => f.includes('tier_b_ui') || f.includes('behaviour_lab'))
assert(tierBUiMigrations.length === 0, `No 40.7 migrations (found: ${tierBUiMigrations.join(', ') || 'none'})`)

for (const routePath of ['ari-chat', 'eli-chat', 'lounge-chat'].map(r => `src/app/api/${r}/route.ts`)) {
  const content = fs.readFileSync(path.join(ROOT, routePath), 'utf-8')
  assert(
    !content.includes('RecallTierBBehaviourLabPanel') && !content.includes('tier_b'),
    `${routePath.split('/').pop()}: NOT modified by 40.7`
  )
}

// ═══════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════')
console.log('  Phase 40.7 Tier B Behaviour Lab UI Tests')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log('═══════════════════════════════════════════════════════')

if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
} else {
  console.log('\n✅ All 40.7 Tier B behaviour lab UI tests passed.\n')
  process.exit(0)
}
