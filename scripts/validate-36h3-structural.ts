/**
 * Phase 36H.3 Structural Tests
 *
 * Validates that the cross-room reflection hook implementation is structurally
 * correct without hitting the database. Tests type shapes, validation logic,
 * context summary building, and processability guards.
 *
 * Usage: npx tsx scripts/validate-36h3-structural.ts
 */

export {}  // TypeScript module boundary — prevents global scope collisions

import {
  VALID_TRIGGER_TYPES,
  PROCESSABLE_TRIGGER_TYPES,
  type ReflectionTriggerType,
  type ReflectionJobSourceMetadata,
  type SourceRefType,
} from '../src/lib/reflections/reflection-types'

import { buildReflectionContext } from '../src/lib/reflections/reflection-hooks'

import {
  formatTriggerType,
  formatSourceRefType,
} from '../src/lib/reflections/reflection-format'

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

// ═══════════════════════════════════════════════════════════════
// 1. Trigger type registration
// ═══════════════════════════════════════════════════════════════
section('1. Trigger type registration')

assert(
  VALID_TRIGGER_TYPES.includes('cross_room_event'),
  'cross_room_event is in VALID_TRIGGER_TYPES'
)

assert(
  VALID_TRIGGER_TYPES.length === 5,
  'VALID_TRIGGER_TYPES has exactly 5 entries'
)

assert(
  PROCESSABLE_TRIGGER_TYPES.includes('timeline_keep'),
  'timeline_keep is processable'
)

assert(
  PROCESSABLE_TRIGGER_TYPES.includes('concept_approved'),
  'concept_approved is processable'
)

assert(
  PROCESSABLE_TRIGGER_TYPES.includes('forgekeeper_accepted'),
  'forgekeeper_accepted is processable'
)

assert(
  PROCESSABLE_TRIGGER_TYPES.includes('living_state_transition'),
  'living_state_transition is processable'
)

assert(
  !PROCESSABLE_TRIGGER_TYPES.includes('cross_room_event'),
  'cross_room_event is NOT processable (queue-only)'
)

assert(
  PROCESSABLE_TRIGGER_TYPES.length === 4,
  'PROCESSABLE_TRIGGER_TYPES has exactly 4 entries'
)

// ═══════════════════════════════════════════════════════════════
// 2. Source ref types
// ═══════════════════════════════════════════════════════════════
section('2. Source ref types')

// Verify that cross_room_event and cross_room_impact are valid SourceRefType values
// by checking the type compiles (runtime check via format function)
assert(
  formatSourceRefType('cross_room_event') === 'Cross-room event',
  'cross_room_event source ref formats correctly'
)

assert(
  formatSourceRefType('cross_room_impact') === 'Cross-room impact',
  'cross_room_impact source ref formats correctly'
)

// ═══════════════════════════════════════════════════════════════
// 3. Format functions
// ═══════════════════════════════════════════════════════════════
section('3. Format functions')

assert(
  formatTriggerType('cross_room_event') === 'Cross-room reflection',
  'formatTriggerType handles cross_room_event'
)

assert(
  formatTriggerType('timeline_keep') === 'Timeline keep',
  'formatTriggerType still works for timeline_keep'
)

assert(
  formatTriggerType('unknown_future_type') === 'unknown_future_type',
  'formatTriggerType passes through unknown types'
)

// ═══════════════════════════════════════════════════════════════
// 4. ReflectionJobSourceMetadata shape
// ═══════════════════════════════════════════════════════════════
section('4. ReflectionJobSourceMetadata shape')

const testMetadata: ReflectionJobSourceMetadata = {
  source_surface: 'lounge',
  source_event_type: 'cross_room_event',
  source_event_id: 'test-event-id',
  source_impact_id: 'test-impact-id',
  source_room_id: 'the-lounge',
  authority_label: 'cross_room_reflection_hook_not_memory',
  eligibility_reason: 'tara_requested',
}

assert(
  testMetadata.source_surface === 'lounge',
  'source_surface field accepted'
)

assert(
  testMetadata.authority_label === 'cross_room_reflection_hook_not_memory',
  'authority_label field accepted'
)

assert(
  testMetadata.source_impact_id === 'test-impact-id',
  'source_impact_id optional field accepted'
)

// Test without optional fields
const minimalMetadata: ReflectionJobSourceMetadata = {
  source_surface: 'gaming_wing',
  source_event_type: 'game_event',
  source_event_id: 'game-123',
  authority_label: 'cross_room_reflection_hook_not_memory',
  eligibility_reason: 'tara_requested',
}

assert(
  minimalMetadata.source_impact_id === undefined,
  'source_impact_id is optional'
)

assert(
  minimalMetadata.source_room_id === undefined,
  'source_room_id is optional'
)

assert(
  minimalMetadata.source_wing_id === undefined,
  'source_wing_id is optional'
)

// ═══════════════════════════════════════════════════════════════
// 5. buildReflectionContext
// ═══════════════════════════════════════════════════════════════
section('5. buildReflectionContext')

const ctx1 = buildReflectionContext(
  {
    impact_summary: 'Eli noticed a pattern in how trust builds between presences.',
    continuity_signal: 'This connects to earlier reflections about presence-to-presence rapport.',
    what_changed: ['Trust model updated', 'New rapport baseline'],
    what_remains_open: ['How does this affect future room dynamics?'],
  },
  'A shared moment of recognition in the Lounge.',
  'eli',
)

assert(ctx1.includes('Eli'), 'Context includes presence name Eli')
assert(ctx1.includes('Eli noticed a pattern'), 'Context includes impact summary')
assert(ctx1.includes('shared-room exchange'), 'Context includes event summary prefix')
assert(ctx1.includes('Continuity signal'), 'Context includes continuity signal')
assert(ctx1.includes('Trust model updated'), 'Context includes what_changed')
assert(ctx1.includes('How does this affect'), 'Context includes what_remains_open')

// Ari context
const ctx2 = buildReflectionContext(
  { impact_summary: 'Ari felt grounded.' },
  null,
  'ari',
)

assert(ctx2.includes('Ari'), 'Context uses Ari for ari presenceId')
assert(!ctx2.includes('shared-room exchange'), 'Context omits event summary when null')
assert(!ctx2.includes('Continuity signal'), 'Context omits continuity_signal when absent')

// Truncation at 800 chars
const longSummary = 'x'.repeat(900)
const ctx3 = buildReflectionContext(
  { impact_summary: longSummary },
  'event summary',
  'eli',
)

assert(ctx3.length <= 800, `Context capped at 800 chars (got ${ctx3.length})`)

// Empty arrays omitted
const ctx4 = buildReflectionContext(
  {
    impact_summary: 'Short impact.',
    what_changed: [],
    what_remains_open: [],
  },
  null,
  'ari',
)

assert(!ctx4.includes('What changed'), 'Empty what_changed is omitted')
assert(!ctx4.includes('What remains open'), 'Empty what_remains_open is omitted')

// Arrays capped at 3
const ctx5 = buildReflectionContext(
  {
    impact_summary: 'Test.',
    what_changed: ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA_FOURTH', 'ECHO_FIFTH'],
    what_remains_open: ['XRAY', 'YANKEE', 'ZULU', 'WHISKEY_FOURTH'],
  },
  null,
  'eli',
)

assert(!ctx5.includes('DELTA_FOURTH'), 'what_changed capped at 3 items (4th excluded)')
assert(!ctx5.includes('WHISKEY_FOURTH'), 'what_remains_open capped at 3 items (4th excluded)')
assert(ctx5.includes('ALPHA'), 'what_changed includes first item')
assert(ctx5.includes('CHARLIE'), 'what_changed includes third item')

// ═══════════════════════════════════════════════════════════════
// 6. Queue-only invariants
// ═══════════════════════════════════════════════════════════════
section('6. Queue-only invariants')

// Verify cross_room_event is not in PROCESSABLE_TRIGGER_TYPES
// This is the critical guard that prevents Run from processing these jobs
const processableSet = new Set(PROCESSABLE_TRIGGER_TYPES)
const validSet = new Set(VALID_TRIGGER_TYPES)

assert(
  validSet.has('cross_room_event') && !processableSet.has('cross_room_event'),
  'cross_room_event is valid but not processable — queue-only enforced'
)

// Verify all processable types are also valid
for (const pt of PROCESSABLE_TRIGGER_TYPES) {
  assert(
    validSet.has(pt),
    `Processable type '${pt}' is also in VALID_TRIGGER_TYPES`
  )
}

// Verify PROCESSABLE is a strict subset of VALID
assert(
  PROCESSABLE_TRIGGER_TYPES.length < VALID_TRIGGER_TYPES.length,
  'PROCESSABLE_TRIGGER_TYPES is a strict subset of VALID_TRIGGER_TYPES'
)

// ═══════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════')
console.log(`Phase 36H.3 Structural Tests: ${passed} passed, ${failed} failed`)
if (failures.length > 0) {
  console.log('\nFailed:')
  for (const f of failures) {
    console.log(`  ✗ ${f}`)
  }
}
console.log('════════════════════════════════════════')

process.exit(failed > 0 ? 1 : 0)
