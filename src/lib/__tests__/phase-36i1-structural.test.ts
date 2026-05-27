/**
 * Phase 36I.1 Structural Tests — Lounge Event Boundary Repair
 *
 * Static/structural validation that the reconstruction marker boundary
 * reset logic is correctly implemented in lounge.ts and supporting files.
 *
 * Run: npx tsx src/lib/__tests__/phase-36i1-structural.test.ts
 *
 * These tests verify code structure only — no Supabase calls, no data writes.
 */

import * as fs from 'fs'
import * as path from 'path'

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

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8')
}

const loungeTs = readFile('src/lib/lounge.ts')
const captureRoute = readFile('src/app/api/lounge-capture/route.ts')
const hookTs = readFile('src/hooks/useLoungeMessages.ts')
const chatTsx = readFile('src/components/LoungeChat.tsx')

// ═══════════════════════════════════════════════════════
// 1. findReconstructionMarker helper exists and is correct
// ═══════════════════════════════════════════════════════
section('1. findReconstructionMarker helper')

assert(
  loungeTs.includes('async function findReconstructionMarker('),
  'findReconstructionMarker function exists in lounge.ts'
)

assert(
  loungeTs.includes(".eq('speaker', 'system')") &&
  loungeTs.includes("findReconstructionMarker"),
  'Marker query filters by speaker = system'
)

assert(
  loungeTs.includes(".ilike('content', '%[RECONSTRUCTION MARKER%')"),
  'Marker query checks for [RECONSTRUCTION MARKER in content'
)

assert(
  loungeTs.includes(".ilike('content', '%Phase 36I incident%')"),
  'Marker query checks for Phase 36I incident in content'
)

assert(
  /findReconstructionMarker[\s\S]*?\.is\('deleted_at',\s*null\)/.test(loungeTs),
  'Marker query filters deleted_at IS NULL'
)

assert(
  /findReconstructionMarker[\s\S]*?\.gt\('created_at',\s*eventTimestamp\)/.test(loungeTs),
  'Marker query requires created_at > eventTimestamp'
)

assert(
  /findReconstructionMarker[\s\S]*?\.maybeSingle\(\)/.test(loungeTs),
  'Marker query uses maybeSingle (returns null when no marker)'
)

// ═══════════════════════════════════════════════════════
// 2. getMessagesForCapture uses the marker correctly
// ═══════════════════════════════════════════════════════
section('2. getMessagesForCapture boundary reset logic')

assert(
  loungeTs.includes('findReconstructionMarker(threadId, eventTimestamp)'),
  'getMessagesForCapture calls findReconstructionMarker on boundary failure'
)

assert(
  loungeTs.includes("boundaryResetReason = 'Boundary reset from reconstruction marker"),
  'Sets boundaryResetReason when marker found'
)

assert(
  loungeTs.includes('Latest Lounge event boundary could not be resolved'),
  'Still blocks when no marker is found'
)

assert(
  loungeTs.includes("const eventTimestamp = lastEvent.ended_at ?? lastEvent.created_at"),
  'Uses ended_at (preferred) or created_at for event timestamp comparison'
)

// ═══════════════════════════════════════════════════════
// 3. LoungeCaptureProposal type includes boundaryResetReason
// ═══════════════════════════════════════════════════════
section('3. LoungeCaptureProposal interface')

assert(
  loungeTs.includes('boundaryResetReason: string | null'),
  'LoungeCaptureProposal has boundaryResetReason: string | null'
)

assert(
  /return\s*\{[\s\S]*?proposal:\s*\{[\s\S]*?boundaryResetReason[\s\S]*?\}/.test(loungeTs),
  'Return object includes boundaryResetReason in proposal'
)

// ═══════════════════════════════════════════════════════
// 4. System messages excluded from capture
// ═══════════════════════════════════════════════════════
section('4. System messages excluded from capture')

// Count occurrences of .neq('speaker', 'system') in the capture function area
const captureArea = loungeTs.slice(
  loungeTs.indexOf('export async function getMessagesForCapture'),
  loungeTs.indexOf('// ─── Reconstruction marker helper')
)

const speakerNeqCount = (captureArea.match(/\.neq\('speaker',\s*'system'\)/g) || []).length

assert(
  speakerNeqCount >= 2,
  `Message fetch queries exclude system messages (found ${speakerNeqCount} .neq(speaker, system) calls, expected ≥2)`
)

// ═══════════════════════════════════════════════════════
// 5. 36J safety filters present on event and message queries
// ═══════════════════════════════════════════════════════
section('5. 36J safety filters in capture')

// Count deleted_at IS NULL filters in the capture function
const deletedAtCount = (captureArea.match(/\.is\('deleted_at',\s*null\)/g) || []).length

assert(
  deletedAtCount >= 4,
  `Capture function has ≥4 deleted_at IS NULL filters (found ${deletedAtCount}): events, boundary msgs, and both message queries`
)

assert(
  captureArea.includes(".eq('test_owned', false)"),
  'Cross-room events query filters test_owned = false'
)

// ═══════════════════════════════════════════════════════
// 6. API route passes boundaryResetReason through
// ═══════════════════════════════════════════════════════
section('6. API route passes boundaryResetReason')

assert(
  captureRoute.includes('boundaryResetReason'),
  'API route includes boundaryResetReason in confirmation response'
)

assert(
  captureRoute.includes('proposal.boundaryResetReason'),
  'API route reads boundaryResetReason from proposal object'
)

// ═══════════════════════════════════════════════════════
// 7. UI displays boundary reset information
// ═══════════════════════════════════════════════════════
section('7. UI boundary reset display')

assert(
  hookTs.includes('boundaryResetReason'),
  'useLoungeMessages hook passes boundaryResetReason through'
)

assert(
  chatTsx.includes('boundaryResetReason'),
  'LoungeChat.tsx references boundaryResetReason'
)

assert(
  chatTsx.includes('boundary reset'),
  'LoungeChat.tsx shows boundary reset note to user'
)

assert(
  chatTsx.includes('review before confirming'),
  'LoungeChat.tsx prompts user to review before confirming reset capture'
)

// Boundary-reset captures always require confirmation
assert(
  loungeTs.includes('if (boundaryResetReason)') &&
  loungeTs.includes('isFirstCapture = true'),
  'Boundary reset forces requiresConfirmation = true (via isFirstCapture)'
)

// ═══════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════')
console.log(`  Phase 36I.1 Structural Tests`)
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
  console.log('\n✅ All structural tests passed.\n')
  process.exit(0)
}
