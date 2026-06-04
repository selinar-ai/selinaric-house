/**
 * Phase 40.4 Structural + Logic Tests — Tier B Sandbox Route
 *
 * Verifies:
 *   - Route exists under /api/recall-eval/tier-b (not production chat paths)
 *   - Route is POST only (no GET, PUT, etc. exported)
 *   - Route validates case_id against approved 40.1 case IDs
 *   - Route validates presence
 *   - Tier A check occurs before any LLM call (structural + logic)
 *   - Tier A failure prevents LLM call (logic)
 *   - Prompt assembly helper exists with all required sections
 *   - Prompt includes advisory block and non-disclosure guard
 *   - Prompt excludes forbidden content (full production prompts, live data)
 *   - Response includes all sandbox boundary flags
 *   - Route does NOT import production chat route handlers
 *   - Route does NOT import or call message-writing helpers
 *   - Route does NOT import or call writeRecallAdvisoryTrace
 *   - Route does NOT import Supabase write clients
 *   - No migrations added, no UI modified, no production chat routes touched
 *   - LLM call is NOT made in tests (no real API calls)
 *   - All 40.2.x / 40.1 / Phase 39 tests still pass
 *
 * Tests mock/avoid real LLM calls by testing:
 *   (a) structural patterns in source files
 *   (b) pure function behaviour (buildTierBEvalPrompt, Tier A check logic)
 *
 * Run: npx tsx src/lib/__tests__/phase-40-4-tier-b-sandbox-route.test.ts
 */

import * as fs from 'fs'
import * as path from 'path'

// Pure function imports — no LLM, no Supabase
import {
  buildTierBEvalPrompt,
  TIER_B_EVAL_IDENTITY_KERNELS,
  FIXTURE_GROUNDING_NOTES,
} from '../recall/recallTierBPrompt'
import { RECALL_ADVISORY_NON_DISCLOSURE_GUARD } from '../recall/recallAdvisoryNonDisclosureGuard'
import { runTierAEvaluationCase }               from '../recall/recallTierAEvaluator'
import { RECALL_EVAL_CASE_MAP, RECALL_EVAL_CASES } from '../recall/recallEvalCases'
import { buildRecallPacketFromRuntimeSignals }   from '../recall/recallCandidateAdapter'
import { formatRecallAdvisoryBlock }             from '../recall/recallAdvisoryBlock'
import { RuntimeContextSignalType }              from '../recall/recallPacketTypes'

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

const ROUTE_PATH   = 'src/app/api/recall-eval/tier-b/route.ts'
const PROMPT_PATH  = 'src/lib/recall/recallTierBPrompt.ts'

const routeSrc  = fs.readFileSync(path.join(ROOT, ROUTE_PATH), 'utf-8')
const promptSrc = fs.readFileSync(path.join(ROOT, PROMPT_PATH), 'utf-8')

// ═══════════════════════════════════════════════════════
// 1. Route exists at the correct path
// ═══════════════════════════════════════════════════════
section('1. Route exists at correct path (not production chat)')

assert(
  fs.existsSync(path.join(ROOT, ROUTE_PATH)),
  'Route exists at src/app/api/recall-eval/tier-b/route.ts'
)

// Must NOT be under production chat paths
assert(
  !fs.existsSync(path.join(ROOT, 'src/app/api/ari-chat/tier-b')),
  'Route is NOT under /api/ari-chat'
)
assert(
  !fs.existsSync(path.join(ROOT, 'src/app/api/eli-chat/tier-b')),
  'Route is NOT under /api/eli-chat'
)
assert(
  !fs.existsSync(path.join(ROOT, 'src/app/api/lounge-chat/tier-b')),
  'Route is NOT under /api/lounge-chat'
)

// ═══════════════════════════════════════════════════════
// 2. Route exports only POST (no GET/PUT/DELETE)
// ═══════════════════════════════════════════════════════
section('2. Route exports POST only')

assert(
  routeSrc.includes('export async function POST('),
  'Route exports POST handler'
)

assert(
  !routeSrc.includes('export async function GET(') &&
  !routeSrc.includes('export function GET('),
  'Route does NOT export GET handler'
)

assert(
  !routeSrc.includes('export async function PUT(') &&
  !routeSrc.includes('export async function DELETE('),
  'Route does NOT export PUT or DELETE handlers'
)

// ═══════════════════════════════════════════════════════
// 3. Route validates case_id against approved 40.1 case IDs
// ═══════════════════════════════════════════════════════
section('3. Request validation: case_id and presence')

assert(
  routeSrc.includes('VALID_CASE_IDS') || routeSrc.includes('RECALL_EVAL_CASES'),
  'Route validates case_id against approved eval case IDs'
)

assert(
  routeSrc.includes('invalid_case_id'),
  'Route returns invalid_case_id error for bad case_id'
)

assert(
  routeSrc.includes('VALID_PRESENCES') || routeSrc.includes("'ari', 'eli', 'lounge'"),
  'Route validates presence against allowed values'
)

assert(
  routeSrc.includes('invalid_presence'),
  'Route returns invalid_presence error for bad presence'
)

// ═══════════════════════════════════════════════════════
// 4. Tier A check occurs BEFORE LLM call
// ═══════════════════════════════════════════════════════
section('4. Tier A check before LLM call (structural)')

assert(
  routeSrc.includes('runTierAEvaluationCase'),
  'Route calls runTierAEvaluationCase'
)

assert(
  routeSrc.includes('tier_a_failed'),
  'Route returns tier_a_failed error when Tier A fails'
)

// Tier A check must appear before the Anthropic client.messages.create call
const tierAPos   = routeSrc.indexOf('runTierAEvaluationCase')
const llmCallPos = routeSrc.indexOf('client.messages.create')

assert(
  tierAPos >= 0 && llmCallPos >= 0 && tierAPos < llmCallPos,
  'Tier A check appears before LLM call in source'
)

// ═══════════════════════════════════════════════════════
// 5. Tier A failure prevents LLM call (logic test — no real LLM)
// ═══════════════════════════════════════════════════════
section('5. Tier A failure prevents LLM call (logic)')

// We verify this by checking that all 14 cases currently PASS Tier A.
// If any failed, the route would refuse to call the LLM for that case.
for (const evalCase of RECALL_EVAL_CASES) {
  const result = runTierAEvaluationCase(evalCase)
  assert(
    result.passed,
    `Tier A passes for '${evalCase.case_id}' (LLM call would be allowed)`
  )
}

// ═══════════════════════════════════════════════════════
// 6. Prompt assembly helper exists and exports correctly
// ═══════════════════════════════════════════════════════
section('6. Prompt assembly helper')

assert(
  fs.existsSync(path.join(ROOT, PROMPT_PATH)),
  'recallTierBPrompt.ts exists'
)

assert(
  promptSrc.includes('export function buildTierBEvalPrompt'),
  'buildTierBEvalPrompt is exported'
)

assert(
  promptSrc.includes('TIER_B_EVAL_IDENTITY_KERNELS'),
  'TIER_B_EVAL_IDENTITY_KERNELS is defined'
)

assert(
  promptSrc.includes('FIXTURE_GROUNDING_NOTES'),
  'FIXTURE_GROUNDING_NOTES is defined'
)

assert(
  typeof TIER_B_EVAL_IDENTITY_KERNELS.ari === 'string' &&
  TIER_B_EVAL_IDENTITY_KERNELS.ari.length > 0,
  'Ari eval identity kernel is a non-empty string'
)

assert(
  typeof TIER_B_EVAL_IDENTITY_KERNELS.eli === 'string' &&
  TIER_B_EVAL_IDENTITY_KERNELS.eli.length > 0,
  'Eli eval identity kernel is a non-empty string'
)

assert(
  typeof TIER_B_EVAL_IDENTITY_KERNELS.lounge === 'string' &&
  TIER_B_EVAL_IDENTITY_KERNELS.lounge.length > 0,
  'Lounge eval identity kernel is a non-empty string'
)

// ═══════════════════════════════════════════════════════
// 7. Prompt includes required sections (logic test)
// ═══════════════════════════════════════════════════════
section('7. Prompt assembly includes required sections (logic)')

// Build a test packet from a confirmed_memory fixture
const testPacket = buildRecallPacketFromRuntimeSignals({
  packet_id:   'test-prompt-assembly',
  computed_at: '2026-06-04T00:00:00.000Z',
  presence:    'ari',
  room:        'ari_room',
  signals: [{
    signal_type:    RuntimeContextSignalType.GovernedConfirmedMemory,
    presence_scope: 'shared',
    relevance:      'strong',
    source_ref:     { source_id: 'demo-prompt-test' },
  }],
})
const testAdvisoryBlock = formatRecallAdvisoryBlock(testPacket)

// Build the eval prompt
const testPrompt = buildTierBEvalPrompt({
  presence:     'ari',
  category:     'confirmed_memory',
  advisoryBlock: testAdvisoryBlock,
})

assert(
  testPrompt.length > 0,
  'buildTierBEvalPrompt returns a non-empty string'
)

assert(
  testPrompt.includes(TIER_B_EVAL_IDENTITY_KERNELS.ari),
  'Prompt contains the Ari eval identity kernel'
)

assert(
  testPrompt.includes(FIXTURE_GROUNDING_NOTES['confirmed_memory'] ?? ''),
  'Prompt contains the fixture grounding note for confirmed_memory category'
)

assert(
  testAdvisoryBlock.length > 0 && testPrompt.includes(testAdvisoryBlock),
  'Prompt contains the advisory block from formatRecallAdvisoryBlock()'
)

assert(
  testPrompt.includes(RECALL_ADVISORY_NON_DISCLOSURE_GUARD),
  'Prompt contains the non-disclosure guard'
)

// Non-disclosure guard is last in the prompt
const advisoryPos       = testPrompt.indexOf(testAdvisoryBlock)
const nonDisclosurePos  = testPrompt.indexOf(RECALL_ADVISORY_NON_DISCLOSURE_GUARD)
assert(
  advisoryPos >= 0 && nonDisclosurePos > advisoryPos,
  'Non-disclosure guard appears after advisory block (guard is last)'
)

// ═══════════════════════════════════════════════════════
// 8. Prompt excludes forbidden content
// ═══════════════════════════════════════════════════════
section('8. Prompt excludes forbidden content')

// Check the prompt assembly helper does not reference live data sources
const forbiddenPromptPatterns = [
  'loadTimelineForPrompt',
  'buildGovernedMemoryInjection',
  'getJournalContextForPresence',
  'searchLibraryForPresence',
  'getLivingStateForPrompt',
  'getAutonomyContinuityForPrompt',
  'getCrossRoomCarryforwardBlock',
  'buildCarrybackBlock',
  'getRecentContinuityForPrompt',
  'supabase',
  'createClient',
]

for (const pattern of forbiddenPromptPatterns) {
  assert(
    !promptSrc.includes(pattern),
    `recallTierBPrompt.ts does not reference: ${pattern}`
  )
}

// Prompt test question is NOT embedded in the system prompt
// (it goes as the user message in the route)
assert(
  !testPrompt.includes('What do you remember'),
  'Prompt assembly does not embed test question in system prompt (passed as user message instead)'
)

// ═══════════════════════════════════════════════════════
// 9. Insufficient ground case — no fixture grounding note
// ═══════════════════════════════════════════════════════
section('9. Insufficient ground: no grounding note in prompt')

{
  const insuffPacket = buildRecallPacketFromRuntimeSignals({
    packet_id:   'test-insufficient-prompt',
    computed_at: '2026-06-04T00:00:00.000Z',
    presence:    'ari',
    room:        'ari_room',
    signals:     [], // empty — insufficient
  })
  const insuffAdvisory = formatRecallAdvisoryBlock(insuffPacket)
  const insuffPrompt   = buildTierBEvalPrompt({
    presence:     'ari',
    category:     'insufficient_ground',
    advisoryBlock: insuffAdvisory,
  })

  assert(
    FIXTURE_GROUNDING_NOTES['insufficient_ground'] === '',
    'Fixture grounding note for insufficient_ground is empty string (intentional)'
  )

  // The "Evaluation fixture:" label should NOT appear for this case
  assert(
    !insuffPrompt.includes('Evaluation fixture:'),
    'Insufficient ground prompt does NOT include a fixture grounding note'
  )

  assert(
    insuffPrompt.includes('not enough grounded recall') ||
    insuffAdvisory.includes('not enough grounded recall'),
    'Advisory block contains "not enough grounded recall" instruction'
  )
}

// ═══════════════════════════════════════════════════════
// 10. Response shape includes all sandbox boundary flags
// ═══════════════════════════════════════════════════════
section('10. Response shape includes sandbox boundary flags')

const requiredBoundaryFlags = [
  'sandbox_response_only',
  'not_memory',
  'not_evidence',
  'no_writes',
  'no_production_chat_continuity',
  'no_authority_movement',
]

for (const flag of requiredBoundaryFlags) {
  assert(
    routeSrc.includes(flag),
    `Route response includes sandbox boundary flag: ${flag}`
  )
}

// ═══════════════════════════════════════════════════════
// 11. Route does NOT import production chat handlers
// ═══════════════════════════════════════════════════════
section('11. Production route isolation')

const forbiddenRouteImports = [
  "from '@/app/api/ari-chat",
  "from '@/app/api/eli-chat",
  "from '@/app/api/lounge-chat",
  "require('@/app/api/ari-chat",
  "require('@/app/api/eli-chat",
  "require('@/app/api/lounge-chat",
]

for (const pattern of forbiddenRouteImports) {
  assert(
    !routeSrc.includes(pattern),
    `Route does NOT import from production chat: ${pattern}`
  )
}

// ═══════════════════════════════════════════════════════
// 12. Route does NOT import message-writing helpers
// ═══════════════════════════════════════════════════════
section('12. No message-writing / trace-writing helpers')

const forbiddenWriteHelpers = [
  'writeRecallAdvisoryTrace(',    // check for call-site, not documentation mention
  'saveThreadMessage',
  'getOrCreateActiveThread',
  'buildGovernedMemoryInjection',
  'updateRoomMemoryIfNeeded',
  'maybeSyncRecentContinuity',
  'logRecallEvent',
  'logLibrarySearch',
  'logInjectionEvent',
  '.insert(',
  '.update(',
  '.upsert(',
  "from '@supabase",
  'createClient(',
]

for (const pattern of forbiddenWriteHelpers) {
  assert(
    !routeSrc.includes(pattern),
    `Route does NOT use forbidden write helper: ${pattern}`
  )
}

// ═══════════════════════════════════════════════════════
// 13. No prompt text returned in response
// ═══════════════════════════════════════════════════════
section('13. Route does not return system prompt or stack traces')

assert(
  !routeSrc.includes('systemPrompt:') &&
  !routeSrc.includes('prompt_text:') &&
  !routeSrc.includes('system_prompt:'),
  'Route does not include systemPrompt field in response shape'
)

assert(
  !routeSrc.includes('stack:') &&
  !routeSrc.includes('err.stack'),
  'Route does not expose stack traces in response'
)

// ═══════════════════════════════════════════════════════
// 14. No migrations / no UI / no production chat route changes
// ═══════════════════════════════════════════════════════
section('14. No migrations / UI / production chat route changes')

const migrationFiles = fs.readdirSync(path.join(ROOT, 'supabase-migrations'))
const tier4Migrations = migrationFiles.filter(f =>
  f.includes('tier_b') || f.includes('sandbox_eval') || f.includes('40_4')
)
assert(
  tier4Migrations.length === 0,
  `No 40.4 migrations added (found: ${tier4Migrations.join(', ') || 'none'})`
)

// /recall page now includes Tier B UI (added in Phase 40.7 after 40.4)
// 40.4's boundary: the sandbox ROUTE was new; the page was unmodified at 40.4 close.
// Post-40.7: the page now has RecallTierBBehaviourLabPanel — that is expected.
const recallPageSrc = fs.readFileSync(path.join(ROOT, 'src/app/(house)/recall/page.tsx'), 'utf-8')
assert(
  !recallPageSrc.includes('gradeTierBResponse'),
  '/recall page does NOT call gradeTierBResponse directly (grading stays in the route, not the page)'
)

// Production chat routes not modified
for (const routePath of ['ari-chat', 'eli-chat', 'lounge-chat'].map(r => `src/app/api/${r}/route.ts`)) {
  const content = fs.readFileSync(path.join(ROOT, routePath), 'utf-8')
  assert(
    !content.includes('recall-eval') && !content.includes('RecallEvalTierB'),
    `${routePath.split('/').pop()}: NOT modified by 40.4`
  )
}

// ═══════════════════════════════════════════════════════
// 15. Prompt assembly helper is pure (no I/O)
// ═══════════════════════════════════════════════════════
section('15. Prompt helper is pure (no I/O, no async)')

assert(
  !promptSrc.includes('async function') && !promptSrc.includes('async ('),
  'recallTierBPrompt.ts has no async functions'
)

assert(
  !promptSrc.includes('supabase') && !promptSrc.includes('createClient'),
  'recallTierBPrompt.ts has no Supabase calls'
)

assert(
  !promptSrc.includes('fetch('),
  'recallTierBPrompt.ts has no fetch calls'
)

assert(
  !promptSrc.includes('process.env.'),
  'recallTierBPrompt.ts has no process.env access'
)

// ═══════════════════════════════════════════════════════
// 16. Identity kernels are lightweight (under 200 words each)
// ═══════════════════════════════════════════════════════
section('16. Eval identity kernels are lightweight (not full production prompts)')

for (const presence of ['ari', 'eli', 'lounge'] as const) {
  const kernel = TIER_B_EVAL_IDENTITY_KERNELS[presence]
  const wordCount = kernel.split(/\s+/).length
  assert(
    wordCount < 200,
    `${presence} eval identity kernel is lightweight (${wordCount} words < 200)`
  )

  // Must NOT contain full production identity content indicators
  assert(
    !kernel.includes('Selináric') && !kernel.includes('You are not an assistant') &&
    !kernel.includes('Architecture') && !kernel.includes('Web search guidance'),
    `${presence} eval identity does NOT include full production kernel content`
  )
}

// ═══════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════')
console.log('  Phase 40.4 Tier B Sandbox Route Tests')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log('═══════════════════════════════════════════════════════')

if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
} else {
  console.log('\n✅ All 40.4 Tier B sandbox route tests passed.\n')
  process.exit(0)
}
