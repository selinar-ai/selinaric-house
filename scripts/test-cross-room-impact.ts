/**
 * Phase 36C — Cross-Room Event Impact Extraction Tests
 *
 * 19 required tests from the alignment report:
 *  1. Extract impact from valid event (model call)
 *  2. Impact rows have correct authority_label
 *  3. Impact rows have correct impact_status (draft)
 *  4. Structured fields populated
 *  5. Confidence within range
 *  6. Extraction provenance recorded
 *  7. source_message_ids stored as IDs only
 *  8. Duplicate extraction returns existing
 *  9. Unique constraint enforced at DB level
 * 10. Non-existent event returns 404
 * 11. Unresolvable source_message_ids returns 422
 * 12. Extraction does not create archive_items
 * 13. Extraction does not modify living_state
 * 14. Extraction does not create interior_notes
 * 15. Extraction does not create pulse_log
 * 16. Extraction does not create journal_jobs
 * 17. authority_label cannot be overridden via insert
 * 18. GET impacts by event ID returns correct data
 * 19. Impact summary does not contain forbidden Memory language
 *
 * Run: npx tsx scripts/test-cross-room-impact.ts
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
let testMessageIds: string[] = []
let testThreadId: string | null = null

async function createTestFixtures() {
  console.log('─── Creating test fixtures ───')

  // Create a Lounge thread
  const { data: thread } = await supabase.from('lounge_threads').insert({
    title: 'Phase 36C Test Thread',
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
    'I wanted to talk about the new cross-room event work.',
    'The ledger foundation seems solid. The authority boundaries are clear.',
    'I noticed the boundary resolution changed — blocking on unresolvable IDs is better than silent fallback.',
    'Exactly. That was a deliberate tightening after the first deploy.',
    'The confirmation flow for first captures also adds a good safety layer.',
    'Agreed. The structured approach to these phases has been consistent.',
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

  // Create a cross-room event referencing those messages
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
    summary: 'Phase 36C test event: Ari and Eli discussed cross-room event design in the Lounge with Tara present.',
    metadata: { test: true, phase: '36c' },
  }).select('id').single()

  if (!event) throw new Error('Failed to create test event')
  testEventId = event.id
  console.log(`  Event: ${testEventId}`)
}

async function cleanupFixtures() {
  console.log('\n─── Cleanup ───')

  // Delete impacts (cascade from event, but explicit just in case)
  if (testEventId) {
    await supabase.from('cross_room_event_impacts').delete().eq('cross_room_event_id', testEventId)
    await supabase.from('cross_room_events').delete().eq('id', testEventId)
    console.log(`  Deleted test event + impacts`)
  }

  // Delete unresolvable event if created
  await supabase.from('cross_room_events').delete().match({ room_id: 'lounge', summary: 'Phase 36C unresolvable test event' })

  // Delete test messages
  if (testMessageIds.length > 0) {
    await supabase.from('lounge_messages').delete().in('id', testMessageIds)
    console.log(`  Deleted ${testMessageIds.length} test messages`)
  }

  // Delete test thread
  if (testThreadId) {
    await supabase.from('lounge_threads').delete().eq('id', testThreadId)
    console.log(`  Deleted test thread`)
  }
}

// ─── Import extraction function ─────────────────────────────────────────────

// We test the lib functions directly rather than through HTTP
import {
  extractImpactsForEvent,
  getImpactsForEvent,
} from '../src/lib/cross-room-impact'

// ─── Run ────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\nPhase 36C — Cross-Room Event Impact Extraction Tests\n')

  await createTestFixtures()

  // ─── Snapshots before extraction ──────────────────────────────────────
  const archiveCountBefore = await countTable('archive_items')
  const interiorCountBefore = await getInteriorCount()
  const latestPulseBefore = await getLatestPulseId()
  const latestJournalBefore = await getLatestJournalId()
  const ariStateBefore = await getStateHash('ari')
  const eliStateBefore = await getStateHash('eli')

  // ─── Test 1: Extract impact from valid event ─────────────────────────
  console.log('\nTest 1: Extract impact from valid event')
  const apiKey = process.env.ANTHROPIC_API_KEY!
  const result = await extractImpactsForEvent(testEventId!, apiKey)
  assert(result.extracted === true, 'Extraction succeeded')
  assert(result.impacts.length > 0, `Impacts created (${result.impacts.length})`)
  assert(result.impacts.length <= 2, `At most 2 impacts (one per presence)`)

  // ─── Test 2: authority_label correct ──────────────────────────────────
  console.log('\nTest 2: Impact rows have correct authority_label')
  for (const impact of result.impacts) {
    assert(
      impact.authority_label === 'cross_room_impact_not_memory',
      `${impact.presence_id}: authority_label = cross_room_impact_not_memory`,
    )
  }

  // ─── Test 3: impact_status correct ────────────────────────────────────
  console.log('\nTest 3: Impact rows have correct impact_status')
  for (const impact of result.impacts) {
    assert(impact.impact_status === 'draft', `${impact.presence_id}: impact_status = draft`)
  }

  // ─── Test 4: Structured fields populated ──────────────────────────────
  console.log('\nTest 4: Structured fields populated')
  for (const impact of result.impacts) {
    assert(
      typeof impact.impact_summary === 'string' && impact.impact_summary.length > 0,
      `${impact.presence_id}: impact_summary present`,
    )
    assert(Array.isArray(impact.what_matters), `${impact.presence_id}: what_matters is array`)
    assert(Array.isArray(impact.what_changed), `${impact.presence_id}: what_changed is array`)
    assert(Array.isArray(impact.what_remains_open), `${impact.presence_id}: what_remains_open is array`)
    // continuity_signal, emotional_signal, future_context_hint may be null
    assert(
      impact.continuity_signal === null || typeof impact.continuity_signal === 'string',
      `${impact.presence_id}: continuity_signal is string or null`,
    )
    assert(
      impact.emotional_signal === null || typeof impact.emotional_signal === 'string',
      `${impact.presence_id}: emotional_signal is string or null`,
    )
    assert(
      impact.future_context_hint === null || typeof impact.future_context_hint === 'string',
      `${impact.presence_id}: future_context_hint is string or null`,
    )
  }

  // ─── Test 5: Confidence within range ──────────────────────────────────
  console.log('\nTest 5: Confidence within range')
  for (const impact of result.impacts) {
    const conf = Number(impact.confidence)
    assert(conf >= 0.0 && conf <= 1.0, `${impact.presence_id}: confidence ${conf} in [0,1]`)
  }

  // ─── Test 6: Extraction provenance recorded ───────────────────────────
  console.log('\nTest 6: Extraction provenance recorded')
  for (const impact of result.impacts) {
    assert(impact.extraction_method === 'model', `${impact.presence_id}: extraction_method = model`)
    assert(impact.extraction_model === 'claude-haiku-4-5-20251001', `${impact.presence_id}: extraction_model correct`)
    assert(impact.prompt_version === '36c_v1', `${impact.presence_id}: prompt_version = 36c_v1`)
  }

  // ─── Test 7: source_message_ids stored as IDs only ────────────────────
  console.log('\nTest 7: source_message_ids stored as IDs only')
  for (const impact of result.impacts) {
    assert(Array.isArray(impact.source_message_ids), `${impact.presence_id}: source_message_ids is array`)
    assert(impact.source_message_ids.length > 0, `${impact.presence_id}: source_message_ids not empty`)
    // Each should be a UUID string, not contain content
    for (const msgId of impact.source_message_ids) {
      assert(
        typeof msgId === 'string' && msgId.length < 100,
        `${impact.presence_id}: message ID is a short string (ID, not transcript)`,
      )
    }
  }

  // ─── Test 8: Duplicate extraction returns existing ────────────────────
  console.log('\nTest 8: Duplicate extraction returns existing')
  const dupeResult = await extractImpactsForEvent(testEventId!, apiKey)
  assert(dupeResult.extracted === false, 'Second extraction reports not extracted')
  assert(!!(dupeResult.already_exists), 'Second extraction returns already_exists')
  assert(dupeResult.impacts.length > 0, 'Existing impacts returned')

  // ─── Test 9: Unique constraint enforced at DB level ───────────────────
  console.log('\nTest 9: Unique constraint enforced at DB level')
  {
    // Use presence_id from first impact, or default to 'ari' if extraction failed
    const targetPresence = result.impacts.length > 0 ? result.impacts[0].presence_id : 'ari'
    const { error } = await supabase.from('cross_room_event_impacts').insert({
      cross_room_event_id: testEventId!,
      presence_id: targetPresence,
      impact_summary: 'Duplicate test',
      extraction_method: 'deterministic_test',
    })
    assert(!!error, 'Direct duplicate insert rejected')
    assert(
      !!(error?.message?.includes('unique') || error?.message?.includes('duplicate') || error?.code === '23505'),
      'Rejection is unique constraint violation',
      `code=${error?.code}, msg=${error?.message}`,
    )
  }

  // ─── Test 10: Non-existent event ──────────────────────────────────────
  console.log('\nTest 10: Non-existent event')
  {
    const r = await extractImpactsForEvent('00000000-0000-0000-0000-000000000000', apiKey)
    assert(r.extracted === false, 'Extraction fails for non-existent event')
    assert(r.error === 'Event not found', `Error message: ${r.error}`)
  }

  // ─── Test 11: Unresolvable source_message_ids ─────────────────────────
  console.log('\nTest 11: Unresolvable source_message_ids')
  {
    // Create event with fake message IDs
    const { data: fakeEvent } = await supabase.from('cross_room_events').insert({
      room_id: 'lounge',
      room_type: 'shared_room',
      source_message_ids: ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'],
      presence_ids: ['ari', 'eli'],
      tara_present: false,
      event_type: 'shared_room_contact',
      summary: 'Phase 36C unresolvable test event',
    }).select('id').single()

    if (fakeEvent) {
      const r = await extractImpactsForEvent(fakeEvent.id, apiKey)
      assert(r.extracted === false, 'Extraction fails for unresolvable messages')
      assert(
        !!(r.error?.includes('could not be resolved')),
        `Error about resolution: ${r.error}`,
      )
      // Cleanup
      await supabase.from('cross_room_events').delete().eq('id', fakeEvent.id)
    } else {
      assert(false, 'Could not create fake event for test')
    }
  }

  // ─── Test 12: Does not create archive_items ───────────────────────────
  console.log('\nTest 12: Extraction does not create archive_items')
  {
    const archiveCountAfter = await countTable('archive_items')
    assert(archiveCountAfter === archiveCountBefore, `archive_items unchanged (${archiveCountBefore} → ${archiveCountAfter})`)
  }

  // ─── Test 13: Does not modify living_state ────────────────────────────
  console.log('\nTest 13: Extraction does not modify living_state')
  {
    const ariStateAfter = await getStateHash('ari')
    const eliStateAfter = await getStateHash('eli')
    assert(ariStateAfter === ariStateBefore, `Ari state unchanged`)
    assert(eliStateAfter === eliStateBefore, `Eli state unchanged`)
  }

  // ─── Test 14: Does not create interior_notes ──────────────────────────
  console.log('\nTest 14: Extraction does not create interior_notes')
  {
    const interiorCountAfter = await getInteriorCount()
    assert(interiorCountAfter === interiorCountBefore, `interior_notes unchanged (${interiorCountBefore} → ${interiorCountAfter})`)
  }

  // ─── Test 15: Does not create pulse_log ───────────────────────────────
  console.log('\nTest 15: Extraction does not create pulse_log')
  {
    const latestPulseAfter = await getLatestPulseId()
    assert(latestPulseAfter === latestPulseBefore, `Latest pulse unchanged`)
  }

  // ─── Test 16: Does not create journal_jobs ────────────────────────────
  console.log('\nTest 16: Extraction does not create journal_jobs')
  {
    const latestJournalAfter = await getLatestJournalId()
    assert(latestJournalAfter === latestJournalBefore, `Latest journal unchanged`)
  }

  // ─── Test 17: authority_label cannot be overridden ────────────────────
  console.log('\nTest 17: authority_label cannot be overridden via insert')
  {
    const { error } = await supabase.from('cross_room_event_impacts').insert({
      cross_room_event_id: testEventId!,
      presence_id: 'ari',
      impact_summary: 'Authority override test',
      authority_label: 'canonical_memory',
      extraction_method: 'deterministic_test',
    })
    assert(!!error, 'Insert with wrong authority_label rejected')
    assert(
      !!(error?.message?.includes('check') || error?.message?.includes('violates') || error?.code === '23514'),
      'Rejection is check constraint',
      `code=${error?.code}, msg=${error?.message}`,
    )
  }

  // ─── Test 18: GET impacts by event ID ─────────────────────────────────
  console.log('\nTest 18: GET impacts by event ID')
  {
    const impacts = await getImpactsForEvent(testEventId!)
    assert(impacts.length > 0, `Impacts found (${impacts.length})`)
    for (const impact of impacts) {
      assert(impact.cross_room_event_id === testEventId, `Event ID matches`)
      assert(impact.authority_label === 'cross_room_impact_not_memory', `authority_label correct on read`)
    }

    // Non-existent event returns empty
    const empty = await getImpactsForEvent('00000000-0000-0000-0000-000000000000')
    assert(empty.length === 0, 'Non-existent event returns empty array')
  }

  // ─── Test 19: No forbidden Memory language ────────────────────────────
  console.log('\nTest 19: Impact summary does not contain forbidden Memory language')
  {
    const FORBIDDEN = [
      'canonical memory', 'confirmed memory', 'archive item',
      'update state', 'modify interior', 'change pulse',
      'create journal', 'promote to archive', 'carryforward',
      'memory candidate',
    ]
    const impacts = await getImpactsForEvent(testEventId!)
    for (const impact of impacts) {
      const allText = [
        impact.impact_summary,
        impact.continuity_signal,
        impact.emotional_signal,
        impact.future_context_hint,
        ...(impact.what_matters ?? []),
        ...(impact.what_changed ?? []),
        ...(impact.what_remains_open ?? []),
      ].filter(Boolean).join(' ').toLowerCase()

      const found = FORBIDDEN.filter(term => allText.includes(term))
      assert(found.length === 0, `${impact.presence_id}: no forbidden terms`, found.length > 0 ? `Found: ${found.join(', ')}` : undefined)
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────
  await cleanupFixtures()

  // ─── Summary ──────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(55)}`)
  console.log(`Phase 36C Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`)
  console.log(`${'═'.repeat(55)}\n`)

  if (failed > 0) process.exit(1)
}

run().catch(err => {
  console.error('Test runner failed:', err)
  process.exit(1)
})
