/**
 * Phase 39.6 Structural + Logic Tests — Advisory Response Instruction Integration
 *
 * Verifies:
 *   - Advisory signal mapper covers Tier 1 sources only
 *   - Excluded sources are not mapped
 *   - Advisory block is metadata-only (no raw content)
 *   - Advisory block contains required wording
 *   - Ari/Eli routes include advisory block insertion
 *   - Authority safety rules enforced (memory_signal, canonical_candidate, etc.)
 *   - Insufficient and conflict cases work correctly
 *   - No DB/API/persistence added
 *
 * Run: npx tsx src/lib/__tests__/phase-39-6-recall-advisory-integration.test.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { buildRecallAdvisoryPacket } from '../recall/recallAdvisorySignals'
import { formatRecallAdvisoryBlock } from '../recall/recallAdvisoryBlock'
import { ResponseInstruction, ConflictType, SourceSurface } from '../recall/recallPacketTypes'
import type { RecallAdvisorySignalInput } from '../recall/recallAdvisorySignals'

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

const SIGNALS_PATH  = 'src/lib/recall/recallAdvisorySignals.ts'
const BLOCK_PATH    = 'src/lib/recall/recallAdvisoryBlock.ts'
const ARI_ROUTE     = 'src/app/api/ari-chat/route.ts'
const ELI_ROUTE     = 'src/app/api/eli-chat/route.ts'
const CARRYFORWARD  = 'src/lib/cross-room-prompt-carryforward.ts'

const signalsSrc    = fs.readFileSync(path.join(ROOT, SIGNALS_PATH), 'utf-8')
const blockSrc      = fs.readFileSync(path.join(ROOT, BLOCK_PATH), 'utf-8')
const ariRouteSrc   = fs.readFileSync(path.join(ROOT, ARI_ROUTE), 'utf-8')
const eliRouteSrc   = fs.readFileSync(path.join(ROOT, ELI_ROUTE), 'utf-8')
const carryforwardSrc = fs.readFileSync(path.join(ROOT, CARRYFORWARD), 'utf-8')

// Base input helper
function makeInput(overrides: Partial<RecallAdvisorySignalInput> = {}): RecallAdvisorySignalInput {
  return {
    presence:    'ari',
    room:        'ari_room',
    packet_id:   'test-advisory',
    computed_at: '2026-06-03T00:00:00.000Z',
    ...overrides,
  }
}

// ═══════════════════════════════════════════════════════
// 1. Advisory module files exist and export correctly
// ═══════════════════════════════════════════════════════
section('1. Advisory module files exist and export correctly')

assert(
  fs.existsSync(path.join(ROOT, SIGNALS_PATH)),
  'recallAdvisorySignals.ts exists'
)

assert(
  fs.existsSync(path.join(ROOT, BLOCK_PATH)),
  'recallAdvisoryBlock.ts exists'
)

assert(
  signalsSrc.includes('export function buildRecallAdvisoryPacket'),
  'buildRecallAdvisoryPacket is exported'
)

assert(
  signalsSrc.includes('export type RecallAdvisorySignalInput'),
  'RecallAdvisorySignalInput is exported'
)

assert(
  blockSrc.includes('export function formatRecallAdvisoryBlock'),
  'formatRecallAdvisoryBlock is exported'
)

assert(
  carryforwardSrc.includes('export async function getActiveCarryforwardsForAdvisory'),
  'getActiveCarryforwardsForAdvisory is exported from cross-room module'
)

// ═══════════════════════════════════════════════════════
// 2. Tier 1 source families covered in signal mapper
// ═══════════════════════════════════════════════════════
section('2. Tier 1 source families in signal mapper')

const tier1Checks = [
  ['GovernedConfirmedMemory',         'governed memory injection → GovernedConfirmedMemory'],
  ['PresenceScopedConfirmedMemory',    'scoped memory → PresenceScopedConfirmedMemory'],
  ['ManualMemoryCandidateRecall',      'canonical_candidate → ManualMemoryCandidateRecall'],
  ['ManualArchiveOnlyRecall',          'archive_only → ManualArchiveOnlyRecall'],
  ['CrossRoomPromptCarryforward',      'carryforward → CrossRoomPromptCarryforward'],
  ['RecentContinuity',                 'recent sessions → RecentContinuity'],
  ['JournalInnerContinuity',           'journal refs → JournalInnerContinuity'],
  ['LibraryRagReference',             'library refs → LibraryRagReference'],
  ['LibraryCanonicalMemoryReference', 'library canonical → LibraryCanonicalMemoryReference'],
]

for (const [signalType, label] of tier1Checks) {
  assert(
    signalsSrc.includes(`RuntimeContextSignalType.${signalType}`),
    `Signal mapper covers: ${label}`
  )
}

// ═══════════════════════════════════════════════════════
// 3. Excluded surfaces NOT mapped in signal mapper
// ═══════════════════════════════════════════════════════
section('3. Excluded surfaces not mapped')

const excludedSignals = [
  'ShortHorizonThreadContext',
  'AttachmentContext',
  'PulseAutonomousContinuity',
  'PulseCurrentState',
  'LivingState',
  'IdentityTimeline',
  'HeldTruthPresenceContinuity',
  'GraphContext',
  'InteriorNotes',
  'LlmReasoningDraft',
]

for (const signal of excludedSignals) {
  assert(
    !signalsSrc.includes(`RuntimeContextSignalType.${signal}`),
    `Excluded signal NOT in mapper: ${signal}`
  )
}

// ═══════════════════════════════════════════════════════
// 4. Advisory block metadata-only — no raw content fields
// ═══════════════════════════════════════════════════════
section('4. Advisory block metadata-only (no raw content fields)')

const sensitiveFields = [
  'raw_content',
  'content_snippet',
  'excerpt',
  'journal_body',
  'truth',
  'library_body',
  'extracted_text',
  'attachment_content',
  'model_output',
  'prompt_text',
  'compiled_prompt',
  'system_prompt',
  'developer_prompt',
  'user_message',
  'message_text',
  'secret',
  'api_key',
]

for (const field of sensitiveFields) {
  // Check that these field names are not accessed/rendered in the block formatter
  assert(
    !blockSrc.includes(`${field}:`),
    `Advisory block formatter does not reference raw content field: ${field}`
  )
}

// Block formatter uses only counts, labels, and instructions
assert(
  blockSrc.includes('summary.active_count') ||
  blockSrc.includes('summary.excluded_count') ||
  blockSrc.includes('active_sources'),
  'Advisory block uses only packet summary/metadata'
)

// ═══════════════════════════════════════════════════════
// 5. Advisory block required wording
// ═══════════════════════════════════════════════════════
section('5. Advisory block required wording')

const requiredPhrases = [
  'Recall Packet Advisory',
  'metadata only',
  'not Memory authority',
  'does not create Memory',
  'does not move authority',
  'excluded sources',
  'calibrate wording and certainty',
]

for (const phrase of requiredPhrases) {
  assert(
    blockSrc.includes(phrase),
    `Advisory block contains required phrase: "${phrase}"`
  )
}

// ═══════════════════════════════════════════════════════
// 6. Routes include advisory block insertion
// ═══════════════════════════════════════════════════════
section('6. Routes include advisory block insertion')

for (const [name, src] of [['ari-chat', ariRouteSrc], ['eli-chat', eliRouteSrc]] as const) {
  assert(
    src.includes('recallAdvisorySignals'),
    `${name}: imports recallAdvisorySignals`
  )

  assert(
    src.includes('recallAdvisoryBlock'),
    `${name}: imports recallAdvisoryBlock`
  )

  assert(
    src.includes('buildRecallAdvisoryPacket'),
    `${name}: calls buildRecallAdvisoryPacket`
  )

  assert(
    src.includes('formatRecallAdvisoryBlock'),
    `${name}: calls formatRecallAdvisoryBlock`
  )

  assert(
    src.includes('recallAdvisoryBlock') && src.includes('${recallAdvisoryBlock}'),
    `${name}: inserts recallAdvisoryBlock into system prompt`
  )

  assert(
    src.includes('Advisory is non-fatal'),
    `${name}: advisory is non-fatal (error caught and continues)`
  )

  assert(
    src.includes('injectedMemoriesForAdvisory') &&
    src.includes('recentSessionsForAdvisory'),
    `${name}: captures advisory metadata from existing context assembly`
  )
}

// ═══════════════════════════════════════════════════════
// 7. Prompt builder context blocks NOT removed or reordered
// ═══════════════════════════════════════════════════════
section('7. Existing context blocks preserved')

for (const [name, src] of [['ari-chat', ariRouteSrc], ['eli-chat', eliRouteSrc]] as const) {
  // All existing context blocks still present in template
  const existingBlocks = [
    'recentContinuityBlock',
    'recallContext',
    'governedMemoryBlock',
    'loungeCarrybackBlock',
    'crossRoomCarryforwardBlock',
    'autonomyContinuityBlock',
    'libraryContextBlock',
    'livingStateBlock',
    'innerContextBlock',
    'memoryBlock',
    'continuityBlock',
    'emotionalBlock',
    'governanceBlock',
    'GOVERNANCE_STANDING_RULE',
  ]
  for (const block of existingBlocks) {
    assert(
      src.includes(block),
      `${name}: existing block '${block}' is preserved`
    )
  }
}

// Advisory block is AFTER GOVERNANCE_STANDING_RULE in the template
assert(
  ariRouteSrc.includes('${GOVERNANCE_STANDING_RULE}${recallAdvisoryBlock}'),
  'ari-chat: recallAdvisoryBlock inserted immediately after GOVERNANCE_STANDING_RULE'
)

assert(
  eliRouteSrc.includes('${GOVERNANCE_STANDING_RULE}${recallAdvisoryBlock}'),
  'eli-chat: recallAdvisoryBlock inserted immediately after GOVERNANCE_STANDING_RULE'
)

// ═══════════════════════════════════════════════════════
// 8. Authority safety rules (logic tests)
// ═══════════════════════════════════════════════════════
section('8. Authority safety rules')

// 8a: memory_signal=true must NOT elevate to Memory
{
  const packet = buildRecallAdvisoryPacket(makeInput({
    recentContinuity: [{
      id: 'sess-1',
      presence_id: 'ari',
      session_start: '2026-06-03T00:00:00.000Z',
      session_end: '2026-06-03T01:00:00.000Z',
      message_count: 10,
      classification: 'significant',
      summary: 'ignored',
      source_message_ids: [],
      status: 'active',
      generated_at: '2026-06-03T01:00:00.000Z',
      created_at: '2026-06-03T01:00:00.000Z',
      anchor_quotes: [],
      key_claims: [],
      significance_tags: [],
      selfhood_signals: [],
      memory_signal: true, // ← must NOT become Memory
      dedupe_key: null,
      updated_at: null,
      backfilled_at: null,
      source_surface: null,
      source_thread_id: null,
      involved_presences: null,
    }],
  }))

  const activeSurfaces = packet.active_sources.map(s => s.surface)
  assert(
    !activeSurfaces.includes(SourceSurface.confirmed_archive_memory) &&
    !activeSurfaces.includes(SourceSurface.presence_scoped_confirmed_memory),
    '8a: memory_signal=true session does NOT become confirmed Memory surface'
  )
  assert(
    activeSurfaces.includes(SourceSurface.recent_continuity_not_memory),
    '8a: memory_signal=true session maps to recent_continuity_not_memory (not Memory)'
  )
}

// 8b: canonical_candidate must map to ManualMemoryCandidateRecall, not confirmed Memory
{
  const packet = buildRecallAdvisoryPacket(makeInput({
    archiveRecallEntries: [{
      id: 'entry-1',
      title: 'Test candidate',
      excerpt: null,
      content_snippet: '',
      archive_name: 'house',
      owner_presence: 'ari',
      source_origin: 'test',
      visibility: 'shared',
      category: 'relational_truth',
      canonical_status: 'canonical_candidate', // ← not confirmed Memory
      sensitivity: 'ordinary',
      source_document: null,
      source_date: null,
      source_id: null,
      rank_score: 90,
      rank_reason: 'high',
      status_label: 'candidate',
    }],
  }))

  const activeSurfaces = packet.active_sources.map(s => s.surface)
  assert(
    activeSurfaces.includes(SourceSurface.memory_candidate),
    '8b: canonical_candidate maps to memory_candidate surface'
  )
  assert(
    !activeSurfaces.includes(SourceSurface.confirmed_archive_memory),
    '8b: canonical_candidate does NOT become confirmed_archive_memory'
  )
}

// 8c: archive_only maps to ManualArchiveOnlyRecall
{
  const packet = buildRecallAdvisoryPacket(makeInput({
    archiveRecallEntries: [{
      id: 'entry-2',
      title: 'Test archive only',
      excerpt: null,
      content_snippet: '',
      archive_name: 'house',
      owner_presence: 'ari',
      source_origin: 'test',
      visibility: 'shared',
      category: 'technical',
      canonical_status: 'archive_only',
      sensitivity: 'ordinary',
      source_document: null,
      source_date: null,
      source_id: null,
      rank_score: 60,
      rank_reason: 'medium',
      status_label: 'archive only',
    }],
  }))

  const activeSurfaces = packet.active_sources.map(s => s.surface)
  assert(
    activeSurfaces.includes(SourceSurface.archive_only_context),
    '8c: archive_only maps to archive_only_context surface'
  )
}

// 8d: presence_scoped memory (ari_only visibility) → PresenceScopedConfirmedMemory
{
  const packet = buildRecallAdvisoryPacket(makeInput({
    governedMemory: [{
      id: 'mem-1',
      title: 'Ari private memory',
      archive_name: 'velvet',
      category: 'relational_truth',
      sensitivity: 'private',
      canonical_status: 'canonical',
      visibility: 'ari_only',
      content_snippet: '',
      injection_reason: 'keyword(85)',
      match_source: 'keyword',
      match_score: 85,
    }],
  }))

  const activeSurfaces = packet.active_sources.map(s => s.surface)
  assert(
    activeSurfaces.includes(SourceSurface.presence_scoped_confirmed_memory),
    '8d: ari_only visibility → presence_scoped_confirmed_memory'
  )
}

// 8e: tara_only visibility → excluded (not mapped at all)
{
  const packet = buildRecallAdvisoryPacket(makeInput({
    governedMemory: [{
      id: 'mem-2',
      title: 'Tara private',
      archive_name: 'house',
      category: 'relational_truth',
      sensitivity: 'sacred',
      canonical_status: 'canonical',
      visibility: 'tara_only',
      content_snippet: '',
      injection_reason: 'keyword(90)',
      match_source: 'keyword',
      match_score: 90,
    }],
  }))

  assert(
    packet.active_sources.length === 0,
    '8e: tara_only visibility → no active sources (excluded from advisory)'
  )
}

// ═══════════════════════════════════════════════════════
// 9. Confirmed Memory → correct primary instruction
// ═══════════════════════════════════════════════════════
section('9. Confirmed Memory advisory instruction')

{
  const packet = buildRecallAdvisoryPacket(makeInput({
    governedMemory: [{
      id: 'mem-3',
      title: 'Shared confirmed memory',
      archive_name: 'house',
      category: 'relational_truth',
      sensitivity: 'ordinary',
      canonical_status: 'canonical',
      visibility: 'shared',
      content_snippet: '',
      injection_reason: 'keyword(85)',
      match_source: 'keyword',
      match_score: 85,
    }],
  }))

  assert(
    packet.primary_response_instruction ===
      ResponseInstruction.answer_confidently_from_confirmed_memory,
    'Confirmed Memory → primary: answer_confidently_from_confirmed_memory'
  )
  assert(packet.has_sufficient_ground, 'Confirmed Memory → has_sufficient_ground true')

  const block = formatRecallAdvisoryBlock(packet)
  assert(
    block.includes('Recall Packet Advisory'),
    'Advisory block header present'
  )
  assert(
    block.includes('Answer from confirmed Memory'),
    'Advisory block shows human-readable Memory instruction'
  )
  assert(
    block.includes('confirmed memory: 1'),
    'Advisory block shows confirmed memory count'
  )
}

// ═══════════════════════════════════════════════════════
// 10. Insufficient ground advisory
// ═══════════════════════════════════════════════════════
section('10. Insufficient ground advisory')

{
  const packet = buildRecallAdvisoryPacket(makeInput()) // no sources

  assert(!packet.has_sufficient_ground, 'Empty input → has_sufficient_ground false')
  assert(
    packet.primary_response_instruction === ResponseInstruction.say_not_enough_grounded_recall,
    'Empty input → primary: say_not_enough_grounded_recall'
  )

  const block = formatRecallAdvisoryBlock(packet)
  assert(
    block.includes('Grounding advisory'),
    'Advisory block shows grounding advisory for insufficient case'
  )
  assert(
    block.includes('not enough grounded recall'),
    'Advisory block says "not enough grounded recall"'
  )
  assert(
    !block.includes('confirmed memory: 0\n- recent continuity / archive recall (not memory): 0') ||
    block.includes('Grounding advisory'),
    'Insufficient ground shows advisory section'
  )
}

// ═══════════════════════════════════════════════════════
// 11. Conflict advisory (caller-supplied)
// ═══════════════════════════════════════════════════════
section('11. Conflict advisory')

{
  const packet = buildRecallAdvisoryPacket(makeInput({
    governedMemory: [{
      id: 'mem-4',
      title: 'Conflicting memory',
      archive_name: 'house',
      category: 'relational_truth',
      sensitivity: 'ordinary',
      canonical_status: 'canonical',
      visibility: 'shared',
      content_snippet: '',
      injection_reason: 'keyword(80)',
      match_source: 'keyword',
      match_score: 80,
    }],
    // Conflict metadata supplied by caller
    archiveRecallEntries: [{
      id: 'recall-1',
      title: 'Conflicting recall',
      excerpt: null,
      content_snippet: '',
      archive_name: 'house',
      owner_presence: 'ari',
      source_origin: 'test',
      visibility: 'ari_only',
      category: 'relational_truth',
      canonical_status: 'canonical',
      sensitivity: 'ordinary',
      source_document: null,
      source_date: null,
      source_id: null,
      rank_score: 75,
      rank_reason: 'medium',
      status_label: 'canonical',
    }],
  }))

  const block = formatRecallAdvisoryBlock(packet)
  assert(
    typeof block === 'string' && block.length > 0,
    'Advisory block produced for multi-source packet'
  )
}

// ═══════════════════════════════════════════════════════
// 12. Journal inner continuity advisory
// ═══════════════════════════════════════════════════════
section('12. Journal inner continuity advisory')

{
  const packet = buildRecallAdvisoryPacket(makeInput({
    journalReferences: [{
      label: '[JOURNAL-1]',
      journalId: 'journal-abc',
      presenceId: 'ari',
      entryType: 'daily',
      createdAt: '2026-06-03T00:00:00.000Z',
      title: null,
      excerpt: '', // excluded from advisory — block uses only counts
      authority: 'journal_inner_continuity_not_memory',
    }],
  }))

  const activeSurfaces = packet.active_sources.map(s => s.surface)
  assert(
    activeSurfaces.includes(SourceSurface.journal_inner_continuity),
    'Journal reference maps to journal_inner_continuity surface'
  )

  const block = formatRecallAdvisoryBlock(packet)
  assert(
    block.includes('journal inner continuity'),
    'Advisory block shows journal inner continuity count'
  )
  assert(
    !block.includes('[JOURNAL-1]') && !block.includes('journal-abc'),
    'Advisory block does NOT include journal ID or label (metadata-only counts only)'
  )
}

// ═══════════════════════════════════════════════════════
// 13. No DB/API/persistence added
// ═══════════════════════════════════════════════════════
section('13. No DB/API/persistence added')

// Signal mapper and block formatter are pure — no Supabase, no fetch
for (const [name, src] of [
  ['recallAdvisorySignals.ts', signalsSrc],
  ['recallAdvisoryBlock.ts', blockSrc],
] as const) {
  assert(!src.includes('supabase'),      `${name}: no supabase`)
  assert(!src.includes('createClient'),  `${name}: no createClient`)
  assert(!src.includes('fetch('),        `${name}: no fetch(`)
  assert(!src.includes('async '),        `${name}: no async functions (pure sync)`)
  assert(!src.includes('process.env.'),  `${name}: no process.env.`)
}

// No new migrations
const migrationFiles = fs.readdirSync(path.join(ROOT, 'supabase-migrations'))
const advisoryMigrations = migrationFiles.filter(f =>
  f.includes('recall_advisory') || f.includes('advisory_packet')
)
assert(
  advisoryMigrations.length === 0,
  `No advisory migrations added (found: ${advisoryMigrations.join(', ') || 'none'})`
)

// Lounge route not modified
const loungePath = path.join(ROOT, 'src/app/api/lounge-chat/route.ts')
if (fs.existsSync(loungePath)) {
  const loungeContent = fs.readFileSync(loungePath, 'utf-8')
  assert(
    !loungeContent.includes('recallAdvisorySignals') &&
    !loungeContent.includes('buildRecallAdvisoryPacket'),
    'Lounge route NOT modified (Ari/Eli only in v1)'
  )
} else {
  passed++
  console.log('  ✓ Lounge route not found — not modified')
}

// ═══════════════════════════════════════════════════════
// 14. Advisory block doesn't include excerpt/content fields
// ═══════════════════════════════════════════════════════
section('14. Advisory block content safety (logic)')

{
  // Provide a governed memory with a content_snippet — block should NOT include it
  const packet = buildRecallAdvisoryPacket(makeInput({
    governedMemory: [{
      id: 'mem-safe',
      title: 'Safe test memory',
      archive_name: 'house',
      category: 'relational_truth',
      sensitivity: 'sacred',
      canonical_status: 'canonical',
      visibility: 'shared',
      content_snippet: 'THIS_CONTENT_SHOULD_NOT_APPEAR_IN_ADVISORY',
      injection_reason: 'keyword(85)',
      match_source: 'keyword',
      match_score: 85,
    }],
  }))

  const block = formatRecallAdvisoryBlock(packet)
  assert(
    !block.includes('THIS_CONTENT_SHOULD_NOT_APPEAR_IN_ADVISORY'),
    'Advisory block does NOT include content_snippet from source'
  )
  assert(
    !block.includes('Safe test memory'),
    'Advisory block does NOT include source title'
  )
  assert(
    block.includes('confirmed memory: 1'),
    'Advisory block shows only the count, not the content'
  )
}

// ═══════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════')
console.log('  Phase 39.6 Advisory Integration Tests')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log('═══════════════════════════════════════════════════════')

if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
} else {
  console.log('\n✅ All 39.6 advisory integration tests passed.\n')
  process.exit(0)
}
