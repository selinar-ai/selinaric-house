/**
 * Phase 39.4 Structural + Logic Tests — Runtime Candidate Adapter
 *
 * Validates the adapter's signal mapping, metadata pass-through, builder
 * delegation, and purity guarantees.
 *
 * Testing note:
 *   Bare "prompt" is NOT tested as a forbidden string — the adapter uses the
 *   governance field prompt_eligible. Sensitive content checks use specific
 *   field-name patterns: raw_prompt, compiled_prompt, prompt_text, etc.
 *
 * Run: npx tsx src/lib/__tests__/phase-39-4-recall-candidate-adapter.test.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  mapRuntimeContextSignalsToCandidates,
  buildRecallPacketFromRuntimeSignals,
  SIGNAL_TO_SURFACE,
} from '../recall/recallCandidateAdapter'
import {
  RuntimeContextSignalType,
  RuntimeContextSignal,
  SourceSurface,
  ExclusionReason,
  ResponseInstruction,
  ConflictType,
} from '../recall/recallPacketTypes'

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

const ADAPTER_PATH = 'src/lib/recall/recallCandidateAdapter.ts'
const TYPES_PATH   = 'src/lib/recall/recallPacketTypes.ts'
const adapterSrc   = readFile(ADAPTER_PATH)
const typesSrc     = readFile(TYPES_PATH)

// ═══════════════════════════════════════════════════════
// 1. File exists and exports
// ═══════════════════════════════════════════════════════
section('1. File exists and exports')

assert(
  fs.existsSync(path.join(ROOT, ADAPTER_PATH)),
  'recallCandidateAdapter.ts exists at src/lib/recall/'
)

assert(
  adapterSrc.includes('export function mapRuntimeContextSignalsToCandidates'),
  'mapRuntimeContextSignalsToCandidates is exported'
)

assert(
  adapterSrc.includes('export function buildRecallPacketFromRuntimeSignals'),
  'buildRecallPacketFromRuntimeSignals is exported'
)

assert(
  adapterSrc.includes('export const SIGNAL_TO_SURFACE'),
  'SIGNAL_TO_SURFACE mapping constant is exported'
)

assert(
  typesSrc.includes('export enum RuntimeContextSignalType'),
  'RuntimeContextSignalType is exported from recallPacketTypes'
)

assert(
  typesSrc.includes('export type RuntimeContextSignal'),
  'RuntimeContextSignal is exported from recallPacketTypes'
)

assert(
  typesSrc.includes('export type RuntimeRecallPacketInput'),
  'RuntimeRecallPacketInput is exported from recallPacketTypes'
)

// ═══════════════════════════════════════════════════════
// 2. Signal enum completeness — 22 signal types
// ═══════════════════════════════════════════════════════
section('2. RuntimeContextSignalType enum completeness (22 values)')

const expectedSignalTypes = [
  // Memory tier (4)
  'GovernedConfirmedMemory',
  'PresenceScopedConfirmedMemory',
  'ManualMemoryCandidateRecall',
  'ManualArchiveOnlyRecall',
  // Continuity tier (6)
  'RecentContinuity',
  'CurrentHouseContext',
  'ShortHorizonThreadContext',
  'LoungeRecentContinuity',
  'RecentCrossRoomContext',
  'CrossRoomPromptCarryforward',
  // Presence state tier (4)
  'PulseAutonomousContinuity',
  'PulseCurrentState',
  'LivingState',
  'InteriorNotes',
  // Inner continuity tier (2)
  'JournalInnerContinuity',
  'HeldTruthPresenceContinuity',
  // Reference tier (3)
  'LibraryRagReference',
  'LibraryCanonicalMemoryReference',
  'AttachmentContext',
  // Identity tier (1)
  'IdentityTimeline',
  // Ground failure (2)
  'Unknown',
  'Insufficient',
]

assert(
  expectedSignalTypes.length === 22,
  'Expected signal type list has exactly 22 entries'
)

for (const signalName of expectedSignalTypes) {
  assert(
    typesSrc.includes(`${signalName} `),
    `RuntimeContextSignalType.${signalName} is defined`
  )
}

// ═══════════════════════════════════════════════════════
// 3. Signal → SourceSurface mapping (structural + logic)
// ═══════════════════════════════════════════════════════
section('3. Signal → SourceSurface mapping')

// Structural: SIGNAL_TO_SURFACE covers all 22 signal types
assert(
  adapterSrc.includes('SIGNAL_TO_SURFACE'),
  'SIGNAL_TO_SURFACE mapping exists in adapter'
)

// Logic: spot-check key mappings
const keyMappings: Array<[RuntimeContextSignalType, SourceSurface, string]> = [
  [RuntimeContextSignalType.GovernedConfirmedMemory,          SourceSurface.confirmed_archive_memory,          'GovernedConfirmedMemory → confirmed_archive_memory'],
  [RuntimeContextSignalType.PresenceScopedConfirmedMemory,    SourceSurface.presence_scoped_confirmed_memory,  'PresenceScopedConfirmedMemory → presence_scoped_confirmed_memory'],
  [RuntimeContextSignalType.ManualMemoryCandidateRecall,      SourceSurface.memory_candidate,                  'ManualMemoryCandidateRecall → memory_candidate'],
  [RuntimeContextSignalType.ManualArchiveOnlyRecall,          SourceSurface.archive_only_context,              'ManualArchiveOnlyRecall → archive_only_context'],
  [RuntimeContextSignalType.RecentContinuity,                 SourceSurface.recent_continuity_not_memory,      'RecentContinuity → recent_continuity_not_memory'],
  [RuntimeContextSignalType.ShortHorizonThreadContext,        SourceSurface.short_horizon_thread_context,      'ShortHorizonThreadContext → short_horizon_thread_context'],
  [RuntimeContextSignalType.JournalInnerContinuity,           SourceSurface.journal_inner_continuity,          'JournalInnerContinuity → journal_inner_continuity'],
  [RuntimeContextSignalType.HeldTruthPresenceContinuity,      SourceSurface.held_truth_presence_continuity,    'HeldTruthPresenceContinuity → held_truth_presence_continuity'],
  [RuntimeContextSignalType.LibraryRagReference,              SourceSurface.library_rag_reference,             'LibraryRagReference → library_rag_reference'],
  [RuntimeContextSignalType.LibraryCanonicalMemoryReference,  SourceSurface.library_canonical_memory_reference,'LibraryCanonicalMemoryReference → library_canonical_memory_reference'],
  [RuntimeContextSignalType.AttachmentContext,                SourceSurface.attachment_context,                'AttachmentContext → attachment_context'],
  [RuntimeContextSignalType.IdentityTimeline,                 SourceSurface.identity_timeline,                 'IdentityTimeline → identity_timeline'],
  [RuntimeContextSignalType.PulseAutonomousContinuity,        SourceSurface.pulse_autonomous_continuity,       'PulseAutonomousContinuity → pulse_autonomous_continuity'],
  [RuntimeContextSignalType.LivingState,                      SourceSurface.living_state,                      'LivingState → living_state'],
  [RuntimeContextSignalType.Unknown,                          SourceSurface.unknown,                           'Unknown → unknown'],
  [RuntimeContextSignalType.Insufficient,                     SourceSurface.insufficient,                      'Insufficient → insufficient'],
]

for (const [signalType, expectedSurface, label] of keyMappings) {
  assert(SIGNAL_TO_SURFACE[signalType] === expectedSurface, label)
}

// All 22 signal types are present in SIGNAL_TO_SURFACE at runtime
const allSignalTypes = Object.values(RuntimeContextSignalType)
assert(
  allSignalTypes.length === 22,
  'RuntimeContextSignalType has 22 enum values'
)

for (const st of allSignalTypes) {
  assert(
    SIGNAL_TO_SURFACE[st] !== undefined,
    `SIGNAL_TO_SURFACE covers RuntimeContextSignalType.${st}`
  )
}

// ═══════════════════════════════════════════════════════
// 4. Metadata pass-through
// ═══════════════════════════════════════════════════════
section('4. Metadata pass-through')

{
  const signal: RuntimeContextSignal = {
    signal_type:     RuntimeContextSignalType.GovernedConfirmedMemory,
    presence_scope:  'shared',
    prompt_eligible: true,
    expired:         false,
    relevance:       'strong',
    source_ref:      { source_id: 'abc-123', count: 1 },
    conflicts_with:  [SourceSurface.held_truth_presence_continuity],
    conflict_types:  [ConflictType.confirmed_memory_vs_held_truth],
  }

  const candidates = mapRuntimeContextSignalsToCandidates([signal])

  assert(candidates.length === 1, 'One signal produces one candidate')

  const c = candidates[0]
  assert(c.surface         === SourceSurface.confirmed_archive_memory, 'surface mapped correctly')
  assert(c.presence_scope  === 'shared',                               'presence_scope passed through')
  assert(c.prompt_eligible === true,                                   'prompt_eligible passed through')
  assert(c.expired         === false,                                  'expired passed through')
  assert(c.relevance       === 'strong',                               'relevance passed through')
  assert(c.source_ref?.source_id === 'abc-123',                        'source_ref.source_id passed through')
  assert(c.source_ref?.count === 1,                                    'source_ref.count passed through')
  assert(
    c.conflicts_with?.[0] === SourceSurface.held_truth_presence_continuity,
    'conflicts_with passed through'
  )
  assert(
    c.conflict_types?.[0] === ConflictType.confirmed_memory_vs_held_truth,
    'conflict_types passed through'
  )
}

// Undefined metadata fields are not invented
{
  const minimal: RuntimeContextSignal = {
    signal_type: RuntimeContextSignalType.RecentContinuity,
  }
  const candidates = mapRuntimeContextSignalsToCandidates([minimal])
  const c = candidates[0]

  assert(c.presence_scope  === undefined, 'presence_scope not invented when absent')
  assert(c.prompt_eligible === undefined, 'prompt_eligible not invented when absent')
  assert(c.expired         === undefined, 'expired not invented when absent')
  assert(c.relevance       === undefined, 'relevance not invented when absent')
  assert(c.source_ref      === undefined, 'source_ref not invented when absent')
  assert(c.conflicts_with  === undefined, 'conflicts_with not invented when absent')
  assert(c.conflict_types  === undefined, 'conflict_types not invented when absent')
}

// ═══════════════════════════════════════════════════════
// 5. No sensitive content field names
// Note: bare "prompt" is NOT checked — prompt_eligible is a valid governance field.
// ═══════════════════════════════════════════════════════
section('5. No sensitive content field names')

const sensitiveFieldNames = [
  'raw_prompt',
  'compiled_prompt',
  'prompt_text',
  'system_prompt',
  'developer_prompt',
  'raw_content',
  'raw_text',
  'archive_text',
  'archive_excerpt',
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

for (const field of sensitiveFieldNames) {
  assert(
    !adapterSrc.includes(field),
    `Adapter does not reference sensitive field: ${field}`
  )
}

// Also check the new types added to recallPacketTypes.ts
const runtimeTypeBlock = (() => {
  const start = typesSrc.indexOf('RUNTIME ADAPTER TYPES')
  return start >= 0 ? typesSrc.slice(start) : ''
})()

for (const field of sensitiveFieldNames) {
  assert(
    !runtimeTypeBlock.includes(field),
    `Runtime adapter types do not define sensitive field: ${field}`
  )
}

// ═══════════════════════════════════════════════════════
// 6. Pure function safety (structural)
// ═══════════════════════════════════════════════════════
section('6. Pure function safety')

const purityChecks: Array<[string, string]> = [
  ['fetch(',            'fetch( call'],
  ["from '@supabase",   "import from '@supabase'"],
  ["createClient()",    'createClient() call-site'],
  ['process.env.',      'process.env. access'],
  ['Date.now()',        'Date.now() call'],
  ['crypto.randomUUID()', 'crypto.randomUUID() call'],
  ["from 'openai'",    "import from 'openai'"],
  ["from '@anthropic-ai", "import from '@anthropic-ai'"],
  ['localStorage.',     'localStorage. access'],
  ['sessionStorage.',   'sessionStorage. access'],
  ['window.',           'window. property access'],
  ['document.getElementById', 'document DOM call'],
]

for (const [pattern, label] of purityChecks) {
  assert(
    !adapterSrc.includes(pattern),
    `Adapter does not contain ${label}`
  )
}

// ═══════════════════════════════════════════════════════
// 7. No async
// ═══════════════════════════════════════════════════════
section('7. No async — pure synchronous only')

assert(
  !adapterSrc.includes('async function') && !adapterSrc.includes('async ('),
  'Adapter has no async functions'
)

assert(
  !adapterSrc.includes('Promise<'),
  'Adapter returns no Promises'
)

assert(
  !adapterSrc.includes('await '),
  'Adapter has no await expressions'
)

// ═══════════════════════════════════════════════════════
// 8. Convenience builder — returns valid RecallPacket
// ═══════════════════════════════════════════════════════
section('8. buildRecallPacketFromRuntimeSignals — valid RecallPacket')

{
  const packet = buildRecallPacketFromRuntimeSignals({
    packet_id:   'test-adapter-basic',
    computed_at: '2026-06-03T00:00:00Z',
    presence:    'ari',
    room:        'ari_room',
    signals: [
      {
        signal_type:    RuntimeContextSignalType.GovernedConfirmedMemory,
        presence_scope: 'shared',
        relevance:      'strong',
      },
    ],
  })

  assert(typeof packet.packet_id === 'string',                  'Packet has packet_id')
  assert(Array.isArray(packet.active_sources),                  'Packet has active_sources array')
  assert(Array.isArray(packet.excluded_sources),                'Packet has excluded_sources array')
  assert(typeof packet.has_sufficient_ground === 'boolean',     'Packet has has_sufficient_ground')
  assert(packet.active_sources.length === 1,                    'One signal → one active source')
  assert(packet.active_sources[0].is_memory === true,           'GovernedConfirmedMemory → is_memory true')
  assert(
    packet.primary_response_instruction ===
      ResponseInstruction.answer_confidently_from_confirmed_memory,
    'Primary instruction: answer_confidently_from_confirmed_memory'
  )
}

// Multiple signals → all classified
{
  const packet = buildRecallPacketFromRuntimeSignals({
    packet_id:   'test-adapter-multi',
    computed_at: '2026-06-03T00:00:00Z',
    presence:    'ari',
    room:        'ari_room',
    signals: [
      { signal_type: RuntimeContextSignalType.GovernedConfirmedMemory,    presence_scope: 'shared', relevance: 'strong' },
      { signal_type: RuntimeContextSignalType.RecentContinuity,           presence_scope: 'ari',    relevance: 'medium' },
      { signal_type: RuntimeContextSignalType.LibraryRagReference,        presence_scope: 'shared', relevance: 'weak'   },
    ],
  })

  const total = packet.active_sources.length + packet.excluded_sources.length
  assert(total === 3, 'Three signals → three classified sources (no disappearance)')
  assert(packet.active_sources.length === 3, 'All three pass gates → active')
  assert(packet.summary.memory_count === 1,      'memory_count: 1')
  assert(packet.summary.continuity_count === 1,  'continuity_count: 1')
}

// ═══════════════════════════════════════════════════════
// 9. Scope gating delegated to builder
// ═══════════════════════════════════════════════════════
section('9. Scope delegation — Eli journal in Ari room')

{
  const packet = buildRecallPacketFromRuntimeSignals({
    packet_id:   'test-scope-delegation',
    computed_at: '2026-06-03T00:00:00Z',
    presence:    'ari',
    room:        'ari_room',
    signals: [
      {
        signal_type:    RuntimeContextSignalType.JournalInnerContinuity,
        presence_scope: 'eli',  // wrong scope for ari_room
        relevance:      'strong',
      },
    ],
  })

  assert(packet.active_sources.length === 0,   'No active sources — Eli journal blocked in Ari room')
  assert(packet.excluded_sources.length === 1, 'One excluded source')
  assert(
    packet.excluded_sources[0]?.exclusion_reason === ExclusionReason.scope_prohibited,
    'Exclusion reason: scope_prohibited (delegated to builder)'
  )
}

// ═══════════════════════════════════════════════════════
// 10. Topic shift delegated to builder
// ═══════════════════════════════════════════════════════
section('10. Topic shift delegation')

{
  const packet = buildRecallPacketFromRuntimeSignals({
    packet_id:     'test-topic-shift',
    computed_at:   '2026-06-03T00:00:00Z',
    presence:      'ari',
    room:          'ari_room',
    query_context: { topic_shift_detected: true },
    signals: [
      {
        signal_type: RuntimeContextSignalType.ShortHorizonThreadContext,
        relevance:   'strong',
      },
    ],
  })

  assert(packet.active_sources.length === 0,   'No active sources after topic shift')
  assert(packet.excluded_sources.length === 1, 'One excluded source')
  assert(
    packet.excluded_sources[0]?.exclusion_reason === ExclusionReason.topic_shift,
    'Exclusion reason: topic_shift (delegated to builder)'
  )
}

// ═══════════════════════════════════════════════════════
// 11. Insufficient ground — empty signals
// ═══════════════════════════════════════════════════════
section('11. Insufficient ground (empty signals)')

{
  const packet = buildRecallPacketFromRuntimeSignals({
    packet_id:   'test-insufficient',
    computed_at: '2026-06-03T00:00:00Z',
    presence:    'ari',
    room:        'ari_room',
    signals:     [],
  })

  assert(packet.has_sufficient_ground === false,         'has_sufficient_ground false for empty signals')
  assert(packet.active_sources.length === 0,             'No active sources')
  assert(
    packet.primary_response_instruction === ResponseInstruction.say_not_enough_grounded_recall,
    'Primary instruction: say_not_enough_grounded_recall'
  )
}

// ═══════════════════════════════════════════════════════
// 12. Ambiguous reference passes through
// ═══════════════════════════════════════════════════════
section('12. Ambiguous reference delegation')

{
  const packet = buildRecallPacketFromRuntimeSignals({
    packet_id:     'test-ambiguous',
    computed_at:   '2026-06-03T00:00:00Z',
    presence:      'ari',
    room:          'ari_room',
    query_context: { reference_ambiguous: true },
    signals: [
      { signal_type: RuntimeContextSignalType.RecentContinuity,    presence_scope: 'ari',    relevance: 'medium' },
      { signal_type: RuntimeContextSignalType.LibraryRagReference, presence_scope: 'shared', relevance: 'medium' },
    ],
  })

  assert(
    packet.primary_response_instruction === ResponseInstruction.ask_clarifying_question,
    'Ambiguous reference → ask_clarifying_question (delegated to builder)'
  )
}

// ═══════════════════════════════════════════════════════
// 13. Relevance none → excluded
// ═══════════════════════════════════════════════════════
section('13. Relevance none passes through to builder')

{
  const packet = buildRecallPacketFromRuntimeSignals({
    packet_id:   'test-relevance-none',
    computed_at: '2026-06-03T00:00:00Z',
    presence:    'ari',
    room:        'ari_room',
    signals: [
      {
        signal_type:    RuntimeContextSignalType.GovernedConfirmedMemory,
        presence_scope: 'shared',
        relevance:      'none',
      },
    ],
  })

  assert(packet.active_sources.length === 0, 'relevance:none → not active')
  assert(
    packet.excluded_sources[0]?.exclusion_reason === ExclusionReason.relevance_too_weak,
    'relevance:none → relevance_too_weak (passed through adapter, evaluated by builder)'
  )
}

// ═══════════════════════════════════════════════════════
// 14. Caller-provided conflict metadata passed through
// ═══════════════════════════════════════════════════════
section('14. Caller-provided conflict metadata')

{
  const packet = buildRecallPacketFromRuntimeSignals({
    packet_id:   'test-conflict',
    computed_at: '2026-06-03T00:00:00Z',
    presence:    'ari',
    room:        'ari_room',
    signals: [
      {
        signal_type:     RuntimeContextSignalType.GovernedConfirmedMemory,
        presence_scope:  'shared',
        relevance:       'strong',
        conflict_types:  [ConflictType.confirmed_memory_vs_held_truth],
        conflicts_with:  [SourceSurface.held_truth_presence_continuity],
      },
      {
        signal_type:    RuntimeContextSignalType.HeldTruthPresenceContinuity,
        presence_scope: 'ari',
        relevance:      'strong',
      },
    ],
  })

  const conflict = packet.conflicts.find(
    c => c.conflict_type === ConflictType.confirmed_memory_vs_held_truth
  )
  assert(conflict !== undefined,              'Conflict created from caller-provided conflict_types')
  assert(conflict?.requires_tara_review === true, 'Conflict requires_tara_review: true')
  assert(
    packet.primary_response_instruction === ResponseInstruction.surface_source_conflict,
    'Primary instruction escalated to surface_source_conflict'
  )
}

// ═══════════════════════════════════════════════════════
// 15. No runtime integration — protected files unchanged
// ═══════════════════════════════════════════════════════
section('15. No runtime integration')

// Note: /recall page is excluded from this list — Phase 39.4.1 explicitly
// mounts the adapter there for debug/lab preview using demo signals only.
// The important protection targets are prompt builders and live chat routes.
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
      !content.includes('recallCandidateAdapter') &&
      !content.includes('mapRuntimeContextSignalsToCandidates') &&
      !content.includes('buildRecallPacketFromRuntimeSignals') &&
      !content.includes('RuntimeContextSignalType'),
      `${file.name} does not import adapter or signal types`
    )
  } else {
    passed++
    console.log(`  ✓ ${file.name} not present — no integration to check`)
  }
}

// No new migrations added
const migrationFiles = fs.readdirSync(path.join(ROOT, 'supabase-migrations'))
const adapterMigrations = migrationFiles.filter(f =>
  f.includes('recall_candidate') || f.includes('runtime_signal')
)
assert(
  adapterMigrations.length === 0,
  `No adapter migrations added (found: ${adapterMigrations.join(', ') || 'none'})`
)

// ═══════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════')
console.log('  Phase 39.4 Runtime Candidate Adapter Tests')
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
  console.log('\n✅ All 39.4 adapter tests passed.\n')
  process.exit(0)
}
