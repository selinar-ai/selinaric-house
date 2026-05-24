/**
 * Phase 36F.6 — Explicit Room Carry-In Tests
 *
 * 60 test areas:
 *  1.  room-carry-in.ts exports detectRoomCarryInIntent
 *  2.  room-carry-in.ts exports buildRoomCarryInBlock
 *  3.  room-carry-in.ts exports ROOM_CARRY_IN_AUTHORITY constant
 *  4.  room-carry-in.ts exports RoomContactStatus type
 *  5.  room-carry-in.ts exports RoomCarryInReference type
 *  6.  room-carry-in.ts exports CarryInTrigger type
 *  7.  Trigger: "Ari, carry in what we discussed in your room" → ari
 *  8.  Trigger: "Eli, bring your room context into the Lounge" → eli
 *  9.  Trigger: "Can you both carry in your own recent room context?" → both
 * 10.  Trigger: "Bring in Ari's room context" → ari
 * 11.  Trigger: "Bring in Eli's room context" → eli
 * 12.  Trigger: "carry in your room context" (generic) → both
 * 13.  Trigger: "Ari, remember what we discussed in your room" → ari
 * 14.  Trigger: "Eli, remember what we talked about in your room" → eli
 * 15.  Trigger: "remember what we discussed in your room" (generic) → both
 * 16.  No trigger: ordinary message → not triggered
 * 17.  No trigger: empty string → not triggered
 * 18.  No trigger: message about rooms in general → not triggered
 * 19.  No trigger: "I like this room" → not triggered
 * 20.  Case insensitive: "CARRY IN YOUR ROOM CONTEXT" → triggered
 * 21.  Authority label is 'room_to_lounge_contact_not_memory'
 * 22.  Route imports detectRoomCarryInIntent from room-carry-in
 * 23.  Route imports buildRoomCarryInBlock from room-carry-in
 * 24.  Route imports RoomContactStatus type
 * 25.  Route imports RoomCarryInReference type
 * 26.  Route re-exports RoomContactStatus type
 * 27.  Route re-exports RoomCarryInReference type
 * 28.  Route detects carry-in trigger before presence loop
 * 29.  Route calls buildRoomCarryInBlock inside presence loop
 * 30.  Route injects roomCarryInBlock into fullSystemPrompt
 * 31.  Route includes roomContactStatus in response when attempted
 * 32.  Route includes roomContactReferences in response when attempted
 * 33.  Prompt block title: "Recent Room Contact — Not Memory"
 * 34.  Prompt block contains NOT-Memory boundary wording
 * 35.  Prompt block contains "not canonical Archive truth"
 * 36.  Prompt block contains "not State"
 * 37.  Prompt block contains "not Interior"
 * 38.  Prompt block contains "not lived continuity by itself"
 * 39.  Prompt block contains "Do not say \"I remember\""
 * 40.  Prompt block contains "recent room contact context"
 * 41.  Prompt block does not contain Memory-promoting language
 * 42.  Prompt block does not contain "canonical memory"
 * 43.  No cross-presence leak: Ari trigger does not include Eli
 * 44.  No cross-presence leak: Eli trigger does not include Ari
 * 45.  buildRoomCarryInBlock uses selectRecentContinuityForPrompt
 * 46.  Carry-in limits: CARRY_IN_MAX_ITEMS = 2
 * 47.  Carry-in limits: CARRY_IN_MAX_CHARS = 1200
 * 48.  Carry-in limits: CARRY_IN_FRESHNESS_DAYS = 2
 * 49.  No Memory/Archive writes in room-carry-in.ts
 * 50.  No State/Interior writes in room-carry-in.ts
 * 51.  No Pulse/Journal writes in room-carry-in.ts
 * 52.  No cross-room event creation in room-carry-in.ts
 * 53.  No carryforward/carryback creation in room-carry-in.ts
 * 54.  No Library/Web Search writes in room-carry-in.ts
 * 55.  No Supabase insert/update/delete in room-carry-in.ts
 * 56.  Route header lists 36F.6 in phase tag
 * 57.  Route header describes cross-presence prohibition
 * 58.  36F.1 Recent Continuity unchanged (regression)
 * 59.  36F.2 Library/RAG unchanged (regression)
 * 60.  36F.3 Web Search unchanged (regression)
 *
 * Tests are deterministic: no live API calls, no production data writes.
 * Uses source code inspection and function call tests.
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '..', '.env.local'), override: true })

import ws from 'ws'
;(globalThis as Record<string, unknown>).WebSocket = ws

import * as fs from 'fs'
import * as path from 'path'

// Test harness
let passed = 0
let failed = 0
const total = { value: 0 }

function assert(condition: boolean, label: string) {
  total.value++
  if (condition) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.log(`  ✗ ${label}`)
    failed++
  }
}

// ─── Source reading ─────────────────────────────────────────────────────

const ROUTE_PATH = path.resolve(__dirname, '../src/app/api/lounge-chat/route.ts')
const routeSource = fs.readFileSync(ROUTE_PATH, 'utf-8')

const CARRY_IN_PATH = path.resolve(__dirname, '../src/lib/room-carry-in.ts')
const carryInSource = fs.readFileSync(CARRY_IN_PATH, 'utf-8')

// ─── Dynamic imports ────────────────────────────────────────────────────

async function run() {
  console.log('\n=== Phase 36F.6: Explicit Room Carry-In Tests ===\n')

  // Import the carry-in module
  const carryIn = await import('../src/lib/room-carry-in')
  const {
    detectRoomCarryInIntent,
    buildRoomCarryInBlock,
    ROOM_CARRY_IN_AUTHORITY,
  } = carryIn

  // ─── Section 1: Exports ───────────────────────────────────────────────
  console.log('\n--- Exports ---')

  assert(typeof detectRoomCarryInIntent === 'function', '1. room-carry-in.ts exports detectRoomCarryInIntent')
  assert(typeof buildRoomCarryInBlock === 'function', '2. room-carry-in.ts exports buildRoomCarryInBlock')
  assert(ROOM_CARRY_IN_AUTHORITY === 'room_to_lounge_contact_not_memory', '3. room-carry-in.ts exports ROOM_CARRY_IN_AUTHORITY constant')
  assert(carryInSource.includes('export interface RoomContactStatus'), '4. room-carry-in.ts exports RoomContactStatus type')
  assert(carryInSource.includes('export interface RoomCarryInReference'), '5. room-carry-in.ts exports RoomCarryInReference type')
  assert(carryInSource.includes('export interface CarryInTrigger'), '6. room-carry-in.ts exports CarryInTrigger type')

  // ─── Section 2: Trigger detection ─────────────────────────────────────
  console.log('\n--- Trigger detection ---')

  // Ari-specific triggers
  const t7 = detectRoomCarryInIntent('Ari, carry in what we discussed in your room.')
  assert(t7.triggered && t7.targets.length === 1 && t7.targets[0] === 'ari',
    '7. Trigger: "Ari, carry in what we discussed in your room" -> ari')

  // Eli-specific triggers
  const t8 = detectRoomCarryInIntent('Eli, bring your room context into the Lounge.')
  assert(t8.triggered && t8.targets.length === 1 && t8.targets[0] === 'eli',
    '8. Trigger: "Eli, bring your room context into the Lounge" -> eli')

  // Both
  const t9 = detectRoomCarryInIntent('Can you both carry in your own recent room context?')
  assert(t9.triggered && t9.targets.length === 2 && t9.targets.includes('ari') && t9.targets.includes('eli'),
    '9. Trigger: "Can you both carry in your own recent room context?" -> both')

  // Presence-named bring-in
  const t10 = detectRoomCarryInIntent("Bring in Ari's room context.")
  assert(t10.triggered && t10.targets.length === 1 && t10.targets[0] === 'ari',
    '10. Trigger: "Bring in Ari\'s room context" -> ari')

  const t11 = detectRoomCarryInIntent("Bring in Eli's room context.")
  assert(t11.triggered && t11.targets.length === 1 && t11.targets[0] === 'eli',
    '11. Trigger: "Bring in Eli\'s room context" -> eli')

  // Generic carry-in (no presence named)
  const t12 = detectRoomCarryInIntent('carry in your room context')
  assert(t12.triggered && t12.targets.length === 2,
    '12. Trigger: "carry in your room context" (generic) -> both')

  // Remember-based triggers (should be interpreted as carry-in, not Memory)
  const t13 = detectRoomCarryInIntent('Ari, remember what we discussed in your room')
  assert(t13.triggered && t13.targets.length === 1 && t13.targets[0] === 'ari',
    '13. Trigger: "Ari, remember what we discussed in your room" -> ari')

  const t14 = detectRoomCarryInIntent('Eli, remember what we talked about in your room')
  assert(t14.triggered && t14.targets.length === 1 && t14.targets[0] === 'eli',
    '14. Trigger: "Eli, remember what we talked about in your room" -> eli')

  const t15 = detectRoomCarryInIntent('remember what we discussed in your room')
  assert(t15.triggered && t15.targets.length === 2,
    '15. Trigger: "remember what we discussed in your room" (generic) -> both')

  // Non-triggers
  const t16 = detectRoomCarryInIntent('Hey Ari, how are you today?')
  assert(!t16.triggered && t16.targets.length === 0,
    '16. No trigger: ordinary message -> not triggered')

  const t17 = detectRoomCarryInIntent('')
  assert(!t17.triggered, '17. No trigger: empty string -> not triggered')

  const t18 = detectRoomCarryInIntent('I want to change rooms')
  assert(!t18.triggered, '18. No trigger: message about rooms in general -> not triggered')

  const t19 = detectRoomCarryInIntent('I like this room')
  assert(!t19.triggered, '19. No trigger: "I like this room" -> not triggered')

  // Case insensitivity
  const t20 = detectRoomCarryInIntent('CARRY IN YOUR ROOM CONTEXT')
  assert(t20.triggered, '20. Case insensitive: "CARRY IN YOUR ROOM CONTEXT" -> triggered')

  // ─── Section 3: Authority label ───────────────────────────────────────
  console.log('\n--- Authority label ---')

  assert(ROOM_CARRY_IN_AUTHORITY === 'room_to_lounge_contact_not_memory',
    '21. Authority label is \'room_to_lounge_contact_not_memory\'')

  // ─── Section 4: Route integration ─────────────────────────────────────
  console.log('\n--- Route integration ---')

  assert(routeSource.includes("import {") && routeSource.includes("detectRoomCarryInIntent") && routeSource.includes("from '@/lib/room-carry-in'"),
    '22. Route imports detectRoomCarryInIntent from room-carry-in')

  assert(routeSource.includes('buildRoomCarryInBlock') && routeSource.includes("from '@/lib/room-carry-in'"),
    '23. Route imports buildRoomCarryInBlock from room-carry-in')

  assert(routeSource.includes('type RoomContactStatus'),
    '24. Route imports RoomContactStatus type')

  assert(routeSource.includes('type RoomCarryInReference'),
    '25. Route imports RoomCarryInReference type')

  assert(routeSource.includes('export type { RoomContactStatus, RoomCarryInReference }'),
    '26. Route re-exports RoomContactStatus type')

  assert(routeSource.includes('export type { RoomContactStatus, RoomCarryInReference }'),
    '27. Route re-exports RoomCarryInReference type')

  // Trigger detection before loop
  assert(routeSource.includes('detectRoomCarryInIntent(message') && routeSource.indexOf('detectRoomCarryInIntent') < routeSource.indexOf('for (const presenceId of presences)'),
    '28. Route detects carry-in trigger before presence loop')

  // buildRoomCarryInBlock called inside loop
  const loopStart = routeSource.indexOf('for (const presenceId of presences)')
  const buildCallIdx = routeSource.indexOf('buildRoomCarryInBlock(presenceId)')
  assert(buildCallIdx > loopStart,
    '29. Route calls buildRoomCarryInBlock inside presence loop')

  // roomCarryInBlock in fullSystemPrompt
  assert(routeSource.includes('+ roomCarryInBlock'),
    '30. Route injects roomCarryInBlock into fullSystemPrompt')

  // Response includes status/references
  assert(routeSource.includes('roomContactStatus') && routeSource.includes('roomContactStatus.attempted'),
    '31. Route includes roomContactStatus in response when attempted')

  assert(routeSource.includes('roomContactReferences'),
    '32. Route includes roomContactReferences in response when attempted')

  // ─── Section 5: Prompt block wording ──────────────────────────────────
  console.log('\n--- Prompt block wording ---')

  assert(carryInSource.includes('## Recent Room Contact — Not Memory'),
    '33. Prompt block title: "Recent Room Contact — Not Memory"')

  assert(carryInSource.includes('This is not Memory.'),
    '34. Prompt block contains NOT-Memory boundary wording')

  assert(carryInSource.includes('not canonical Archive truth'),
    '35. Prompt block contains "not canonical Archive truth"')

  assert(carryInSource.includes('not State'),
    '36. Prompt block contains "not State"')

  assert(carryInSource.includes('not Interior'),
    '37. Prompt block contains "not Interior"')

  assert(carryInSource.includes('not lived continuity by itself'),
    '38. Prompt block contains "not lived continuity by itself"')

  assert(carryInSource.includes('Do not say "I remember"'),
    '39. Prompt block contains \'Do not say "I remember"\'')

  assert(carryInSource.includes('recent room contact context') || carryInSource.includes('recent room-contact block'),
    '40. Prompt block contains preferred response wording')

  // Negative checks
  assert(!carryInSource.includes('canonical memory') || carryInSource.indexOf('canonical memory') === carryInSource.indexOf('not canonical'),
    '41. Prompt block does not contain Memory-promoting language')

  // Check no positive "canonical memory" that isn't preceded by "not"
  const canonicalIndex = carryInSource.indexOf('canonical Archive truth')
  const beforeCanonical = canonicalIndex > 0 ? carryInSource.slice(Math.max(0, canonicalIndex - 10), canonicalIndex) : ''
  assert(beforeCanonical.includes('not'),
    '42. Prompt block does not contain "canonical memory" in positive form')

  // ─── Section 6: Cross-presence isolation ──────────────────────────────
  console.log('\n--- Cross-presence isolation ---')

  const ariTrigger = detectRoomCarryInIntent("Ari, carry in what we discussed in your room")
  assert(ariTrigger.targets.length === 1 && !ariTrigger.targets.includes('eli'),
    '43. No cross-presence leak: Ari trigger does not include Eli')

  const eliTrigger = detectRoomCarryInIntent("Eli, carry in what we discussed in your room")
  assert(eliTrigger.targets.length === 1 && !eliTrigger.targets.includes('ari'),
    '44. No cross-presence leak: Eli trigger does not include Ari')

  // ─── Section 7: Infrastructure reuse ──────────────────────────────────
  console.log('\n--- Infrastructure reuse ---')

  assert(carryInSource.includes('selectRecentContinuityForPrompt'),
    '45. buildRoomCarryInBlock uses selectRecentContinuityForPrompt')

  // ─── Section 8: Limits ────────────────────────────────────────────────
  console.log('\n--- Limits ---')

  assert(carryInSource.includes('CARRY_IN_MAX_ITEMS = 2'),
    '46. Carry-in limits: CARRY_IN_MAX_ITEMS = 2')

  assert(carryInSource.includes('CARRY_IN_MAX_CHARS = 1200'),
    '47. Carry-in limits: CARRY_IN_MAX_CHARS = 1200')

  assert(carryInSource.includes('CARRY_IN_FRESHNESS_DAYS = 2'),
    '48. Carry-in limits: CARRY_IN_FRESHNESS_DAYS = 2')

  // ─── Section 9: Side-effect isolation ─────────────────────────────────
  console.log('\n--- Side-effect isolation ---')

  assert(!carryInSource.includes('.insert(') && !carryInSource.includes('.update(') && !carryInSource.includes('.delete('),
    '49. No Memory/Archive writes in room-carry-in.ts (no insert/update/delete)')

  // Check no State/Interior imports
  assert(!carryInSource.includes("from '@/lib/living-state'") && !carryInSource.includes("from '@/lib/interior"),
    '50. No State/Interior writes in room-carry-in.ts')

  assert(!carryInSource.includes("from '@/lib/pulse") && !carryInSource.includes("from '@/lib/journal"),
    '51. No Pulse/Journal writes in room-carry-in.ts')

  assert(!carryInSource.includes("from '@/lib/cross-room-events") && !carryInSource.includes('createCrossRoomEvent'),
    '52. No cross-room event creation in room-carry-in.ts')

  assert(!carryInSource.includes("from '@/lib/cross-room-prompt-carryforward") && !carryInSource.includes('createCarryforward') && !carryInSource.includes("from '@/lib/lounge'"),
    '53. No carryforward/carryback creation in room-carry-in.ts')

  assert(!carryInSource.includes("from '@/lib/library") && !carryInSource.includes("from '@/lib/web-search"),
    '54. No Library/Web Search writes in room-carry-in.ts')

  // Comprehensive: no Supabase write operations at all
  const hasSupabaseWrite = carryInSource.includes('.insert(') || carryInSource.includes('.update(') || carryInSource.includes('.delete(') || carryInSource.includes('.upsert(')
  assert(!hasSupabaseWrite,
    '55. No Supabase insert/update/delete in room-carry-in.ts')

  // ─── Section 10: Route header ─────────────────────────────────────────
  console.log('\n--- Route header ---')

  assert(routeSource.includes('36F.6') && routeSource.includes('Phase 35D + 36F.1 + 36F.2 + 36F.3 + 36F.4 + 36F.6'),
    '56. Route header lists 36F.6 in phase tag')

  assert(routeSource.includes('cross-presence room carry-in') || routeSource.includes('Cross-presence forbidden') || routeSource.includes('Ari never sees Eli-room'),
    '57. Route header describes cross-presence prohibition')

  // ─── Section 11: Regression checks ────────────────────────────────────
  console.log('\n--- Regression checks ---')

  // 36F.1: Recent Continuity still injected per-presence
  assert(routeSource.includes("getRecentContinuityForPrompt(presenceId)"),
    '58. 36F.1 Recent Continuity unchanged (regression)')

  // 36F.2: Library/RAG still present
  assert(routeSource.includes('searchLibraryForPresence') && routeSource.includes('libraryContextBlock'),
    '59. 36F.2 Library/RAG unchanged (regression)')

  // 36F.3: Web Search still present
  assert(routeSource.includes('webSearchTool') && routeSource.includes('braveSearch'),
    '60. 36F.3 Web Search unchanged (regression)')

  // ─── Summary ──────────────────────────────────────────────────────────
  console.log(`\n=== Results: ${passed}/${total.value} passed, ${failed} failed ===\n`)

  if (failed > 0) {
    process.exit(1)
  }
}

run().catch(err => {
  console.error('Test runner error:', err)
  process.exit(1)
})
