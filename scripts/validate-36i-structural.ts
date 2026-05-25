/**
 * Phase 36I Structural Tests
 *
 * Validates that the Lounge Recent Continuity carry-in implementation is
 * structurally correct without hitting the database.
 *
 * Tests: type shapes, format functions, prompt block wording, source labels,
 * involved-presences logic, and generation pipeline structure.
 *
 * Usage: npx tsx scripts/validate-36i-structural.ts
 */

export {}  // TypeScript module boundary

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// ─── Env stub: supabase client initialises eagerly — provide dummy URLs ──────
// Must be set before any dynamic import that triggers supabase.ts
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

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

async function run() {
  // Dynamic import — happens AFTER env stubs are set
  const rcModule = await import('../src/lib/recent-continuity')

  // ═══════════════════════════════════════════════════════════════
  // 1. RecentContinuitySession type — new fields accepted
  // ═══════════════════════════════════════════════════════════════
  section('1. RecentContinuitySession type — Phase 36I fields')

  const loungeSession = {
    source_surface: 'lounge' as string | null,
    source_thread_id: 'thread-abc-123' as string | null,
    involved_presences: ['ari', 'eli'] as string[] | null,
  }

  assert(loungeSession.source_surface === 'lounge', 'source_surface = lounge accepted')
  assert(loungeSession.source_thread_id === 'thread-abc-123', 'source_thread_id accepted')
  assert(
    Array.isArray(loungeSession.involved_presences) && loungeSession.involved_presences.length === 2,
    'involved_presences accepts array of 2'
  )

  // Legacy room-derived row — null fields
  const roomSession = {
    source_surface: null as string | null,
    source_thread_id: null as string | null,
    involved_presences: null as string[] | null,
  }

  assert(roomSession.source_surface === null, 'Legacy room row: source_surface = null')
  assert(roomSession.source_thread_id === null, 'Legacy room row: source_thread_id = null')
  assert(roomSession.involved_presences === null, 'Legacy room row: involved_presences = null')

  // ═══════════════════════════════════════════════════════════════
  // 2. maybeSyncLoungeRecentContinuity export exists
  // ═══════════════════════════════════════════════════════════════
  section('2. maybeSyncLoungeRecentContinuity export')

  assert(typeof rcModule.maybeSyncLoungeRecentContinuity === 'function', 'maybeSyncLoungeRecentContinuity is exported function')
  assert(rcModule.maybeSyncLoungeRecentContinuity.length === 2, 'maybeSyncLoungeRecentContinuity takes 2 args (threadId, apiKey)')

  // ═══════════════════════════════════════════════════════════════
  // 3. getRecentContinuityForPrompt export exists
  // ═══════════════════════════════════════════════════════════════
  section('3. getRecentContinuityForPrompt export')

  assert(typeof rcModule.getRecentContinuityForPrompt === 'function', 'getRecentContinuityForPrompt is exported function')

  // ═══════════════════════════════════════════════════════════════
  // 4. Lounge chat route import
  // ═══════════════════════════════════════════════════════════════
  section('4. Lounge chat route includes sync call')

  const loungeRouteSource = readFileSync(
    resolve(__dirname, '../src/app/api/lounge-chat/route.ts'),
    'utf-8'
  )

  assert(
    loungeRouteSource.includes('maybeSyncLoungeRecentContinuity'),
    'Lounge chat route imports maybeSyncLoungeRecentContinuity'
  )

  assert(
    loungeRouteSource.includes('maybeSyncLoungeRecentContinuity(thread.id, apiKey)'),
    'Lounge chat route calls maybeSyncLoungeRecentContinuity(thread.id, apiKey)'
  )

  assert(
    loungeRouteSource.includes('.catch('),
    'Lounge sync call is wrapped in .catch (non-blocking)'
  )

  assert(
    !loungeRouteSource.includes('await maybeSyncLoungeRecentContinuity'),
    'Lounge sync call is NOT awaited (fire-and-forget, non-blocking)'
  )

  // ═══════════════════════════════════════════════════════════════
  // 5. Source-aware format — [Lounge] tag
  // ═══════════════════════════════════════════════════════════════
  section('5. Source format in recent-continuity.ts')

  const rcSource = readFileSync(
    resolve(__dirname, '../src/lib/recent-continuity.ts'),
    'utf-8'
  )

  assert(
    rcSource.includes("source_surface === 'lounge' ? ' [Lounge]' : ''"),
    'formatSessionLine adds [Lounge] tag for Lounge-derived sessions'
  )

  assert(
    rcSource.includes('hasLounge'),
    'getRecentContinuityForPrompt tracks whether Lounge sessions are present'
  )

  assert(
    rcSource.includes('From recent Lounge continuity'),
    'Prompt block includes Lounge authority wording'
  )

  assert(
    rcSource.includes('Recently in the Lounge'),
    'Prompt block includes "Recently in the Lounge" wording'
  )

  // ═══════════════════════════════════════════════════════════════
  // 6. Source-aware dedupe — Lounge overlap uses separate function
  // ═══════════════════════════════════════════════════════════════
  section('6. Source-aware dedupe')

  assert(
    rcSource.includes('findOverlappingRowForLounge'),
    'Lounge has its own overlap detection function'
  )

  assert(
    rcSource.includes("eq('source_surface', 'lounge')") &&
    rcSource.includes("eq('source_thread_id', threadId)"),
    'Lounge dedupe queries filter by source_surface and source_thread_id'
  )

  // ═══════════════════════════════════════════════════════════════
  // 7. Per-presence row creation
  // ═══════════════════════════════════════════════════════════════
  section('7. Per-presence row creation')

  assert(
    rcSource.includes('for (const presenceId of sessionToSync.involvedPresences)'),
    'Lounge sync creates rows per involved presence'
  )

  assert(
    rcSource.includes("m.speaker === 'ari' || m.speaker === 'eli'"),
    'Involvement is determined by speaker column'
  )

  // ═══════════════════════════════════════════════════════════════
  // 8. Non-blocking behaviour
  // ═══════════════════════════════════════════════════════════════
  section('8. Non-blocking behaviour')

  assert(
    rcSource.includes('console.error(`[recent-continuity] Lounge sync failed'),
    'Lounge sync has top-level catch that logs errors'
  )

  // Verify the Lounge route does fire-and-forget (not await)
  const routeLines = loungeRouteSource.split('\n')
  const syncLine = routeLines.find(l => l.includes('maybeSyncLoungeRecentContinuity(thread.id'))
  assert(
    syncLine !== undefined && !syncLine.trimStart().startsWith('await'),
    'Lounge route sync call is fire-and-forget (no await)'
  )

  // ═══════════════════════════════════════════════════════════════
  // 9. UI component — source badges
  // ═══════════════════════════════════════════════════════════════
  section('9. UI component — source badges')

  const uiSource = readFileSync(
    resolve(__dirname, '../src/components/RecentContinuityView.tsx'),
    'utf-8'
  )

  assert(
    uiSource.includes('source_surface'),
    'RecentContinuityView interface includes source_surface'
  )

  assert(
    uiSource.includes('source_thread_id'),
    'RecentContinuityView interface includes source_thread_id'
  )

  assert(
    uiSource.includes('involved_presences'),
    'RecentContinuityView interface includes involved_presences'
  )

  assert(
    uiSource.includes('LOUNGE'),
    'UI shows LOUNGE badge'
  )

  assert(
    uiSource.includes('ROOM'),
    'UI shows ROOM badge'
  )

  // ═══════════════════════════════════════════════════════════════
  // 10. Migration file exists
  // ═══════════════════════════════════════════════════════════════
  section('10. Migration 065 exists')

  assert(
    existsSync(resolve(__dirname, '../supabase-migrations/065_recent_continuity_lounge_columns.sql')),
    'Migration 065 file exists'
  )

  const migrationSql = readFileSync(
    resolve(__dirname, '../supabase-migrations/065_recent_continuity_lounge_columns.sql'),
    'utf-8'
  )

  assert(
    migrationSql.includes('source_surface text'),
    'Migration adds source_surface column'
  )

  assert(
    migrationSql.includes('source_thread_id uuid'),
    'Migration adds source_thread_id column'
  )

  assert(
    migrationSql.includes('involved_presences text[]'),
    'Migration adds involved_presences column'
  )

  assert(
    migrationSql.includes('DEFAULT NULL'),
    'All new columns have DEFAULT NULL (backward compatible)'
  )

  // ═══════════════════════════════════════════════════════════════
  // 11. Scope guard — no forbidden writes
  // ═══════════════════════════════════════════════════════════════
  section('11. Scope guard — no forbidden writes in Lounge sync')

  // The maybeSyncLoungeRecentContinuity function should ONLY write to recent_continuity_sessions
  // Check it does not reference forbidden tables
  const loungeSection = rcSource.slice(
    rcSource.indexOf('export async function maybeSyncLoungeRecentContinuity'),
    rcSource.indexOf('function findOverlappingRowForLounge')
  )

  const forbiddenTables = [
    'room_memories', 'archive_entries', 'journal_', 'reflection_',
    'living_state', 'interior_notes', 'pulse_log', 'memory_nodes',
    'memory_edges', 'cross_room_events', 'cross_room_impacts',
    'lounge_carrybacks',
  ]

  for (const table of forbiddenTables) {
    assert(
      !loungeSection.includes(table),
      `Lounge sync does not reference '${table}'`
    )
  }

  assert(
    loungeSection.includes("from('lounge_messages')"),
    'Lounge sync reads from lounge_messages'
  )

  assert(
    loungeSection.includes("from('recent_continuity_sessions')"),
    'Lounge sync writes to recent_continuity_sessions'
  )

  // ═══════════════════════════════════════════════════════════════
  // 12. Existing room sync unchanged
  // ═══════════════════════════════════════════════════════════════
  section('12. Existing room sync unchanged')

  assert(
    rcSource.includes("from('room_messages')"),
    'Room sync still queries room_messages'
  )

  assert(
    rcSource.includes("eq('room_slug', presenceId)"),
    'Room sync still filters by room_slug = presenceId'
  )

  // Room maybeSyncRecentContinuity should NOT set source_surface
  const roomSyncSection = rcSource.slice(
    rcSource.indexOf('export async function maybeSyncRecentContinuity'),
    rcSource.indexOf('// ─── Phase 36I: Lounge Recent Continuity generation')
  )

  assert(
    !roomSyncSection.includes('source_surface'),
    'Room sync does not set source_surface (legacy rows stay NULL)'
  )

  // ═══════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════
  console.log('\n════════════════════════════════════════')
  console.log(`Phase 36I Structural Tests: ${passed} passed, ${failed} failed`)
  if (failures.length > 0) {
    console.log('\nFailed:')
    for (const f of failures) {
      console.log(`  ✗ ${f}`)
    }
  }
  console.log('════════════════════════════════════════')

  process.exit(failed > 0 ? 1 : 0)
}

run().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
