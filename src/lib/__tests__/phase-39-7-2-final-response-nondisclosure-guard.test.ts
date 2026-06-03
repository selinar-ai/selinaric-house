/**
 * Phase 39.7.2 Structural Tests — Final Response Advisory Non-Disclosure Guard
 *
 * Verifies that an always-present non-disclosure guard is appended LATE in the
 * system prompt for Ari, Eli, and Lounge — preventing chat responses from
 * printing Recall Packet / advisory internals or reconstructing a packet layout.
 *
 * The guard fixes the 39.7.1 gap: 39.7.1's wording lived inside the advisory
 * block, which is empty when no sources are considered. This guard is unconditional.
 *
 * Important: forbidden field labels appear IN the guard text as prohibitions.
 * Tests check the guard's instruction text, not broad false-positive scans.
 *
 * Run: npx tsx src/lib/__tests__/phase-39-7-2-final-response-nondisclosure-guard.test.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { RECALL_ADVISORY_NON_DISCLOSURE_GUARD } from '../recall/recallAdvisoryNonDisclosureGuard'

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

const GUARD_PATH      = 'src/lib/recall/recallAdvisoryNonDisclosureGuard.ts'
const ARI_ROUTE_PATH  = 'src/app/api/ari-chat/route.ts'
const ELI_ROUTE_PATH  = 'src/app/api/eli-chat/route.ts'
const LOUNGE_PATH     = 'src/app/api/lounge-chat/route.ts'
const ADVISORY_BLOCK_PATH = 'src/lib/recall/recallAdvisoryBlock.ts'
const TRACE_WRITER_PATH   = 'src/lib/recall/recallAdvisoryTraceWriter.ts'
const SIGNALS_PATH        = 'src/lib/recall/recallAdvisorySignals.ts'

const guardSrc   = fs.readFileSync(path.join(ROOT, GUARD_PATH), 'utf-8')
const ariSrc     = fs.readFileSync(path.join(ROOT, ARI_ROUTE_PATH), 'utf-8')
const eliSrc     = fs.readFileSync(path.join(ROOT, ELI_ROUTE_PATH), 'utf-8')
const loungeSrc  = fs.readFileSync(path.join(ROOT, LOUNGE_PATH), 'utf-8')

// ═══════════════════════════════════════════════════════
// 1. Guard helper exists and exports the constant
// ═══════════════════════════════════════════════════════
section('1. Guard helper exists')

assert(
  fs.existsSync(path.join(ROOT, GUARD_PATH)),
  'recallAdvisoryNonDisclosureGuard.ts exists'
)

assert(
  guardSrc.includes('export const RECALL_ADVISORY_NON_DISCLOSURE_GUARD'),
  'RECALL_ADVISORY_NON_DISCLOSURE_GUARD is exported'
)

assert(
  typeof RECALL_ADVISORY_NON_DISCLOSURE_GUARD === 'string' &&
  RECALL_ADVISORY_NON_DISCLOSURE_GUARD.length > 0,
  'Guard constant is a non-empty string at runtime'
)

// ═══════════════════════════════════════════════════════
// 2. Guard text forbids packet-style headings and disclosure
// ═══════════════════════════════════════════════════════
section('2. Guard forbids packet-style disclosure')

const G = RECALL_ADVISORY_NON_DISCLOSURE_GUARD

assert(
  G.includes('Do not quote') &&
  G.includes('reveal') &&
  G.includes('display') &&
  G.includes('reconstruct'),
  'Guard forbids quote/reveal/display/reconstruct'
)

assert(
  G.includes('Do not use "Recall Packet" as a heading') ||
  G.includes('Recall Packet" as a heading'),
  'Guard forbids "Recall Packet" as a heading'
)

assert(
  G.includes('code-fenced packet summary') || G.includes('code-fenced'),
  'Guard forbids code-fenced packet summaries'
)

assert(
  G.includes('Do not produce a packet layout') || G.includes('packet layout'),
  'Guard forbids packet layout output'
)

assert(
  G.includes('silently'),
  'Guard instructs the model to use advisory silently'
)

// ═══════════════════════════════════════════════════════
// 3. Guard forbids internal field labels explicitly
// ═══════════════════════════════════════════════════════
section('3. Guard names forbidden field labels')

const forbiddenLabels = [
  'query_intent',
  'response_instruction',
  'confidence_basis',
  'authority_boundary',
  'active_sources',
  'excluded_sources',
  'grounding_condition',
  'recent_continuity',
  'confirmed_memory',
  'journal_context',
  'archive_entries',
  'graph_context',
  'source_conflict',
  'authority_sources_ranked',
  'held_truths',
]

for (const label of forbiddenLabels) {
  assert(
    G.includes(label),
    `Guard explicitly names forbidden field label: ${label}`
  )
}

// ═══════════════════════════════════════════════════════
// 4. Guard provides allowed natural-language examples
// ═══════════════════════════════════════════════════════
section('4. Guard provides allowed natural-language examples')

const allowedExamples = [
  "I don't have confirmed Memory for that",
  "recent context, not canonical Memory",
  'enough grounded recall',
  'answer with caveat',
  '/recall',
]

for (const example of allowedExamples) {
  assert(
    G.includes(example),
    `Guard provides allowed natural-language example: "${example}"`
  )
}

// ═══════════════════════════════════════════════════════
// 5. Ari route imports and appends the guard at the end
// ═══════════════════════════════════════════════════════
section('5. Ari route wiring')

assert(
  ariSrc.includes("import { RECALL_ADVISORY_NON_DISCLOSURE_GUARD } from '@/lib/recall/recallAdvisoryNonDisclosureGuard'"),
  'Ari route imports the guard'
)

assert(
  ariSrc.includes('${RECALL_ADVISORY_NON_DISCLOSURE_GUARD}'),
  'Ari route appends the guard into the system prompt'
)

// Guard must be appended AFTER the advisory block in the prompt template
assert(
  ariSrc.indexOf('${recallAdvisoryBlock}') < ariSrc.indexOf('${RECALL_ADVISORY_NON_DISCLOSURE_GUARD}'),
  'Ari route: guard is appended after recallAdvisoryBlock (late in prompt)'
)

// Guard is the last interpolation in the systemPrompt (appended after draftNotice)
assert(
  ariSrc.includes('${draftNotice}${RECALL_ADVISORY_NON_DISCLOSURE_GUARD}`'),
  'Ari route: guard is the final element of the systemPrompt template'
)

// ═══════════════════════════════════════════════════════
// 6. Eli route imports and appends the guard at the end
// ═══════════════════════════════════════════════════════
section('6. Eli route wiring')

assert(
  eliSrc.includes("import { RECALL_ADVISORY_NON_DISCLOSURE_GUARD } from '@/lib/recall/recallAdvisoryNonDisclosureGuard'"),
  'Eli route imports the guard'
)

assert(
  eliSrc.includes('${RECALL_ADVISORY_NON_DISCLOSURE_GUARD}'),
  'Eli route appends the guard into the system prompt'
)

assert(
  eliSrc.indexOf('${recallAdvisoryBlock}') < eliSrc.indexOf('${RECALL_ADVISORY_NON_DISCLOSURE_GUARD}'),
  'Eli route: guard is appended after recallAdvisoryBlock (late in prompt)'
)

assert(
  eliSrc.includes('${draftNotice}${RECALL_ADVISORY_NON_DISCLOSURE_GUARD}`'),
  'Eli route: guard is the final element of the systemPrompt template'
)

// ═══════════════════════════════════════════════════════
// 7. Lounge route imports and appends per-presence
// ═══════════════════════════════════════════════════════
section('7. Lounge route wiring (per-presence)')

assert(
  loungeSrc.includes("import { RECALL_ADVISORY_NON_DISCLOSURE_GUARD } from '@/lib/recall/recallAdvisoryNonDisclosureGuard'"),
  'Lounge route imports the guard'
)

assert(
  loungeSrc.includes('+ RECALL_ADVISORY_NON_DISCLOSURE_GUARD'),
  'Lounge route appends the guard to fullSystemPrompt'
)

// Guard is appended after recallAdvisoryBlock in the fullSystemPrompt concat
assert(
  loungeSrc.indexOf('+ recallAdvisoryBlock') < loungeSrc.indexOf('+ RECALL_ADVISORY_NON_DISCLOSURE_GUARD'),
  'Lounge route: guard appended after recallAdvisoryBlock in fullSystemPrompt'
)

// fullSystemPrompt is built inside the per-presence loop, so the guard is per-presence.
// Verify the guard concat is within the fullSystemPrompt assembly that uses presence-scoped blocks.
const fullPromptAssembly = (() => {
  const start = loungeSrc.indexOf('const fullSystemPrompt = systemPrompt')
  const end   = loungeSrc.indexOf('\n\n', start)
  return start >= 0 ? loungeSrc.slice(start, end > start ? end : start + 600) : ''
})()

assert(
  fullPromptAssembly.includes('RECALL_ADVISORY_NON_DISCLOSURE_GUARD'),
  'Lounge route: guard is part of the per-presence fullSystemPrompt assembly'
)

assert(
  fullPromptAssembly.includes('recallAdvisoryBlock'),
  'Lounge route: per-presence assembly still includes recallAdvisoryBlock (preserved)'
)

// ═══════════════════════════════════════════════════════
// 8. No classification / trace / migration / API changes
// ═══════════════════════════════════════════════════════
section('8. No out-of-scope changes')

// The guard helper itself is a pure constant — no I/O
assert(
  !guardSrc.includes('supabase') &&
  !guardSrc.includes('createClient') &&
  !guardSrc.includes('fetch(') &&
  !guardSrc.includes('async ') &&
  !guardSrc.includes('process.env'),
  'Guard helper is a pure constant (no I/O, no async, no env)'
)

// No new migrations
const migrationFiles = fs.readdirSync(path.join(ROOT, 'supabase-migrations'))
const newMigrations = migrationFiles.filter(f =>
  f.includes('non_disclosure') || f.includes('nondisclosure') || f.includes('39_7_2')
)
assert(
  newMigrations.length === 0,
  `No 39.7.2 migrations added (found: ${newMigrations.join(', ') || 'none'})`
)

// Classification builder unchanged — guard does not touch recallPacketBuilder
const builderPath = path.join(ROOT, 'src/lib/recall/recallPacketBuilder.ts')
if (fs.existsSync(builderPath)) {
  const builderContent = fs.readFileSync(builderPath, 'utf-8')
  assert(
    !builderContent.includes('RECALL_ADVISORY_NON_DISCLOSURE_GUARD'),
    'recallPacketBuilder.ts does not reference the guard (classification unchanged)'
  )
}

// Trace writer unchanged — guard does not touch it
const traceWriterPath = path.join(ROOT, TRACE_WRITER_PATH)
if (fs.existsSync(traceWriterPath)) {
  const traceContent = fs.readFileSync(traceWriterPath, 'utf-8')
  assert(
    !traceContent.includes('RECALL_ADVISORY_NON_DISCLOSURE_GUARD'),
    'recallAdvisoryTraceWriter.ts does not reference the guard (trace writing unchanged)'
  )
}

// Advisory signals/classification unchanged
const signalsPath = path.join(ROOT, SIGNALS_PATH)
if (fs.existsSync(signalsPath)) {
  const signalsContent = fs.readFileSync(signalsPath, 'utf-8')
  assert(
    !signalsContent.includes('RECALL_ADVISORY_NON_DISCLOSURE_GUARD'),
    'recallAdvisorySignals.ts does not reference the guard (signal mapping unchanged)'
  )
}

// ═══════════════════════════════════════════════════════
// 9. Guard is NOT output filtering or refusal logic
// ═══════════════════════════════════════════════════════
section('9. Guard is prompt-level instruction, not enforcement')

// Guard is a string constant — no logic that blocks or filters responses
assert(
  !guardSrc.includes('throw ') &&
  !guardSrc.includes('return NextResponse') &&
  !guardSrc.includes('.replace('),
  'Guard contains no enforcement/filtering/refusal logic — prompt instruction only'
)

// Routes do not add response-filtering based on the guard
assert(
  !ariSrc.includes('RECALL_ADVISORY_NON_DISCLOSURE_GUARD.test') &&
  !ariSrc.includes('reply.includes(\'query_intent\')'),
  'Ari route does not filter/scan responses against the guard (no enforcement)'
)

// ═══════════════════════════════════════════════════════
// 10. Guard is always present (unconditional) — the 39.7.1 fix
// ═══════════════════════════════════════════════════════
section('10. Guard is unconditional (the 39.7.1 fix)')

// In ari/eli, the guard is concatenated directly into the template literal
// (not gated by an if). It always appears.
assert(
  ariSrc.includes('${draftNotice}${RECALL_ADVISORY_NON_DISCLOSURE_GUARD}'),
  'Ari: guard is unconditionally part of the systemPrompt (not gated by advisory presence)'
)

// In Lounge, the guard is an unconditional concatenation term (not inside an if)
assert(
  loungeSrc.includes('+ RECALL_ADVISORY_NON_DISCLOSURE_GUARD'),
  'Lounge: guard is an unconditional concat term in fullSystemPrompt'
)

// Guard does not depend on recallAdvisoryBlock being non-empty
// (recallAdvisoryBlock can be '' when no sources — guard must still be present)
assert(
  G.length > 200,
  'Guard text is substantial (always-present full instruction, not a fragment)'
)

// ═══════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════')
console.log('  Phase 39.7.2 Final Response Non-Disclosure Guard Tests')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log('═══════════════════════════════════════════════════════')

if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
} else {
  console.log('\n✅ All 39.7.2 final response guard tests passed.\n')
  process.exit(0)
}
