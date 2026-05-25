/**
 * Emergency Lounge Export
 *
 * Dumps all Lounge threads and messages to a timestamped JSON file.
 * Run BEFORE any destructive operation or major milestone.
 *
 * Usage: node scripts/emergency-lounge-export.mjs
 *
 * Output: scripts/exports/lounge-export-<timestamp>.json
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs'

const BASE = 'https://selinaric-house.vercel.app'

async function run() {
  console.log('[export] Fetching Lounge data...')

  const res = await fetch(`${BASE}/api/lounge-messages`)
  if (!res.ok) {
    console.error(`[export] Failed: ${res.status} ${res.statusText}`)
    process.exit(1)
  }

  const data = await res.json()
  const thread = data.thread
  const messages = data.messages || []

  console.log(`[export] Thread: ${thread?.id} (${thread?.status})`)
  console.log(`[export] Messages: ${messages.length}`)

  // Also fetch cross-room events for this thread
  let crossRoomEvents = []
  try {
    const eventsRes = await fetch(`${BASE}/api/cross-room-events`)
    if (eventsRes.ok) {
      const eventsData = await eventsRes.json()
      const allEvents = eventsData.events || eventsData.data || []
      crossRoomEvents = allEvents.filter(e => e.source_thread_id === thread?.id)
      console.log(`[export] Cross-room events for this thread: ${crossRoomEvents.length}`)
    }
  } catch {
    console.log('[export] Could not fetch cross-room events (non-fatal)')
  }

  // Also fetch recent continuity
  let recentContinuity = []
  try {
    const rcRes = await fetch(`${BASE}/api/recent-continuity`)
    if (rcRes.ok) {
      const rcData = await rcRes.json()
      recentContinuity = (rcData.sessions || []).filter(
        s => s.source_thread_id === thread?.id
      )
      console.log(`[export] Recent continuity rows for this thread: ${recentContinuity.length}`)
    }
  } catch {
    console.log('[export] Could not fetch recent continuity (non-fatal)')
  }

  const exportData = {
    exported_at: new Date().toISOString(),
    export_reason: 'emergency_pre_operation_backup',
    thread,
    message_count: messages.length,
    messages,
    cross_room_events: crossRoomEvents,
    recent_continuity: recentContinuity,
  }

  // Write to file
  const dir = 'scripts/exports'
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `${dir}/lounge-export-${timestamp}.json`

  writeFileSync(filename, JSON.stringify(exportData, null, 2))
  console.log(`\n[export] Saved to ${filename}`)
  console.log(`[export] Thread: ${thread?.id}`)
  console.log(`[export] Messages: ${messages.length}`)
  console.log(`[export] Size: ${(JSON.stringify(exportData).length / 1024).toFixed(1)} KB`)
}

run().catch(err => {
  console.error('[export] Fatal:', err)
  process.exit(1)
})
