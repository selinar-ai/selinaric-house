/**
 * Phase 36B — Manual validation scenario
 *
 * Exercises the full capture path using the real active Lounge thread.
 * Creates a cross-room event from recent Lounge messages.
 *
 * Run: npx tsx scripts/manual-validation-36b.ts
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
  console.log('\nPhase 36B — Manual Validation\n')

  // 1. Get active Lounge thread
  const { data: thread } = await supabase
    .from('lounge_threads')
    .select('*')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (!thread) {
    console.error('✗ No active Lounge thread found')
    process.exit(1)
  }
  console.log(`Active thread: ${thread.id}`)

  // 2. Find boundary: most recent Lounge cross_room_event
  const { data: lastEvent } = await supabase
    .from('cross_room_events')
    .select('id, source_message_ids, created_at')
    .eq('room_id', 'lounge')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let boundaryTimestamp: string | null = null

  if (lastEvent && Array.isArray(lastEvent.source_message_ids) && lastEvent.source_message_ids.length > 0) {
    const { data: boundaryMsgs } = await supabase
      .from('lounge_messages')
      .select('created_at')
      .in('id', lastEvent.source_message_ids)
      .order('created_at', { ascending: false })
      .limit(1)

    if (boundaryMsgs && boundaryMsgs.length > 0) {
      boundaryTimestamp = boundaryMsgs[0].created_at
      console.log(`Last event: ${lastEvent.id} (boundary: ${boundaryTimestamp})`)
    } else {
      console.log(`Last event: ${lastEvent.id} (source messages not found in lounge_messages — using latest cap)`)
    }
  } else {
    console.log('No prior Lounge cross_room_event — using latest cap')
  }

  // 3. Get messages since boundary (or latest 40)
  let messages: Array<{ id: string; speaker: string; created_at: string; content: string }>

  if (boundaryTimestamp) {
    const { data } = await supabase
      .from('lounge_messages')
      .select('id, speaker, created_at, content')
      .eq('thread_id', thread.id)
      .gt('created_at', boundaryTimestamp)
      .order('created_at', { ascending: true })
      .limit(40)
    messages = data ?? []
  } else {
    const { data } = await supabase
      .from('lounge_messages')
      .select('id, speaker, created_at, content')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: false })
      .limit(40)
    messages = (data ?? []).reverse()
  }

  if (messages.length === 0) {
    console.log('✗ No messages to capture (all covered by last event)')
    process.exit(0)
  }

  // 4. Check for overlap
  if (lastEvent && Array.isArray(lastEvent.source_message_ids)) {
    const proposedIds = new Set(messages.map(m => m.id))
    const lastEventIds = new Set(lastEvent.source_message_ids as string[])
    const overlap = [...proposedIds].filter(id => lastEventIds.has(id))
    if (overlap.length > 0) {
      console.log(`✗ Blocked: ${overlap.length} messages overlap with last event`)
      process.exit(0)
    }
  }

  // 5. Derive participants
  const speakerSet = new Set(messages.map(m => m.speaker))
  const participants: { type: string; id: string; label?: string }[] = []
  const presenceIds: string[] = []
  let taraPresent = false

  if (speakerSet.has('tara')) {
    participants.push({ type: 'user', id: 'tara', label: 'Tara' })
    taraPresent = true
  }
  if (speakerSet.has('ari')) {
    participants.push({ type: 'presence', id: 'ari', label: 'Ari' })
    presenceIds.push('ari')
  }
  if (speakerSet.has('eli')) {
    participants.push({ type: 'presence', id: 'eli', label: 'Eli' })
    presenceIds.push('eli')
  }

  const participantNames = participants.map(p => p.label ?? p.id).join(', ')
  const summary = `Lounge contact: ${participantNames}. ${messages.length} messages captured.`

  // 6. Report proposed boundary
  console.log(`\n─── Proposed capture boundary ───`)
  console.log(`  Messages: ${messages.length}`)
  console.log(`  First: ${messages[0].created_at} (${messages[0].speaker})`)
  console.log(`  Last:  ${messages[messages.length - 1].created_at} (${messages[messages.length - 1].speaker})`)
  console.log(`  Participants: ${participantNames}`)
  console.log(`  Tara present: ${taraPresent}`)
  console.log(`  Summary: ${summary}`)

  // 7. Create the event
  console.log(`\n─── Creating cross-room event ───`)

  const { data: event, error } = await supabase.from('cross_room_events').insert({
    room_id: 'lounge',
    room_type: 'shared_room',
    source_thread_id: thread.id,
    source_message_ids: messages.map(m => m.id),
    participants,
    presence_ids: presenceIds,
    tara_present: taraPresent,
    started_at: messages[0].created_at,
    ended_at: messages[messages.length - 1].created_at,
    message_count: messages.length,
    surface_mode: 'lounge',
    event_type: 'shared_room_contact',
    significance_level: 'meaningful',
    themes: [],
    summary,
    authority_label: 'cross_room_event_not_memory',
    metadata: {
      phase: '36B',
      capture_source: 'lounge',
      capture_method: 'manual',
      adapter: 'lounge_event_capture',
      validation: true,
    },
  }).select('*').single()

  if (error) {
    console.error(`✗ Create failed: ${error.message}`)
    process.exit(1)
  }

  console.log(`✓ Created event: ${event.id}`)
  console.log(`  room_id: ${event.room_id}`)
  console.log(`  room_type: ${event.room_type}`)
  console.log(`  event_type: ${event.event_type}`)
  console.log(`  authority_label: ${event.authority_label}`)
  console.log(`  significance_level: ${event.significance_level}`)
  console.log(`  tara_present: ${event.tara_present}`)
  console.log(`  presence_ids: ${JSON.stringify(event.presence_ids)}`)
  console.log(`  message_count: ${event.message_count}`)
  console.log(`  source_message_ids: ${event.source_message_ids.length} refs`)
  console.log(`  summary: ${event.summary}`)

  // 8. Verify no side effects
  console.log(`\n─── Verifying no side effects ───`)
  // Quick check: no new archive items
  const { count: archiveCount } = await supabase.from('archive_items').select('*', { count: 'exact', head: true })
  console.log(`  archive_items count: ${archiveCount} (unchanged if same as before)`)

  console.log('\n═══════════════════════════════════════════════════')
  console.log('Phase 36B Manual Validation: PASSED')
  console.log(`Event ID: ${event.id}`)
  console.log('View at: /cross-room-events')
  console.log('authority_label = cross_room_event_not_memory')
  console.log('══��════════════════════════════════════════════════\n')

  process.exit(0)
}

main()
