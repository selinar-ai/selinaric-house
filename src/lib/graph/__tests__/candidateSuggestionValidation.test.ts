/**
 * Phase 37H.1 — Candidate Suggestion Validation Tests
 *
 * Run: npx tsx src/lib/graph/__tests__/candidateSuggestionValidation.test.ts
 *
 * No Supabase calls, no data writes.
 */

import {
  validateCandidateSuggestion,
  validateEvidenceRoleConsistency,
  validateCircularEvidence,
  type CandidateSuggestionInput,
} from '../candidateSuggestionValidation'

import type { SupportingArchiveSource } from '../candidateSuggestionTypes'

import * as fs from 'fs'
import * as path from 'path'

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

function makeValidMemoryCandidate(): CandidateSuggestionInput {
  return {
    candidate_type: 'memory_candidate',
    status: 'pending_review',
    prompt_eligible: false,
    proposed_label: 'Test Memory Candidate',
    reason_for_candidate: 'Appears across multiple approved graph nodes',
    evidence_strength: 'moderate',
    target_archive_item_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    supporting_graph_node_ids: ['11111111-2222-3333-4444-555555555555'],
    supporting_graph_edge_ids: [],
    supporting_proposal_ids: [],
    supporting_archive_sources: [
      {
        archive_item_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        canonical_status_snapshot: 'canonical',
        evidence_role: 'confirmed_memory_evidence',
        used_for_weighting: true,
      },
    ],
    deduplicated_evidence_sources: ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'],
    limits_or_uncertainties: 'Single source only',
  }
}

function makeValidHeldTruthCandidate(): CandidateSuggestionInput {
  return {
    candidate_type: 'held_truth_candidate',
    status: 'pending_review',
    prompt_eligible: false,
    proposed_label: 'Test Held Truth Candidate',
    proposed_truth_text: 'Tara values directness in communication',
    target_presence_id: 'ari',
    reason_for_candidate: 'Repeated pattern across approved graph edges',
    evidence_strength: 'moderate',
    supporting_graph_node_ids: ['11111111-2222-3333-4444-555555555555'],
    supporting_graph_edge_ids: ['22222222-3333-4444-5555-666666666666'],
    supporting_proposal_ids: [],
    supporting_archive_sources: [
      {
        archive_item_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        canonical_status_snapshot: 'canonical',
        evidence_role: 'confirmed_memory_evidence',
        used_for_weighting: true,
      },
    ],
    deduplicated_evidence_sources: ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'],
    limits_or_uncertainties: 'Interpretive — may not apply across all contexts',
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

section('candidate_type validation')

{
  const r1 = validateCandidateSuggestion(makeValidMemoryCandidate())
  assert(r1.valid, 'memory_candidate is valid')

  const r2 = validateCandidateSuggestion(makeValidHeldTruthCandidate())
  assert(r2.valid, 'held_truth_candidate is valid')

  const r3 = validateCandidateSuggestion({ ...makeValidMemoryCandidate(), candidate_type: 'bogus' })
  assert(!r3.valid, 'bogus candidate_type is rejected')
  assert(r3.errors.some(e => e.includes('Invalid candidate_type')), 'error mentions invalid candidate_type')

  const r4 = validateCandidateSuggestion({ ...makeValidMemoryCandidate(), candidate_type: '' })
  assert(!r4.valid, 'empty candidate_type is rejected')
}

section('prompt_eligible enforcement')

{
  const valid = validateCandidateSuggestion(makeValidMemoryCandidate())
  assert(valid.valid, 'prompt_eligible: false passes')

  const r1 = validateCandidateSuggestion({
    ...makeValidMemoryCandidate(),
    prompt_eligible: true as unknown as false,
  })
  assert(!r1.valid, 'prompt_eligible: true is hard rejected')
  assert(r1.errors.some(e => e.includes('prompt_eligible must be false')), 'error message cites the law')

  const r2 = validateCandidateSuggestion({
    ...makeValidMemoryCandidate(),
    prompt_eligible: undefined as unknown as false,
  })
  assert(!r2.valid, 'prompt_eligible: undefined is rejected')
}

section('memory_candidate field requirements')

{
  const r1 = validateCandidateSuggestion({
    ...makeValidMemoryCandidate(),
    target_archive_item_id: null,
  })
  assert(!r1.valid, 'memory_candidate without target_archive_item_id fails')
  assert(r1.errors.some(e => e.includes('target_archive_item_id')), 'error mentions target_archive_item_id')

  // target_presence_id is nullable for memory_candidate — no error
  const r2 = validateCandidateSuggestion({
    ...makeValidMemoryCandidate(),
    target_presence_id: 'ari',
  })
  assert(r2.valid, 'memory_candidate with optional target_presence_id is fine')
}

section('held_truth_candidate field requirements')

{
  const r1 = validateCandidateSuggestion({
    ...makeValidHeldTruthCandidate(),
    target_presence_id: null,
  })
  assert(!r1.valid, 'held_truth_candidate without target_presence_id fails')
  assert(r1.errors.some(e => e.includes('target_presence_id')), 'error mentions target_presence_id')

  const r2 = validateCandidateSuggestion({
    ...makeValidHeldTruthCandidate(),
    proposed_truth_text: null,
  })
  assert(!r2.valid, 'held_truth_candidate without proposed_truth_text fails')
  assert(r2.errors.some(e => e.includes('proposed_truth_text')), 'error mentions proposed_truth_text')

  const r3 = validateCandidateSuggestion({
    ...makeValidHeldTruthCandidate(),
    target_presence_id: null,
    proposed_truth_text: null,
  })
  assert(!r3.valid, 'held_truth_candidate missing both fields fails')
  assert(r3.errors.length >= 2, 'produces at least two errors when both missing')
}

section('evidence_role consistency')

{
  // canonical + confirmed_memory_evidence → valid
  const s1: SupportingArchiveSource[] = [{
    archive_item_id: 'a', canonical_status_snapshot: 'canonical',
    evidence_role: 'confirmed_memory_evidence', used_for_weighting: true,
  }]
  const r1 = validateEvidenceRoleConsistency(s1)
  assert(r1.valid, 'canonical + confirmed_memory_evidence is valid')

  // canonical + archive_provenance → also valid
  const s2: SupportingArchiveSource[] = [{
    archive_item_id: 'a', canonical_status_snapshot: 'canonical',
    evidence_role: 'archive_provenance', used_for_weighting: false,
  }]
  const r2 = validateEvidenceRoleConsistency(s2)
  assert(r2.valid, 'canonical + archive_provenance is valid')

  // canonical_candidate + candidate_context → valid
  const s3: SupportingArchiveSource[] = [{
    archive_item_id: 'b', canonical_status_snapshot: 'canonical_candidate',
    evidence_role: 'candidate_context', used_for_weighting: false,
  }]
  const r3 = validateEvidenceRoleConsistency(s3)
  assert(r3.valid, 'canonical_candidate + candidate_context is valid')

  // canonical_candidate + confirmed_memory_evidence → REJECTED (core safety check)
  const s4: SupportingArchiveSource[] = [{
    archive_item_id: 'b', canonical_status_snapshot: 'canonical_candidate',
    evidence_role: 'confirmed_memory_evidence', used_for_weighting: true,
  }]
  const r4 = validateEvidenceRoleConsistency(s4)
  assert(!r4.valid, 'canonical_candidate + confirmed_memory_evidence is rejected')
  assert(
    r4.errors.some(e => e.includes('canonical_candidate') && e.includes('not confirmed Memory')),
    'error explains that canonical_candidate is not confirmed Memory'
  )

  // canonical + candidate_context → rejected (canonical is not a candidate)
  const s5: SupportingArchiveSource[] = [{
    archive_item_id: 'a', canonical_status_snapshot: 'canonical',
    evidence_role: 'candidate_context', used_for_weighting: false,
  }]
  const r5 = validateEvidenceRoleConsistency(s5)
  assert(!r5.valid, 'canonical + candidate_context is rejected')

  // staged + archive_provenance → valid
  const s6: SupportingArchiveSource[] = [{
    archive_item_id: 'c', canonical_status_snapshot: 'staged',
    evidence_role: 'archive_provenance', used_for_weighting: false,
  }]
  const r6 = validateEvidenceRoleConsistency(s6)
  assert(r6.valid, 'staged + archive_provenance is valid')

  // staged + confirmed_memory_evidence → rejected
  const s7: SupportingArchiveSource[] = [{
    archive_item_id: 'c', canonical_status_snapshot: 'staged',
    evidence_role: 'confirmed_memory_evidence', used_for_weighting: true,
  }]
  const r7 = validateEvidenceRoleConsistency(s7)
  assert(!r7.valid, 'staged + confirmed_memory_evidence is rejected')
}

section('circular evidence detection')

{
  // No overlap → no circular evidence
  const r1 = validateCircularEvidence({
    supporting_archive_sources: [
      { archive_item_id: 'aaa', canonical_status_snapshot: 'canonical', evidence_role: 'confirmed_memory_evidence', used_for_weighting: true },
    ],
    supporting_graph_node_ids: ['node-1'],
    graphNodeSourceItemIds: { 'node-1': ['bbb'] },
  })
  assert(!r1.hasCircularEvidence, 'no overlap → no circular evidence')
  assert(r1.overlappingArchiveIds.length === 0, 'no overlapping IDs')

  // Overlap with used_for_weighting: true → circular evidence detected
  const r2 = validateCircularEvidence({
    supporting_archive_sources: [
      { archive_item_id: 'aaa', canonical_status_snapshot: 'canonical', evidence_role: 'confirmed_memory_evidence', used_for_weighting: true },
    ],
    supporting_graph_node_ids: ['node-1'],
    graphNodeSourceItemIds: { 'node-1': ['aaa', 'bbb'] },
  })
  assert(r2.hasCircularEvidence, 'overlap with weighting → circular evidence detected')
  assert(r2.overlappingArchiveIds.includes('aaa'), 'overlapping ID is aaa')
  assert(r2.warnings.length > 0, 'warning produced for circular evidence')

  // Overlap with used_for_weighting: false → no circular evidence
  const r3 = validateCircularEvidence({
    supporting_archive_sources: [
      { archive_item_id: 'aaa', canonical_status_snapshot: 'canonical', evidence_role: 'confirmed_memory_evidence', used_for_weighting: false },
    ],
    supporting_graph_node_ids: ['node-1'],
    graphNodeSourceItemIds: { 'node-1': ['aaa'] },
  })
  assert(!r3.hasCircularEvidence, 'overlap without weighting → no circular evidence')

  // Graph node not in lookup → no crash, no circular evidence
  const r4 = validateCircularEvidence({
    supporting_archive_sources: [
      { archive_item_id: 'aaa', canonical_status_snapshot: 'canonical', evidence_role: 'confirmed_memory_evidence', used_for_weighting: true },
    ],
    supporting_graph_node_ids: ['node-unknown'],
    graphNodeSourceItemIds: {},
  })
  assert(!r4.hasCircularEvidence, 'unknown graph node → no crash, no circular evidence')
}

section('deduplicated_evidence_sources validation')

{
  const r1 = validateCandidateSuggestion(makeValidMemoryCandidate())
  assert(r1.valid, 'deduplicated_evidence_sources present → valid')

  const r2 = validateCandidateSuggestion({
    ...makeValidMemoryCandidate(),
    deduplicated_evidence_sources: undefined,
  })
  assert(!r2.valid, 'deduplicated_evidence_sources missing → invalid')
  assert(r2.errors.some(e => e.includes('deduplicated_evidence_sources')), 'error mentions field')
}

section('evidence_strength validation')

{
  for (const strength of ['strong', 'moderate', 'weak']) {
    const r = validateCandidateSuggestion({ ...makeValidMemoryCandidate(), evidence_strength: strength })
    assert(r.valid, `evidence_strength "${strength}" is valid`)
  }

  const r1 = validateCandidateSuggestion({ ...makeValidMemoryCandidate(), evidence_strength: 'very_strong' })
  assert(!r1.valid, 'evidence_strength "very_strong" is rejected')

  const r2 = validateCandidateSuggestion({ ...makeValidMemoryCandidate(), evidence_strength: '' })
  assert(!r2.valid, 'evidence_strength "" is rejected')
}

section('structural safety — no canonical_status mutation in types')

{
  const typesPath = path.resolve(__dirname, '../candidateSuggestionTypes.ts')
  const content = fs.readFileSync(typesPath, 'utf-8')

  assert(!content.includes('setCanonicalStatus'), 'types file does not contain setCanonicalStatus')
  assert(!content.includes('updateCanonicalStatus'), 'types file does not contain updateCanonicalStatus')
  assert(!content.includes('mutateCanonicalStatus'), 'types file does not contain mutateCanonicalStatus')
  assert(!content.includes('promoteToMemory'), 'types file does not contain promoteToMemory')
  assert(!content.includes('insertHeldTruth'), 'types file does not contain insertHeldTruth')

  const validationPath = path.resolve(__dirname, '../candidateSuggestionValidation.ts')
  const vContent = fs.readFileSync(validationPath, 'utf-8')

  assert(!vContent.includes('setCanonicalStatus'), 'validation file does not contain setCanonicalStatus')
  assert(!vContent.includes('supabase'), 'validation file does not import supabase')
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
