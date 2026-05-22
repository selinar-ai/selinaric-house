/**
 * Phase 36A — Cross-Room Event Ledger Tests
 *
 * 7 required tests from the brief:
 * 1. Create event → row exists with correct fields
 * 2. Client cannot create Memory (authority_label forced)
 * 3. Event does not update Memory (archive_items unchanged)
 * 4. Event does not update State/Interior
 * 5. Event does not touch Pulse
 * 6. Event does not create journal job
 * 7. List/read inspection works
 *
 * Run: npx tsx scripts/test-cross-room-events.ts
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '..', '.env.local') })

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
let createdEventId: string | null = null

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
  const { data } = await supabase.from('presence_state').select('updated_at').eq('presence_id', presenceId).single()
  return data?.updated_at ?? 'none'
}

async function getInteriorHash(presenceId: string): Promise<string> {
  const { data } = await supabase.from('interior_notes').select('id, updated_at').eq('presence_id', presenceId).order('updated_at', { ascending: false }).limit(1)
  return data?.[0]?.updated_at ?? 'none'
}

// ─── Run ────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\nPhase 36A — Cross-Room Event Ledger Tests\n')

  // ─── Snapshots before create ──────────────────────────────────────────
  const archiveCountBefore = await countTable('archive_items')
  const latestPulseBefore = await getLatestPulseId()
  const latestJournalBefore = await getLatestJournalId()
  const ariStateBefore = await getStateHash('ari')
  const eliStateBefore = await getStateHash('eli')
  const ariInteriorBefore = await getInteriorHash('ari')
  const eliInteriorBefore = await getInteriorHash('eli')

  // ─── Test 1: Create event → row exists with correct fields ────────────
  console.log('Test 1: Create event → row exists with correct fields')
  {
    const { data, error } = await supabase.from('cross_room_events').insert({
      room_id: 'lounge',
      room_type: 'shared',
      source_thread_id: 'test-thread-36a',
      source_message_ids: ['msg-001', 'msg-002', 'msg-003'],
      participants: [
        { type: 'presence', id: 'ari', label: 'Ari' },
        { type: 'presence', id: 'eli', label: 'Eli' },
      ],
      presence_ids: ['ari', 'eli'],
      tara_present: true,
      event_type: 'shared_room_contact',
      significance_level: 'meaningful',
      themes: ['phase-36-discussion', 'cross-room-design'],
      summary: 'Phase 36A test event: Ari and Eli discussed cross-room event design in the Lounge with Tara present.',
      metadata: { test: true, phase: '36a' },
    }).select('*').single()

    assert(!error, 'Insert succeeds', error?.message)
    assert(!!data, 'Row returned')
    if (data) {
      createdEventId = data.id
      assert(data.room_id === 'lounge', 'room_id = lounge')
      assert(data.room_type === 'shared', 'room_type = shared')
      assert(data.event_type === 'shared_room_contact', 'event_type = shared_room_contact')
      assert(data.significance_level === 'meaningful', 'significance_level = meaningful')
      assert(data.tara_present === true, 'tara_present = true')
      assert(Array.isArray(data.presence_ids) && data.presence_ids.includes('ari') && data.presence_ids.includes('eli'), 'presence_ids contains ari and eli')
      assert(Array.isArray(data.source_message_ids) && data.source_message_ids.length === 3, 'source_message_ids has 3 entries')
      assert(Array.isArray(data.themes) && data.themes.length === 2, 'themes has 2 entries')
      assert(!!data.summary, 'summary present')
      assert(data.authority_label === 'cross_room_event_not_memory', 'authority_label = cross_room_event_not_memory')
      assert(!!data.id, 'id is a UUID')
      assert(!!data.created_at, 'created_at populated')
      assert(!!data.updated_at, 'updated_at populated')
    }
  }

  // ─── Test 2: Client cannot create Memory (authority_label forced) ─────
  console.log('\nTest 2: Client cannot override authority_label')
  {
    // Attempt to insert with a different authority_label — DB check constraint should reject
    const { error } = await supabase.from('cross_room_events').insert({
      room_id: 'lounge',
      room_type: 'shared',
      authority_label: 'canonical_memory',
    }).select('*').single()

    assert(!!error, 'Insert with wrong authority_label rejected', error?.message)
    assert(
      !!(error?.message?.includes('check') || error?.message?.includes('violates') || error?.code === '23514'),
      'Rejection is check constraint violation',
      `code=${error?.code}, msg=${error?.message}`,
    )
  }

  // ─── Test 3: Event does not update Memory (archive_items unchanged) ───
  console.log('\nTest 3: Event does not update Memory (archive_items unchanged)')
  {
    const archiveCountAfter = await countTable('archive_items')
    assert(archiveCountAfter === archiveCountBefore, `archive_items count unchanged (${archiveCountBefore} → ${archiveCountAfter})`)
  }

  // ─── Test 4: Event does not update State/Interior ─────────────────────
  console.log('\nTest 4: Event does not update State/Interior')
  {
    const ariStateAfter = await getStateHash('ari')
    const eliStateAfter = await getStateHash('eli')
    const ariInteriorAfter = await getInteriorHash('ari')
    const eliInteriorAfter = await getInteriorHash('eli')

    assert(ariStateAfter === ariStateBefore, `Ari state unchanged (${ariStateBefore})`)
    assert(eliStateAfter === eliStateBefore, `Eli state unchanged (${eliStateBefore})`)
    assert(ariInteriorAfter === ariInteriorBefore, `Ari interior unchanged`)
    assert(eliInteriorAfter === eliInteriorBefore, `Eli interior unchanged`)
  }

  // ─── Test 5: Event does not touch Pulse ───────────────────────────────
  console.log('\nTest 5: Event does not touch Pulse')
  {
    const latestPulseAfter = await getLatestPulseId()
    assert(latestPulseAfter === latestPulseBefore, `Latest pulse_log entry unchanged (${latestPulseBefore})`)
  }

  // ─── Test 6: Event does not create journal job ────────────────────────
  console.log('\nTest 6: Event does not create journal job')
  {
    const latestJournalAfter = await getLatestJournalId()
    assert(latestJournalAfter === latestJournalBefore, `Latest journal_jobs entry unchanged (${latestJournalBefore})`)
  }

  // ─── Test 7: List/read inspection ─────────────────────────────────────
  console.log('\nTest 7: List and read inspection')
  {
    // List all
    const { data: listAll } = await supabase
      .from('cross_room_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
    assert(Array.isArray(listAll) && listAll.length > 0, 'List returns events')
    assert(listAll!.some(e => e.id === createdEventId), 'Created event appears in list')

    // Filter by presence_id (use .filter with 'cs' for JSONB array containment)
    const { data: listAri } = await supabase
      .from('cross_room_events')
      .select('*')
      .filter('presence_ids', 'cs', JSON.stringify(['ari']))
      .limit(10)
    assert(Array.isArray(listAri) && listAri.some(e => e.id === createdEventId), 'Filter by presence_id=ari finds event')

    // Read single
    const { data: single } = await supabase
      .from('cross_room_events')
      .select('*')
      .eq('id', createdEventId!)
      .single()
    assert(!!single, 'Single event read succeeds')
    assert(single?.room_id === 'lounge', 'Single read returns correct room_id')
    assert(single?.authority_label === 'cross_room_event_not_memory', 'Single read confirms authority_label')

    // Read non-existent
    const { data: missing } = await supabase
      .from('cross_room_events')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .maybeSingle()
    assert(missing === null, 'Non-existent ID returns null')
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────
  console.log('\n─── Cleanup ───')
  if (createdEventId) {
    const { error } = await supabase.from('cross_room_events').delete().eq('id', createdEventId)
    if (error) {
      console.log(`  ⚠ Could not delete test event: ${error.message}`)
    } else {
      console.log(`  Deleted test event ${createdEventId}`)
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(50)}`)
  console.log(`Phase 36A Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`)
  console.log(`${'═'.repeat(50)}\n`)

  if (failed > 0) process.exit(1)
}

run().catch(err => {
  console.error('Test runner failed:', err)
  process.exit(1)
})
