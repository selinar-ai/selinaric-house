/**
 * Phase 39.3.1 Structural Tests — Recall Packet Inspector Mount
 *
 * Verifies that the Recall Packet Inspector was mounted on the existing /recall
 * page using fixture data only, with no live data, no prompt integration, and
 * no runtime changes.
 *
 * Run: npx tsx src/lib/__tests__/phase-39-3-1-recall-packet-inspector-mount.test.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  inspectorDemoFixture,
  ALL_FIXTURES,
} from '../recall/recallPacketFixtures'
import { ExclusionReason } from '../recall/recallPacketTypes'

// ─── test harness ─────────────────────────────────────────────────────────────

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

const RECALL_PAGE_PATH = 'src/app/(house)/recall/page.tsx'
const FIXTURES_PATH    = 'src/lib/recall/recallPacketFixtures.ts'

const pageSrc     = fs.readFileSync(path.join(ROOT, RECALL_PAGE_PATH), 'utf-8')
const fixturesSrc = fs.readFileSync(path.join(ROOT, FIXTURES_PATH), 'utf-8')

// ═══════════════════════════════════════════════════════
// 1. Page imports RecallPacketDebugPanel
// ═══════════════════════════════════════════════════════
section('1. Page imports RecallPacketDebugPanel')

assert(
  pageSrc.includes("import RecallPacketDebugPanel from '@/components/recall/RecallPacketDebugPanel'"),
  '/recall page imports RecallPacketDebugPanel'
)

assert(
  pageSrc.includes("from '@/lib/recall/recallPacketFixtures'"),
  '/recall page imports from recallPacketFixtures'
)

// ═══════════════════════════════════════════════════════
// 2. Page uses fixture data only — not buildRecallPacket
// ═══════════════════════════════════════════════════════
section('2. Fixture data only — no builder call')

// The meaningful check: recallPacketBuilder is not imported.
// Comments in the page document this intentional absence; checking the import path
// rather than the function name string avoids false positives from documentation.
assert(
  !pageSrc.includes("from '@/lib/recall/recallPacketBuilder'") &&
  !pageSrc.includes("from '../recall/recallPacketBuilder'"),
  '/recall page does not import recallPacketBuilder (receives fixture packets, not live builder)'
)

// ═══════════════════════════════════════════════════════
// 3. No forbidden imports added to the page
// ═══════════════════════════════════════════════════════
section('3. No forbidden imports added')

// These should not appear as newly added imports to the recall section
// (they may exist elsewhere in the file from before — check that we didn't add them)
const recallInspectorBlock = (() => {
  const start = pageSrc.indexOf('Recall Packet Inspector')
  return start >= 0 ? pageSrc.slice(Math.max(0, start - 200), start + 3000) : ''
})()

assert(
  !recallInspectorBlock.includes("from '@supabase") &&
  !recallInspectorBlock.includes('createClient'),
  'Inspector section does not introduce Supabase imports'
)

assert(
  !recallInspectorBlock.includes("from 'openai'") &&
  !recallInspectorBlock.includes("from '@anthropic-ai"),
  'Inspector section does not introduce OpenAI/Anthropic imports'
)

// ═══════════════════════════════════════════════════════
// 4. Required UI text present
// ═══════════════════════════════════════════════════════
section('4. Required UI wording')

assert(
  pageSrc.includes('Recall Packet Inspector'),
  '/recall page contains "Recall Packet Inspector"'
)

assert(
  pageSrc.includes('Fixture-only preview'),
  '/recall page contains "Fixture-only preview"'
)

assert(
  pageSrc.includes('No live recall'),
  '/recall page contains "No live recall"'
)

assert(
  pageSrc.includes('No prompt integration'),
  '/recall page contains "No prompt integration"'
)

assert(
  pageSrc.includes('No authority movement'),
  '/recall page contains "No authority movement"'
)

// ═══════════════════════════════════════════════════════
// 5. RecallPacketDebugPanel is rendered with fixture packet
// ═══════════════════════════════════════════════════════
section('5. Panel rendering with fixture packet')

assert(
  pageSrc.includes('<RecallPacketDebugPanel'),
  '/recall page renders <RecallPacketDebugPanel'
)

assert(
  pageSrc.includes('RECALL_INSPECTOR_FIXTURES[selectedFixture]') ||
  pageSrc.includes('inspectorDemoFixture'),
  '/recall page passes a fixture packet to RecallPacketDebugPanel'
)

assert(
  pageSrc.includes('inspectorDemoFixture') ||
  pageSrc.includes('inspectorDemo'),
  '/recall page references inspectorDemoFixture as default'
)

// ═══════════════════════════════════════════════════════
// 6. Fixture selector present and uses no extra dependencies
// ═══════════════════════════════════════════════════════
section('6. Fixture selector')

assert(
  pageSrc.includes('INSPECTOR_FIXTURE_OPTIONS') ||
  pageSrc.includes('RECALL_INSPECTOR_FIXTURES'),
  '/recall page defines local fixture constants'
)

assert(
  pageSrc.includes('<select'),
  '/recall page includes a native <select> fixture selector (no extra dependencies)'
)

// ═══════════════════════════════════════════════════════
// 7. Collapsible state — uses existing React useState only
// ═══════════════════════════════════════════════════════
section('7. Collapsible state (no new dependencies)')

assert(
  pageSrc.includes('inspectorOpen') && pageSrc.includes('setInspectorOpen'),
  '/recall page has inspectorOpen state for collapsible section'
)

assert(
  pageSrc.includes('selectedFixture') && pageSrc.includes('setSelectedFixture'),
  '/recall page has selectedFixture state for selector'
)

// ═══════════════════════════════════════════════════════
// 8. inspectorDemoFixture satisfies brief requirements
// ═══════════════════════════════════════════════════════
section('8. inspectorDemoFixture packet shape')

assert(
  fixturesSrc.includes('export const inspectorDemoFixture'),
  'inspectorDemoFixture is exported from recallPacketFixtures'
)

assert(
  inspectorDemoFixture.active_sources.some(s => s.is_memory),
  'inspectorDemoFixture: has at least one active Memory source'
)

assert(
  inspectorDemoFixture.active_sources.some(s => s.is_continuity && !s.is_memory),
  'inspectorDemoFixture: has at least one active non-Memory continuity source'
)

assert(
  inspectorDemoFixture.excluded_sources.some(
    s => s.exclusion_reason === ExclusionReason.trace_only
  ),
  'inspectorDemoFixture: has at least one trace-excluded source'
)

assert(
  inspectorDemoFixture.has_sufficient_ground === true,
  'inspectorDemoFixture: has_sufficient_ground true'
)

assert(
  inspectorDemoFixture.summary.memory_count === 1,
  'inspectorDemoFixture: memory_count is 1'
)

assert(
  inspectorDemoFixture.summary.trace_count === 1,
  'inspectorDemoFixture: trace_count is 1'
)

// ═══════════════════════════════════════════════════════
// 9. No live data — no new fetch/Supabase calls in inspector section
// ═══════════════════════════════════════════════════════
section('9. No live data in inspector section')

// The inspector section must not contain fetch(), supabase., or await calls
const inspectorSection = (() => {
  const startMarker = 'Recall Packet Inspector (Phase 39.3.1)'
  const endMarker   = '</div>\n      </div>'
  const start = pageSrc.indexOf(startMarker)
  if (start < 0) return ''
  const end = pageSrc.indexOf(endMarker, start)
  return end > start ? pageSrc.slice(start, end) : pageSrc.slice(start, start + 5000)
})()

assert(
  !inspectorSection.includes('await ') &&
  !inspectorSection.includes('fetch(') &&
  !inspectorSection.includes('.from('),
  'Inspector section contains no fetch/await/Supabase calls'
)

// ═══════════════════════════════════════════════════════
// 10. No prompt builders or chat routes modified
// ═══════════════════════════════════════════════════════
section('10. No prompt builders or chat routes modified')

const protectedFiles = [
  { path: 'src/lib/presences/ari.ts',       name: 'ari.ts prompt builder' },
  { path: 'src/lib/presences/eli.ts',       name: 'eli.ts prompt builder' },
  { path: 'src/app/api/eli-chat/route.ts',  name: 'eli-chat route' },
  { path: 'src/app/api/ari-chat/route.ts',  name: 'ari-chat route' },
  { path: 'src/app/api/lounge-chat/route.ts', name: 'lounge-chat route' },
]

for (const file of protectedFiles) {
  const fullPath = path.join(ROOT, file.path)
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf-8')
    assert(
      !content.includes('RecallPacketDebugPanel') &&
      !content.includes('recallPacketFixtures') &&
      !content.includes('inspectorDemoFixture'),
      `${file.name} unmodified — no recall inspector imports`
    )
  } else {
    passed++
    console.log(`  ✓ ${file.name} not present — no integration to check`)
  }
}

// ═══════════════════════════════════════════════════════
// 11. No new recall-packet migrations
// ═══════════════════════════════════════════════════════
section('11. No new migrations')

const migrationFiles = fs.readdirSync(path.join(ROOT, 'supabase-migrations'))
const newRecallMigrations = migrationFiles.filter(f =>
  f.includes('recall_packet') ||
  f.includes('context_authority') ||
  f.includes('recall_inspector')
)

assert(
  newRecallMigrations.length === 0,
  `No recall-packet migrations added (found: ${newRecallMigrations.join(', ') || 'none'})`
)

// ═══════════════════════════════════════════════════════
// 12. ALL_FIXTURES includes inspectorDemoFixture
// ═══════════════════════════════════════════════════════
section('12. ALL_FIXTURES updated')

assert(
  fixturesSrc.includes("inspectorDemo:      inspectorDemoFixture") ||
  fixturesSrc.includes("inspectorDemo: inspectorDemoFixture"),
  'ALL_FIXTURES includes inspectorDemoFixture'
)

assert(
  typeof ALL_FIXTURES.inspectorDemo === 'object' &&
  typeof ALL_FIXTURES.inspectorDemo.packet_id === 'string',
  'ALL_FIXTURES.inspectorDemo is a valid RecallPacket at runtime'
)

// ═══════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════')
console.log('  Phase 39.3.1 Recall Packet Inspector Mount Tests')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log('═══════════════════════════════════════════════════════')

if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) {
    console.log(`  ✗ ${f}`)
  }
  process.exit(1)
} else {
  console.log('\n✅ All 39.3.1 mount tests passed.\n')
  process.exit(0)
}
