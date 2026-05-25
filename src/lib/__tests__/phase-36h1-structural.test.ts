/**
 * Phase 36H.1 Structural Tests
 *
 * Static/structural validation of the Same-Presence Journal Recall
 * + Inner Continuity Boundary implementation.
 *
 * These tests validate:
 * 1. Journal recall type contracts
 * 2. Same-presence scope enforcement
 * 3. Lounge mode-aware trigger logic
 * 4. No-write / side-effect constraints
 * 5. 36G LoungeContextIndicator regression
 * 6. MessageId metadata binding correctness
 *
 * Run: npx tsx src/lib/__tests__/phase-36h1-structural.test.ts
 */

import * as fs from 'fs'
import * as path from 'path'

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

// ═══════════════════════════════════════════════════════
// 1. Journal Recall Type Contracts
// ═══════════════════════════════════════════════════════
section('1. Journal recall type contracts')

const journalTs = readFile('src/lib/journal.ts')

assert(
  journalTs.includes('export interface JournalContextResult'),
  'JournalContextResult type is exported'
)
assert(
  journalTs.includes('export interface JournalContextStatus'),
  'JournalContextStatus type is exported'
)
assert(
  journalTs.includes('export interface JournalContextReference'),
  'JournalContextReference type is exported'
)
assert(
  journalTs.includes("authorityLabel: 'journal_inner_continuity_not_memory'"),
  'JournalContextStatus has correct authority label literal'
)
assert(
  journalTs.includes("authority: 'journal_inner_continuity_not_memory'"),
  'JournalContextReference has correct authority label literal'
)
assert(
  journalTs.includes('export async function getJournalContextForPresence'),
  'getJournalContextForPresence is exported'
)
assert(
  journalTs.includes('[JOURNAL-1]') && journalTs.includes('[JOURNAL-2]') && journalTs.includes('[JOURNAL-3]'),
  'Stable [JOURNAL-N] labels (1, 2, 3) present'
)
assert(
  journalTs.includes('## Journal Context — Inner Continuity, Not Memory'),
  'Prompt block header uses correct wording'
)
assert(
  journalTs.includes('It is not canonical Memory.') &&
  journalTs.includes('It is not confirmed Archive Memory.') &&
  journalTs.includes('It is not Watchtower evidence.') &&
  journalTs.includes('It is not State.') &&
  journalTs.includes('It is not Interior.') &&
  journalTs.includes('It is not cross-room truth.'),
  'Prompt block contains all 6 authority boundary negations'
)
assert(
  journalTs.includes("reason: 'same_presence_journal_found'") &&
  journalTs.includes("reason: 'no_journal_context'") &&
  journalTs.includes("reason: 'scope_blocked'") &&
  journalTs.includes("reason: 'source_error'"),
  'All 4 status reason values present'
)

// ═══════════════════════════════════════════════════════
// 2. Same-Presence Scope Tests
// ═══════════════════════════════════════════════════════
section('2. Same-presence scope enforcement')

assert(
  journalTs.includes("presenceId !== 'ari' && presenceId !== 'eli'"),
  'Scope guard rejects non-ari/eli presenceIds'
)
assert(
  journalTs.includes("reason: 'scope_blocked'"),
  'Scope guard returns scope_blocked reason'
)

const ariChatTs = readFile('src/app/api/ari-chat/route.ts')
const eliChatTs = readFile('src/app/api/eli-chat/route.ts')

assert(
  ariChatTs.includes("getJournalContextForPresence('ari')"),
  'Ari room calls getJournalContextForPresence with ari only'
)
assert(
  !ariChatTs.includes("getJournalContextForPresence('eli')"),
  'Ari room does NOT call getJournalContextForPresence with eli'
)
assert(
  eliChatTs.includes("getJournalContextForPresence('eli')"),
  'Eli room calls getJournalContextForPresence with eli only'
)
assert(
  !eliChatTs.includes("getJournalContextForPresence('ari')"),
  'Eli room does NOT call getJournalContextForPresence with ari'
)

const loungeChatTs = readFile('src/app/api/lounge-chat/route.ts')
assert(
  loungeChatTs.includes('getJournalContextForPresence(presenceId'),
  'Lounge calls getJournalContextForPresence with loop presenceId (same-presence)'
)
// Verify no hardcoded 'ari' or 'eli' in journal calls within lounge
const journalCallMatches = loungeChatTs.match(/getJournalContextForPresence\(['"](?:ari|eli)['"]\)/g)
assert(
  journalCallMatches === null,
  'Lounge does NOT hardcode ari/eli in journal call (uses loop variable)'
)

// ═══════════════════════════════════════════════════════
// 3. Lounge Mode-Aware Trigger Tests
// ═══════════════════════════════════════════════════════
section('3. Lounge mode-aware trigger logic')

assert(
  loungeChatTs.includes("const isInnerSurface = surface === 'inner'"),
  'Inner surface detection uses current_surface === inner'
)
assert(
  loungeChatTs.includes('journalRelevantTerms'),
  'Journal-relevant term list exists for default surface trigger'
)
assert(
  loungeChatTs.includes('const shouldInjectJournal = isInnerSurface || turnReferencesJournal'),
  'Injection logic: inner surface OR turn references journal'
)
assert(
  loungeChatTs.includes('maxEntries: 3, maxExcerptWords: 60, maxTotalChars: 3500'),
  'Inner surface uses richer budget (3/60/3500)'
)
assert(
  loungeChatTs.includes('maxEntries: 2, maxExcerptWords: 40, maxTotalChars: 2000'),
  'Default surface uses standard budget (2/40/2000)'
)
assert(
  loungeChatTs.includes("reason: 'not_triggered'"),
  'Non-triggered state returns not_triggered reason'
)

// ═══════════════════════════════════════════════════════
// 4. No-Write / Side-Effect Tests
// ═══════════════════════════════════════════════════════
section('4. No-write / side-effect constraints')

// Extract only the getJournalContextForPresence function body
const funcStart = journalTs.indexOf('export async function getJournalContextForPresence')
const funcEnd = journalTs.indexOf('\n}\n', funcStart + 100)
const funcBody = journalTs.slice(funcStart, funcEnd + 3)

assert(
  !funcBody.includes('.insert(') && !funcBody.includes('.insert({'),
  'getJournalContextForPresence contains no .insert() calls'
)
assert(
  !funcBody.includes('.upsert(') && !funcBody.includes('.upsert({'),
  'getJournalContextForPresence contains no .upsert() calls'
)
assert(
  !funcBody.includes('.update(') && !funcBody.includes('.update({'),
  'getJournalContextForPresence contains no .update() calls'
)
assert(
  !funcBody.includes('.delete()'),
  'getJournalContextForPresence contains no .delete() calls'
)
assert(
  !funcBody.includes('createJournalJob') &&
  !funcBody.includes('create_journal_job') &&
  !funcBody.includes('journal_jobs'),
  'getJournalContextForPresence creates no journal jobs'
)
assert(
  !funcBody.includes('createReflectionJob') &&
  !funcBody.includes('reflection_jobs'),
  'getJournalContextForPresence creates no reflection jobs'
)
assert(
  !funcBody.includes('memory_nodes') &&
  !funcBody.includes('memory_edges') &&
  !funcBody.includes('room_memories'),
  'getJournalContextForPresence writes no memory/graph data'
)
assert(
  !funcBody.includes('cross_room_events') &&
  !funcBody.includes('crossRoomEvent'),
  'getJournalContextForPresence creates no cross-room events'
)
assert(
  !funcBody.includes('presence_state') &&
  !funcBody.includes('interior_notes') &&
  !funcBody.includes('pulse_log'),
  'getJournalContextForPresence writes no State/Interior/Pulse'
)

// ═══════════════════════════════════════════════════════
// 5. 36G LoungeContextIndicator Regression
// ═══════════════════════════════════════════════════════
section('5. 36G LoungeContextIndicator regression')

const indicatorTsx = readFile('src/components/LoungeContextIndicator.tsx')

// Existing sections still present
assert(
  indicatorTsx.includes('Library ({metadata.libraryReferences.length})'),
  'Library section still present in expanded view'
)
assert(
  indicatorTsx.includes("Web ({metadata.webSearchReferences.length}"),
  'Web section still present in expanded view'
)
assert(
  indicatorTsx.includes("Attachments ({metadata.attachmentReferences.length})"),
  'Attachments section still present in expanded view'
)
assert(
  indicatorTsx.includes("Room Carry-In ({metadata.roomContactStatus.sessionsUsed}"),
  'Room Carry-In section still present in expanded view'
)

// Journal section added
assert(
  indicatorTsx.includes('Journal ({metadata.journalContextReferences.length})'),
  'Journal section added to expanded view'
)
assert(
  indicatorTsx.includes('Inner continuity only. Not Memory.'),
  'Journal section has correct authority footer'
)
assert(
  indicatorTsx.includes('text-rose-400'),
  'Journal section uses rose color scheme'
)

// Collapsed chips still work
assert(
  indicatorTsx.includes("chips.push(`Library"),
  'Library chip in collapsed view preserved'
)
assert(
  indicatorTsx.includes("chips.push(`Web"),
  'Web chip in collapsed view preserved'
)
assert(
  indicatorTsx.includes("chips.push(`Attachments"),
  'Attachments chip in collapsed view preserved'
)
assert(
  indicatorTsx.includes("chips.push(`Room"),
  'Room chip in collapsed view preserved'
)
assert(
  indicatorTsx.includes("chips.push(`Journal"),
  'Journal chip in collapsed view added'
)

// hasAnyContext includes journal
assert(
  indicatorTsx.includes('meta.journalContextStatus?.contextInjected'),
  'hasAnyContext checks journalContextStatus.contextInjected'
)

// Types
assert(
  indicatorTsx.includes('export interface LoungeJournalContextStatus'),
  'LoungeJournalContextStatus type exported'
)
assert(
  indicatorTsx.includes('export interface LoungeJournalContextReference'),
  'LoungeJournalContextReference type exported'
)

// ═══════════════════════════════════════════════════════
// 6. MessageId Metadata Binding (Lounge)
// ═══════════════════════════════════════════════════════
section('6. Lounge messageId metadata binding')

// Verify journal metadata is declared inside the per-presence loop
const loopStart = loungeChatTs.indexOf('for (const presenceId of presences)')
const loopEnd = loungeChatTs.indexOf('return NextResponse.json', loopStart)
const loopBody = loungeChatTs.slice(loopStart, loopEnd)

assert(
  loopBody.includes('let journalContextBlock'),
  'journalContextBlock is declared inside per-presence loop (per-presence scoped)'
)
assert(
  loopBody.includes('let journalContextStatus'),
  'journalContextStatus is declared inside per-presence loop (per-presence scoped)'
)
assert(
  loopBody.includes('let journalContextReferences'),
  'journalContextReferences is declared inside per-presence loop (per-presence scoped)'
)

// Verify save happens before push, and messageId comes from savedMsg
assert(
  loopBody.includes('const savedMsg = await saveThreadMessage(thread.id, presenceId, reply, surface)'),
  'Message saved with presenceId as speaker via saveThreadMessage'
)

// Verify the push includes messageId from savedMsg AND journal metadata
const pushStart = loopBody.indexOf('responses.push({')
// Find the matching closing by taking a generous slice (the push block is ~25 lines)
const pushBlock = loopBody.slice(pushStart, pushStart + 1200)

assert(
  pushBlock.includes("messageId: savedMsg?.id ?? null"),
  'Response messageId comes from savedMsg.id (DB-generated)'
)
assert(
  pushBlock.includes('speaker: presenceId'),
  'Response speaker is the loop presenceId'
)
assert(
  pushBlock.includes('journalContextStatus') && pushBlock.includes('journalContextReferences'),
  'Journal metadata is included in same responses.push() as messageId and speaker'
)

// Verify journal variables are reset per iteration (declared with let inside loop)
const journalBlockDecl = loopBody.indexOf("let journalContextBlock = ''")
const journalStatusDecl = loopBody.indexOf("let journalContextStatus: JournalContextStatus")
const journalRefsDecl = loopBody.indexOf("let journalContextReferences: JournalContextReference[]")
assert(
  journalBlockDecl > 0 && journalStatusDecl > 0 && journalRefsDecl > 0,
  'All 3 journal variables are let-declared (reset each iteration)'
)
assert(
  journalBlockDecl < loopBody.indexOf('getJournalContextForPresence'),
  'Journal variables declared before journal call (clean per-iteration state)'
)

// Verify the saved message is presence-specific (speaker = presenceId)
assert(
  loopBody.includes('saveThreadMessage(thread.id, presenceId, reply, surface)'),
  'saveThreadMessage binds message to presenceId (not hardcoded ari/eli)'
)

// ═══════════════════════════════════════════════════════
// 7. LoungeChat.tsx Metadata Wiring
// ═══════════════════════════════════════════════════════
section('7. LoungeChat.tsx metadata wiring')

const loungeChatTsx = readFile('src/components/LoungeChat.tsx')

assert(
  loungeChatTsx.includes('journalContextStatus: resp.journalContextStatus'),
  'LoungeChat captures journalContextStatus from response'
)
assert(
  loungeChatTsx.includes('journalContextReferences: resp.journalContextReferences'),
  'LoungeChat captures journalContextReferences from response'
)
assert(
  loungeChatTsx.includes('messageId: resp.messageId'),
  'LoungeChat captures messageId from response'
)

// ═══════════════════════════════════════════════════════
// 8. Backward Compatibility
// ═══════════════════════════════════════════════════════
section('8. Backward compatibility')

assert(
  journalTs.includes('export async function getInnerContextForPrompt'),
  'Deprecated getInnerContextForPrompt wrapper still exported'
)
assert(
  journalTs.includes('@deprecated'),
  'getInnerContextForPrompt marked as @deprecated'
)
assert(
  journalTs.includes('getJournalContextForPresence(presenceId)'),
  'Deprecated wrapper delegates to getJournalContextForPresence'
)

// ═══════════════════════════════════════════════════════
// 9. 11E.1 Journal Freedom Regression
// ═══════════════════════════════════════════════════════
section('9. 11E.1 journal freedom regression')

assert(
  journalTs.includes('getJournalEntries'),
  'getJournalEntries function still present (journal CRUD intact)'
)
assert(
  journalTs.includes('insertJournalEntry'),
  'insertJournalEntry function still present (write path intact for presence-authored use)'
)
assert(
  loungeChatTs.includes('getSharedAutonomyContinuityForPrompt'),
  'Lounge still includes shared autonomy continuity block (11E.1 intact)'
)

// ═══════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════')
console.log(`  Total: ${passed + failed}  |  Passed: ${passed}  |  Failed: ${failed}`)
console.log('══════════════════════════════════════')

if (failed > 0) {
  console.log('\nFailed tests:')
  failures.forEach(f => console.log(`  ✗ ${f}`))
  process.exit(1)
} else {
  console.log('\nAll tests passed.')
  process.exit(0)
}
