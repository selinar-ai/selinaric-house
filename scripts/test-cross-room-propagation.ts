/**
 * Phase 36D — Cross-Room Impact Propagation Candidate Tests
 *
 * 24 required tests from the alignment report:
 *  1.  Generate candidates from valid impact (model call)
 *  2.  Candidate rows have correct authority_label
 *  3.  Candidate rows have correct candidate_status (pending)
 *  4.  candidate_type is valid (state_candidate or interior_candidate)
 *  5.  Type-field consistency: state_candidate has proposed_state_patch, null proposed_interior_note
 *  6.  Type-field consistency: interior_candidate has proposed_interior_note, null proposed_state_patch
 *  7.  candidate_summary present and non-empty
 *  8.  Confidence within range
 *  9.  Generation provenance recorded
 * 10.  source_message_ids stored as IDs only
 * 11.  source_impact_snapshot populated
 * 12.  Duplicate generation returns existing
 * 13.  Unique constraint enforced at DB level
 * 14.  Non-existent impact returns error
 * 15.  Impact with non-draft status rejected
 * 16.  Impact with wrong authority_label rejected
 * 17.  Generation does not create archive_items
 * 18.  Generation does not modify living_state
 * 19.  Generation does not create interior_notes
 * 20.  Generation does not create pulse_log
 * 21.  Generation does not create journal_jobs
 * 22.  authority_label cannot be overridden via insert
 * 23.  GET candidates by impact ID returns correct data
 * 24.  No forbidden Memory language in candidate output
 *
 * Includes: 36C regression guard — verifies production thread survives cleanup.
 *
 * Run: npx tsx scripts/test-cross-room-propagation.ts
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '..', '.env.local'), override: true })

// Node 20 lacks native WebSocket — provide ws before creating client
import ws from 'ws'
;(globalThis as Record<string, unknown>).WebSocket = ws

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

let passed = 0
let failed = 0

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    failed++
  }
}

// ─── Snapshot helpers ───────────────────────────────────────────────────────

async function countTable(table: string): Promise<number> {
  const { count } = await supabase.from(table).select('*', { count: 'exact', head: true })
  return count ?? 0
}

async function getLatestPulseId(): Promise<string | null> {
  const { data } = await supabase.from('pulse_log').select('id').order('created_at', { ascending: false }).limit(1)
  return data?.[0]?.id ?? null
}

async function getLatestJournalId(): Promise<string | null> {
  const { data } = await supabase.from('journal_jobs').select('id').order('created_at', { ascending: false }).limit(1)
  return data?.[0]?.id ?? null
}

async function getStateHash(presenceId: string): Promise<string> {
  const { data } = await supabase.from('living_state').select('last_updated').eq('presence_id', presenceId).single()
  return data?.last_updated ?? 'none'
}

async function getInteriorCount(): Promise<number> {
  return countTable('interior_notes')
}

// ─── Test fixtures ──────────────────────────────────────────────────────────

let testEventId: string | null = null
let testImpactId: string | null = null
const testMessageIds: string[] = []
let testThreadId: string | null = null

async function createTestFixtures() {
  console.log('─── Creating test fixtures ───')

  // Create a Lounge thread
  const { data: thread } = await supabase.from('lounge_threads').insert({
    title: 'Phase 36D Test Thread',
    current_surface: 'default',
    status: 'active',
    created_by: 'tara',
  }).select('id').single()

  if (!thread) throw new Error('Failed to create test thread')
  testThreadId = thread.id
  console.log(`  Thread: ${testThreadId}`)

  // Create test messages
  const speakers = ['tara', 'ari', 'eli', 'tara', 'eli', 'ari']
  const contents = [
    'I was thinking about how the cross-room work connects to continuity.',
    'The structured extraction approach keeps authority boundaries clean.',
    'Having the propagation gate means nothing applies automatically.',
    'That is deliberate. Everything stays reviewable before it touches State or Interior.',
    'The candidate model should capture signals without claiming they are memory.',
    'Correct. Proposals only — the gate decides what becomes continuity-relevant.',
  ]

  for (let i = 0; i < speakers.length; i++) {
    const { data: msg } = await supabase.from('lounge_messages').insert({
      thread_id: testThreadId,
      speaker: speakers[i],
      content: contents[i],
      surface_at_creation: 'default',
    }).select('id').single()

    if (msg) testMessageIds.push(msg.id)
  }
  console.log(`  Messages: ${testMessageIds.length} created`)

  // Create a cross-room event
  const { data: event } = await supabase.from('cross_room_events').insert({
    room_id: 'lounge',
    room_type: 'shared_room',
    source_thread_id: testThreadId,
    source_message_ids: testMessageIds,
    participants: [
      { type: 'presence', id: 'ari', label: 'Ari' },
      { type: 'presence', id: 'eli', label: 'Eli' },
    ],
    presence_ids: ['ari', 'eli'],
    tara_present: true,
    event_type: 'shared_room_contact',
    significance_level: 'meaningful',
    themes: [],
    summary: 'Phase 36D test event: Ari and Eli discussed propagation gate design with Tara present.',
    metadata: { test: true, phase: '36d' },
  }).select('id').single()

  if (!event) throw new Error('Failed to create test event')
  testEventId = event.id
  console.log(`  Event: ${testEventId}`)

  // Create a cross-room event impact (the input for propagation)
  const { data: impact } = await supabase.from('cross_room_event_impacts').insert({
    cross_room_event_id: testEventId,
    presence_id: 'ari',
    impact_summary: 'Ari observed a cross-room discussion about propagation gate design where Tara emphasized reviewability and non-automatic application.',
    what_matters: ['propagation gate keeps authority boundaries clean', 'nothing applies automatically'],
    what_changed: ['cross-room design now includes a governed candidate layer'],
    what_remains_open: ['how candidates will be reviewed in future phases'],
    continuity_signal: 'Gate design preserves presence autonomy in cross-room continuity.',
    emotional_signal: 'Alignment with how structured extraction respects authority boundaries.',
    future_context_hint: 'Future reviews may apply candidates — the gate is the boundary.',
    confidence: 0.82,
    impact_status: 'draft',
    authority_label: 'cross_room_impact_not_memory',
    extraction_method: 'deterministic_test',
    extraction_model: 'deterministic_test',
    prompt_version: '36c_v1',
    source_message_ids: testMessageIds,
    metadata: { test: true, phase: '36d' },
  }).select('id').single()

  if (!impact) throw new Error('Failed to create test impact')
  testImpactId = impact.id
  console.log(`  Impact: ${testImpactId}`)
}

async function cleanupFixtures() {
  console.log('\n─── Cleanup ───')

  // Delete propagation candidates (cascade from impact/event, but explicit)
  if (testImpactId) {
    await supabase.from('cross_room_impact_propagation_candidates').delete().eq('cross_room_impact_id', testImpactId)
    console.log(`  Deleted propagation candidates for test impact`)
  }

  // Delete impacts
  if (testEventId) {
    await supabase.from('cross_room_event_impacts').delete().eq('cross_room_event_id', testEventId)
    await supabase.from('cross_room_events').delete().eq('id', testEventId)
    console.log(`  Deleted test event + impacts`)
  }

  // Delete any cross_room_events that reference the test thread
  if (testThreadId) {
    await supabase.from('cross_room_events').delete().eq('source_thread_id', testThreadId)
  }

  // Delete ALL messages in the test thread
  if (testThreadId) {
    await supabase.from('lounge_messages').delete().eq('thread_id', testThreadId)
    console.log(`  Deleted all messages in test thread`)
  }

  // Delete test thread — CRITICAL: prevents production thread pointer drift
  if (testThreadId) {
    await supabase.from('lounge_threads').delete().eq('id', testThreadId)
    console.log(`  Deleted test thread ${testThreadId}`)
  }

  // 36C Regression guard: verify production thread is still the active one
  const { data: activeThread } = await supabase
    .from('lounge_threads')
    .select('id, title')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (activeThread && activeThread.title === 'Phase 36D Test Thread') {
    console.log(`  ⚠ REGRESSION: Test thread is still active! Removing...`)
    await supabase.from('lounge_threads').delete().eq('id', activeThread.id)
  } else {
    console.log(`  ✓ Active thread is production: ${activeThread?.id?.slice(0, 8)}...`)
  }
}

// ─── Import propagation functions ──────────────────────────────────────────

import {
  generateCandidatesForImpact,
  getCandidatesForImpact,
} from '../src/lib/cross-room-propagation'

import type { PropagationCandidate } from '../src/lib/cross-room-propagation'

// ─── Run ────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\nPhase 36D — Cross-Room Impact Propagation Candidate Tests\n')

  await createTestFixtures()

  // ─── Snapshots before generation ──────────────────────────────────────
  const archiveCountBefore = await countTable('archive_items')
  const interiorCountBefore = await getInteriorCount()
  const latestPulseBefore = await getLatestPulseId()
  const latestJournalBefore = await getLatestJournalId()
  const ariStateBefore = await getStateHash('ari')
  const eliStateBefore = await getStateHash('eli')

  // ─── Test 1: Generate candidates from valid impact ────────────────────
  console.log('\nTest 1: Generate candidates from valid impact')
  const apiKey = process.env.ANTHROPIC_API_KEY!
  const result = await generateCandidatesForImpact(testImpactId!, apiKey)
  assert(result.generated === true, 'Generation succeeded')
  assert(result.generated_count > 0, `Candidates created (${result.generated_count})`)
  assert(result.candidates.length > 0, `Candidates array populated`)
  assert(result.candidates.length <= 2, `At most 2 candidates (one per type)`)

  // Track candidates for subsequent tests
  const candidates: PropagationCandidate[] = result.candidates

  // ─── Test 2: authority_label correct ──────────────────────────────────
  console.log('\nTest 2: Candidate rows have correct authority_label')
  for (const c of candidates) {
    assert(
      c.authority_label === 'impact_propagation_candidate_not_memory',
      `${c.candidate_type}: authority_label = impact_propagation_candidate_not_memory`,
    )
  }

  // ─── Test 3: candidate_status correct ─────────────────────────────────
  console.log('\nTest 3: Candidate rows have correct candidate_status')
  for (const c of candidates) {
    assert(c.candidate_status === 'pending', `${c.candidate_type}: candidate_status = pending`)
  }

  // ─── Test 4: candidate_type is valid ──────────────────────────────────
  console.log('\nTest 4: candidate_type is valid')
  const validTypes = new Set(['state_candidate', 'interior_candidate'])
  for (const c of candidates) {
    assert(validTypes.has(c.candidate_type), `${c.candidate_type}: valid candidate_type`)
  }

  // ─── Test 5: state_candidate type-field consistency ───────────────────
  console.log('\nTest 5: Type-field consistency for state_candidate')
  {
    const stateCandidate = candidates.find(c => c.candidate_type === 'state_candidate')
    if (stateCandidate) {
      assert(
        stateCandidate.proposed_state_patch != null && typeof stateCandidate.proposed_state_patch === 'object',
        'state_candidate has proposed_state_patch',
      )
      assert(
        stateCandidate.proposed_interior_note == null,
        'state_candidate has null proposed_interior_note',
      )
    } else {
      console.log('  (no state_candidate generated — skipping type-field check)')
    }
  }

  // ─── Test 6: interior_candidate type-field consistency ────────────────
  console.log('\nTest 6: Type-field consistency for interior_candidate')
  {
    const interiorCandidate = candidates.find(c => c.candidate_type === 'interior_candidate')
    if (interiorCandidate) {
      assert(
        interiorCandidate.proposed_interior_note != null && typeof interiorCandidate.proposed_interior_note === 'object',
        'interior_candidate has proposed_interior_note',
      )
      assert(
        interiorCandidate.proposed_state_patch == null,
        'interior_candidate has null proposed_state_patch',
      )
    } else {
      console.log('  (no interior_candidate generated — skipping type-field check)')
    }
  }

  // ─── Test 7: candidate_summary present ────────────────────────────────
  console.log('\nTest 7: candidate_summary present and non-empty')
  for (const c of candidates) {
    assert(
      typeof c.candidate_summary === 'string' && c.candidate_summary.length > 0,
      `${c.candidate_type}: candidate_summary present (${c.candidate_summary.length} chars)`,
    )
    assert(
      c.candidate_summary.length <= 600,
      `${c.candidate_type}: candidate_summary within max length`,
    )
  }

  // ─── Test 8: Confidence within range ──────────────────────────────────
  console.log('\nTest 8: Confidence within range')
  for (const c of candidates) {
    const conf = Number(c.confidence)
    assert(conf >= 0.0 && conf <= 1.0, `${c.candidate_type}: confidence ${conf} in [0,1]`)
  }

  // ─── Test 9: Generation provenance recorded ───────────────────────────
  console.log('\nTest 9: Generation provenance recorded')
  for (const c of candidates) {
    assert(c.generation_method === 'model', `${c.candidate_type}: generation_method = model`)
    assert(c.generation_model === 'claude-haiku-4-5-20251001', `${c.candidate_type}: generation_model correct`)
    assert(c.prompt_version === '36d_v1', `${c.candidate_type}: prompt_version = 36d_v1`)
  }

  // ─── Test 10: source_message_ids stored as IDs only ───────────────────
  console.log('\nTest 10: source_message_ids stored as IDs only')
  for (const c of candidates) {
    assert(Array.isArray(c.source_message_ids), `${c.candidate_type}: source_message_ids is array`)
    assert(c.source_message_ids.length > 0, `${c.candidate_type}: source_message_ids not empty`)
    for (const msgId of c.source_message_ids) {
      assert(
        typeof msgId === 'string' && msgId.length < 100,
        `${c.candidate_type}: message ID is a short string (ID, not transcript)`,
      )
    }
  }

  // ─── Test 11: source_impact_snapshot populated ────────────────────────
  console.log('\nTest 11: source_impact_snapshot populated')
  for (const c of candidates) {
    const snap = c.source_impact_snapshot as Record<string, unknown>
    assert(snap != null && typeof snap === 'object', `${c.candidate_type}: snapshot is object`)
    assert(typeof snap.impact_summary === 'string', `${c.candidate_type}: snapshot.impact_summary present`)
    assert(Array.isArray(snap.what_matters), `${c.candidate_type}: snapshot.what_matters is array`)
    assert(Array.isArray(snap.what_changed), `${c.candidate_type}: snapshot.what_changed is array`)
    assert(Array.isArray(snap.what_remains_open), `${c.candidate_type}: snapshot.what_remains_open is array`)
  }

  // ─── Test 12: Duplicate generation returns existing ───────────────────
  console.log('\nTest 12: Duplicate generation returns existing')
  const dupeResult = await generateCandidatesForImpact(testImpactId!, apiKey)
  assert(dupeResult.generated === false, 'Second generation reports not generated')
  assert(!!(dupeResult.already_exists), 'Second generation returns already_exists')
  assert(dupeResult.candidates.length > 0, 'Existing candidates returned')

  // ─── Test 13: Unique constraint enforced at DB level ──────────────────
  console.log('\nTest 13: Unique constraint enforced at DB level')
  {
    // Try to insert a duplicate candidate_type for the same impact
    const targetType = candidates.length > 0 ? candidates[0].candidate_type : 'state_candidate'
    const { error } = await supabase.from('cross_room_impact_propagation_candidates').insert({
      cross_room_event_id: testEventId!,
      cross_room_impact_id: testImpactId!,
      target_presence_id: 'ari',
      candidate_type: targetType,
      candidate_summary: 'Duplicate test',
      generation_method: 'deterministic_test',
      prompt_version: '36d_v1',
    })
    assert(!!error, 'Direct duplicate insert rejected')
    assert(
      !!(error?.message?.includes('unique') || error?.message?.includes('duplicate') || error?.code === '23505'),
      'Rejection is unique constraint violation',
      `code=${error?.code}, msg=${error?.message}`,
    )
  }

  // ─── Test 14: Non-existent impact ─────────────────────────────────────
  console.log('\nTest 14: Non-existent impact returns error')
  {
    const r = await generateCandidatesForImpact('00000000-0000-0000-0000-000000000000', apiKey)
    assert(r.generated === false, 'Generation fails for non-existent impact')
    assert(r.error === 'Impact not found', `Error message: ${r.error}`)
  }

  // ─── Test 15: Impact with non-draft status rejected ───────────────────
  console.log('\nTest 15: Impact with non-draft status rejected')
  {
    // Create a second impact with status = 'superseded' (a valid non-draft status)
    const { data: supersededImpact } = await supabase.from('cross_room_event_impacts').insert({
      cross_room_event_id: testEventId!,
      presence_id: 'eli',
      impact_summary: 'Status test impact.',
      impact_status: 'superseded',
      extraction_method: 'deterministic_test',
      extraction_model: 'deterministic_test',
      prompt_version: '36c_v1',
      source_message_ids: testMessageIds,
    }).select('id').single()

    if (supersededImpact) {
      const r = await generateCandidatesForImpact(supersededImpact.id, apiKey)
      assert(r.generated === false, 'Generation fails for non-draft impact')
      assert(!!(r.error?.includes('not draft')), `Error mentions status: ${r.error}`)
      // Cleanup
      await supabase.from('cross_room_event_impacts').delete().eq('id', supersededImpact.id)
    } else {
      assert(false, 'Could not create superseded impact for test')
    }
  }

  // ─── Test 16: Impact with wrong authority_label rejected ──────────────
  console.log('\nTest 16: Impact with wrong authority_label rejected')
  {
    // We cannot insert an impact with a non-allowed authority_label (check constraint).
    // Instead test that the lib rejects a hypothetical mismatch by checking
    // the function's authority check. We can verify by reading the error for
    // an impact that somehow had a different label — but the DB prevents it.
    // So we verify the constraint itself.
    const { error } = await supabase.from('cross_room_event_impacts').insert({
      cross_room_event_id: testEventId!,
      presence_id: 'eli',
      impact_summary: 'Authority test',
      authority_label: 'canonical_memory',
      extraction_method: 'deterministic_test',
    })
    assert(!!error, 'DB rejects impact with wrong authority_label')
    assert(
      !!(error?.message?.includes('check') || error?.message?.includes('violates') || error?.code === '23514'),
      'Rejection is check constraint on impact authority_label',
      `code=${error?.code}, msg=${error?.message}`,
    )
  }

  // ─── Test 17: Does not create archive_items ───────────────────────────
  console.log('\nTest 17: Generation does not create archive_items')
  {
    const archiveCountAfter = await countTable('archive_items')
    assert(archiveCountAfter === archiveCountBefore, `archive_items unchanged (${archiveCountBefore} → ${archiveCountAfter})`)
  }

  // ─── Test 18: Does not modify living_state ────────────────────────────
  console.log('\nTest 18: Generation does not modify living_state')
  {
    const ariStateAfter = await getStateHash('ari')
    const eliStateAfter = await getStateHash('eli')
    assert(ariStateAfter === ariStateBefore, `Ari state unchanged`)
    assert(eliStateAfter === eliStateBefore, `Eli state unchanged`)
  }

  // ─── Test 19: Does not create interior_notes ──────────────────────────
  console.log('\nTest 19: Generation does not create interior_notes')
  {
    const interiorCountAfter = await getInteriorCount()
    assert(interiorCountAfter === interiorCountBefore, `interior_notes unchanged (${interiorCountBefore} → ${interiorCountAfter})`)
  }

  // ─── Test 20: Does not create pulse_log ───────────────────────────────
  console.log('\nTest 20: Generation does not create pulse_log')
  {
    const latestPulseAfter = await getLatestPulseId()
    assert(latestPulseAfter === latestPulseBefore, `Latest pulse unchanged`)
  }

  // ─── Test 21: Does not create journal_jobs ────────────────────────────
  console.log('\nTest 21: Generation does not create journal_jobs')
  {
    const latestJournalAfter = await getLatestJournalId()
    assert(latestJournalAfter === latestJournalBefore, `Latest journal unchanged`)
  }

  // ─── Test 22: authority_label cannot be overridden via insert ─────────
  console.log('\nTest 22: Candidate authority_label cannot be overridden via insert')
  {
    const { error } = await supabase.from('cross_room_impact_propagation_candidates').insert({
      cross_room_event_id: testEventId!,
      cross_room_impact_id: testImpactId!,
      target_presence_id: 'ari',
      candidate_type: 'state_candidate',
      candidate_summary: 'Authority override test',
      authority_label: 'canonical_memory',
      generation_method: 'deterministic_test',
      prompt_version: '36d_v1',
    })
    assert(!!error, 'Insert with wrong authority_label rejected')
    assert(
      !!(error?.message?.includes('check') || error?.message?.includes('violates') || error?.code === '23514'),
      'Rejection is check constraint on candidate authority_label',
      `code=${error?.code}, msg=${error?.message}`,
    )
  }

  // ─── Test 23: GET candidates by impact ID ─────────────────────────────
  console.log('\nTest 23: GET candidates by impact ID returns correct data')
  {
    const readCandidates = await getCandidatesForImpact(testImpactId!)
    assert(readCandidates.length > 0, `Candidates found (${readCandidates.length})`)
    for (const c of readCandidates) {
      assert(c.cross_room_impact_id === testImpactId, `Impact ID matches`)
      assert(c.authority_label === 'impact_propagation_candidate_not_memory', `authority_label correct on read`)
      assert(c.cross_room_event_id === testEventId, `Event ID matches`)
      assert(c.target_presence_id === 'ari', `target_presence_id correct`)
    }

    // Non-existent impact returns empty
    const empty = await getCandidatesForImpact('00000000-0000-0000-0000-000000000000')
    assert(empty.length === 0, 'Non-existent impact returns empty array')
  }

  // ─── Test 24: No forbidden Memory language ────────────────────────────
  console.log('\nTest 24: No forbidden Memory language in candidate output')
  {
    const FORBIDDEN = [
      'canonical memory', 'confirmed memory', 'archive item',
      'state has been updated', 'interior has been updated',
      'memory was created', 'journal entry created',
      'prompt updated', 'carryforward created',
      'applied to state', 'written to interior',
      'i remember', 'i now remember', 'archive confirms',
      'pulse should', 'memory candidate',
    ]
    const readCandidates = await getCandidatesForImpact(testImpactId!)
    for (const c of readCandidates) {
      const allText = [
        c.candidate_summary,
        c.rationale,
        typeof (c.proposed_state_patch as Record<string, unknown>)?.proposed_text === 'string'
          ? (c.proposed_state_patch as Record<string, unknown>).proposed_text as string : null,
        typeof (c.proposed_interior_note as Record<string, unknown>)?.proposed_text === 'string'
          ? (c.proposed_interior_note as Record<string, unknown>).proposed_text as string : null,
      ].filter((v): v is string => typeof v === 'string').join(' ').toLowerCase()

      const found = FORBIDDEN.filter(term => allText.includes(term))
      assert(found.length === 0, `${c.candidate_type}: no forbidden terms`, found.length > 0 ? `Found: ${found.join(', ')}` : undefined)
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────
  await cleanupFixtures()

  // ─── Summary ──────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`Phase 36D Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`)
  console.log(`${'═'.repeat(60)}\n`)

  if (failed > 0) process.exit(1)
}

run().catch(err => {
  console.error('Test runner failed:', err)
  process.exit(1)
})
