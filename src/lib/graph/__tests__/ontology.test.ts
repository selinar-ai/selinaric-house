/**
 * Phase 37A — Ontology Type Validation Tests
 *
 * Structural tests for graph ontology type guards.
 * Run: npx tsx src/lib/graph/__tests__/ontology.test.ts
 *
 * No Supabase calls, no data writes.
 */

import {
  isValidGraphNodeType,
  isValidGraphEdgeType,
  isValidGraphAuthorityStatus,
  isValidGraphReviewStatus,
  isValidGraphPresenceScope,
  isValidGraphSourceType,
  GRAPH_NODE_TYPES,
  GRAPH_EDGE_TYPES,
  GRAPH_AUTHORITY_STATUSES,
  GRAPH_REVIEW_STATUSES,
  GRAPH_PRESENCE_SCOPES,
  GRAPH_SOURCE_TYPES,
} from '../ontology'

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

// ─── Node Types ─────────────────────────────────────────────────────────────

section('Node type validation — valid types pass')

for (const nodeType of GRAPH_NODE_TYPES) {
  assert(isValidGraphNodeType(nodeType), `"${nodeType}" is valid node type`)
}

section('Node type validation — invalid types fail')

const invalidNodeTypes = ['invalid', 'PERSON', 'Person', '', 'memory', 'node', 'edge', 'room_memory']
for (const bad of invalidNodeTypes) {
  assert(!isValidGraphNodeType(bad), `"${bad}" is not valid node type`)
}

// ─── Edge Types ─────────────────────────────────────────────────────────────

section('Edge type validation — valid types pass')

for (const edgeType of GRAPH_EDGE_TYPES) {
  assert(isValidGraphEdgeType(edgeType), `"${edgeType}" is valid edge type`)
}

section('Edge type validation — invalid types fail')

const invalidEdgeTypes = ['invalid', 'RELATES_TO', 'links_to', '', 'anchors', 'shaped_by', 'extends']
for (const bad of invalidEdgeTypes) {
  assert(!isValidGraphEdgeType(bad), `"${bad}" is not valid edge type`)
}

// ─── Authority Statuses ─────────────────────────────────────────────────────

section('Authority status validation — valid statuses pass')

for (const status of GRAPH_AUTHORITY_STATUSES) {
  assert(isValidGraphAuthorityStatus(status), `"${status}" is valid authority status`)
}

section('Authority status validation — invalid statuses fail')

const invalidAuthority = ['invalid', 'canonical', 'approved', '', 'CANONICAL_SUPPORTED', 'pending']
for (const bad of invalidAuthority) {
  assert(!isValidGraphAuthorityStatus(bad), `"${bad}" is not valid authority status`)
}

// ─── Review Statuses ────────────────────────────────────────────────────────

section('Review status validation — valid statuses pass')

for (const status of GRAPH_REVIEW_STATUSES) {
  assert(isValidGraphReviewStatus(status), `"${status}" is valid review status`)
}

section('Review status validation — invalid statuses fail')

const invalidReview = ['invalid', 'approved', '', 'APPROVED_GRAPH', 'canonical_supported']
for (const bad of invalidReview) {
  assert(!isValidGraphReviewStatus(bad), `"${bad}" is not valid review status`)
}

// ─── Presence Scopes ────────────────────────────────────────────────────────

section('Presence scope validation — valid scopes pass')

for (const scope of GRAPH_PRESENCE_SCOPES) {
  assert(isValidGraphPresenceScope(scope), `"${scope}" is valid presence scope`)
}

section('Presence scope validation — invalid scopes fail')

const invalidScopes = ['invalid', 'Ari', 'Eli', '', 'both', 'all', 'tara']
for (const bad of invalidScopes) {
  assert(!isValidGraphPresenceScope(bad), `"${bad}" is not valid presence scope`)
}

// ─── Source Types ───────────────────────────────────────────────────────────

section('Source type validation — valid types pass')

for (const sourceType of GRAPH_SOURCE_TYPES) {
  assert(isValidGraphSourceType(sourceType), `"${sourceType}" is valid source type`)
}

section('Source type validation — invalid types fail')

const invalidSources = ['invalid', 'memory', '', 'chat_message', 'CANONICAL_MEMORY', 'room_memory']
for (const bad of invalidSources) {
  assert(!isValidGraphSourceType(bad), `"${bad}" is not valid source type`)
}

// ─── Array completeness ────────────────────────────────────────────────────

section('Array completeness checks')

assert(GRAPH_NODE_TYPES.length === 24, `Node types count is 24 (got ${GRAPH_NODE_TYPES.length})`)
assert(GRAPH_EDGE_TYPES.length === 29, `Edge types count is 29 (got ${GRAPH_EDGE_TYPES.length})`)
assert(GRAPH_AUTHORITY_STATUSES.length === 9, `Authority statuses count is 9 (got ${GRAPH_AUTHORITY_STATUSES.length})`)
assert(GRAPH_REVIEW_STATUSES.length === 7, `Review statuses count is 7 (got ${GRAPH_REVIEW_STATUSES.length})`)
assert(GRAPH_PRESENCE_SCOPES.length === 5, `Presence scopes count is 5 (got ${GRAPH_PRESENCE_SCOPES.length})`)
assert(GRAPH_SOURCE_TYPES.length === 20, `Source types count is 20 (got ${GRAPH_SOURCE_TYPES.length})`)

// ─── No duplicates ─────────────────────────────────────────────────────────

section('No duplicate values in arrays')

function hasDuplicates(arr: readonly string[]): boolean {
  return new Set(arr).size !== arr.length
}

assert(!hasDuplicates(GRAPH_NODE_TYPES), 'Node types have no duplicates')
assert(!hasDuplicates(GRAPH_EDGE_TYPES), 'Edge types have no duplicates')
assert(!hasDuplicates(GRAPH_AUTHORITY_STATUSES), 'Authority statuses have no duplicates')
assert(!hasDuplicates(GRAPH_REVIEW_STATUSES), 'Review statuses have no duplicates')
assert(!hasDuplicates(GRAPH_PRESENCE_SCOPES), 'Presence scopes have no duplicates')
assert(!hasDuplicates(GRAPH_SOURCE_TYPES), 'Source types have no duplicates')

// ─── Summary ────────────────────────────────────────────────────────────────

console.log(`\n══════════════════════════════════════`)
console.log(`  Phase 37A Ontology Tests: ${passed} passed, ${failed} failed`)
if (failures.length > 0) {
  console.log(`\n  Failures:`)
  failures.forEach(f => console.log(`    - ${f}`))
}
console.log(`══════════════════════════════════════\n`)

process.exit(failed > 0 ? 1 : 0)
