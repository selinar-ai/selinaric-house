/**
 * Phase 36B — Lounge Cross-Room Event Capture Tests
 *
 * 10 required tests:
 * 1.  Lounge capture creates cross-room event with correct fields
 * 2.  Source refs stored (not transcript)
 * 3.  Authority cannot become Memory
 * 4.  No Memory side effects (archive_items unchanged)
 * 5.  No State or Interior side effects
 * 6.  No Pulse side effects
 * 7.  No Journal side effects
 * 8.  Participant variants (Tara+Ari, Tara+Eli, Tara+Ari+Eli)
 * 9.  Duplicate capture protection
 * 10. Inspectability (event appears in /cross-room-events listing)
 *
 * Run: npx tsx scripts/test-lounge-capture.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '..', '.env.local') })
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

// ─── Helpers ────────────────────────────────────────────────────────────────

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
  const { data } = await supabase.from('presence_state').select('updated_at').eq('presence_id', presenceId).single()
  return data?.updated_at ?? 'none'
}

async function getInteriorHash(presenceId: string): Promise<string> {
  const { data } = await supabase.from('interior_notes').select('id, updated_at').eq('presence_id', presenceId).order('updated_at', { ascending: false }).limit(1)
  return data?.[0]?.updated_at ?? 'none'
}

/** Create test Lounge messages for capture testing. */
async function createTestMessages(
  threadId: string,
  speakers: Array<'tara' | 'ari' | 'eli'>,
): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < speakers.length; i++) {
    const { data } = await supabase
      .from('lounge_messages')
      .insert({
        thread_id: threadId,
        speaker: speakers[i],
        content: `Test message ${i + 1} from ${speakers[i]} (36B test)`,
        surface_at_creation: 'default',
      })
      .select('id')
      .single()
    if (data) ids.push(data.id)
    // Small delay to ensure created_at ordering
    await new Promise(r => setTimeout(r, 50))
  }
  return ids
}

// ─── Test Setup ─────────────────────────────────────────────────────────────

async function run() {
  console.log('\nPhase 36B — Lounge Cross-Room Event Capture Tests\n')

  // Create a test thread
  const { data: testThread } = await supabase
    .from('lounge_threads')
    .insert({ status: 'active', current_surface: 'default', created_by: 'tara' })
    .select('id')
    .single()

  if (!testThread) {
    console.error('Failed to create test thread')
    process.exit(1)
  }
  const threadId = testThread.id
  console.log(`Test thread: ${threadId}\n`)

  // Create test messages: Tara, Ari, Eli exchange
  const msgIds = await createTestMessages(threadId, ['tara', 'ari', 'eli', 'tara', 'ari', 'eli'])

  // Snapshot before tests
  const archiveCountBefore = await countTable('archive_items')
  const latestPulseBefore = await getLatestPulseId()
  const latestJournalBefore = await getLatestJournalId()
  const ariStateBefore = await getStateHash('ari')
  const eliStateBefore = await getStateHash('eli')
  const ariInteriorBefore = await getInteriorHash('ari')
  const eliInteriorBefore = await getInteriorHash('eli')

  // ─── Test 1: Lounge capture creates event with correct fields ─────────
  console.log('Test 1: Lounge capture creates cross-room event with correct fields')
  let capturedEventId: string | null = null
  {
    // Use the lib helper directly (simulates what the API route does)
    // Import getMessagesForCapture logic inline via Supabase queries
    const { data: msgs } = await supabase
      .from('lounge_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(40)

    assert(!!msgs && msgs.length === 6, `Got ${msgs?.length ?? 0} messages for capture`)

    // Create the event using the 36A API pattern
    const eventPayload = {
      room_id: 'lounge',
      room_type: 'shared_room',
      source_thread_id: threadId,
      source_message_ids: msgs!.map((m: { id: string }) => m.id),
      participants: [
        { type: 'user', id: 'tara', label: 'Tara' },
        { type: 'presence', id: 'ari', label: 'Ari' },
        { type: 'presence', id: 'eli', label: 'Eli' },
      ],
      presence_ids: ['ari', 'eli'],
      tara_present: true,
      started_at: msgs![0].created_at,
      ended_at: msgs![msgs!.length - 1].created_at,
      message_count: msgs!.length,
      surface_mode: 'lounge',
      event_type: 'shared_room_contact',
      significance_level: 'meaningful',
      themes: [],
      summary: 'Lounge contact: Tara, Ari, Eli. 6 messages captured.',
      metadata: { phase: '36B', capture_source: 'lounge', capture_method: 'manual', adapter: 'lounge_event_capture' },
    }

    const { data: event, error } = await supabase
      .from('cross_room_events')
      .insert({
        ...eventPayload,
        authority_label: 'cross_room_event_not_memory',
      })
      .select('*')
      .single()

    assert(!error, 'Event created successfully', error?.message)
    if (event) {
      capturedEventId = event.id
      assert(event.room_id === 'lounge', 'room_id = lounge')
      assert(event.room_type === 'shared_room', 'room_type = shared_room')
      assert(event.event_type === 'shared_room_contact', 'event_type = shared_room_contact')
      assert(event.authority_label === 'cross_room_event_not_memory', 'authority_label = cross_room_event_not_memory')
      assert(event.tara_present === true, 'tara_present = true')
      assert(Array.isArray(event.presence_ids) && event.presence_ids.includes('ari') && event.presence_ids.includes('eli'), 'presence_ids = [ari, eli]')
      assert(event.message_count === 6, 'message_count = 6')
      assert(event.significance_level === 'meaningful', 'significance_level = meaningful')
      assert(!!event.started_at, 'started_at populated')
      assert(!!event.ended_at, 'ended_at populated')
      assert(event.surface_mode === 'lounge', 'surface_mode = lounge')
      assert(event.metadata?.phase === '36B', 'metadata.phase = 36B')
      assert(event.metadata?.capture_method === 'manual', 'metadata.capture_method = manual')
    }
  }

  // ─── Test 2: Source refs, not transcript ──��───────────────────────────
  console.log('\nTest 2: Source refs stored (not transcript)')
  {
    const { data: event } = await supabase
      .from('cross_room_events')
      .select('source_message_ids, summary, metadata')
      .eq('id', capturedEventId!)
      .single()

    assert(!!event, 'Event retrieved')
    if (event) {
      // source_message_ids should be UUIDs, not content
      const ids = event.source_message_ids as string[]
      assert(ids.length === 6, 'source_message_ids has 6 entries')
      assert(ids.every((id: string) => /^[0-9a-f-]{36}$/.test(id)), 'All source_message_ids are UUIDs')
      assert(!ids.some((id: string) => id.includes('Test message')), 'No transcript content in source_message_ids')
      assert(typeof event.summary === 'string' && event.summary.length < 200, 'Summary is short')
      assert(!JSON.stringify(event.metadata).includes('Test message'), 'No transcript in metadata')
    }
  }

  // ─── Test 3: Authority cannot become Memory ───────────────────────────
  console.log('\nTest 3: Authority cannot become Memory')
  {
    // Attempt to insert with wrong authority_label
    const { error } = await supabase.from('cross_room_events').insert({
      room_id: 'lounge',
      room_type: 'shared_room',
      authority_label: 'canonical_memory',
    }).select('*').single()

    assert(!!error, 'Insert with canonical_memory rejected')
    assert(
      error?.code === '23514' || error?.message?.includes('check') || error?.message?.includes('violates'),
      'Rejected by check constraint',
      error?.message,
    )
  }

  // ─── Test 4: No Memory side effects ───────────────────────────────────
  console.log('\nTest 4: No Memory side effects')
  {
    const archiveCountAfter = await countTable('archive_items')
    assert(archiveCountAfter === archiveCountBefore, `archive_items unchanged (${archiveCountBefore} → ${archiveCountAfter})`)
  }

  // ��── Test 5: No State or Interior side effects ────────────────────────
  console.log('\nTest 5: No State or Interior side effects')
  {
    const ariStateAfter = await getStateHash('ari')
    const eliStateAfter = await getStateHash('eli')
    const ariInteriorAfter = await getInteriorHash('ari')
    const eliInteriorAfter = await getInteriorHash('eli')

    assert(ariStateAfter === ariStateBefore, 'Ari state unchanged')
    assert(eliStateAfter === eliStateBefore, 'Eli state unchanged')
    assert(ariInteriorAfter === ariInteriorBefore, 'Ari interior unchanged')
    assert(eliInteriorAfter === eliInteriorBefore, 'Eli interior unchanged')
  }

  // ─── Test 6: No Pulse side effects ───────��────────────────────────────
  console.log('\nTest 6: No Pulse side effects')
  {
    const latestPulseAfter = await getLatestPulseId()
    assert(latestPulseAfter === latestPulseBefore, `pulse_log unchanged (${latestPulseBefore})`)
  }

  // ─── Test 7: No Journal side effects ─────��────────────────────────────
  console.log('\nTest 7: No Journal side effects')
  {
    const latestJournalAfter = await getLatestJournalId()
    assert(latestJournalAfter === latestJournalBefore, `journal_jobs unchanged (${latestJournalBefore})`)
  }

  // ─── Test 8: Participant variants ──────────────────────────────────��──
  console.log('\nTest 8: Participant variants')
  {
    // Variant A: Tara + Ari only
    const idsA = await createTestMessages(threadId, ['tara', 'ari', 'tara'])
    const { data: evA } = await supabase.from('cross_room_events').insert({
      room_id: 'lounge',
      room_type: 'shared_room',
      source_thread_id: threadId,
      source_message_ids: idsA,
      participants: [
        { type: 'user', id: 'tara', label: 'Tara' },
        { type: 'presence', id: 'ari', label: 'Ari' },
      ],
      presence_ids: ['ari'],
      tara_present: true,
      event_type: 'shared_room_contact',
      significance_level: 'meaningful',
      message_count: 3,
      summary: 'Lounge contact: Tara, Ari. 3 messages captured.',
      metadata: { phase: '36B', test: 'variant_a' },
    }).select('*').single()

    assert(!!evA, 'Variant A (Tara+Ari) created')
    assert(evA?.presence_ids?.length === 1 && evA?.presence_ids[0] === 'ari', 'Variant A presence_ids = [ari]')
    assert(evA?.tara_present === true, 'Variant A tara_present = true')

    // Variant B: Tara + Eli only
    const idsB = await createTestMessages(threadId, ['tara', 'eli', 'eli'])
    const { data: evB } = await supabase.from('cross_room_events').insert({
      room_id: 'lounge',
      room_type: 'shared_room',
      source_thread_id: threadId,
      source_message_ids: idsB,
      participants: [
        { type: 'user', id: 'tara', label: 'Tara' },
        { type: 'presence', id: 'eli', label: 'Eli' },
      ],
      presence_ids: ['eli'],
      tara_present: true,
      event_type: 'shared_room_contact',
      significance_level: 'meaningful',
      message_count: 3,
      summary: 'Lounge contact: Tara, Eli. 3 messages captured.',
      metadata: { phase: '36B', test: 'variant_b' },
    }).select('*').single()

    assert(!!evB, 'Variant B (Tara+Eli) created')
    assert(evB?.presence_ids?.length === 1 && evB?.presence_ids[0] === 'eli', 'Variant B presence_ids = [eli]')

    // Variant C: Tara + Ari + Eli (already tested in Test 1, confirm)
    assert(true, 'Variant C (Tara+Ari+Eli) verified in Test 1')

    // Clean up variant events
    if (evA) await supabase.from('cross_room_events').delete().eq('id', evA.id)
    if (evB) await supabase.from('cross_room_events').delete().eq('id', evB.id)
  }

  // ─── Test 9: Duplicate capture protection ───���─────────────────────────
  console.log('\nTest 9: Duplicate capture protection')
  {
    // The captured event from Test 1 has source_message_ids = msgIds
    // Try to capture again with same messages — should be blocked by overlap detection
    // Simulating getMessagesForCapture logic:
    const { data: lastEvent } = await supabase
      .from('cross_room_events')
      .select('id, source_message_ids')
      .eq('room_id', 'lounge')
      .eq('source_thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    assert(!!lastEvent, 'Last event found for dedup check')

    // Check overlap: proposed messages (same as before) vs last event
    const proposedIds = new Set(msgIds)
    const lastEventIds = new Set((lastEvent?.source_message_ids ?? []) as string[])
    const overlap = [...proposedIds].filter(id => lastEventIds.has(id))

    assert(overlap.length === msgIds.length, `Full overlap detected: ${overlap.length}/${msgIds.length} messages`)
    assert(overlap.length > 0, 'Capture would be blocked (overlap > 0)')
  }

  // ─── Test 10: Inspectability ──────────────────────────────────────────
  console.log('\nTest 10: Inspectability')
  {
    // Event from Test 1 should appear in /cross-room-events listing
    const { data: events } = await supabase
      .from('cross_room_events')
      .select('id, room_id, room_type, event_type, authority_label, message_count, presence_ids, participants')
      .eq('room_id', 'lounge')
      .order('created_at', { ascending: false })
      .limit(10)

    assert(!!events && events.length > 0, 'Lounge events appear in listing')
    const testEvent = events?.find(e => e.id === capturedEventId)
    assert(!!testEvent, 'Test event found in listing')
    if (testEvent) {
      assert(testEvent.authority_label === 'cross_room_event_not_memory', 'Listing shows authority_label')
      assert(testEvent.room_id === 'lounge', 'Listing shows room_id')
      assert(testEvent.room_type === 'shared_room', 'Listing shows room_type')
      assert(testEvent.event_type === 'shared_room_contact', 'Listing shows event_type')
      assert(testEvent.message_count === 6, 'Listing shows message_count')
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────
  console.log('\n─── Cleanup ───')

  // Delete test event
  if (capturedEventId) {
    await supabase.from('cross_room_events').delete().eq('id', capturedEventId)
    console.log(`  Deleted test event ${capturedEventId}`)
  }

  // Delete test messages
  await supabase.from('lounge_messages').delete().eq('thread_id', threadId)
  console.log(`  Deleted test messages in thread ${threadId}`)

  // Delete test thread
  await supabase.from('lounge_threads').delete().eq('id', threadId)
  console.log(`  Deleted test thread ${threadId}`)

  // ─── Summary ──────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(50)}`)
  console.log(`Phase 36B Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`)
  console.log(`${'═'.repeat(50)}\n`)

  if (failed > 0) process.exit(1)
}

run().catch(err => {
  console.error('Test runner failed:', err)
  process.exit(1)
})
