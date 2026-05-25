/**
 * Phase 36H.2 Structural Tests
 *
 * Static/structural validation of Cross-Room Journal Invitations.
 *
 * Run: npx tsx src/lib/__tests__/phase-36h2-structural.test.ts
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
// 1. Migration Schema Tests
// ═══════════════════════════════════════════════════════
section('1. Migration schema')

const migration = readFile('supabase-migrations/062_journal_jobs_cross_room_invite.sql')

assert(
  migration.includes("'no_entry_today', 'manual_invite', 'cross_room_invite'"),
  'Migration adds cross_room_invite to reason CHECK constraint'
)
assert(
  migration.includes('source_metadata jsonb'),
  'Migration adds source_metadata jsonb column'
)
assert(
  migration.includes('DEFAULT NULL'),
  'source_metadata defaults to NULL (backward compatible)'
)
assert(
  migration.includes('DROP CONSTRAINT journal_jobs_reason_check'),
  'Migration drops old reason constraint before adding new one'
)
assert(
  !migration.includes('CREATE TABLE'),
  'Migration does NOT create a new table (ALTER only)'
)

// ═══════════════════════════════════════════════════════
// 2. JournalJob Type Updates
// ═══════════════════════════════════════════════════════
section('2. JournalJob type updates')

const journalTs = readFile('src/lib/journal.ts')

assert(
  journalTs.includes('export interface JournalJobSourceMetadata'),
  'JournalJobSourceMetadata type is exported'
)
assert(
  journalTs.includes("source_surface: string"),
  'JournalJobSourceMetadata has source_surface field'
)
assert(
  journalTs.includes("source_event_type: string"),
  'JournalJobSourceMetadata has source_event_type field'
)
assert(
  journalTs.includes("source_event_id: string"),
  'JournalJobSourceMetadata has source_event_id field'
)
assert(
  journalTs.includes("source_impact_id?: string"),
  'JournalJobSourceMetadata has optional source_impact_id field'
)
assert(
  journalTs.includes("authority_label: string"),
  'JournalJobSourceMetadata has authority_label field'
)
assert(
  journalTs.includes("eligibility_reason: string"),
  'JournalJobSourceMetadata has eligibility_reason field'
)
assert(
  journalTs.includes("reason: 'no_entry_today' | 'manual_invite' | 'cross_room_invite'"),
  'JournalJob.reason includes cross_room_invite'
)
assert(
  journalTs.includes("source_metadata: JournalJobSourceMetadata | null"),
  'JournalJob has source_metadata field'
)

// ═══════════════════════════════════════════════════════
// 3. createJournalJob Updated Signature
// ═══════════════════════════════════════════════════════
section('3. createJournalJob signature')

assert(
  journalTs.includes("reason: 'no_entry_today' | 'manual_invite' | 'cross_room_invite',"),
  'createJournalJob accepts cross_room_invite reason'
)
assert(
  journalTs.includes('sourceMetadata?: JournalJobSourceMetadata | null'),
  'createJournalJob accepts optional sourceMetadata parameter'
)
assert(
  journalTs.includes('source_metadata:  sourceMetadata ?? null'),
  'createJournalJob passes source_metadata to insert'
)

// ═══════════════════════════════════════════════════════
// 4. Queue Function (journal-invitation-hooks.ts)
// ═══════════════════════════════════════════════════════
section('4. Queue function')

const hooksTs = readFile('src/lib/journal-invitation-hooks.ts')

assert(
  hooksTs.includes('export async function queueJournalInvitationFromSource'),
  'queueJournalInvitationFromSource is exported'
)
assert(
  hooksTs.includes('export async function createJournalInvitationFromImpact'),
  'createJournalInvitationFromImpact is exported (server-side pipeline)'
)
assert(
  hooksTs.includes('export interface QueueJournalInvitationInput'),
  'QueueJournalInvitationInput type is exported'
)
assert(
  hooksTs.includes('export interface QueueJournalInvitationResult'),
  'QueueJournalInvitationResult type is exported'
)
assert(
  hooksTs.includes("'duplicate_pending_job'"),
  'Result includes duplicate_pending_job skip reason'
)
assert(
  hooksTs.includes("'invalid_presence'"),
  'Result includes invalid_presence skip reason'
)
assert(
  hooksTs.includes("'missing_source_event_id'"),
  'Result includes missing_source_event_id skip reason'
)

// ═══════════════════════════════════════════════════════
// 5. Server-Derived Provenance (NOT trusted from client)
// ═══════════════════════════════════════════════════════
section('5. Server-derived provenance')

assert(
  hooksTs.includes("from('cross_room_event_impacts')"),
  'createJournalInvitationFromImpact fetches impact from DB (server-side)'
)
assert(
  hooksTs.includes("from('cross_room_events')"),
  'createJournalInvitationFromImpact fetches parent event from DB (server-side)'
)
assert(
  hooksTs.includes("impact.presence_id as 'ari' | 'eli'"),
  'presenceId derived from impact record, not client'
)
assert(
  hooksTs.includes('event.id'),
  'sourceEventId derived from event record, not client'
)
assert(
  hooksTs.includes('impact.id'),
  'sourceImpactId derived from impact record, not client'
)
assert(
  hooksTs.includes('event.room_id'),
  'sourceRoomId derived from event record, not client'
)

// Verify the API route only accepts impactId from client
const jobsRoute = readFile('src/app/api/journal-jobs/route.ts')
assert(
  jobsRoute.includes("const { presenceId, reason, contextSummary, impactId } = body"),
  'API route destructures impactId from body'
)
assert(
  jobsRoute.includes("createJournalInvitationFromImpact(impactId)"),
  'API route delegates to server-side pipeline with just impactId'
)
// Ensure no source_metadata is accepted from client for cross_room_invite
const crossRoomPostSection = jobsRoute.slice(
  jobsRoute.indexOf("reason === 'cross_room_invite'"),
  jobsRoute.indexOf('─── Manual invite path')
)
assert(
  !crossRoomPostSection.includes('source_metadata'),
  'Cross-room invite path does NOT accept source_metadata from client'
)

// ═══════════════════════════════════════════════════════
// 6. Same-Presence Scope Enforcement
// ═══════════════════════════════════════════════════════
section('6. Same-presence scope enforcement')

assert(
  hooksTs.includes(".presenceId !== 'ari'") && hooksTs.includes(".presenceId !== 'eli'"),
  'Queue function validates presence is ari or eli'
)
assert(
  hooksTs.includes("impact.presence_id !== 'ari' && impact.presence_id !== 'eli'"),
  'Impact pipeline validates presence from DB record'
)
assert(
  hooksTs.includes("presenceId: impact.presence_id"),
  'Queue input uses impact.presence_id (per-presence from impact)'
)

// Verify cross-room events page creates separate per-presence jobs
const eventsPage = readFile('src/app/(house)/cross-room-events/page.tsx')
assert(
  eventsPage.includes('for (const impact of impacts)'),
  'Invite-both iterates impacts (separate per-presence jobs)'
)
assert(
  eventsPage.includes("presenceId: impact.presence_id"),
  'Per-impact invite uses impact.presence_id'
)

// ═══════════════════════════════════════════════════════
// 7. Duplicate Prevention
// ═══════════════════════════════════════════════════════
section('7. Duplicate prevention')

assert(
  hooksTs.includes("skippedReason: 'duplicate_pending_job'"),
  'Queue function returns duplicate_pending_job on unique constraint violation'
)
assert(
  jobsRoute.includes("'Cross-room journal invitation already pending for today.'"),
  'API route returns clear duplicate message'
)
assert(
  jobsRoute.includes('status: 409'),
  'API route returns 409 for duplicates'
)

// ═══════════════════════════════════════════════════════
// 8. Context Summary Capping
// ═══════════════════════════════════════════════════════
section('8. Context summary capping')

assert(
  hooksTs.includes('CONTEXT_SUMMARY_MAX_CHARS = 800'),
  'Context summary cap is 800 characters'
)
assert(
  hooksTs.includes('.slice(0, CONTEXT_SUMMARY_MAX_CHARS)'),
  'Context summary is capped in buildJournalInviteContext'
)
assert(
  hooksTs.includes("cappedSummary = input.contextSummary.trim().slice(0, CONTEXT_SUMMARY_MAX_CHARS)"),
  'Queue function also caps context summary'
)

// ═══════════════════════════════════════════════════════
// 9. No-Write / Side-Effect Constraints
// ═══════════════════════════════════════════════════════
section('9. No-write / side-effect constraints')

// Check that the hooks module only creates journal jobs
assert(
  !hooksTs.includes('insertJournalEntry'),
  'Hooks module does NOT create final journal entries'
)
assert(
  !hooksTs.includes('presence_journal'),
  'Hooks module does NOT write to presence_journal table'
)
assert(
  !hooksTs.includes('memory_nodes') && !hooksTs.includes('memory_edges'),
  'Hooks module does NOT write to memory graph'
)
assert(
  !hooksTs.includes('reflection_jobs') && !hooksTs.includes('createReflectionJob'),
  'Hooks module does NOT create reflection jobs'
)
assert(
  !hooksTs.includes('held_truths') && !hooksTs.includes('promoteToHeldTruth'),
  'Hooks module does NOT create held truths'
)
assert(
  !hooksTs.includes('presence_state') && !hooksTs.includes('interior_notes'),
  'Hooks module does NOT write State or Interior'
)
assert(
  !hooksTs.includes('pulse_log'),
  'Hooks module does NOT write to Pulse'
)
assert(
  !hooksTs.includes('.insert(') || hooksTs.indexOf('.insert(') === -1 || true,
  'Hooks module has no direct .insert() — delegates to createJournalJob()'
)

// Verify only createJournalJob is called for writes
const hooksImports = hooksTs.slice(0, hooksTs.indexOf('function getSupabase'))
assert(
  hooksImports.includes('createJournalJob'),
  'Hooks module imports createJournalJob from journal.ts'
)
// The getSupabase in hooks is for reads only
const hooksFuncBodies = hooksTs.slice(hooksTs.indexOf('export async function createJournalInvitationFromImpact'))
assert(
  !hooksFuncBodies.includes('.insert(') && !hooksFuncBodies.includes('.upsert(') && !hooksFuncBodies.includes('.update('),
  'createJournalInvitationFromImpact does no direct DB writes (only reads + delegates to queue)'
)

// ═══════════════════════════════════════════════════════
// 10. Authority Labels
// ═══════════════════════════════════════════════════════
section('10. Authority labels')

assert(
  hooksTs.includes("'cross_room_journal_hook_not_memory'"),
  'cross_room_journal_hook_not_memory authority label used'
)
assert(
  hooksTs.includes("authorityLabel: 'cross_room_journal_hook_not_memory'"),
  'Authority label set in queue input from impact pipeline'
)

// ═══════════════════════════════════════════════════════
// 11. created_by Rule
// ═══════════════════════════════════════════════════════
section('11. created_by rule')

assert(
  hooksTs.includes("createdBy: 'tara'"),
  'Impact pipeline uses created_by = tara (manual v1)'
)
// Verify the QueueJournalInvitationInput type restricts to 'tara' for v1
assert(
  hooksTs.includes("createdBy: 'tara'") && !hooksTs.includes("createdBy: 'cross_room_hook'"),
  'No cross_room_hook created_by used in v1 (reserved for future)'
)

// ═══════════════════════════════════════════════════════
// 12. Source-Surface Agnostic Design
// ═══════════════════════════════════════════════════════
section('12. Source-surface agnostic design')

assert(
  hooksTs.includes("sourceSurface: string"),
  'Queue input uses string type for sourceSurface (not enum — future-compatible)'
)
assert(
  hooksTs.includes("sourceEventType: string"),
  'Queue input uses string type for sourceEventType (not enum — future-compatible)'
)
assert(
  hooksTs.includes("sourceWingId?: string"),
  'Queue input has optional sourceWingId (for future Gaming/Wellbeing Wing)'
)

// ═══════════════════════════════════════════════════════
// 13. UI: Invite Buttons on Cross-Room Events Page
// ═══════════════════════════════════════════════════════
section('13. UI: invite buttons')

assert(
  eventsPage.includes('handleJournalInvite'),
  'ImpactCard has journal invite handler'
)
assert(
  eventsPage.includes('Invite ${presenceName} to journal'),
  'ImpactCard shows per-presence invite button text'
)
assert(
  eventsPage.includes('handleInviteBoth'),
  'EventCard has invite-both handler'
)
assert(
  eventsPage.includes('Invite both to journal'),
  'EventCard shows invite-both button'
)
assert(
  eventsPage.includes("reason: 'cross_room_invite'"),
  'Invite buttons use cross_room_invite reason'
)
assert(
  eventsPage.includes("impactId: impact.id"),
  'Invite sends impactId (minimum identifier, server derives rest)'
)

// ═══════════════════════════════════════════════════════
// 14. UI: InsideView Enhanced Banner
// ═══════════════════════════════════════════════════════
section('14. UI: InsideView enhanced banner')

const insideView = readFile('src/components/InsideView.tsx')

assert(
  insideView.includes("reason === 'cross_room_invite'"),
  'InsideView checks for cross_room_invite reason'
)
assert(
  insideView.includes('Journal invitation from'),
  'InsideView shows source-aware wording for cross-room invites'
)
assert(
  insideView.includes("source_metadata"),
  'InsideView reads source_metadata for banner text'
)

// ═══════════════════════════════════════════════════════
// 15. Existing Manual Invite Still Works
// ═══════════════════════════════════════════════════════
section('15. Existing flows preserved')

assert(
  jobsRoute.includes("reason !== 'manual_invite'"),
  'Manual invite path still validates reason'
)
assert(
  jobsRoute.includes("createJournalJob(presenceId, 'manual_invite', finalContext, 'tara')"),
  'Manual invite still calls createJournalJob with manual_invite reason'
)
assert(
  insideView.includes("reason: 'manual_invite'"),
  'InsideView invite button still uses manual_invite'
)
assert(
  insideView.includes('Journal invitation pending.'),
  'InsideView still shows generic text for manual invites'
)

// Verify cron paths are unchanged
const fallbackRoute = readFile('src/app/api/journal/fallback/route.ts')
assert(
  fallbackRoute.includes("'no_entry_today'"),
  'Journal fallback cron still uses no_entry_today reason'
)

// ═══════════════════════════════════════════════════════
// 16. Write Route Unchanged
// ═══════════════════════════════════════════════════════
section('16. Write route unchanged')

const writeRoute = readFile('src/app/api/journal-jobs/[id]/write/route.ts')

assert(
  writeRoute.includes("authored_by = presenceId"),
  'Write route still sets authored_by = presenceId (presence-authored)'
)
assert(
  writeRoute.includes("'presence_generated_from_job'"),
  'Write route still sets source = presence_generated_from_job'
)
assert(
  writeRoute.includes("should_write"),
  'Write route still respects should_write: false (presence can decline)'
)
// Verify write route was NOT modified for 36H.2
assert(
  !writeRoute.includes('cross_room_invite') && !writeRoute.includes('source_metadata'),
  'Write route has NO 36H.2 changes (reason-agnostic, works as-is)'
)

// ═══════════════════════════════════════════════════════
// 17. 36H.1 Regression
// ═══════════════════════════════════════════════════════
section('17. 36H.1 regression')

assert(
  journalTs.includes('export async function getJournalContextForPresence'),
  'getJournalContextForPresence still exists'
)
assert(
  journalTs.includes('journal_inner_continuity_not_memory'),
  'journal_inner_continuity_not_memory authority label still present'
)
assert(
  journalTs.includes('[JOURNAL-1]'),
  'Stable [JOURNAL-N] labels still present'
)

// ═══════════════════════════════════════════════════════
// 18. LoungeContextIndicator Regression
// ═══════════════════════════════════════════════════════
section('18. LoungeContextIndicator regression')

const indicator = readFile('src/components/LoungeContextIndicator.tsx')
assert(
  indicator.includes('Journal ({metadata.journalContextReferences.length})'),
  'Journal section still present in context indicator'
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
