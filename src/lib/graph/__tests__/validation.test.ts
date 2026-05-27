/**
 * Phase 37A — Composite Validation + Directionality Tests
 *
 * Run: npx tsx src/lib/graph/__tests__/validation.test.ts
 *
 * No Supabase calls, no data writes.
 */

import {
  isSymmetricGraphEdgeType,
  isDirectionalGraphEdgeType,
  validateGraphOntology,
} from '../ontology'
import { requiresSourceReference, isAuthorityAllowedWithoutSource } from '../authority'
import type { GraphEdgeType, GraphAuthorityStatus } from '../types'

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

// ─── Directionality ─────────────────────────────────────────────────────────

section('Symmetric edge types')

const expectedSymmetric: GraphEdgeType[] = ['relates_to', 'contrasts_with', 'not_same_as', 'unresolved_with']
for (const edge of expectedSymmetric) {
  assert(isSymmetricGraphEdgeType(edge), `"${edge}" is symmetric`)
}

section('Directional edge types')

const expectedDirectional: GraphEdgeType[] = [
  'continues', 'generated_from', 'confirmed_by', 'promoted_to_candidate',
  'deepens', 'repairs', 'reaffirms', 'evolves_from', 'marks_milestone_in',
  'belongs_to', 'derived_from', 'proposed_by', 'reviewed_by',
]
for (const edge of expectedDirectional) {
  assert(isDirectionalGraphEdgeType(edge), `"${edge}" is directional`)
}

section('Symmetric edges are not directional, and vice versa')

for (const edge of expectedSymmetric) {
  assert(!isDirectionalGraphEdgeType(edge), `symmetric "${edge}" is not directional`)
}
for (const edge of expectedDirectional) {
  assert(!isSymmetricGraphEdgeType(edge), `directional "${edge}" is not symmetric`)
}

// ─── Source Requirements ────────────────────────────────────────────────────

section('Source requirement rules')

const requiresSource: GraphAuthorityStatus[] = [
  'canonical_supported', 'candidate', 'held_truth',
  'archive_supported', 'library_reference', 'inferred',
  'rejected', 'superseded',
]
for (const status of requiresSource) {
  assert(requiresSourceReference(status), `"${status}" requires source reference`)
}

assert(!requiresSourceReference('workspace_only'), '"workspace_only" does not require source')

section('Authority allowed without source')

assert(isAuthorityAllowedWithoutSource('workspace_only'), '"workspace_only" allowed without source')

const notAllowedWithout: GraphAuthorityStatus[] = [
  'canonical_supported', 'candidate', 'held_truth', 'archive_supported',
  'library_reference', 'inferred', 'rejected', 'superseded',
]
for (const status of notAllowedWithout) {
  assert(!isAuthorityAllowedWithoutSource(status), `"${status}" not allowed without source`)
}

// ─── Composite Validation ───────────────────────────────────────────────────

section('Composite validation — valid inputs pass')

const validResult = validateGraphOntology({
  nodeType: 'person',
  edgeType: 'relates_to',
  authorityStatus: 'canonical_supported',
  reviewStatus: 'approved_graph',
  presenceScope: 'shared',
  sourceType: 'canonical_memory',
  sourceId: 'src-123',
  promptEligible: true,
})
assert(validResult.valid, 'fully valid input passes')
assert(validResult.errors.length === 0, 'no errors on valid input')

section('Composite validation — invalid node type fails')

const badNode = validateGraphOntology({
  nodeType: 'invalid_type',
  authorityStatus: 'workspace_only',
  reviewStatus: 'workspace_only',
  presenceScope: 'none',
})
assert(!badNode.valid, 'invalid node type fails')
assert(badNode.errors.some(e => e.includes('Invalid node type')), 'error message mentions node type')

section('Composite validation — invalid edge type fails')

const badEdge = validateGraphOntology({
  edgeType: 'links_to',
  authorityStatus: 'workspace_only',
  reviewStatus: 'workspace_only',
  presenceScope: 'none',
})
assert(!badEdge.valid, 'invalid edge type fails')
assert(badEdge.errors.some(e => e.includes('Invalid edge type')), 'error message mentions edge type')

section('Composite validation — invalid authority status fails')

const badAuth = validateGraphOntology({
  authorityStatus: 'approved',
  reviewStatus: 'approved_graph',
  presenceScope: 'shared',
})
assert(!badAuth.valid, 'invalid authority status fails')

section('Composite validation — invalid review status fails')

const badReview = validateGraphOntology({
  authorityStatus: 'candidate',
  reviewStatus: 'approved',
  presenceScope: 'shared',
  sourceId: 'src-1',
})
assert(!badReview.valid, 'invalid review status fails')

section('Composite validation — invalid presence scope fails')

const badScope = validateGraphOntology({
  authorityStatus: 'candidate',
  reviewStatus: 'pending_review',
  presenceScope: 'both',
  sourceId: 'src-1',
})
assert(!badScope.valid, 'invalid presence scope fails')

section('Composite validation — invalid source type fails')

const badSource = validateGraphOntology({
  authorityStatus: 'candidate',
  reviewStatus: 'pending_review',
  presenceScope: 'ari',
  sourceType: 'chat_message',
  sourceId: 'src-1',
})
assert(!badSource.valid, 'invalid source type fails')
assert(badSource.errors.some(e => e.includes('Invalid source type')), 'error mentions source type')

section('Composite validation — canonical_supported without source fails')

const canonicalNoSource = validateGraphOntology({
  authorityStatus: 'canonical_supported',
  reviewStatus: 'approved_graph',
  presenceScope: 'shared',
  sourceType: 'canonical_memory',
})
assert(!canonicalNoSource.valid, 'canonical_supported without source ID fails')
assert(canonicalNoSource.errors.some(e => e.includes('requires a source reference')), 'error mentions source reference')

section('Composite validation — canonical_supported with non-canonical source type fails')

const canonicalBadSource = validateGraphOntology({
  authorityStatus: 'canonical_supported',
  reviewStatus: 'approved_graph',
  presenceScope: 'shared',
  sourceType: 'reflection_output',
  sourceId: 'src-1',
})
assert(!canonicalBadSource.valid, 'canonical_supported with non-canonical source type fails')
assert(canonicalBadSource.errors.some(e => e.includes('canonical source type')), 'error mentions canonical source type')

section('Composite validation — workspace_only + promptEligible=true fails')

const workspacePrompt = validateGraphOntology({
  authorityStatus: 'workspace_only',
  reviewStatus: 'workspace_only',
  presenceScope: 'none',
  promptEligible: true,
})
assert(!workspacePrompt.valid, 'workspace_only + promptEligible fails')
assert(workspacePrompt.errors.some(e => e.includes('cannot be prompt eligible')), 'error mentions prompt eligible')

section('Composite validation — rejected + promptEligible=true fails')

const rejectedPrompt = validateGraphOntology({
  authorityStatus: 'rejected',
  reviewStatus: 'rejected',
  presenceScope: 'none',
  sourceId: 'src-1',
  promptEligible: true,
})
assert(!rejectedPrompt.valid, 'rejected + promptEligible fails')

section('Composite validation — workspace_only without source returns warning')

const workspaceNoSource = validateGraphOntology({
  authorityStatus: 'workspace_only',
  reviewStatus: 'workspace_only',
  presenceScope: 'none',
})
assert(workspaceNoSource.valid, 'workspace_only without source is valid')
assert(workspaceNoSource.warnings.length > 0, 'workspace_only without source has warning')

// ─── Summary ────────────────────────────────────────────────────────────────

console.log(`\n══════════════════════════════════════`)
console.log(`  Phase 37A Validation Tests: ${passed} passed, ${failed} failed`)
if (failures.length > 0) {
  console.log(`\n  Failures:`)
  failures.forEach(f => console.log(`    - ${f}`))
}
console.log(`══════════════════════════════════════\n`)

process.exit(failed > 0 ? 1 : 0)
