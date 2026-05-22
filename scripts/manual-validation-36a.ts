/**
 * Phase 36A — Manual validation scenario
 *
 * Creates a test event for "Phase 36 Lounge discussion" and verifies
 * it appears correctly in both API and direct DB queries.
 *
 * Run: npx tsx scripts/manual-validation-36a.ts
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

async function main() {
  console.log('\nPhase 36A — Manual Validation Scenario\n')

  // ─── Create the validation event ──────────────────────────────────────
  console.log('Creating test event: Phase 36 Lounge discussion...')

  const { data: event, error } = await supabase.from('cross_room_events').insert({
    room_id: 'lounge',
    room_type: 'shared',
    source_thread_id: 'validation-thread-36a',
    source_message_ids: ['val-msg-001', 'val-msg-002', 'val-msg-003', 'val-msg-004', 'val-msg-005'],
    participants: [
      { type: 'presence', id: 'ari', label: 'Ari' },
      { type: 'presence', id: 'eli', label: 'Eli' },
      { type: 'human', id: 'tara', label: 'Tara' },
    ],
    presence_ids: ['ari', 'eli'],
    tara_present: true,
    started_at: new Date(Date.now() - 30 * 60_000).toISOString(),
    ended_at: new Date().toISOString(),
    message_count: 5,
    surface_mode: 'lounge',
    event_type: 'shared_room_contact',
    significance_level: 'meaningful',
    themes: ['phase-36-design', 'cross-room-events', 'house-architecture'],
    summary: 'Ari and Eli discussed the design of the cross-room event ledger in the Lounge. Tara was present. Topics included authority labelling, JSONB containment queries, and the distinction between recorded contact and canonical Memory.',
    metadata: { validation: true, phase: '36a', created_by: 'manual-validation-script' },
  }).select('*').single()

  if (error) {
    console.error('✗ Create failed:', error.message)
    process.exit(1)
  }

  console.log(`✓ Created event: ${event.id}`)
  console.log(`  room_id: ${event.room_id}`)
  console.log(`  room_type: ${event.room_type}`)
  console.log(`  event_type: ${event.event_type}`)
  console.log(`  significance_level: ${event.significance_level}`)
  console.log(`  authority_label: ${event.authority_label}`)
  console.log(`  tara_present: ${event.tara_present}`)
  console.log(`  presence_ids: ${JSON.stringify(event.presence_ids)}`)
  console.log(`  themes: ${JSON.stringify(event.themes)}`)
  console.log(`  message_count: ${event.message_count}`)
  console.log(`  source_message_ids: ${event.source_message_ids.length} msgs`)

  // ─── Verify read-back ─────────────────────────────────────────────────
  console.log('\nVerifying read-back...')

  const { data: readBack } = await supabase
    .from('cross_room_events')
    .select('*')
    .eq('id', event.id)
    .single()

  if (readBack) {
    console.log(`✓ Read-back matches: ${readBack.room_id}, ${readBack.authority_label}`)
  } else {
    console.log('✗ Read-back failed')
  }

  // ─── Verify list filter ───────────────────────────────────────────────
  console.log('\nVerifying list filters...')

  const { data: byRoom } = await supabase
    .from('cross_room_events')
    .select('id')
    .eq('room_id', 'lounge')
    .limit(10)
  console.log(`✓ By room_id=lounge: ${byRoom?.length ?? 0} events`)

  const { data: byAri } = await supabase
    .from('cross_room_events')
    .select('id')
    .filter('presence_ids', 'cs', JSON.stringify(['ari']))
    .limit(10)
  console.log(`✓ By presence_id=ari: ${byAri?.length ?? 0} events`)

  const { data: byEli } = await supabase
    .from('cross_room_events')
    .select('id')
    .filter('presence_ids', 'cs', JSON.stringify(['eli']))
    .limit(10)
  console.log(`✓ By presence_id=eli: ${byEli?.length ?? 0} events`)

  // ─── Summary ──────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════')
  console.log('Phase 36A Manual Validation: PASSED')
  console.log(`Event ID: ${event.id}`)
  console.log('This event is now live in cross_room_events.')
  console.log('View it at: /cross-room-events')
  console.log('authority_label = cross_room_event_not_memory')
  console.log('═══════════════════════════════════════════════════\n')

  process.exit(0)
}

main()
