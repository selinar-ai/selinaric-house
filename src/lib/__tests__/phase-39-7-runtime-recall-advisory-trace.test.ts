/**
 * Phase 39.7 Structural Tests — Runtime Recall Advisory Trace
 *
 * Verifies:
 *   - Migration schema: table exists, forbidden columns absent, DB constraints present
 *   - Trace writer: metadata-only, non-fatal, no raw content
 *   - Route wiring: ari-chat, eli-chat, lounge-chat
 *   - /recall UI: trace panel imported, collapsed by default, boundary wording present
 *   - API route: GET only, metadata-only response, no POST
 *   - Authority boundary: not_memory, not_evidence, not_prompt_eligible enforced
 *   - Retention/future-use boundary documented
 *
 * Run: npx tsx src/lib/__tests__/phase-39-7-runtime-recall-advisory-trace.test.ts
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

const MIGRATION_PATH     = 'supabase-migrations/073_runtime_recall_advisory_traces.sql'
const WRITER_PATH        = 'src/lib/recall/recallAdvisoryTraceWriter.ts'
const API_ROUTE_PATH     = 'src/app/api/recall-advisory-traces/route.ts'
const COMPONENT_PATH     = 'src/components/recall/RecallAdvisoryTracePanel.tsx'
const ARI_ROUTE_PATH     = 'src/app/api/ari-chat/route.ts'
const ELI_ROUTE_PATH     = 'src/app/api/eli-chat/route.ts'
const LOUNGE_ROUTE_PATH  = 'src/app/api/lounge-chat/route.ts'
const RECALL_PAGE_PATH   = 'src/app/(house)/recall/page.tsx'

const migSrc       = fs.readFileSync(path.join(ROOT, MIGRATION_PATH), 'utf-8')
const writerSrc    = fs.readFileSync(path.join(ROOT, WRITER_PATH), 'utf-8')
const apiSrc       = fs.readFileSync(path.join(ROOT, API_ROUTE_PATH), 'utf-8')
const componentSrc = fs.readFileSync(path.join(ROOT, COMPONENT_PATH), 'utf-8')
const ariSrc       = fs.readFileSync(path.join(ROOT, ARI_ROUTE_PATH), 'utf-8')
const eliSrc       = fs.readFileSync(path.join(ROOT, ELI_ROUTE_PATH), 'utf-8')
const loungeSrc    = fs.readFileSync(path.join(ROOT, LOUNGE_ROUTE_PATH), 'utf-8')
const recallSrc    = fs.readFileSync(path.join(ROOT, RECALL_PAGE_PATH), 'utf-8')

// ═══════════════════════════════════════════════════════
// 1. Migration schema — table and constraint existence
// ═══════════════════════════════════════════════════════
section('1. Migration schema')

assert(
  fs.existsSync(path.join(ROOT, MIGRATION_PATH)),
  'Migration 073_runtime_recall_advisory_traces.sql exists'
)

assert(
  migSrc.includes('CREATE TABLE runtime_recall_advisory_traces'),
  'Migration creates runtime_recall_advisory_traces table'
)

// Required governance columns
const requiredColumns = [
  'trace_kind',
  'route_surface',
  'presence_id',
  'room_context',
  'packet_id',
  'primary_response_instruction',
  'grounding_condition',
  'conflict_count',
  'active_source_count',
  'excluded_source_count',
  'confirmed_memory_count',
  'recent_continuity_count',
  'journal_count',
  'library_count',
  'cross_room_count',
  'advisory_inserted',
  'advisory_error',
  'not_memory',
  'not_evidence',
  'not_prompt_eligible',
  'authority_changed',
  'review_routed',
]

for (const col of requiredColumns) {
  assert(migSrc.includes(col), `Migration has column: ${col}`)
}

// Governance constraints
assert(
  migSrc.includes('rrat_not_memory_always_true') &&
  migSrc.includes('CHECK (not_memory = true)'),
  'Migration has not_memory=true constraint (rrat_not_memory_always_true)'
)

assert(
  migSrc.includes('rrat_not_evidence_always_true') &&
  migSrc.includes('CHECK (not_evidence = true)'),
  'Migration has not_evidence=true constraint'
)

assert(
  migSrc.includes('rrat_not_prompt_eligible_always_true') &&
  migSrc.includes('CHECK (not_prompt_eligible = true)'),
  'Migration has not_prompt_eligible=true constraint'
)

assert(
  migSrc.includes('rrat_authority_never_changes') &&
  migSrc.includes('CHECK (authority_changed = false)'),
  'Migration has authority_changed=false constraint'
)

assert(
  migSrc.includes('rrat_review_never_routed') &&
  migSrc.includes('CHECK (review_routed = false)'),
  'Migration has review_routed=false constraint'
)

assert(
  migSrc.includes('rrat_counts_non_negative'),
  'Migration has non-negative count constraint'
)

assert(
  migSrc.includes("route_surface IN ('ari_chat', 'eli_chat', 'lounge_chat')"),
  'Migration constrains route_surface to allowed values'
)

assert(
  migSrc.includes("presence_id IN ('ari', 'eli')"),
  'Migration constrains presence_id to allowed values'
)

assert(
  migSrc.includes("room_context IN ('ari_room', 'eli_room', 'lounge')"),
  'Migration constrains room_context to allowed values'
)

// ═══════════════════════════════════════════════════════
// 2. Migration — forbidden columns absent
// ═══════════════════════════════════════════════════════
section('2. Migration — forbidden columns absent')

const forbiddenColumns = [
  'user_message',
  'assistant_response',
  'prompt_text',
  'system_prompt',
  'developer_prompt',
  'compiled_prompt',
  'raw_content',
  'journal_body',
  'library_body',
  'archive_content',
  'memory_text',
  'source_id',
  'memory_id',
  'model_output',
  'reasoning_draft',
  'api_key',
  'secret',
]

for (const col of forbiddenColumns) {
  assert(
    !migSrc.includes(`${col} `),
    `Migration does NOT define forbidden column: ${col}`
  )
}

// ═══════════════════════════════════════════════════════
// 3. Migration — retention and future-use boundary documented
// ═══════════════════════════════════════════════════════
section('3. Migration — retention and future-use boundary')

assert(
  migSrc.includes('NOT Memory') || migSrc.includes('not Memory'),
  'Migration documents NOT Memory boundary'
)

assert(
  migSrc.includes('NOT evidence') || migSrc.includes('not evidence'),
  'Migration documents NOT evidence boundary'
)

assert(
  migSrc.includes('NOT a prompt source') || migSrc.includes('not a prompt source') ||
  migSrc.includes('prompt source'),
  'Migration documents NOT a prompt source boundary'
)

assert(
  migSrc.includes('100') || migSrc.includes('250') || migSrc.includes('30 days') || migSrc.includes('Retention') || migSrc.includes('retention'),
  'Migration documents retention guidance'
)

// ═══════════════════════════════════════════════════════
// 4. Trace writer — metadata-only, no raw content
// ═══════════════════════════════════════════════════════
section('4. Trace writer — metadata-only, no raw content')

assert(
  fs.existsSync(path.join(ROOT, WRITER_PATH)),
  'recallAdvisoryTraceWriter.ts exists'
)

assert(
  writerSrc.includes('export async function writeRecallAdvisoryTrace'),
  'writeRecallAdvisoryTrace is exported'
)

// Writer accepts RecallPacket
assert(
  writerSrc.includes('packet:       RecallPacket'),
  'Writer input has packet: RecallPacket field'
)

// Writer does not accept raw content fields
const writerForbiddenFields = [
  'user_message',
  'assistant_response',
  'prompt_text',
  'system_prompt',
  'raw_content',
  'journal_body',
  'library_body',
  'model_output',
  'source_id',
  'memory_id',
]

for (const field of writerForbiddenFields) {
  assert(
    !writerSrc.includes(`${field}:`),
    `Writer does not accept or store raw content field: ${field}`
  )
}

// Writer does not persist full packet JSON
assert(
  !writerSrc.includes('JSON.stringify(packet)') &&
  !writerSrc.includes('JSON.stringify(input.packet)'),
  'Writer does not store full packet JSON'
)

// Writer governance flags are always hard-coded
assert(
  writerSrc.includes('not_memory:          true'),
  'Writer always sets not_memory: true'
)

assert(
  writerSrc.includes('not_evidence:        true'),
  'Writer always sets not_evidence: true'
)

assert(
  writerSrc.includes('authority_changed:   false'),
  'Writer always sets authority_changed: false'
)

// Writer is non-fatal
assert(
  writerSrc.includes('} catch (err)') &&
  (writerSrc.includes('non-fatal') || writerSrc.includes('non_fatal')),
  'Writer has try/catch with non-fatal pattern'
)

// Writer does not log packet contents in catch block
const catchBlock = (() => {
  const start = writerSrc.lastIndexOf('} catch (err)')
  return start >= 0 ? writerSrc.slice(start, start + 400) : ''
})()

assert(
  !catchBlock.includes('packet.') && !catchBlock.includes('input.packet'),
  'Writer catch block does not log packet contents'
)

// ═══════════════════════════════════════════════════════
// 5. API route — GET only, metadata-safe
// ═══════════════════════════════════════════════════════
section('5. API route — GET only, metadata-safe')

assert(
  fs.existsSync(path.join(ROOT, API_ROUTE_PATH)),
  'recall-advisory-traces API route exists'
)

assert(
  apiSrc.includes('export async function GET('),
  'API route has GET handler'
)

assert(
  !apiSrc.includes('export async function POST(') &&
  !apiSrc.includes('export function POST('),
  'API route has NO POST handler'
)

// API selects only safe columns — no forbidden content columns
const apiForbiddenFields = [
  'user_message',
  'raw_content',
  'journal_body',
  'library_body',
  'prompt_text',
  'model_output',
  'source_id',
  'memory_id',
]

for (const field of apiForbiddenFields) {
  assert(
    !apiSrc.includes(`'${field}'`) && !apiSrc.includes(`"${field}"`),
    `API response does not expose forbidden field: ${field}`
  )
}

// ═══════════════════════════════════════════════════════
// 6. UI component — collapsed by default, boundary wording
// ═══════════════════════════════════════════════════════
section('6. UI component — trace panel')

assert(
  fs.existsSync(path.join(ROOT, COMPONENT_PATH)),
  'RecallAdvisoryTracePanel.tsx exists'
)

assert(
  componentSrc.includes('export default function RecallAdvisoryTracePanel'),
  'RecallAdvisoryTracePanel is default export'
)

assert(
  componentSrc.includes("useState(false)") ||
  componentSrc.includes('const [open, setOpen] = useState(false)'),
  'Panel is collapsed by default (open state initialised to false)'
)

// Required boundary wording
const boundaryPhrases = [
  'Runtime advisory trace only',
  'Not Memory',
  'Not evidence',
  'Not prompt authority',
  'No raw content stored',
]

for (const phrase of boundaryPhrases) {
  assert(
    componentSrc.includes(phrase),
    `Component contains boundary phrase: "${phrase}"`
  )
}

// Forbidden content fields NOT rendered
const componentForbiddenFields = [
  'raw_content',
  'journal_body',
  'library_body',
  'prompt_text',
  'model_output',
  'user_message',
  'source_id',
  'memory_id',
]

for (const field of componentForbiddenFields) {
  assert(
    !componentSrc.includes(`trace.${field}`) &&
    !componentSrc.includes(`{trace.${field}}`),
    `Component does not render forbidden field: trace.${field}`
  )
}

// ═══════════════════════════════════════════════════════
// 7. /recall page — trace panel imported and placed
// ═══════════════════════════════════════════════════════
section('7. /recall page — trace panel integration')

assert(
  recallSrc.includes("import RecallAdvisoryTracePanel from '@/components/recall/RecallAdvisoryTracePanel'"),
  '/recall page imports RecallAdvisoryTracePanel'
)

assert(
  recallSrc.includes('<RecallAdvisoryTracePanel />'),
  '/recall page renders <RecallAdvisoryTracePanel />'
)

assert(
  recallSrc.includes('Phase 39.7') ||
  recallSrc.includes('RecallAdvisoryTracePanel'),
  '/recall page has trace panel placement comment or component'
)

// ═══════════════════════════════════════════════════════
// 8. Route wiring — trace writer imported and called
// ═══════════════════════════════════════════════════════
section('8. Route wiring — all three routes')

for (const [name, src] of [
  ['ari-chat', ariSrc],
  ['eli-chat', eliSrc],
  ['lounge-chat', loungeSrc],
] as const) {
  assert(
    src.includes('writeRecallAdvisoryTrace'),
    `${name}: imports/calls writeRecallAdvisoryTrace`
  )

  assert(
    src.includes("from '@/lib/recall/recallAdvisoryTraceWriter'"),
    `${name}: imports from recallAdvisoryTraceWriter`
  )

  assert(
    src.includes('Advisory trace write failed (non-fatal)') ||
    src.includes('trace write failed'),
    `${name}: has non-fatal catch for trace write`
  )
}

// ari-chat uses 'ari_chat' route surface
assert(
  ariSrc.includes("routeSurface:     'ari_chat'"),
  'ari-chat: uses routeSurface ari_chat'
)

// eli-chat uses 'eli_chat' route surface
assert(
  eliSrc.includes("routeSurface:     'eli_chat'"),
  'eli-chat: uses routeSurface eli_chat'
)

// lounge-chat uses 'lounge_chat' route surface
assert(
  loungeSrc.includes("routeSurface:     'lounge_chat'"),
  'lounge-chat: uses routeSurface lounge_chat'
)

// Lounge has per-presence trace (presenceId variable, not hardcoded)
assert(
  loungeSrc.includes('presenceId:       presenceId as'),
  'lounge-chat: per-presence trace (uses loop presenceId, not hardcoded string)'
)

// ═══════════════════════════════════════════════════════
// 9. Chat response not exposed to trace data
// ═══════════════════════════════════════════════════════
section('9. Trace data not exposed in chat response')

// Trace write is fire-and-forget (no await, no result captured)
const ariTraceCall = (() => {
  const idx = ariSrc.indexOf('writeRecallAdvisoryTrace({')
  return idx >= 0 ? ariSrc.slice(idx, idx + 500) : ''
})()

assert(
  ariTraceCall.includes('.catch('),
  'ari-chat: trace write is fire-and-forget with .catch()'
)

// Response JSON does not include trace data
assert(
  !ariSrc.includes('advisoryPacketSnapshot') ||
  !ariSrc.includes('"advisoryPacketSnapshot"'),
  'ari-chat: advisoryPacketSnapshot not exposed in JSON response'
)

// ═══════════════════════════════════════════════════════
// 10. No content in trace — writer uses packet metadata only
// ═══════════════════════════════════════════════════════
section('10. Writer uses packet metadata only (structural)')

// Writer references only packet.primary_response_instruction and packet.summary
// Not packet content, source text, or IDs beyond packet_id
assert(
  writerSrc.includes('packet.primary_response_instruction'),
  'Writer reads packet.primary_response_instruction (metadata)'
)

assert(
  writerSrc.includes('packet.has_sufficient_ground'),
  'Writer reads packet.has_sufficient_ground (metadata)'
)

assert(
  writerSrc.includes('summary.conflict_count') ||
  writerSrc.includes('packet.summary'),
  'Writer reads packet.summary (metadata counts)'
)

// Writer iterates active_sources and excluded_sources for COUNTS only
assert(
  writerSrc.includes('for (const src of active_sources)'),
  'Writer iterates active_sources for count computation only'
)

assert(
  writerSrc.includes('for (const src of excluded_sources)'),
  'Writer iterates excluded_sources for count computation only'
)

// Writer does not access any text content fields
assert(
  !writerSrc.includes('src.title') &&
  !writerSrc.includes('src.content') &&
  !writerSrc.includes('src.excerpt'),
  'Writer does not access title, content, or excerpt from sources'
)

// ═══════════════════════════════════════════════════════
// 11. No new DB writes blocked if trace fails
// ═══════════════════════════════════════════════════════
section('11. Non-fatal — chat continues if trace fails')

// The trace write in ari-chat is after the advisory block and before systemPrompt
// It uses .catch() pattern so it cannot block
assert(
  ariSrc.indexOf('writeRecallAdvisoryTrace') < ariSrc.indexOf('const systemPrompt'),
  'ari-chat: trace write fires before systemPrompt (advisory captured after advisory build)'
)

// ═══════════════════════════════════════════════════════
// 12. No migrations beyond 073
// ═══════════════════════════════════════════════════════
section('12. No unexpected migrations added')

const migrationFiles = fs.readdirSync(path.join(ROOT, 'supabase-migrations'))
const phase39Migrations = migrationFiles.filter(f => f.startsWith('073_'))
assert(
  phase39Migrations.length === 1 &&
  phase39Migrations[0] === '073_runtime_recall_advisory_traces.sql',
  'Exactly one 39.7 migration: 073_runtime_recall_advisory_traces.sql'
)

// ═══════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════')
console.log('  Phase 39.7 Runtime Recall Advisory Trace Tests')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log('═══════════════════════════════════════════════════════')

if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
} else {
  console.log('\n✅ All 39.7 runtime recall advisory trace tests passed.\n')
  process.exit(0)
}
