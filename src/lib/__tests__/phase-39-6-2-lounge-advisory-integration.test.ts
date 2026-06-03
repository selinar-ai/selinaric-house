/**
 * Phase 39.6.2 Structural + Logic Tests — Lounge Advisory Integration
 *
 * Verifies:
 *   - Lounge route imports advisory builder/formatter
 *   - Advisory is built per-presence inside the loop (not globally)
 *   - Advisory uses room: 'lounge'
 *   - Advisory receives only shared-safe Tier 1 sources
 *   - Excluded sources (journal, recentContinuity, governedMemory, carryforwards) not passed
 *   - Scope gate blocks presence-scoped memory in Lounge advisory
 *   - Advisory is non-fatal (try/catch)
 *   - No new DB writes / migrations / API endpoints
 *   - Ari/Eli routes unchanged
 *   - RecallAdvisorySignalInput.room now accepts RoomContext (not just ari_room/eli_room)
 *
 * Run: npx tsx src/lib/__tests__/phase-39-6-2-lounge-advisory-integration.test.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { buildRecallAdvisoryPacket } from '../recall/recallAdvisorySignals'
import { formatRecallAdvisoryBlock } from '../recall/recallAdvisoryBlock'
import { ExclusionReason, ResponseInstruction, SourceSurface } from '../recall/recallPacketTypes'

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

const LOUNGE_ROUTE   = 'src/app/api/lounge-chat/route.ts'
const ARI_ROUTE      = 'src/app/api/ari-chat/route.ts'
const ELI_ROUTE      = 'src/app/api/eli-chat/route.ts'
const SIGNALS_PATH   = 'src/lib/recall/recallAdvisorySignals.ts'

const loungeSrc  = fs.readFileSync(path.join(ROOT, LOUNGE_ROUTE), 'utf-8')
const ariSrc     = fs.readFileSync(path.join(ROOT, ARI_ROUTE), 'utf-8')
const eliSrc     = fs.readFileSync(path.join(ROOT, ELI_ROUTE), 'utf-8')
const signalsSrc = fs.readFileSync(path.join(ROOT, SIGNALS_PATH), 'utf-8')

// ═══════════════════════════════════════════════════════
// 1. RecallAdvisorySignalInput.room accepts RoomContext
// ═══════════════════════════════════════════════════════
section('1. RecallAdvisorySignalInput.room accepts RoomContext')

assert(
  signalsSrc.includes("import type { RoomContext }") ||
  signalsSrc.includes("type RoomContext,"),
  'recallAdvisorySignals.ts imports RoomContext type'
)

assert(
  !signalsSrc.includes("room: 'ari_room' | 'eli_room'"),
  'room type is no longer narrowed to ari_room | eli_room only'
)

assert(
  signalsSrc.includes('room: RoomContext'),
  'RecallAdvisorySignalInput.room is typed as RoomContext'
)

// ═══════════════════════════════════════════════════════
// 2. Lounge route imports advisory functions
// ═══════════════════════════════════════════════════════
section('2. Lounge route imports advisory functions')

assert(
  loungeSrc.includes('buildRecallAdvisoryPacket'),
  'Lounge route imports buildRecallAdvisoryPacket'
)

assert(
  loungeSrc.includes('formatRecallAdvisoryBlock'),
  'Lounge route imports formatRecallAdvisoryBlock'
)

assert(
  loungeSrc.includes("from '@/lib/recall/recallAdvisorySignals'"),
  'Lounge route imports from recallAdvisorySignals'
)

assert(
  loungeSrc.includes("from '@/lib/recall/recallAdvisoryBlock'"),
  'Lounge route imports from recallAdvisoryBlock'
)

// ═══════════════════════════════════════════════════════
// 3. Advisory is inside per-presence loop
// ═══════════════════════════════════════════════════════
section('3. Advisory inside per-presence loop')

// The packet_id includes presenceId — this can only be set inside the loop
assert(
  loungeSrc.includes('`advisory:${presenceId}:lounge:'),
  'Advisory packet_id contains presenceId (proves it is inside the per-presence loop)'
)

assert(
  loungeSrc.includes("room:                 'lounge'") ||
  loungeSrc.includes("room: 'lounge'"),
  'Advisory uses room: lounge'
)

// ═══════════════════════════════════════════════════════
// 4. Advisory receives shared-safe Tier 1 sources only
// ═══════════════════════════════════════════════════════
section('4. Advisory receives shared-safe Tier 1 sources only')

// Extract just the buildRecallAdvisoryPacket({...}) call arguments.
// Using the call object literal rather than a broad block avoids false positives
// from comments and adjacent code that mention excluded variable names.
const buildCallStart = loungeSrc.indexOf('buildRecallAdvisoryPacket({')
const buildCallEnd   = loungeSrc.indexOf('\n        })', buildCallStart)
const advisoryCallArgs = buildCallStart >= 0 && buildCallEnd > buildCallStart
  ? loungeSrc.slice(buildCallStart, buildCallEnd + 12)
  : ''

// Also extract broader advisory block for non-content checks
const advisoryBlockStart = loungeSrc.indexOf('Phase 39.6.2: Recall Packet Advisory')
const advisoryBlockEnd   = loungeSrc.indexOf('const fullSystemPrompt =', advisoryBlockStart)
const advisoryBlock = advisoryBlockStart >= 0 && advisoryBlockEnd > advisoryBlockStart
  ? loungeSrc.slice(advisoryBlockStart, advisoryBlockEnd)
  : ''

assert(advisoryBlock.length > 0, 'Advisory block extracted from Lounge route')
assert(advisoryCallArgs.length > 0, 'buildRecallAdvisoryPacket call arguments extracted')

assert(
  advisoryCallArgs.includes('archiveRecallEntries: recallEntries'),
  'Advisory receives archiveRecallEntries (shared-safe archive recall)'
)

assert(
  advisoryCallArgs.includes('libraryReferences'),
  'Advisory receives libraryReferences (lounge-allowed library context)'
)

// ═══════════════════════════════════════════════════════
// 5. Excluded sources NOT passed to advisory
// ═══════════════════════════════════════════════════════
section('5. Excluded sources NOT passed to advisory builder')

// Check the advisory builder call — these should NOT appear as arguments
const forbiddenAdvisoryArgs = [
  'journalReferences',
  'journalContextReferences',
  'recentContinuity',
  'governedMemory',
  'crossRoomCarryforwards',
  'livingStateBlock',
  'identityTimeline',
  'heldTruths',
  'interiorNotes',
  'attachmentContextBlock',
  'autonomyContinuityBlock',
]

for (const arg of forbiddenAdvisoryArgs) {
  // Check specifically within the buildRecallAdvisoryPacket call arguments
  // (not the broader advisory block, to avoid false positives from comments)
  assert(
    !advisoryCallArgs.includes(`${arg}:`),
    `Advisory builder call does NOT receive excluded source as argument: ${arg}:`
  )
}

// ═══════════════════════════════════════════════════════
// 6. recallEntries hoisted to outer scope
// ═══════════════════════════════════════════════════════
section('6. recallEntries hoisted to outer scope for advisory access')

assert(
  loungeSrc.includes('let recallEntries: RecallEntry[] = []'),
  'recallEntries is declared in outer scope (hoisted from inner if-block)'
)

// ═══════════════════════════════════════════════════════
// 7. Advisory block inserted into fullSystemPrompt
// ═══════════════════════════════════════════════════════
section('7. Advisory block inserted into fullSystemPrompt')

assert(
  loungeSrc.includes('livingStateBlock + autonomyContinuityBlock + recallAdvisoryBlock'),
  'recallAdvisoryBlock appended to fullSystemPrompt after livingStateBlock + autonomyContinuityBlock'
)

// ═══════════════════════════════════════════════════════
// 8. Advisory is non-fatal
// ═══════════════════════════════════════════════════════
section('8. Non-fatal error handling')

assert(
  loungeSrc.includes('Advisory is non-fatal'),
  'Lounge advisory has non-fatal comment'
)

assert(
  advisoryBlock.includes('try {'),
  'Advisory computation is in a try block'
)

assert(
  advisoryBlock.includes('} catch (err)'),
  'Advisory has a catch block'
)

// ═══════════════════════════════════════════════════════
// 9. Scope gate logic — Lounge advisory (logic tests)
// ═══════════════════════════════════════════════════════
section('9. Scope gate — Lounge advisory (logic)')

// 9a: shared archive recall passes scope gate for lounge
{
  const packet = buildRecallAdvisoryPacket({
    presence:             'ari',
    room:                 'lounge',
    packet_id:            'test-lounge-shared',
    computed_at:          '2026-06-03T00:00:00.000Z',
    archiveRecallEntries: [{
      id: 'shared-mem-1',
      title: 'Shared memory',
      excerpt: null,
      content_snippet: '',
      archive_name: 'house',
      owner_presence: 'ari',
      source_origin: 'test',
      visibility: 'shared',
      category: 'relational_truth',
      canonical_status: 'canonical',
      sensitivity: 'ordinary',
      source_document: null,
      source_date: null,
      source_id: null,
      rank_score: 85,
      rank_reason: 'high',
      status_label: 'canonical',
    }],
  })

  assert(
    packet.active_sources.some(s => s.surface === SourceSurface.confirmed_archive_memory),
    '9a: shared confirmed archive memory is ACTIVE in Lounge advisory (lounge_allowed: true)'
  )
  assert(
    packet.has_sufficient_ground,
    '9a: has_sufficient_ground true for shared Memory in Lounge'
  )
}

// 9b: presence-scoped memory is scope-excluded in Lounge advisory
{
  const packet = buildRecallAdvisoryPacket({
    presence:             'ari',
    room:                 'lounge',
    packet_id:            'test-lounge-scoped',
    computed_at:          '2026-06-03T00:00:00.000Z',
    archiveRecallEntries: [{
      id: 'ari-private-1',
      title: 'Ari private memory',
      excerpt: null,
      content_snippet: '',
      archive_name: 'velvet',
      owner_presence: 'ari',
      source_origin: 'test',
      visibility: 'ari_only',  // private — lounge_allowed: false
      category: 'relational_truth',
      canonical_status: 'canonical',
      sensitivity: 'private',
      source_document: null,
      source_date: null,
      source_id: null,
      rank_score: 90,
      rank_reason: 'high',
      status_label: 'canonical',
    }],
  })

  assert(
    packet.active_sources.length === 0,
    '9b: ari_only Memory is NOT active in Lounge advisory (lounge_allowed: false)'
  )
  assert(
    packet.excluded_sources.some(s => s.exclusion_reason === ExclusionReason.scope_prohibited),
    '9b: ari_only Memory excluded with scope_prohibited in Lounge advisory'
  )
}

// 9c: empty advisory → insufficient ground
{
  const packet = buildRecallAdvisoryPacket({
    presence:    'ari',
    room:        'lounge',
    packet_id:   'test-lounge-empty',
    computed_at: '2026-06-03T00:00:00.000Z',
  })

  assert(!packet.has_sufficient_ground, '9c: no sources → insufficient ground in Lounge advisory')
  assert(
    packet.primary_response_instruction === ResponseInstruction.say_not_enough_grounded_recall,
    '9c: primary instruction say_not_enough_grounded_recall for empty Lounge advisory'
  )
}

// 9d: library reference with lounge-allowed scope passes
{
  const packet = buildRecallAdvisoryPacket({
    presence:         'ari',
    room:             'lounge',
    packet_id:        'test-lounge-library',
    computed_at:      '2026-06-03T00:00:00.000Z',
    libraryReferences: [{
      id: 'lib-1',
      title: 'Shared library item',
      effectiveAuthorityStatus: 'library_reference',
      collection: 'house',
      itemType: 'architecture_law',
      presenceScope: 'shared',
      phaseCode: null,
      phaseLabel: null,
      retrievalReason: 'test',
    }],
  })

  assert(
    packet.active_sources.some(s => s.surface === SourceSurface.library_rag_reference),
    '9d: shared library reference is ACTIVE in Lounge advisory'
  )
}

// ═══════════════════════════════════════════════════════
// 10. Advisory block content safety
// ═══════════════════════════════════════════════════════
section('10. Advisory block metadata-only (content safety)')

{
  const packet = buildRecallAdvisoryPacket({
    presence:             'ari',
    room:                 'lounge',
    packet_id:            'test-lounge-content-safe',
    computed_at:          '2026-06-03T00:00:00.000Z',
    archiveRecallEntries: [{
      id: 'safe-test-1',
      title: 'DO_NOT_SHOW_TITLE',
      excerpt: null,
      content_snippet: 'DO_NOT_SHOW_SNIPPET',
      archive_name: 'house',
      owner_presence: 'ari',
      source_origin: 'test',
      visibility: 'shared',
      category: 'relational_truth',
      canonical_status: 'canonical',
      sensitivity: 'ordinary',
      source_document: null,
      source_date: null,
      source_id: null,
      rank_score: 80,
      rank_reason: 'test',
      status_label: 'canonical',
    }],
  })

  const block = formatRecallAdvisoryBlock(packet)
  assert(!block.includes('DO_NOT_SHOW_TITLE'), 'Advisory block does NOT include source title')
  assert(!block.includes('DO_NOT_SHOW_SNIPPET'), 'Advisory block does NOT include content_snippet')
  assert(block.includes('confirmed memory: 1'), 'Advisory block shows only the count')
}

// ═══════════════════════════════════════════════════════
// 11. Ari/Eli routes are unchanged (no regression)
// ═══════════════════════════════════════════════════════
section('11. Ari/Eli routes not modified by 39.6.2')

// Ari/Eli routes should not have been touched — they use ari_room/eli_room
assert(
  ariSrc.includes("room:                  'ari_room'"),
  'ari-chat route still uses ari_room — unchanged'
)

assert(
  eliSrc.includes("room:                  'eli_room'"),
  'eli-chat route still uses eli_room — unchanged'
)

// Ari/Eli routes still do NOT use 'lounge' room
assert(
  !ariSrc.includes("room: 'lounge'") && !ariSrc.includes("room:                 'lounge'"),
  'ari-chat route does NOT contain lounge room advisory'
)

assert(
  !eliSrc.includes("room: 'lounge'") && !eliSrc.includes("room:                 'eli_room'\n        room:"),
  'eli-chat route does NOT contain lounge room advisory (no confusion)'
)

// ═══════════════════════════════════════════════════════
// 12. No new DB writes / migrations
// ═══════════════════════════════════════════════════════
section('12. No DB writes / migrations')

const migrationFiles    = fs.readdirSync(path.join(ROOT, 'supabase-migrations'))
const loungeAdvisoryMigs = migrationFiles.filter(f => f.includes('lounge_advisory'))
assert(
  loungeAdvisoryMigs.length === 0,
  `No Lounge advisory migrations added (found: ${loungeAdvisoryMigs.join(', ') || 'none'})`
)

// Advisory functions are pure — already verified in 39.6 tests
// Confirm the buildRecallAdvisoryPacket call args contain no Supabase patterns
assert(
  !advisoryCallArgs.includes('.from(') &&
  !advisoryCallArgs.includes('supabase'),
  'buildRecallAdvisoryPacket call args contain no Supabase calls'
)

// ═══════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════')
console.log('  Phase 39.6.2 Lounge Advisory Integration Tests')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log('═══════════════════════════════════════════════════════')

if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
} else {
  console.log('\n✅ All 39.6.2 Lounge advisory tests passed.\n')
  process.exit(0)
}
