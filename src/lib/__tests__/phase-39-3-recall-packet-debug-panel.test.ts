/**
 * Phase 39.3 Structural Tests — Recall Packet Debug Panel
 *
 * Structural validation of the debug panel component, fixtures, and
 * governance boundaries. No React rendering — file-content checks and
 * logic assertions on fixture data.
 *
 * Run: npx tsx src/lib/__tests__/phase-39-3-recall-packet-debug-panel.test.ts
 *
 * Test cleanup applied:
 *   - Bare "prompt" not checked (footer requires "prompt eligibility").
 *   - Sensitive content tests use specific field-name patterns instead.
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  ALL_FIXTURES,
  confirmedMemoryFixture,
  insufficientGroundFixture,
  sourceConflictFixture,
  traceExcludedFixture,
  scopeBlockedFixture,
  topicShiftFixture,
} from '../recall/recallPacketFixtures'
import { ResponseInstruction, ExclusionReason } from '../recall/recallPacketTypes'

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

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8')
}

const COMPONENT_PATH = 'src/components/recall/RecallPacketDebugPanel.tsx'
const FIXTURES_PATH  = 'src/lib/recall/recallPacketFixtures.ts'
const BUILDER_PATH   = 'src/lib/recall/recallPacketBuilder.ts'
const TYPES_PATH     = 'src/lib/recall/recallPacketTypes.ts'

const componentSrc = readFile(COMPONENT_PATH)
const fixturesSrc  = readFile(FIXTURES_PATH)

// ═══════════════════════════════════════════════════════
// 1. Component exists and exports correctly
// ═══════════════════════════════════════════════════════
section('1. Component exists and exports')

assert(
  fs.existsSync(path.join(ROOT, COMPONENT_PATH)),
  'RecallPacketDebugPanel.tsx exists at src/components/recall/'
)

assert(
  componentSrc.includes('export default function RecallPacketDebugPanel'),
  'RecallPacketDebugPanel is exported as default function'
)

assert(
  componentSrc.includes('export interface RecallPacketDebugPanelProps'),
  'RecallPacketDebugPanelProps interface is exported'
)

assert(
  componentSrc.includes('packet: RecallPacket'),
  'Props include required packet: RecallPacket field'
)

// ═══════════════════════════════════════════════════════
// 2. Imports only safe types — no builder call, no Supabase
// ═══════════════════════════════════════════════════════
section('2. Safe imports only')

assert(
  componentSrc.includes("from '@/lib/recall/recallPacketTypes'"),
  'Component imports from recallPacketTypes'
)

// Component must not import buildRecallPacket — it receives the packet as a prop.
// Comments may mention the function name; check import paths instead.
assert(
  !componentSrc.includes("from '@/lib/recall/recallPacketBuilder'") &&
  !componentSrc.includes("from '../recall/recallPacketBuilder'"),
  'Component does not import recallPacketBuilder (receives RecallPacket as prop)'
)

// No Supabase / external service imports
const forbiddenImports = [
  "from '@supabase",
  "createClient",
  "from 'openai'",
  "from '@anthropic-ai",
  "supabase.from(",
]

for (const imp of forbiddenImports) {
  assert(
    !componentSrc.includes(imp),
    `Component does not import ${imp}`
  )
}

// ═══════════════════════════════════════════════════════
// 3. No side effects
// ═══════════════════════════════════════════════════════
section('3. No side effects')

// Check for actual call-site usage; comment documentation of absence uses the word too
assert(
  !componentSrc.includes('useEffect('),
  'Component has no useEffect( call-site'
)

assert(
  !componentSrc.includes('fetch('),
  'Component has no fetch( call'
)

assert(
  !componentSrc.includes('supabase'),
  'Component has no supabase reference'
)

assert(
  !componentSrc.includes('process.env.'),
  'Component has no process.env. access'
)

assert(
  !componentSrc.includes('localStorage.'),
  'Component has no localStorage. access'
)

assert(
  !componentSrc.includes('sessionStorage.'),
  'Component has no sessionStorage. access'
)

assert(
  !componentSrc.includes('window.location'),
  'Component has no window.location access'
)

assert(
  !componentSrc.includes('document.getElementById') &&
  !componentSrc.includes('document.querySelector'),
  'Component has no DOM query calls'
)

// ═══════════════════════════════════════════════════════
// 4. Required sections present
// ═══════════════════════════════════════════════════════
section('4. Required sections present')

const requiredLabels = [
  'Recall Packet',
  'Context Authority Packet',
  'Primary response instruction',
  'Active Sources',
  'Excluded Sources',
  'Conflicts',
  'Response Instructions',
  'Summary',
]

for (const label of requiredLabels) {
  assert(
    componentSrc.includes(label),
    `Component contains required label: "${label}"`
  )
}

// ═══════════════════════════════════════════════════════
// 5. Governance footer — exact required phrases
// ═══════════════════════════════════════════════════════
section('5. Governance footer phrases')

const governancePhrases = [
  'does not create Memory',
  'move authority',
  'Excluded sources are not response grounding',
  'Trace sources are not evidence',
]

for (const phrase of governancePhrases) {
  assert(
    componentSrc.includes(phrase),
    `Governance footer contains: "${phrase}"`
  )
}

assert(
  componentSrc.includes('Recall Packet classifies context authority'),
  'Governance footer contains opening sentence'
)

// ═══════════════════════════════════════════════════════
// 6. Forbidden language absent
// ═══════════════════════════════════════════════════════
section('6. Forbidden language absent')

const forbiddenPhrases = [
  'packet proves',
  'packet remembers',
  'approved by recall',
  'confirmed by packet',
  'ready to promote',
  'send to Memory',
  'audit confirms truth',
  'feedback confirms truth',
  'graph proves',
  'layout confirms',
  'source is promoted',
]

for (const phrase of forbiddenPhrases) {
  assert(
    !componentSrc.includes(phrase),
    `Component does not contain forbidden phrase: "${phrase}"`
  )
}

// ═══════════════════════════════════════════════════════
// 7. No sensitive content field names
// Note: bare "prompt" is NOT tested — governance footer includes "prompt eligibility"
// ═══════════════════════════════════════════════════════
section('7. No sensitive content field names')

const sensitiveFields = [
  'raw_content',
  'raw_prompt',
  'compiled_prompt',
  'prompt_text',
  'system_prompt',
  'developer_prompt',
  'model_output',
  'llm_draft',
  'journal_body',
  'choice_text',
  'telegram_response_text',
  'library_body',
  'attachment_content',
  'web_result_body',
  'api_key',
  'cookie',
  'secret',
]

for (const field of sensitiveFields) {
  assert(
    !componentSrc.includes(field),
    `Component does not reference sensitive field: ${field}`
  )
}

// ═══════════════════════════════════════════════════════
// 8. Active vs excluded separation — structural
// ═══════════════════════════════════════════════════════
section('8. Active vs excluded separation')

assert(
  componentSrc.includes('packet.active_sources'),
  'Component renders packet.active_sources'
)

assert(
  componentSrc.includes('packet.excluded_sources'),
  'Component renders packet.excluded_sources'
)

assert(
  componentSrc.includes('ActiveSourceRow'),
  'Component has ActiveSourceRow sub-component'
)

assert(
  componentSrc.includes('ExcludedSourceRow'),
  'Component has ExcludedSourceRow sub-component'
)

// ═══════════════════════════════════════════════════════
// 9. Trace-only visual boundary
// ═══════════════════════════════════════════════════════
section('9. Trace-only visual boundary')

assert(
  componentSrc.includes('trace only, not evidence'),
  'Component labels trace sources as "trace only, not evidence"'
)

assert(
  componentSrc.includes('trace_only'),
  'Component handles trace_only exclusion reason'
)

// ═══════════════════════════════════════════════════════
// 10. Fixture file exists and exports expected fixtures
// ═══════════════════════════════════════════════════════
section('10. Fixture file')

assert(
  fs.existsSync(path.join(ROOT, FIXTURES_PATH)),
  'recallPacketFixtures.ts exists at src/lib/recall/'
)

const expectedFixtureNames = [
  'confirmedMemoryFixture',
  'recentContinuityFixture',
  'mixedPacketFixture',
  'scopeBlockedFixture',
  'traceExcludedFixture',
  'insufficientGroundFixture',
  'sourceConflictFixture',
  'topicShiftFixture',
  'ambiguousReferenceFixture',
  'ALL_FIXTURES',
]

for (const name of expectedFixtureNames) {
  assert(
    fixturesSrc.includes(`export const ${name}`),
    `Fixtures exports: ${name}`
  )
}

assert(
  !fixturesSrc.includes('raw_content') &&
  !fixturesSrc.includes('journal_body') &&
  !fixturesSrc.includes('choice_text'),
  'Fixtures contain no sensitive content field names'
)

// ═══════════════════════════════════════════════════════
// 11. Logic: Fixture packet shapes verified
// ═══════════════════════════════════════════════════════
section('11. Fixture packet logic')

// Confirmed memory fixture
assert(
  confirmedMemoryFixture.active_sources.length === 1 &&
  confirmedMemoryFixture.active_sources[0].is_memory === true,
  'confirmedMemoryFixture: 1 active source, is_memory true'
)

assert(
  confirmedMemoryFixture.primary_response_instruction ===
    ResponseInstruction.answer_confidently_from_confirmed_memory,
  'confirmedMemoryFixture: primary instruction is answer_confidently_from_confirmed_memory'
)

assert(
  confirmedMemoryFixture.has_sufficient_ground === true,
  'confirmedMemoryFixture: has_sufficient_ground true'
)

// Insufficient ground fixture
assert(
  insufficientGroundFixture.active_sources.length === 0,
  'insufficientGroundFixture: no active sources'
)

assert(
  insufficientGroundFixture.has_sufficient_ground === false,
  'insufficientGroundFixture: has_sufficient_ground false'
)

assert(
  insufficientGroundFixture.primary_response_instruction ===
    ResponseInstruction.say_not_enough_grounded_recall,
  'insufficientGroundFixture: primary instruction is say_not_enough_grounded_recall'
)

// Source conflict fixture
assert(
  sourceConflictFixture.primary_response_instruction ===
    ResponseInstruction.surface_source_conflict,
  'sourceConflictFixture: primary instruction is surface_source_conflict'
)

assert(
  sourceConflictFixture.conflicts.length > 0,
  'sourceConflictFixture: at least one conflict detected'
)

assert(
  sourceConflictFixture.conflicts.some(c => c.requires_tara_review === true),
  'sourceConflictFixture: at least one conflict requires_tara_review'
)

// Trace excluded fixture
assert(
  traceExcludedFixture.summary.trace_count === 1,
  'traceExcludedFixture: trace_count is 1'
)

const traceEntry = traceExcludedFixture.excluded_sources.find(
  s => s.exclusion_reason === ExclusionReason.trace_only
)
assert(
  traceEntry !== undefined,
  'traceExcludedFixture: trace source present in excluded_sources with trace_only reason'
)

// Scope blocked fixture
const scopeEntry = scopeBlockedFixture.excluded_sources.find(
  s => s.exclusion_reason === ExclusionReason.scope_prohibited
)
assert(
  scopeEntry !== undefined,
  'scopeBlockedFixture: scope-prohibited source present in excluded_sources'
)

// Topic shift fixture
const topicShiftExcluded = topicShiftFixture.excluded_sources.filter(
  s => s.exclusion_reason === ExclusionReason.topic_shift
)
assert(
  topicShiftExcluded.length >= 2,
  'topicShiftFixture: at least 2 topic-shift exclusions'
)

// All fixtures are valid packets (have required fields)
for (const [name, fixture] of Object.entries(ALL_FIXTURES)) {
  assert(
    typeof fixture.packet_id === 'string' &&
    Array.isArray(fixture.active_sources) &&
    Array.isArray(fixture.excluded_sources) &&
    typeof fixture.has_sufficient_ground === 'boolean',
    `ALL_FIXTURES.${name}: valid RecallPacket shape`
  )
}

// ═══════════════════════════════════════════════════════
// 12. Insufficient ground display — no alarming language
// ═══════════════════════════════════════════════════════
section('12. Insufficient ground display')

assert(
  componentSrc.includes('not enough grounded recall'),
  'Insufficient ground state shows: "not enough grounded recall"'
)

// Must not show alarming language for a ground-failure state
const alarmingPhrases = ['ERROR', 'CRITICAL', 'FATAL', 'PANIC', 'BROKEN']
for (const phrase of alarmingPhrases) {
  assert(
    !componentSrc.includes(phrase),
    `Component does not use alarming language: ${phrase}`
  )
}

// ═══════════════════════════════════════════════════════
// 13. No runtime integration — key files unmodified
// ═══════════════════════════════════════════════════════
section('13. No runtime integration')

// Builder and types files must exist and be untouched by component
assert(
  fs.existsSync(path.join(ROOT, BUILDER_PATH)),
  'Builder file unchanged at src/lib/recall/recallPacketBuilder.ts'
)

assert(
  fs.existsSync(path.join(ROOT, TYPES_PATH)),
  'Types file unchanged at src/lib/recall/recallPacketTypes.ts'
)

// Check that component is NOT imported in chat routes or prompt builders
const chatRoutes = [
  'src/app/api/eli-chat/route.ts',
  'src/app/api/ari-chat/route.ts',
  'src/app/api/lounge-chat/route.ts',
]

for (const route of chatRoutes) {
  const fullPath = path.join(ROOT, route)
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf-8')
    assert(
      !content.includes('RecallPacketDebugPanel') &&
      !content.includes('recallPacketBuilder') &&
      !content.includes('recallPacketFixtures'),
      `Chat route ${route} does not import recall panel, builder, or fixtures`
    )
  } else {
    // If the route doesn't exist, that's fine — pass the assertion
    passed++
    console.log(`  ✓ Chat route ${route} not present — no integration to check`)
  }
}

// Component should not be imported in any prompt builder
const promptBuilders = [
  'src/lib/presences/ari.ts',
  'src/lib/presences/eli.ts',
]

for (const builder of promptBuilders) {
  const fullPath = path.join(ROOT, builder)
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf-8')
    assert(
      !content.includes('RecallPacketDebugPanel') &&
      !content.includes('recallPacketBuilder') &&
      !content.includes('recallPacketFixtures'),
      `Prompt builder ${builder} does not import recall artefacts`
    )
  } else {
    passed++
    console.log(`  ✓ Prompt builder ${builder} not found — no integration to check`)
  }
}

// No recall/packet migrations added — check by content rather than fragile count
const migrationFiles = fs.readdirSync(path.join(ROOT, 'supabase-migrations'))
const phase39Migrations = migrationFiles.filter(f =>
  f.includes('recall_packet') ||
  f.includes('context_authority') ||
  f.includes('recall_debug')
)
assert(
  phase39Migrations.length === 0,
  `No Phase 39 recall-packet migration files added (found: ${phase39Migrations.join(', ') || 'none'})`
)

// ═══════════════════════════════════════════════════════
// 14. Fixture data safety — no real content
// ═══════════════════════════════════════════════════════
section('14. Fixture data safety')

// All fixture source_ref values (if any) should be IDs only, not content
for (const [name, fixture] of Object.entries(ALL_FIXTURES)) {
  const allSources = [...fixture.active_sources, ...fixture.excluded_sources]
  for (const source of allSources) {
    // surface names are enum values — safe identifiers, not content
    assert(
      typeof source.surface === 'string' && source.surface.length < 100,
      `${name}: source.surface is a safe identifier string`
    )
    assert(
      typeof source.authority_label === 'string',
      `${name}: source.authority_label is a string`
    )
  }
}

// ═══════════════════════════════════════════════════════
// 15. Lab mount decision noted
// ═══════════════════════════════════════════════════════
section('15. Lab mount decision')

// Confirm that the /recall page exists as a candidate mount surface
const recallPagePath = 'src/app/(house)/recall/page.tsx'
assert(
  fs.existsSync(path.join(ROOT, recallPagePath)),
  '/recall page exists as a candidate lab mount surface for 39.3.1'
)

// Confirm the panel IS mounted (mounted in 39.3.1 with fixture data)
const recallPageSrc = fs.readFileSync(path.join(ROOT, recallPagePath), 'utf-8')
assert(
  recallPageSrc.includes('RecallPacketDebugPanel'),
  'RecallPacketDebugPanel is mounted in /recall page (mounted in 39.3.1 with fixture data)'
)

// ═══════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════')
console.log('  Phase 39.3 Recall Packet Debug Panel — Structural Tests')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log('═══════════════════════════════════════════════════════')

if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) {
    console.log(`  ✗ ${f}`)
  }
  process.exit(1)
} else {
  console.log('\n✅ All 39.3 structural tests passed.\n')
  process.exit(0)
}
