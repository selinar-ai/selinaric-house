/**
 * Phase 39.4.1 Structural + Logic Tests — Adapter-Generated Recall Packet Preview
 *
 * Verifies that the /recall Recall Packet Inspector can display adapter-generated
 * packets built from metadata-only demo runtime signals, without live data,
 * DB reads, API calls, prompt integration, or behaviour changes.
 *
 * Testing note:
 *   Bare "prompt" is NOT tested as a forbidden string.
 *   The signal fixtures use prompt_eligible as a governance field.
 *   Sensitive content checks use specific field-name patterns.
 *
 * Run: npx tsx src/lib/__tests__/phase-39-4-1-adapter-generated-preview.test.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  inspectorDemoSignals,
  conflictSignals,
  insufficientSignals,
  topicShiftSignals,
  ALL_SIGNAL_FIXTURES,
} from '../recall/recallSignalFixtures'
import { buildRecallPacketFromRuntimeSignals } from '../recall/recallCandidateAdapter'
import { ExclusionReason, ResponseInstruction, RuntimeContextSignalType } from '../recall/recallPacketTypes'

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

const RECALL_PAGE_PATH    = 'src/app/(house)/recall/page.tsx'
const SIGNAL_FIXTURES_PATH = 'src/lib/recall/recallSignalFixtures.ts'

const pageSrc         = fs.readFileSync(path.join(ROOT, RECALL_PAGE_PATH), 'utf-8')
const signalFixSrc    = fs.readFileSync(path.join(ROOT, SIGNAL_FIXTURES_PATH), 'utf-8')

// ═══════════════════════════════════════════════════════
// 1. Signal fixture file exists and exports correctly
// ═══════════════════════════════════════════════════════
section('1. Signal fixture file')

assert(
  fs.existsSync(path.join(ROOT, SIGNAL_FIXTURES_PATH)),
  'recallSignalFixtures.ts exists'
)

const expectedExports = [
  'inspectorDemoSignals',
  'conflictSignals',
  'insufficientSignals',
  'topicShiftSignals',
  'ALL_SIGNAL_FIXTURES',
]

for (const name of expectedExports) {
  assert(
    signalFixSrc.includes(`export const ${name}`),
    `recallSignalFixtures exports: ${name}`
  )
}

// Signal fixtures are arrays
assert(Array.isArray(inspectorDemoSignals), 'inspectorDemoSignals is an array')
assert(Array.isArray(conflictSignals),      'conflictSignals is an array')
assert(Array.isArray(insufficientSignals),  'insufficientSignals is an array (may be empty)')
assert(Array.isArray(topicShiftSignals),    'topicShiftSignals is an array')

assert(inspectorDemoSignals.length > 0, 'inspectorDemoSignals is non-empty')
assert(conflictSignals.length > 0,      'conflictSignals is non-empty')
assert(insufficientSignals.length === 0, 'insufficientSignals is empty (intentional — insufficient ground demo)')
assert(topicShiftSignals.length > 0,    'topicShiftSignals is non-empty')

// ═══════════════════════════════════════════════════════
// 2. /recall page imports adapter and signal fixtures
// ═══════════════════════════════════════════════════════
section('2. /recall page imports')

assert(
  pageSrc.includes("import { buildRecallPacketFromRuntimeSignals } from '@/lib/recall/recallCandidateAdapter'"),
  '/recall page imports buildRecallPacketFromRuntimeSignals from recallCandidateAdapter'
)

assert(
  pageSrc.includes("from '@/lib/recall/recallSignalFixtures'"),
  '/recall page imports from recallSignalFixtures'
)

assert(
  pageSrc.includes('inspectorDemoSignals') &&
  pageSrc.includes('conflictSignals') &&
  pageSrc.includes('insufficientSignals') &&
  pageSrc.includes('topicShiftSignals'),
  '/recall page imports all four signal fixture arrays'
)

assert(
  pageSrc.includes('ADAPTER_DEMO_PACKETS'),
  '/recall page defines ADAPTER_DEMO_PACKETS constants'
)

assert(
  pageSrc.includes('DEMO_TIMESTAMP'),
  '/recall page uses static DEMO_TIMESTAMP (not Date.now)'
)

// ═══════════════════════════════════════════════════════
// 3. /recall does NOT import live recall or DB clients
// ═══════════════════════════════════════════════════════
section('3. No live data imports in /recall page')

const forbiddenImports = [
  "from '@supabase",
  "createClient()",
  "from '@/lib/archive-recall'",
  "from '@/lib/graph/'",
  "from 'openai'",
  "from '@anthropic-ai",
]

for (const imp of forbiddenImports) {
  assert(
    !pageSrc.includes(imp),
    `/recall page does not import: ${imp}`
  )
}

// Adapter import is allowed (debug lab preview) — verify it's the adapter, not raw builder
assert(
  !pageSrc.includes("from '@/lib/recall/recallPacketBuilder'"),
  '/recall page does not import recallPacketBuilder directly (uses adapter)'
)

// ═══════════════════════════════════════════════════════
// 4. No live data call patterns in adapter-preview constants
// ═══════════════════════════════════════════════════════
section('4. No live data patterns in adapter preview constants')

// Extract just the adapter-preview block (from DEMO_TIMESTAMP definition)
const adapterBlock = (() => {
  const start = pageSrc.indexOf('const DEMO_TIMESTAMP')
  const end   = pageSrc.indexOf('const DEFAULT_FILTERS')
  return (start >= 0 && end > start) ? pageSrc.slice(start, end) : ''
})()

assert(adapterBlock.length > 0, 'Adapter preview constants block found in page')

const liveDataPatterns: Array<[string, string]> = [
  ['fetch(',        'fetch( call'],
  ['await ',        'await expression'],
  ['async ',        'async keyword'],
  ['.from(',        '.from( Supabase call'],
  ['.select(',      '.select( Supabase call'],
  ['Date.now',      'Date.now call'],
  ['crypto.randomUUID', 'crypto.randomUUID call'],
  ['process.env.',  'process.env. access'],
]

for (const [pattern, label] of liveDataPatterns) {
  assert(
    !adapterBlock.includes(pattern),
    `Adapter preview constants do not contain ${label}`
  )
}

// ═══════════════════════════════════════════════════════
// 5. Required wording present in /recall page
// ═══════════════════════════════════════════════════════
section('5. Required wording in /recall page')

const requiredPhrases = [
  'Recall Packet Inspector',
  'Adapter-generated preview',
  'demo runtime signals',
  'No live recall',
  'No DB reads',
  'No prompt integration',
  'No authority movement',
  'Fixture-only preview',     // mode toggle label — 39.3.1 compatibility
]

for (const phrase of requiredPhrases) {
  assert(
    pageSrc.includes(phrase),
    `/recall page contains: "${phrase}"`
  )
}

// ═══════════════════════════════════════════════════════
// 6. Signal fixtures contain no sensitive content fields
// ═══════════════════════════════════════════════════════
section('6. Signal fixtures metadata-only — no sensitive content fields')

const sensitiveFields = [
  'raw_prompt',
  'compiled_prompt',
  'prompt_text',
  'system_prompt',
  'developer_prompt',
  'raw_content',
  'archive_text',
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

// Use colon-suffix pattern to check for field definitions rather than bare string presence.
// This avoids false positives when comment documentation mentions the field names
// (e.g. "No API keys, cookies, or secrets." in the file header comment).
for (const field of sensitiveFields) {
  assert(
    !signalFixSrc.includes(`${field}:`),
    `recallSignalFixtures does not define sensitive field: ${field}:`
  )
}

// Signal source_ref uses only safe fields (source_id, count)
assert(
  signalFixSrc.includes('source_id') || !signalFixSrc.includes('source_ref'),
  'Signal source_ref uses only safe source_id field'
)

// Fake IDs use the demo- prefix
assert(
  signalFixSrc.includes('demo-'),
  'Signal fixtures use demo- prefix for fake IDs'
)

// ═══════════════════════════════════════════════════════
// 7. Adapter-generated packets work — logic tests
// ═══════════════════════════════════════════════════════
section('7. Adapter-generated packets (logic)')

// inspectorDemoSignals → ari_room → Memory + continuity active, Eli journal excluded
{
  const packet = buildRecallPacketFromRuntimeSignals({
    packet_id:   'test-inspector-demo',
    computed_at: '2026-06-03T00:00:00.000Z',
    presence:    'ari',
    room:        'ari_room',
    signals:     inspectorDemoSignals,
  })

  assert(packet.active_sources.length > 0,  'inspectorDemoSignals: has active sources')
  assert(packet.excluded_sources.length > 0, 'inspectorDemoSignals: has excluded sources (Eli journal)')
  assert(packet.has_sufficient_ground,       'inspectorDemoSignals: has_sufficient_ground true')
  assert(packet.summary.memory_count >= 1,   'inspectorDemoSignals: memory_count >= 1')

  const totalClassified = packet.active_sources.length + packet.excluded_sources.length
  assert(
    totalClassified === inspectorDemoSignals.length,
    'inspectorDemoSignals: no candidate disappears'
  )

  const scopeBlocked = packet.excluded_sources.find(
    s => s.exclusion_reason === ExclusionReason.scope_prohibited
  )
  assert(
    scopeBlocked !== undefined,
    'inspectorDemoSignals: Eli-scoped journal excluded with scope_prohibited'
  )
}

// conflictSignals → conflict requiring Tara review
{
  const packet = buildRecallPacketFromRuntimeSignals({
    packet_id:   'test-conflict',
    computed_at: '2026-06-03T00:00:00.000Z',
    presence:    'ari',
    room:        'ari_room',
    signals:     conflictSignals,
  })

  assert(packet.conflicts.length > 0, 'conflictSignals: conflict detected')
  assert(
    packet.conflicts.some(c => c.requires_tara_review),
    'conflictSignals: conflict requires_tara_review true'
  )
  assert(
    packet.primary_response_instruction === ResponseInstruction.surface_source_conflict,
    'conflictSignals: primary instruction surface_source_conflict'
  )
}

// insufficientSignals → insufficient ground
{
  const packet = buildRecallPacketFromRuntimeSignals({
    packet_id:   'test-insufficient',
    computed_at: '2026-06-03T00:00:00.000Z',
    presence:    'ari',
    room:        'ari_room',
    signals:     insufficientSignals,
  })

  assert(!packet.has_sufficient_ground,                       'insufficientSignals: has_sufficient_ground false')
  assert(packet.active_sources.length === 0,                  'insufficientSignals: no active sources')
  assert(
    packet.primary_response_instruction === ResponseInstruction.say_not_enough_grounded_recall,
    'insufficientSignals: primary instruction say_not_enough_grounded_recall'
  )
}

// topicShiftSignals with topic_shift_detected → Memory survives, continuity excluded
{
  const packet = buildRecallPacketFromRuntimeSignals({
    packet_id:     'test-topic-shift',
    computed_at:   '2026-06-03T00:00:00.000Z',
    presence:      'ari',
    room:          'ari_room',
    query_context: { topic_shift_detected: true },
    signals:       topicShiftSignals,
  })

  assert(packet.has_sufficient_ground, 'topicShiftSignals: Memory keeps packet sufficient')
  assert(
    packet.active_sources.some(s => s.is_memory),
    'topicShiftSignals: confirmed Memory remains active through topic shift'
  )
  assert(
    packet.excluded_sources.some(s => s.exclusion_reason === ExclusionReason.topic_shift),
    'topicShiftSignals: short-horizon/recent continuity excluded with topic_shift'
  )
}

// ═══════════════════════════════════════════════════════
// 8. Both preview modes preserved in /recall page
// ═══════════════════════════════════════════════════════
section('8. Both modes preserved')

assert(
  pageSrc.includes('previewMode') && pageSrc.includes("'adapter'") && pageSrc.includes("'fixture'"),
  '/recall page has previewMode state with adapter and fixture values'
)

assert(
  pageSrc.includes("previewMode === 'adapter'") || pageSrc.includes('previewMode === \'adapter\''),
  '/recall page renders adapter mode section'
)

assert(
  pageSrc.includes("previewMode === 'fixture'") || pageSrc.includes('previewMode === \'fixture\''),
  '/recall page renders fixture mode section'
)

// Static fixture mode is still operational
assert(
  pageSrc.includes('RECALL_INSPECTOR_FIXTURES[selectedFixture]'),
  'Fixture mode still uses RECALL_INSPECTOR_FIXTURES — static fixtures preserved'
)

// ═══════════════════════════════════════════════════════
// 9. ALL_SIGNAL_FIXTURES — all arrays present at runtime
// ═══════════════════════════════════════════════════════
section('9. ALL_SIGNAL_FIXTURES completeness')

for (const [name, fixture] of Object.entries(ALL_SIGNAL_FIXTURES)) {
  assert(
    Array.isArray(fixture),
    `ALL_SIGNAL_FIXTURES.${name} is an array`
  )
}

// All signal_types in inspectorDemoSignals are valid enum values
for (const signal of inspectorDemoSignals) {
  assert(
    Object.values(RuntimeContextSignalType).includes(signal.signal_type),
    `inspectorDemoSignal signal_type is a valid RuntimeContextSignalType: ${signal.signal_type}`
  )
}

// ═══════════════════════════════════════════════════════
// 10. No prompt builder / chat route / DB files modified
// ═══════════════════════════════════════════════════════
section('10. No prompt builders, chat routes, or DB files modified')

const protectedPaths = [
  { path: 'src/lib/presences/ari.ts',              name: 'ari.ts prompt builder' },
  { path: 'src/lib/presences/eli.ts',              name: 'eli.ts prompt builder' },
  { path: 'src/app/api/eli-chat/route.ts',         name: 'eli-chat route' },
  { path: 'src/app/api/ari-chat/route.ts',         name: 'ari-chat route' },
  { path: 'src/app/api/lounge-chat/route.ts',      name: 'lounge-chat route' },
  { path: 'src/components/recall/RecallPacketDebugPanel.tsx', name: 'RecallPacketDebugPanel' },
]

for (const file of protectedPaths) {
  const fullPath = path.join(ROOT, file.path)
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf-8')
    assert(
      !content.includes('recallSignalFixtures') &&
      !content.includes('inspectorDemoSignals') &&
      !content.includes('buildRecallPacketFromRuntimeSignals'),
      `${file.name} does not import signal fixtures or adapter`
    )
  } else {
    passed++
    console.log(`  ✓ ${file.name} not present — no integration to check`)
  }
}

const migrationFiles  = fs.readdirSync(path.join(ROOT, 'supabase-migrations'))
const signalMigrations = migrationFiles.filter(f =>
  f.includes('recall_signal') || f.includes('adapter_preview')
)
assert(
  signalMigrations.length === 0,
  `No signal/adapter-preview migrations added (found: ${signalMigrations.join(', ') || 'none'})`
)

// ═══════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════')
console.log('  Phase 39.4.1 Adapter-Generated Preview Tests')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log('═══════════════════════════════════════════════════════')

if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
} else {
  console.log('\n✅ All 39.4.1 adapter-generated preview tests passed.\n')
  process.exit(0)
}
