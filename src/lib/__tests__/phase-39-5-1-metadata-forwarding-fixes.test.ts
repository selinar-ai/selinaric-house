/**
 * Phase 39.5.1 Structural Tests — Tier 1 Metadata Forwarding Fixes
 *
 * Verifies that the four targeted metadata fixes were applied:
 *   Fix A: InjectedMemory now carries source_document and source_date (id was already present)
 *   Fix B: Living State block header contains "not canonical Memory" authority boundary
 *   Fix C: getLivingStateForSignal() exported for freshness/metadata mapping
 *   Fix D: loadTimelineEntries() has JSDoc noting voice_integrity for signal mapping
 *
 * These are metadata-only / documentation fixes.
 * No prompt builder behaviour was changed beyond the Living State authority label.
 * No chat routes were changed.
 * No DB migrations were added.
 *
 * Run: npx tsx src/lib/__tests__/phase-39-5-1-metadata-forwarding-fixes.test.ts
 */

import * as fs from 'fs'
import * as path from 'path'

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

const MEMORY_INJECTION_PATH = 'src/lib/memory-injection.ts'
const LIVING_STATE_PATH     = 'src/lib/living-state.ts'
const TIMELINE_PATH         = 'src/lib/timeline.ts'

const memSrc       = fs.readFileSync(path.join(ROOT, MEMORY_INJECTION_PATH), 'utf-8')
const livingStateSrc = fs.readFileSync(path.join(ROOT, LIVING_STATE_PATH), 'utf-8')
const timelineSrc  = fs.readFileSync(path.join(ROOT, TIMELINE_PATH), 'utf-8')

// ═══════════════════════════════════════════════════════
// Fix A — InjectedMemory provenance fields
// ═══════════════════════════════════════════════════════
section('Fix A — InjectedMemory provenance fields')

assert(
  memSrc.includes('export interface InjectedMemory'),
  'InjectedMemory interface exists in memory-injection.ts'
)

assert(
  memSrc.includes('id: string'),
  'InjectedMemory already has id: string field'
)

assert(
  memSrc.includes('source_document?: string | null'),
  'InjectedMemory has new source_document?: string | null field'
)

assert(
  memSrc.includes('source_date?: string | null'),
  'InjectedMemory has new source_date?: string | null field'
)

// Provenance fields are populated in the injected entry construction
assert(
  memSrc.includes('source_document: entry?.source_document ?? null'),
  'source_document populated from keyword RecallEntry in injectedEntry construction'
)

assert(
  memSrc.includes('source_date: entry?.source_date ?? null'),
  'source_date populated from keyword RecallEntry in injectedEntry construction'
)

// Provenance fields must NOT be used in prompt formatting functions
// (they are metadata only — formatInjectedEntry must not include them in block text)
const formatFunctionStart = memSrc.indexOf('function formatInjectedEntry(')
const formatFunctionEnd   = memSrc.indexOf('\nfunction buildInjectionBlock(')
const formatFunctionBody  = formatFunctionStart >= 0 && formatFunctionEnd > formatFunctionStart
  ? memSrc.slice(formatFunctionStart, formatFunctionEnd)
  : ''

assert(
  formatFunctionBody.length > 0,
  'formatInjectedEntry function located for inspection'
)

assert(
  !formatFunctionBody.includes('source_document') &&
  !formatFunctionBody.includes('source_date'),
  'formatInjectedEntry does NOT use source_document or source_date (metadata only, not in prompt)'
)

// ═══════════════════════════════════════════════════════
// Fix B — Living State "not canonical Memory" authority boundary
// ═══════════════════════════════════════════════════════
section('Fix B — Living State authority boundary in block header')

assert(
  livingStateSrc.includes('getLivingStateForPrompt'),
  'getLivingStateForPrompt function exists'
)

assert(
  livingStateSrc.includes('not canonical Memory'),
  'Living State block header contains "not canonical Memory" authority boundary'
)

assert(
  !livingStateSrc.includes('## Living State — where we are right now:'),
  'Old header without authority boundary is removed'
)

assert(
  livingStateSrc.includes('## Living State — current orientation, not canonical Memory:'),
  'New header with authority boundary is present'
)

// Verify it is inside getLivingStateForPrompt, not just in a comment somewhere
const promptFnStart = livingStateSrc.indexOf('export async function getLivingStateForPrompt(')
const promptFnEnd   = livingStateSrc.indexOf('\n/**', promptFnStart + 1)
const promptFnBody  = promptFnStart >= 0
  ? livingStateSrc.slice(promptFnStart, promptFnEnd > 0 ? promptFnEnd : promptFnStart + 500)
  : ''

assert(
  promptFnBody.includes('not canonical Memory'),
  'Authority boundary is inside getLivingStateForPrompt() function body'
)

// ═══════════════════════════════════════════════════════
// Fix C — getLivingStateForSignal() exported
// ═══════════════════════════════════════════════════════
section('Fix C — getLivingStateForSignal() metadata function')

assert(
  livingStateSrc.includes('export interface LivingStateSignalMetadata'),
  'LivingStateSignalMetadata interface exported'
)

assert(
  livingStateSrc.includes('last_updated: string'),
  'LivingStateSignalMetadata has last_updated: string'
)

assert(
  livingStateSrc.includes('version:      number') ||
  livingStateSrc.includes('version: number'),
  'LivingStateSignalMetadata has version: number'
)

assert(
  livingStateSrc.includes('updated_by:   string') ||
  livingStateSrc.includes('updated_by: string'),
  'LivingStateSignalMetadata has updated_by: string'
)

assert(
  livingStateSrc.includes('presence_id:  string') ||
  livingStateSrc.includes('presence_id: string'),
  'LivingStateSignalMetadata has presence_id: string'
)

assert(
  livingStateSrc.includes('export async function getLivingStateForSignal('),
  'getLivingStateForSignal() is exported'
)

// getLivingStateForSignal must not modify prompts or inject content
const signalFnStart = livingStateSrc.indexOf('export async function getLivingStateForSignal(')
const signalFnEnd   = livingStateSrc.length
const signalFnBody  = signalFnStart >= 0 ? livingStateSrc.slice(signalFnStart) : ''

assert(
  signalFnBody.includes('last_updated: state.last_updated'),
  'getLivingStateForSignal returns last_updated from LivingState'
)

assert(
  !signalFnBody.includes('## ') && !signalFnBody.includes('What matters'),
  'getLivingStateForSignal does not produce prompt-formatted content'
)

// ═══════════════════════════════════════════════════════
// Fix D — Timeline voice_integrity documented
// ═══════════════════════════════════════════════════════
section('Fix D — Timeline voice_integrity documentation')

assert(
  timelineSrc.includes('voice_integrity'),
  'voice_integrity field exists in TimelineEntry type'
)

assert(
  timelineSrc.includes('export async function loadTimelineEntries('),
  'loadTimelineEntries() function exported'
)

assert(
  timelineSrc.includes("'ari' | 'eli' | null") || timelineSrc.includes('"ari" | "eli" | null'),
  'voice_integrity type is ari/eli/null in TimelineEntry'
)

assert(
  timelineSrc.includes('voice_integrity for') ||
  timelineSrc.includes('voice_integrity enables') ||
  timelineSrc.includes('voice_integrity ('),
  'loadTimelineEntries() JSDoc references voice_integrity for signal mapping'
)

assert(
  timelineSrc.includes('39.5.1'),
  'Timeline file has Phase 39.5.1 note'
)

// loadTimelineForPrompt still exists and is unchanged in behaviour
assert(
  timelineSrc.includes('export async function loadTimelineForPrompt('),
  'loadTimelineForPrompt() still exported (not changed)'
)

assert(
  timelineSrc.includes("block = '## Your history with Tara:\\n\\n'") ||
  timelineSrc.includes("block = '## Your history with Tara:"),
  'loadTimelineForPrompt() block header unchanged (no behavioural modification)'
)

// ═══════════════════════════════════════════════════════
// No prompt behaviour changes beyond Living State label
// ═══════════════════════════════════════════════════════
section('No prompt behaviour changes beyond Living State label')

// Memory injection block formatting is unchanged except for InjectedMemory type fields
// Check that the prompt block structure is the same (header text unchanged)
assert(
  memSrc.includes('## Confirmed') && memSrc.includes('Memory — Relevant to Current Conversation'),
  'Memory injection block header unchanged'
)

assert(
  memSrc.includes('Authority: Confirmed Memory'),
  'Memory injection entry formatting unchanged'
)

// Living State prompt is changed ONLY in header — verify the field formatting is unchanged
assert(
  livingStateSrc.includes('What matters right now:'),
  'Living State field formatting unchanged'
)

assert(
  livingStateSrc.includes('Still holding:'),
  'Living State field formatting unchanged'
)

// ═══════════════════════════════════════════════════════
// No DB migrations
// ═══════════════════════════════════════════════════════
section('No DB migrations added')

const migrationFiles = fs.readdirSync(path.join(ROOT, 'supabase-migrations'))
const newMigrations  = migrationFiles.filter(f =>
  f.includes('living_state_signal') ||
  f.includes('injected_memory') ||
  f.includes('timeline_metadata')
)

assert(
  newMigrations.length === 0,
  `No 39.5.1 migrations added (found: ${newMigrations.join(', ') || 'none'})`
)

// ═══════════════════════════════════════════════════════
// Prompt builders unchanged (no behavioural modifications)
// ═══════════════════════════════════════════════════════
section('Chat routes and prompt builders not modified')

const protectedFiles = [
  { path: 'src/lib/presences/ari.ts',              name: 'ari.ts' },
  { path: 'src/lib/presences/eli.ts',              name: 'eli.ts' },
  { path: 'src/app/api/eli-chat/route.ts',         name: 'eli-chat route' },
  { path: 'src/app/api/ari-chat/route.ts',         name: 'ari-chat route' },
  { path: 'src/app/api/lounge-chat/route.ts',      name: 'lounge-chat route' },
]

for (const file of protectedFiles) {
  const fullPath = path.join(ROOT, file.path)
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf-8')
    assert(
      !content.includes('getLivingStateForSignal') &&
      !content.includes('LivingStateSignalMetadata'),
      `${file.name} does not import 39.5.1 metadata functions (not wired)`
    )
  } else {
    passed++
    console.log(`  ✓ ${file.name} not found — no integration to check`)
  }
}

// ═══════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════')
console.log('  Phase 39.5.1 Metadata Forwarding Fixes Tests')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log('═══════════════════════════════════════════════════════')

if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
} else {
  console.log('\n✅ All 39.5.1 metadata forwarding tests passed.\n')
  process.exit(0)
}
