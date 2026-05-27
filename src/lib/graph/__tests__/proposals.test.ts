/**
 * Phase 37B — Graph Proposal Pipeline Structural Tests
 *
 * Static/structural validation of proposal pipeline logic.
 * Run: npx tsx src/lib/graph/__tests__/proposals.test.ts
 *
 * No Supabase calls, no data writes, no model calls.
 * Tests that need Supabase imports are done via file inspection.
 */

import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..', '..', '..', '..')

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

// ─── Import pure helpers from ontology (no Supabase dependency) ─────────────

import {
  isValidGraphNodeType,
  isValidGraphEdgeType,
  isValidGraphAuthorityStatus,
  isValidGraphPresenceScope,
  isValidGraphSourceType,
} from '../ontology'

// ═══════════════════════════════════════════════════════════════════════════
// Pure function re-implementations for testing (avoids Supabase import)
// These mirror the logic in proposals.ts
// ═══════════════════════════════════════════════════════════════════════════

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

function generateDedupeKey(input: {
  proposalType: 'node' | 'edge'
  sourceType: string
  sourceId: string
  presenceScope: string
  label: string
  edgeType?: string
  fromLabel?: string
  toLabel?: string
}): string {
  if (input.proposalType === 'edge') {
    const from = normalizeLabel(input.fromLabel ?? '')
    const to = normalizeLabel(input.toLabel ?? '')
    return `edge:${input.sourceType}:${input.sourceId}:${input.presenceScope}:${input.edgeType ?? 'unknown'}:${from}:${to}`
  }
  return `node:${input.sourceType}:${input.sourceId}:${input.presenceScope}:${normalizeLabel(input.label)}`
}

type ProposalInput = {
  proposalType: 'node' | 'edge'
  nodeType?: string
  edgeType?: string
  label: string
  summary: string
  confidence: number
  salience: number
  reason: string
  authorityStatus: string
  presenceScope: string
  primarySourceType: string
  primarySourceId: string
}

function validateProposalInput(input: ProposalInput): string[] {
  const errors: string[] = []

  if (input.proposalType === 'node') {
    if (!input.nodeType) errors.push('Node proposal requires nodeType')
    if (input.edgeType) errors.push('Node proposal must not have edgeType')
    if (input.nodeType && !isValidGraphNodeType(input.nodeType)) {
      errors.push(`Invalid node type: "${input.nodeType}"`)
    }
  } else if (input.proposalType === 'edge') {
    if (!input.edgeType) errors.push('Edge proposal requires edgeType')
    if (input.nodeType) errors.push('Edge proposal must not have nodeType')
    if (input.edgeType && !isValidGraphEdgeType(input.edgeType)) {
      errors.push(`Invalid edge type: "${input.edgeType}"`)
    }
  } else {
    errors.push(`Invalid proposal type: "${input.proposalType}"`)
  }

  if (!isValidGraphAuthorityStatus(input.authorityStatus)) {
    errors.push(`Invalid authority status: "${input.authorityStatus}"`)
  }
  if (!isValidGraphPresenceScope(input.presenceScope)) {
    errors.push(`Invalid presence scope: "${input.presenceScope}"`)
  }
  if (!isValidGraphSourceType(input.primarySourceType)) {
    errors.push(`Invalid primary source type: "${input.primarySourceType}"`)
  }

  if (input.confidence < 0 || input.confidence > 1) {
    errors.push(`Confidence must be 0–1, got ${input.confidence}`)
  }
  if (input.salience < 0 || input.salience > 1) {
    errors.push(`Salience must be 0–1, got ${input.salience}`)
  }

  if (!input.label || input.label.trim().length === 0) {
    errors.push('Label is required')
  }
  if (!input.reason || input.reason.trim().length === 0) {
    errors.push('Reason is required')
  }
  if (!input.primarySourceId || input.primarySourceId.trim().length === 0) {
    errors.push('Primary source ID is required')
  }

  return errors
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Proposal input validation
// ═══════════════════════════════════════════════════════════════════════════

section('Valid node proposal passes validation')

const validNodeInput: ProposalInput = {
  proposalType: 'node',
  nodeType: 'concept',
  label: 'Continuity',
  summary: 'The concept of continuity across sessions.',
  confidence: 0.7,
  salience: 0.6,
  reason: 'Source discusses continuity as a core theme.',
  authorityStatus: 'candidate',
  presenceScope: 'shared',
  primarySourceType: 'archive_item',
  primarySourceId: 'src-123',
}

assert(
  validateProposalInput(validNodeInput).length === 0,
  'Valid node proposal has no errors'
)

section('Valid edge proposal passes validation')

const validEdgeInput: ProposalInput = {
  proposalType: 'edge',
  edgeType: 'relates_to',
  label: 'Continuity -> Memory',
  summary: 'Continuity relates to memory.',
  confidence: 0.6,
  salience: 0.5,
  reason: 'Source links continuity and memory concepts.',
  authorityStatus: 'candidate',
  presenceScope: 'shared',
  primarySourceType: 'archive_item',
  primarySourceId: 'src-123',
}

assert(
  validateProposalInput(validEdgeInput).length === 0,
  'Valid edge proposal has no errors'
)

// ═══════════════════════════════════════════════════════════════════════════
// 2. Invalid proposals are rejected
// ═══════════════════════════════════════════════════════════════════════════

section('Invalid node type rejected')

const badNodeType = { ...validNodeInput, nodeType: 'invalid_type' }
const nodeTypeErrors = validateProposalInput(badNodeType)
assert(nodeTypeErrors.length > 0, 'Invalid node type produces errors')
assert(nodeTypeErrors.some(e => e.includes('Invalid node type')), 'Error mentions invalid node type')

section('Invalid edge type rejected')

const badEdgeType = { ...validEdgeInput, edgeType: 'links_to' }
const edgeTypeErrors = validateProposalInput(badEdgeType)
assert(edgeTypeErrors.length > 0, 'Invalid edge type produces errors')
assert(edgeTypeErrors.some(e => e.includes('Invalid edge type')), 'Error mentions invalid edge type')

section('Invalid authority status rejected')

const badAuth = { ...validNodeInput, authorityStatus: 'approved' }
const authErrors = validateProposalInput(badAuth)
assert(authErrors.length > 0, 'Invalid authority status produces errors')

section('Invalid presence scope rejected')

const badScope = { ...validNodeInput, presenceScope: 'both' }
const scopeErrors = validateProposalInput(badScope)
assert(scopeErrors.length > 0, 'Invalid presence scope produces errors')

section('Invalid primary source type rejected')

const badSourceType = { ...validNodeInput, primarySourceType: 'chat_message' }
const sourceTypeErrors = validateProposalInput(badSourceType)
assert(sourceTypeErrors.length > 0, 'Invalid source type produces errors')

section('Node proposal must not have edgeType')

const nodeWithEdge = { ...validNodeInput, edgeType: 'relates_to' }
const nodeEdgeErrors = validateProposalInput(nodeWithEdge)
assert(nodeEdgeErrors.some(e => e.includes('must not have edgeType')), 'Node with edgeType fails')

section('Edge proposal must not have nodeType')

const edgeWithNode = { ...validEdgeInput, nodeType: 'concept' }
const edgeNodeErrors = validateProposalInput(edgeWithNode)
assert(edgeNodeErrors.some(e => e.includes('must not have nodeType')), 'Edge with nodeType fails')

section('Missing label rejected')

const noLabel = { ...validNodeInput, label: '' }
const labelErrors = validateProposalInput(noLabel)
assert(labelErrors.some(e => e.includes('Label is required')), 'Missing label fails')

section('Missing reason rejected')

const noReason = { ...validNodeInput, reason: '' }
const reasonErrors = validateProposalInput(noReason)
assert(reasonErrors.some(e => e.includes('Reason is required')), 'Missing reason fails')

section('Confidence out of range rejected')

const badConfidence = { ...validNodeInput, confidence: 1.5 }
const confErrors = validateProposalInput(badConfidence)
assert(confErrors.some(e => e.includes('Confidence must be 0–1')), 'Confidence >1 fails')

const badConfLow = { ...validNodeInput, confidence: -0.1 }
const confLowErrors = validateProposalInput(badConfLow)
assert(confLowErrors.some(e => e.includes('Confidence must be 0–1')), 'Confidence <0 fails')

// ═══════════════════════════════════════════════════════════════════════════
// 3. Relationship Arc types pass validation
// ═══════════════════════════════════════════════════════════════════════════

section('Relationship Arc node types pass')

const arcTypes = ['relationship_arc', 'relationship_milestone', 'bond_event'] as const
for (const nodeType of arcTypes) {
  const input = { ...validNodeInput, nodeType }
  assert(validateProposalInput(input).length === 0, `"${nodeType}" node type passes validation`)
}

section('Relationship arc edge types pass')

const arcEdgeTypes = ['deepens', 'repairs', 'reaffirms', 'evolves_from', 'marks_milestone_in'] as const
for (const edgeType of arcEdgeTypes) {
  const input = { ...validEdgeInput, edgeType }
  assert(validateProposalInput(input).length === 0, `"${edgeType}" edge type passes validation`)
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Source adapter safety (file inspection)
// ═══════════════════════════════════════════════════════════════════════════

section('Source adapter supported types (file inspection)')

const adapterFile = readFile('src/lib/graph/sourceAdapters.ts')

assert(adapterFile.includes("sourceType: 'archive_item'"), 'archive_item adapter exists')
assert(adapterFile.includes("sourceType: 'interior_note'"), 'interior_note adapter exists')
assert(adapterFile.includes("sourceType: 'held_truth'"), 'held_truth adapter exists')
assert(adapterFile.includes("sourceType: 'journal_entry'"), 'journal_entry adapter exists')
assert(adapterFile.includes("sourceType: 'canonical_memory'"), 'canonical_memory adapter exists')
assert(adapterFile.includes("sourceType: 'library_item'"), 'library_item adapter exists')

section('canonical_memory adapter One Crown Rule')

// canonical_memory must derive from archive_items (confirmed canonical), NOT room_memories
assert(
  !adapterFile.includes("from('room_memories')"),
  'canonical_memory adapter does NOT read from room_memories'
)
// Extract the canonical_memory adapter section between its heading and the next adapter heading
const canonicalStart = adapterFile.indexOf('Adapter: canonical_memory')
const canonicalEnd = adapterFile.indexOf('Adapter: library_item')
const canonicalSection = (canonicalStart !== -1 && canonicalEnd !== -1)
  ? adapterFile.slice(canonicalStart, canonicalEnd)
  : ''
assert(
  canonicalSection.includes("from('archive_items')"),
  'canonical_memory adapter reads from archive_items'
)
assert(
  canonicalSection.includes("data.canonical_status !== 'canonical'"),
  'canonical_memory adapter rejects non-canonical items'
)
assert(
  canonicalSection.includes("authorityStatusHint: 'canonical_supported'"),
  'canonical_memory adapter hints canonical_supported'
)
assert(
  canonicalSection.includes('One Crown Rule'),
  'canonical_memory adapter documents One Crown Rule'
)

section('Unsupported sources listed')

assert(adapterFile.includes("'memory_candidate'"), 'memory_candidate listed as unsupported')
assert(adapterFile.includes("'reflection_output'"), 'reflection_output listed as unsupported')
assert(adapterFile.includes("'lounge_capture'"), 'lounge_capture listed as unsupported')

section('Source adapter safety checks')

assert(adapterFile.includes('data.deleted_at'), 'Deleted check exists in adapters')
assert(adapterFile.includes('MIN_SOURCE_TEXT_LENGTH'), 'Minimum text length check exists')
assert(adapterFile.includes("'unsupported_source_type'"), 'Unsupported type error code exists')
assert(adapterFile.includes("'source_not_found'"), 'Not found error code exists')
assert(adapterFile.includes("'source_too_short'"), 'Too short error code exists')

// ═══════════════════════════════════════════════════════════════════════════
// 5. Label normalization
// ═══════════════════════════════════════════════════════════════════════════

section('Label normalization')

assert(normalizeLabel('  Hello  World  ') === 'hello world', 'Trims and collapses whitespace')
assert(normalizeLabel('UPPERCASE') === 'uppercase', 'Lowercases')
assert(normalizeLabel('already normalized') === 'already normalized', 'Already normalized passes')

// ═══════════════════════════════════════════════════════════════════════════
// 6. Dedupe key generation
// ═══════════════════════════════════════════════════════════════════════════

section('Dedupe key generation')

const nodeKey = generateDedupeKey({
  proposalType: 'node',
  sourceType: 'archive_item',
  sourceId: 'abc-123',
  presenceScope: 'shared',
  label: 'Continuity Theme',
})
assert(nodeKey === 'node:archive_item:abc-123:shared:continuity theme', `Node dedupe key correct: "${nodeKey}"`)

const edgeKey = generateDedupeKey({
  proposalType: 'edge',
  sourceType: 'archive_item',
  sourceId: 'abc-123',
  presenceScope: 'shared',
  label: 'edge label',
  edgeType: 'relates_to',
  fromLabel: 'Node A',
  toLabel: 'Node B',
})
assert(edgeKey === 'edge:archive_item:abc-123:shared:relates_to:node a:node b', `Edge dedupe key correct: "${edgeKey}"`)

section('Duplicate dedupe keys match for same input')

const key1 = generateDedupeKey({
  proposalType: 'node',
  sourceType: 'archive_item',
  sourceId: 'x',
  presenceScope: 'ari',
  label: '  Test Label  ',
})
const key2 = generateDedupeKey({
  proposalType: 'node',
  sourceType: 'archive_item',
  sourceId: 'x',
  presenceScope: 'ari',
  label: 'test label',
})
assert(key1 === key2, 'Same normalized input produces same dedupe key')

section('Different source produces different dedupe key')

const key3 = generateDedupeKey({
  proposalType: 'node',
  sourceType: 'archive_item',
  sourceId: 'different-source',
  presenceScope: 'ari',
  label: 'test label',
})
assert(key1 !== key3, 'Different source ID produces different dedupe key')

// ═══════════════════════════════════════════════════════════════════════════
// 7. No authority mutation — code inspection
// ═══════════════════════════════════════════════════════════════════════════

section('No writes to existing graph systems')

const proposalsFile = readFile('src/lib/graph/proposals.ts')
const generatorFile = readFile('src/lib/graph/proposalGenerator.ts')
const allCode = proposalsFile + adapterFile + generatorFile

assert(!allCode.includes("from('memory_nodes')"), 'No memory_nodes access in proposal pipeline')
assert(!allCode.includes("from('memory_edges')"), 'No memory_edges access in proposal pipeline')
assert(!allCode.includes("from('archive_graph_nodes')"), 'No archive_graph_nodes access in proposal pipeline')
assert(!allCode.includes("from('archive_graph_edges')"), 'No archive_graph_edges access in proposal pipeline')

section('prompt_eligible forced false')

assert(!allCode.includes('prompt_eligible: true'), 'No prompt_eligible=true in proposal pipeline')
assert(proposalsFile.includes('const promptEligible = false'), 'proposals.ts forces promptEligible = false')

section('Pipeline only writes to allowed tables')

const writeMatches = allCode.match(/from\('(\w+)'\)\s*\n?\s*\.insert/g) ?? []
const insertTargets = allCode.match(/from\('(\w+)'\)[\s\S]*?\.insert/g) ?? []
const allowedWriteTargets = ['graph_proposals', 'graph_proposal_sources', 'graph_proposal_events']

// Inspect the proposals.ts inserts specifically
const proposalInserts = proposalsFile.match(/\.from\('(\w+)'\)/g) ?? []
const proposalTables = proposalInserts.map(m => m.match(/'(\w+)'/)?.[1]).filter(Boolean)
for (const table of proposalTables) {
  assert(
    allowedWriteTargets.includes(table!) || table === 'graph_proposals',
    `proposals.ts accesses only allowed table: "${table}"`
  )
}

section('No canonical Memory promotion writes')

// canonical_status may be READ from source tables (archive_items) and included in
// source_metadata. That's safe — it's provenance, not mutation. Check for actual writes:
assert(!allCode.includes('.update({') || !allCode.includes('canonical_status'), 'No canonical_status update mutations in pipeline')
// The pipeline must not set canonical_status on any row via insert/update
const noCanonicalWrite = !proposalsFile.includes('canonical_status') && !generatorFile.includes('canonical_status')
assert(noCanonicalWrite, 'proposals.ts and generator do not reference canonical_status')

// ═══════════════════════════════════════════════════════════════════════════
// 8. Migration file safety checks
// ═══════════════════════════════════════════════════════════════════════════

section('Migration file safety')

const migrationFile = readFile('supabase-migrations/068_graph_proposals.sql')

assert(migrationFile.includes('create table graph_proposals'), 'Migration creates graph_proposals')
assert(migrationFile.includes('create table graph_proposal_sources'), 'Migration creates graph_proposal_sources')
assert(migrationFile.includes('create table graph_proposal_events'), 'Migration creates graph_proposal_events')
assert(migrationFile.includes('on delete restrict'), 'FKs use ON DELETE RESTRICT')
assert(!migrationFile.includes('on delete cascade'), 'No CASCADE FKs in migration')
assert(migrationFile.includes('enable row level security'), 'RLS enabled')
assert(migrationFile.includes("default 'pending_review'"), 'Default status is pending_review')
assert(migrationFile.includes('default false'), 'prompt_eligible defaults false')

section('Migration has no data writes')

assert(!migrationFile.toLowerCase().includes('insert into'), 'No INSERT INTO in migration')
assert(!migrationFile.toLowerCase().match(/\bupdate\b.*\bset\b/), 'No UPDATE SET in migration')
assert(!migrationFile.toLowerCase().includes('delete from'), 'No DELETE FROM in migration')

section('Migration does not create final graph tables')

assert(!migrationFile.includes('create table graph_nodes'), 'Does not create graph_nodes')
assert(!migrationFile.includes('create table graph_edges'), 'Does not create graph_edges')

section('Protected tables registry updated')

const protectedFile = readFile('src/lib/safety/protected-tables.ts')
assert(protectedFile.includes("table: 'graph_proposals'"), 'graph_proposals in protected registry')
assert(protectedFile.includes("table: 'graph_proposal_sources'"), 'graph_proposal_sources in protected registry')
assert(protectedFile.includes("table: 'graph_proposal_events'"), 'graph_proposal_events in protected registry')

// Check RESTRICT FK behaviour
assert(protectedFile.includes("parentFkBehaviour: 'RESTRICT'"), 'RESTRICT FK registered for child tables')

// ═══════════════════════════════════════════════════════════════════════════
// 9. Generator safety checks
// ═══════════════════════════════════════════════════════════════════════════

section('Generator safety')

assert(generatorFile.includes('up to 3 node proposals'), 'Generator mentions 3 node cap')
assert(generatorFile.includes('up to 3 edge proposals'), 'Generator mentions 3 edge cap')
assert(generatorFile.includes('.slice(0, 3)'), 'Generator caps at 3')
assert(generatorFile.includes('PROPOSAL only'), 'Generator prompt says PROPOSAL only')
assert(generatorFile.includes('Do not create Memory'), 'Generator prompt says do not create Memory')
assert(generatorFile.includes('enforceAuthority'), 'Generator enforces authority status')
assert(generatorFile.includes("'canonical_supported'"), 'canonical_supported handled in authority overrides')

section('Authority enforcement rules')

assert(generatorFile.includes("canonical_memory: ['canonical_supported']"), 'canonical_memory allows canonical_supported')
assert(generatorFile.includes("held_truth: ['held_truth']"), 'held_truth source allows held_truth status')
assert(generatorFile.includes("archive_item: ['archive_supported', 'candidate']"), 'archive_item allows archive_supported or candidate')
assert(generatorFile.includes("journal_entry: ['candidate', 'inferred']"), 'journal allows candidate or inferred')
assert(generatorFile.includes("library_item: ['library_reference']"), 'library_item allows library_reference only')

// ═══════════════════════════════════════════════════════════════════════════
// 10. API route safety
// ═══════════════════════════════════════════════════════════════════════════

section('API route safety')

const listRoute = readFile('src/app/api/graph-proposals/route.ts')
const detailRoute = readFile('src/app/api/graph-proposals/[id]/route.ts')

assert(listRoute.includes('fetchSourceRecord'), 'POST route fetches source server-side')
assert(listRoute.includes('isValidGraphSourceType'), 'POST route validates source type')
assert(listRoute.includes('generateProposalsFromSource'), 'POST route uses generator')
assert(!listRoute.includes('prompt_eligible'), 'POST route does not set prompt_eligible')
assert(detailRoute.includes('getProposal'), 'Detail route fetches single proposal')
assert(detailRoute.includes('getProposalSources'), 'Detail route fetches sources')

// ═══════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n══════════════════════════════════════`)
console.log(`  Phase 37B Proposal Tests: ${passed} passed, ${failed} failed`)
if (failures.length > 0) {
  console.log(`\n  Failures:`)
  failures.forEach(f => console.log(`    - ${f}`))
}
console.log(`══════════════════════════════════════\n`)

process.exit(failed > 0 ? 1 : 0)
