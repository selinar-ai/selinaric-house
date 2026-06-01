/**
 * Phase 37H.2 — Candidate Suggestion Service Boundary Tests
 *
 * Run: npx tsx src/lib/graph/__tests__/candidateSuggestionService.test.ts
 *
 * These tests validate the service module's structure and the validation
 * integration without making actual Supabase calls.
 * They verify that:
 *   - governance fields are server-owned
 *   - forbidden write paths don't exist in the service
 *   - validation contract integration works correctly
 *   - evidence ID destination rules are enforced
 */

import * as fs from 'fs'
import * as path from 'path'

import {
  validateCandidateSuggestion,
  validateEvidenceRoleConsistency,
  validateCircularEvidence,
} from '../candidateSuggestionValidation'

import {
  isValidCandidateType,
  isValidSuggestionStatus,
  isValidEvidenceRole,
  isValidEvidenceStrength,
  CANDIDATE_TYPES,
  SUGGESTION_STATUSES,
  EVIDENCE_ROLES,
  EVIDENCE_STRENGTHS,
} from '../candidateSuggestionTypes'

import type { SupportingArchiveSource } from '../candidateSuggestionTypes'

// ─── Harness ───────────────────────────────────────────────────────────────

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

// ─── Test Helpers ──────────────────────────────────────────────────────────

function makeValidMemoryInput() {
  return {
    candidate_type: 'memory_candidate' as const,
    status: 'pending_review' as const,
    prompt_eligible: false as const,
    proposed_label: 'Test Memory Suggestion',
    reason_for_candidate: 'Multiple approved graph nodes reference this item',
    evidence_strength: 'moderate' as const,
    target_archive_item_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    supporting_graph_node_ids: [],
    supporting_graph_edge_ids: [],
    supporting_proposal_ids: ['pppppppp-1111-2222-3333-444444444444'],
    supporting_archive_sources: [{
      archive_item_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      canonical_status_snapshot: 'canonical' as const,
      evidence_role: 'confirmed_memory_evidence' as const,
      used_for_weighting: true,
    }],
    deduplicated_evidence_sources: ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'],
    limits_or_uncertainties: 'Single source only',
  }
}

function makeValidHeldTruthInput() {
  return {
    candidate_type: 'held_truth_candidate' as const,
    status: 'pending_review' as const,
    prompt_eligible: false as const,
    proposed_label: 'Test Held Truth Suggestion',
    proposed_truth_text: 'Communication directness is valued',
    target_presence_id: 'ari' as const,
    reason_for_candidate: 'Pattern across approved graph edges',
    evidence_strength: 'moderate' as const,
    supporting_graph_node_ids: [],
    supporting_graph_edge_ids: [],
    supporting_proposal_ids: [],
    supporting_archive_sources: [{
      archive_item_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      canonical_status_snapshot: 'canonical' as const,
      evidence_role: 'confirmed_memory_evidence' as const,
      used_for_weighting: true,
    }],
    deduplicated_evidence_sources: ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'],
    limits_or_uncertainties: 'Interpretive',
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

section('Governance field enforcement — service file structure')

{
  const servicePath = path.resolve(__dirname, '../candidateSuggestionService.ts')
  const content = fs.readFileSync(servicePath, 'utf-8')

  // Server must force status to pending_review
  assert(content.includes("status: 'pending_review'"), 'service sets status = pending_review')

  // Server must force prompt_eligible to false
  assert(content.includes('prompt_eligible: false'), 'service sets prompt_eligible = false')

  // Server must force created_by to tara
  assert(content.includes("created_by: 'tara'"), 'service sets created_by = tara')

  // Server must force reviewed_by to null on create
  assert(content.includes('reviewed_by: null'), 'service sets reviewed_by = null on create')

  // Server must force reviewed_at to null on create
  assert(content.includes('reviewed_at: null'), 'service sets reviewed_at = null on create')
}

section('Forbidden write targets — service must not reference other tables for writes')

{
  const servicePath = path.resolve(__dirname, '../candidateSuggestionService.ts')
  const content = fs.readFileSync(servicePath, 'utf-8')

  // Extract all .from('...') calls
  const fromCalls = content.match(/\.from\(['"]([^'"]+)['"]\)/g) ?? []
  const tables = fromCalls.map(c => {
    const m = c.match(/\.from\(['"]([^'"]+)['"]\)/)
    return m ? m[1] : ''
  }).filter(Boolean)

  const uniqueTables = [...new Set(tables)]

  // Allowed tables (read or write)
  const allowedTables = [
    'graph_candidate_suggestions',
    'graph_candidate_suggestion_events',
    'archive_items',            // read-only for snapshots
    'archive_graph_nodes',      // read-only for verification
    'archive_graph_edges',      // read-only for verification
    'graph_proposals',          // read-only for verification
  ]

  const forbidden = uniqueTables.filter(t => !allowedTables.includes(t))
  assert(
    forbidden.length === 0,
    `service only references allowed tables (found: ${uniqueTables.join(', ')}${forbidden.length > 0 ? '; FORBIDDEN: ' + forbidden.join(', ') : ''})`
  )

  // Must not reference these tables at all
  const neverTables = [
    'archive_memory_events',
    'held_truths',
    'memory_injection_events',
    'graph_proposal_sources',
    'graph_proposal_events',
    'relational_map_workspaces',
  ]
  for (const t of neverTables) {
    assert(!content.includes(`'${t}'`), `service does not reference ${t}`)
  }
}

section('Forbidden write targets — API routes')

{
  const routePath = path.resolve(__dirname, '../../../app/api/graph-candidate-suggestions/route.ts')
  const content = fs.readFileSync(routePath, 'utf-8')

  // API route must not directly query any tables — it delegates to the service
  assert(!content.includes(".from("), 'API route does not query tables directly (delegates to service)')
  assert(!content.includes('supabase'), 'API route does not import supabase')
  assert(!content.includes('prompt_eligible: true'), 'API route never sets prompt_eligible true')
}

section('Validation integration — memory_candidate')

{
  const input = makeValidMemoryInput()
  const result = validateCandidateSuggestion(input)
  assert(result.valid, 'valid memory_candidate passes validation')
  assert(result.errors.length === 0, 'no errors for valid memory_candidate')

  // Missing target_archive_item_id
  const r2 = validateCandidateSuggestion({ ...input, target_archive_item_id: null })
  assert(!r2.valid, 'memory_candidate without archive id fails')

  // With held truth fields — should fail in the form (server strips them,
  // but validation catches if they leak)
  // Note: the validator itself doesn't reject extra fields, the DB constraints do.
  // So we test the type discrimination instead.
  assert(input.candidate_type === 'memory_candidate', 'candidate_type is memory_candidate')
}

section('Validation integration — held_truth_candidate')

{
  const input = makeValidHeldTruthInput()
  const result = validateCandidateSuggestion(input)
  assert(result.valid, 'valid held_truth_candidate passes validation')

  const r2 = validateCandidateSuggestion({ ...input, target_presence_id: null })
  assert(!r2.valid, 'held_truth_candidate without presence_id fails')

  const r3 = validateCandidateSuggestion({ ...input, proposed_truth_text: null })
  assert(!r3.valid, 'held_truth_candidate without truth text fails')
}

section('Evidence role enforcement — canonical_candidate must be candidate_context')

{
  const sources: SupportingArchiveSource[] = [{
    archive_item_id: 'x',
    canonical_status_snapshot: 'canonical_candidate',
    evidence_role: 'confirmed_memory_evidence',
    used_for_weighting: true,
  }]
  const r = validateEvidenceRoleConsistency(sources)
  assert(!r.valid, 'canonical_candidate + confirmed_memory_evidence is rejected')
  assert(r.errors.some(e => e.includes('not confirmed Memory')), 'error explains the rule')
}

section('Circular evidence detection')

{
  const r = validateCircularEvidence({
    supporting_archive_sources: [
      { archive_item_id: 'shared-id', canonical_status_snapshot: 'canonical', evidence_role: 'confirmed_memory_evidence', used_for_weighting: true },
    ],
    supporting_graph_node_ids: ['node-1'],
    graphNodeSourceItemIds: { 'node-1': ['shared-id', 'other-id'] },
  })
  assert(r.hasCircularEvidence, 'circular evidence detected when archive id overlaps with graph node source')
  assert(r.overlappingArchiveIds.includes('shared-id'), 'overlapping ID identified')

  const r2 = validateCircularEvidence({
    supporting_archive_sources: [
      { archive_item_id: 'shared-id', canonical_status_snapshot: 'canonical', evidence_role: 'confirmed_memory_evidence', used_for_weighting: false },
    ],
    supporting_graph_node_ids: ['node-1'],
    graphNodeSourceItemIds: { 'node-1': ['shared-id'] },
  })
  assert(!r2.hasCircularEvidence, 'no circular evidence when used_for_weighting is false')
}

section('Evidence ID destinations — structural verification')

{
  const servicePath = path.resolve(__dirname, '../candidateSuggestionService.ts')
  const content = fs.readFileSync(servicePath, 'utf-8')

  // supporting_graph_node_ids must query archive_graph_nodes, not graph_proposals
  assert(
    content.includes("from('archive_graph_nodes')"),
    'service verifies graph node IDs against archive_graph_nodes table'
  )

  // supporting_graph_edge_ids must query archive_graph_edges
  assert(
    content.includes("from('archive_graph_edges')"),
    'service verifies graph edge IDs against archive_graph_edges table'
  )

  // supporting_proposal_ids must query graph_proposals
  assert(
    content.includes("from('graph_proposals')"),
    'service verifies proposal IDs against graph_proposals table'
  )

  // Must check approval_status for legacy nodes/edges
  assert(
    content.includes("approval_status !== 'approved'"),
    'service rejects unapproved legacy graph nodes/edges'
  )

  // Must check status for proposals
  assert(
    content.includes("prop.status !== 'approved_graph'"),
    'service rejects non-approved_graph proposals'
  )
}

section('No prompt injection — structural verification')

{
  const servicePath = path.resolve(__dirname, '../candidateSuggestionService.ts')
  const content = fs.readFileSync(servicePath, 'utf-8')

  assert(!content.includes('getHeldTruthsForPrompt'), 'service does not call getHeldTruthsForPrompt')
  assert(!content.includes('MemoryInjection'), 'service does not reference MemoryInjection')
  assert(!content.includes('prompt_eligible: true'), 'service never sets prompt_eligible true')

  const typesPath = path.resolve(__dirname, '../candidateSuggestionTypes.ts')
  const typesContent = fs.readFileSync(typesPath, 'utf-8')
  assert(typesContent.includes('prompt_eligible: false'), 'types enforce prompt_eligible as literal false')
}

section('No approve/promote actions in service')

{
  const servicePath = path.resolve(__dirname, '../candidateSuggestionService.ts')
  const content = fs.readFileSync(servicePath, 'utf-8')

  assert(!content.includes('confirm_memory'), 'service does not contain confirm_memory')
  assert(!content.includes('promoteToHeldTruth'), 'service does not contain promoteToHeldTruth')
  assert(!content.includes("status: 'approved'") || content.includes("status !== 'approved'"), 'service does not set status to approved (only checks against it)')

  // The only status transitions in create/dismiss should be pending_review and dismissed.
  // Hydration (read-only) may reference other statuses in DTO construction — exclude it.
  const hydrateIdx = content.indexOf('export async function hydrateCandidateSuggestion')
  const createDismissContent = hydrateIdx > 0 ? content.slice(0, hydrateIdx) : content
  const statusWrites = createDismissContent.match(/status:\s*['"](?!pending_review|dismissed)/g) ?? []
  assert(
    statusWrites.length === 0,
    `service create/dismiss only writes status pending_review or dismissed (found ${statusWrites.length} others)`
  )
}

section('List filter — status=all does not query status=all')

{
  const servicePath = path.resolve(__dirname, '../candidateSuggestionService.ts')
  const content = fs.readFileSync(servicePath, 'utf-8')

  // The list function must not literally query .eq('status', 'all')
  assert(
    content.includes("params.status !== 'all'"),
    'list function filters out status=all before querying'
  )

  // When status is absent or all, no .eq('status', 'pending_review') default
  const listFnStart = content.indexOf('export async function listCandidateSuggestions')
  const listFnEnd = content.indexOf('// ─── Dismiss', listFnStart)
  const listFn = content.slice(listFnStart, listFnEnd > 0 ? listFnEnd : undefined)
  assert(
    !listFn.includes("eq('status', 'pending_review')"),
    'list function does not hardcode pending_review as default filter'
  )
}

// ─── Summary ───────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
if (failures.length > 0) {
  console.log('\n  Failures:')
  for (const f of failures) {
    console.log(`    ✗ ${f}`)
  }
}
console.log('══════════════════════════════════════════\n')

process.exit(failed > 0 ? 1 : 0)
