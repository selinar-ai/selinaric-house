/**
 * Phase 39.7.1 Structural + Logic Tests — Advisory Non-Disclosure Patch
 *
 * Verifies that the Recall Packet Advisory block includes explicit non-disclosure
 * instructions preventing Ari/Eli/Lounge from printing or reconstructing packet
 * internals in chat responses.
 *
 * Important: these tests check the advisory INSTRUCTION TEXT (what gets injected
 * into prompts) — not broad source-code scans. Forbidden field names appear in
 * the advisory text as things NOT to print; this is intentional.
 *
 * Run: npx tsx src/lib/__tests__/phase-39-7-1-advisory-nondisclosure.test.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { buildRecallAdvisoryPacket } from '../recall/recallAdvisorySignals'
import { formatRecallAdvisoryBlock } from '../recall/recallAdvisoryBlock'
import { RuntimeContextSignalType } from '../recall/recallPacketTypes'

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

const BLOCK_PATH = 'src/lib/recall/recallAdvisoryBlock.ts'
const blockSrc   = fs.readFileSync(path.join(ROOT, BLOCK_PATH), 'utf-8')

// ─── Get the actual formatted advisory block string ──────────────────────────
// We test the OUTPUT of formatRecallAdvisoryBlock() — what actually appears in prompts.

const testPacket = buildRecallAdvisoryPacket({
  packet_id:   'test-nondisclosure',
  computed_at: '2026-06-03T00:00:00Z',
  presence:    'ari',
  room:        'ari_room',
  signals: [{
    signal_type:    RuntimeContextSignalType.GovernedConfirmedMemory,
    presence_scope: 'shared',
    relevance:      'strong',
    source_ref:     { source_id: 'test-1' },
  }],
})

const advisoryBlock = formatRecallAdvisoryBlock(testPacket)

// ═══════════════════════════════════════════════════════
// 1. Advisory block source has non-disclosure rule section
// ═══════════════════════════════════════════════════════
section('1. Advisory block source has non-disclosure rule section')

assert(
  blockSrc.includes('Non-disclosure rule'),
  'recallAdvisoryBlock.ts contains Non-disclosure rule section'
)

// ═══════════════════════════════════════════════════════
// 2. Formatted advisory block output contains required non-disclosure phrases
//    Checks the ACTUAL OUTPUT injected into prompts — not just source code.
// ═══════════════════════════════════════════════════════
section('2. Advisory block OUTPUT contains required non-disclosure phrases')

assert(advisoryBlock.length > 0, 'Advisory block is non-empty for test packet')

const requiredPhrases = [
  'Do not quote',
  'Do not display',
  'Do not reveal',
  'Do not reconstruct',
  'Use this advisory silently',
  'natural language',
  '/recall',
]

for (const phrase of requiredPhrases) {
  assert(
    advisoryBlock.includes(phrase),
    `Advisory block OUTPUT contains required non-disclosure phrase: "${phrase}"`
  )
}

// ═══════════════════════════════════════════════════════
// 3. Formatted advisory block output explicitly names forbidden field labels
//    These appear in the "do not print" instruction — as prohibited examples.
//    The presence of these strings IS expected (as part of the prohibition).
// ═══════════════════════════════════════════════════════
section('3. Advisory block OUTPUT names forbidden field labels in prohibition context')

const forbiddenFieldsInProhibition = [
  'grounding_condition',
  'active_sources',
  'excluded_sources',
  'response_instruction',
  'query_intent',
  'confidence_basis',
  'authority_boundary',
]

for (const field of forbiddenFieldsInProhibition) {
  assert(
    advisoryBlock.includes(field),
    `Advisory block OUTPUT mentions "${field}" as a forbidden field label in the non-disclosure rule`
  )
}

// ═══════════════════════════════════════════════════════
// 4. Natural language examples present in output
// ═══════════════════════════════════════════════════════
section('4. Advisory block OUTPUT provides natural language example phrases')

assert(
  advisoryBlock.includes("I don't have confirmed Memory") ||
  advisoryBlock.includes("don't have confirmed Memory"),
  'Advisory block OUTPUT provides natural-language grounding example'
)

assert(
  advisoryBlock.includes('recent context') || advisoryBlock.includes('recent continuity'),
  'Advisory block OUTPUT references natural-language continuity phrasing'
)

// ═══════════════════════════════════════════════════════
// 5. Non-disclosure rule appears in all advisory packets
//    (including insufficient ground — different path in formatter)
// ═══════════════════════════════════════════════════════
section('5. Non-disclosure rule appears in insufficient ground advisory')

{
  const insufficientPacket = buildRecallAdvisoryPacket({
    packet_id:   'test-insufficient-nondisclosure',
    computed_at: '2026-06-03T00:00:00Z',
    presence:    'ari',
    room:        'ari_room',
    signals:     [], // empty → insufficient
  })

  // Empty signals → total_surfaces_considered = 0, no conflict → returns ''
  // The formatter returns '' when nothing was even considered
  // This is expected behaviour — no advisory, no non-disclosure block needed
  const insufficientBlock = formatRecallAdvisoryBlock(insufficientPacket)

  // Empty-signal packet returns '' (no advisory injected at all)
  // so there's nothing to disclose — this case is correctly handled
  assert(
    insufficientBlock === '' || insufficientBlock.includes('Do not quote'),
    'Empty-signal advisory either returns empty string or includes non-disclosure rule'
  )
}

// Packet WITH sources but insufficient ground (e.g., all excluded)
{
  const excludedPacket = buildRecallAdvisoryPacket({
    packet_id:   'test-excluded-nondisclosure',
    computed_at: '2026-06-03T00:00:00Z',
    presence:    'ari',
    room:        'ari_room',
    signals: [{
      signal_type:    RuntimeContextSignalType.GovernedConfirmedMemory,
      presence_scope: 'shared',
      relevance:      'none', // excluded by relevance gate
    }],
  })

  const excludedBlock = formatRecallAdvisoryBlock(excludedPacket)
  assert(
    excludedBlock.includes('Do not quote') ||
    excludedBlock.includes('Do not reconstruct'),
    'Advisory block with excluded-only sources still contains non-disclosure rule'
  )
}

// ═══════════════════════════════════════════════════════
// 6. Non-disclosure rule does not appear as data output
//    The advisory block should give an INSTRUCTION, not expose data
// ═══════════════════════════════════════════════════════
section('6. Non-disclosure is an instruction, not a data disclosure')

// The field names in the prohibition are there to FORBID them, not to surface them as values
assert(
  advisoryBlock.includes('Do not print internal Recall Packet field names') ||
  advisoryBlock.includes('field names or labels'),
  'Advisory block frames forbidden field names as "do not print" instruction'
)

// The block should not have a line that starts with "grounding_condition:" (as a value)
const lines = advisoryBlock.split('\n')
const dataLines = lines.filter(l => /^grounding_condition:|^active_sources:|^excluded_sources:/.test(l.trim()))
assert(
  dataLines.length === 0,
  'Advisory block does not output grounding_condition/active_sources/excluded_sources as data fields (only mentions them as forbidden examples)'
)

// ═══════════════════════════════════════════════════════
// 7. Advisory block still fulfills core advisory purpose
// ═══════════════════════════════════════════════════════
section('7. Advisory block still fulfills core advisory purpose')

assert(
  advisoryBlock.includes('Recall Packet Advisory'),
  'Advisory block header still present'
)

assert(
  advisoryBlock.includes('metadata only, not Memory authority'),
  'Authority boundary header still present'
)

assert(
  advisoryBlock.includes('Primary response instruction:'),
  'Primary response instruction still present in advisory'
)

assert(
  advisoryBlock.includes('Grounding status:'),
  'Grounding status still present in advisory'
)

assert(
  advisoryBlock.includes('confirmed memory:'),
  'Source family counts still present in advisory (count-agnostic check)'
)

// ═══════════════════════════════════════════════════════
// 8. No existing tests broken by the wording change
// ═══════════════════════════════════════════════════════
section('8. Existing required phrases still present')

// Check phrases that are actually in the advisory block output.
// Note: "Excluded sources are not response grounding" and "Trace sources are not evidence"
// live in RecallPacketDebugPanel.tsx's governance footer — not in the advisory block.
// The advisory block has its own boundary phrasing below.
const existingPhrases = [
  'does not create Memory',
  'does not move authority',
  'Do not treat excluded sources as grounding',
  'calibrate wording and certainty',
]

for (const phrase of existingPhrases) {
  assert(
    advisoryBlock.includes(phrase),
    `Existing required phrase still in advisory output: "${phrase}"`
  )
}

// ═══════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════')
console.log('  Phase 39.7.1 Advisory Non-Disclosure Tests')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log('═══════════════════════════════════════════════════════')

if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
} else {
  console.log('\n✅ All 39.7.1 advisory non-disclosure tests passed.\n')
  process.exit(0)
}
