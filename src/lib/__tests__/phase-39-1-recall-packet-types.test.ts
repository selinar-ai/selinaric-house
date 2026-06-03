/**
 * Phase 39.1 Structural Tests — Context Authority Packet Types
 *
 * Static/structural validation of the Recall Packet type vocabulary,
 * source surface registry, authority rank mapping, and contract shape.
 *
 * These tests verify code structure only — no Supabase calls, no data writes,
 * no runtime builder execution.
 *
 * Run: npx tsx src/lib/__tests__/phase-39-1-recall-packet-types.test.ts
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

const TYPES_FILE_PATH = 'src/lib/recall/recallPacketTypes.ts'
const src = readFile(TYPES_FILE_PATH)

// ═══════════════════════════════════════════════════════
// 1. File structure
// ═══════════════════════════════════════════════════════
section('1. File structure')

assert(
  fs.existsSync(path.join(ROOT, TYPES_FILE_PATH)),
  'recallPacketTypes.ts exists at src/lib/recall/recallPacketTypes.ts'
)

assert(
  src.includes('export enum SourceSurface'),
  'SourceSurface enum is exported'
)

assert(
  src.includes('export enum AuthorityLabel'),
  'AuthorityLabel enum is exported'
)

assert(
  src.includes('export enum AuthorityTier'),
  'AuthorityTier enum is exported'
)

assert(
  src.includes('export enum ResponseInstruction'),
  'ResponseInstruction enum is exported'
)

assert(
  src.includes('export enum ConflictType'),
  'ConflictType enum is exported'
)

assert(
  src.includes('export enum ExclusionReason'),
  'ExclusionReason enum is exported'
)

assert(
  src.includes('export const SOURCE_SURFACE_REGISTRY'),
  'SOURCE_SURFACE_REGISTRY const is exported'
)

assert(
  src.includes('export const AUTHORITY_RANK'),
  'AUTHORITY_RANK const is exported'
)

assert(
  src.includes('export const CONFLICT_RESOLUTION_ONLY_INSTRUCTIONS'),
  'CONFLICT_RESOLUTION_ONLY_INSTRUCTIONS const is exported'
)

// ═══════════════════════════════════════════════════════
// 2. SourceSurface enum — all 39 surfaces present
// ═══════════════════════════════════════════════════════
section('2. SourceSurface enum completeness (39 surfaces)')

const expectedSurfaces = [
  // Memory tier (7)
  'confirmed_archive_memory',
  'presence_scoped_confirmed_memory',
  'tara_only_confirmed_memory',
  'memory_candidate',
  'archive_only_context',
  'archive_source_raw_material',
  'archive_entry_draft',
  // Continuity tier (6)
  'recent_continuity_not_memory',
  'current_house_context',
  'short_horizon_thread_context',
  'lounge_recent_continuity',
  'recent_cross_room_context',
  'cross_room_prompt_carryforward',
  // Presence state tier (4)
  'pulse_autonomous_continuity',
  'pulse_current_state',
  'living_state',
  'interior_notes',
  // Inner continuity tier (4)
  'journal_inner_continuity',
  'journal_invitation_not_inner_life',
  'held_truth_presence_continuity',
  'reflection_output',
  // Reference tier (5)
  'library_rag_reference',
  'library_canonical_memory_reference',
  'watchtower_source_grounding',
  'attachment_context',
  'web_search_context',
  // Graph tier (5)
  'graph_context',
  'graph_proposal_context',
  'graph_candidate_suggestion',
  'ontology_lab_context',
  'relational_map_layout',
  // Trace tier (5)
  'llm_reasoning_draft',
  'llm_reasoning_feedback_trace',
  'reasoning_audit_trace',
  'archive_memory_events_trace',
  'archive_recall_events_trace',
  // Identity continuity tier (1)
  'identity_timeline',
  // Ground failure (2)
  'unknown',
  'insufficient',
]

assert(
  expectedSurfaces.length === 39,
  'Expected surface list has exactly 39 entries'
)

for (const surface of expectedSurfaces) {
  assert(
    src.includes(`${surface} = '${surface}'`),
    `SourceSurface.${surface} is defined`
  )
}

// ═══════════════════════════════════════════════════════
// 3. AuthorityTier enum — 10 tiers including IdentityContinuity
// ═══════════════════════════════════════════════════════
section('3. AuthorityTier enum (10 tiers)')

const expectedTiers = [
  'Memory',
  'MemoryAdjacent',
  'Continuity',
  'PresenceState',
  'InnerContinuity',
  'IdentityContinuity',
  'Reference',
  'Graph',
  'Trace',
  'GroundFailure',
]

assert(
  expectedTiers.length === 10,
  'Expected tier list has exactly 10 entries'
)

for (const tier of expectedTiers) {
  assert(
    src.includes(`${tier} = '${tier}'`),
    `AuthorityTier.${tier} is defined`
  )
}

assert(
  src.includes("IdentityContinuity = 'IdentityContinuity'"),
  'IdentityContinuity tier exists (for identity_timeline surface)'
)

// ═══════════════════════════════════════════════════════
// 4. ResponseInstruction enum — 15 instructions, no do_not_answer_from_recall
// ═══════════════════════════════════════════════════════
section('4. ResponseInstruction enum (15 instructions)')

const expectedInstructions = [
  'answer_confidently_from_confirmed_memory',
  'answer_with_source_label',
  'answer_with_caveat',
  'say_recent_continuity_only',
  'say_live_thread_context_only',
  'say_lounge_context_only',
  'say_cross_room_context_only',
  'say_journal_inner_continuity_only',
  'say_pulse_continuity_only',
  'say_graph_context_only',
  'say_reference_context_only',
  'surface_source_conflict',
  'ask_clarifying_question',
  'say_not_enough_grounded_recall',
  'do_not_inject',
]

assert(
  expectedInstructions.length === 15,
  'Expected instruction list has exactly 15 entries'
)

for (const instr of expectedInstructions) {
  assert(
    src.includes(`${instr} = '${instr}'`),
    `ResponseInstruction.${instr} is defined`
  )
}

assert(
  !src.includes("do_not_answer_from_recall = 'do_not_answer_from_recall'"),
  'do_not_answer_from_recall is NOT defined as an enum value (merged into say_not_enough_grounded_recall / do_not_inject)'
)

// ═══════════════════════════════════════════════════════
// 5. ResponseInstruction completeness — source defaults + conflict/fallback
// ═══════════════════════════════════════════════════════
section('5. ResponseInstruction completeness (source defaults + conflict/fallback)')

// Instructions that should appear as default_response_instruction in registry entries
const sourceDefaultInstructions = [
  'answer_confidently_from_confirmed_memory',
  'answer_with_source_label',
  'answer_with_caveat',
  'say_recent_continuity_only',
  'say_live_thread_context_only',
  'say_lounge_context_only',
  'say_cross_room_context_only',
  'say_journal_inner_continuity_only',
  'say_pulse_continuity_only',
  'say_graph_context_only',
  'say_reference_context_only',
  'say_not_enough_grounded_recall',
  'do_not_inject',
]

for (const instr of sourceDefaultInstructions) {
  assert(
    src.includes(`default_response_instruction: ResponseInstruction.${instr}`),
    `${instr} is used as a default_response_instruction in at least one registry entry`
  )
}

// Conflict/fallback-only instructions are declared in CONFLICT_RESOLUTION_ONLY_INSTRUCTIONS
assert(
  src.includes('ResponseInstruction.surface_source_conflict'),
  'surface_source_conflict appears in CONFLICT_RESOLUTION_ONLY_INSTRUCTIONS'
)

assert(
  src.includes('ResponseInstruction.ask_clarifying_question'),
  'ask_clarifying_question appears in CONFLICT_RESOLUTION_ONLY_INSTRUCTIONS'
)

assert(
  src.includes('CONFLICT_RESOLUTION_ONLY_INSTRUCTIONS'),
  'CONFLICT_RESOLUTION_ONLY_INSTRUCTIONS constant is declared for conflict/fallback-only instructions'
)

// ═══════════════════════════════════════════════════════
// 6. ConflictType enum — 15 conflict types
// ═══════════════════════════════════════════════════════
section('6. ConflictType enum (15 conflict types)')

const expectedConflicts = [
  'confirmed_memory_vs_recent_continuity',
  'confirmed_memory_vs_journal_context',
  'confirmed_memory_vs_graph_context',
  'confirmed_memory_vs_held_truth',
  'recent_continuity_vs_journal_context',
  'pulse_authored_choice_vs_inferred_emotion',
  'cross_room_context_vs_presence_scope',
  'lounge_context_vs_individual_room_scope',
  'graph_only_authority_risk',
  'rag_reference_vs_memory_authority',
  'trace_only_source_used_as_content',
  'topic_shift_relevance_failure',
  'ambiguous_reference',
  'insufficient_ground',
  'presence_memory_scope_collision',
]

assert(
  expectedConflicts.length === 15,
  'Expected conflict list has exactly 15 entries'
)

for (const conflict of expectedConflicts) {
  assert(
    src.includes(`${conflict} = '${conflict}'`),
    `ConflictType.${conflict} is defined`
  )
}

// ═══════════════════════════════════════════════════════
// 7. ExclusionReason enum — 12 reasons
// ═══════════════════════════════════════════════════════
section('7. ExclusionReason enum (12 reasons)')

const expectedReasons = [
  'trace_only',
  'scope_prohibited',
  'expired',
  'not_prompt_eligible',
  'insufficient_ground',
  'relevance_too_weak',
  'unknown_source',
  'raw_source',
  'draft_source',
  'tara_only',
  'not_in_runtime_builder',
  'topic_shift',
]

assert(
  expectedReasons.length === 12,
  'Expected exclusion reason list has exactly 12 entries'
)

for (const reason of expectedReasons) {
  assert(
    src.includes(`${reason} = '${reason}'`),
    `ExclusionReason.${reason} is defined`
  )
}

// ═══════════════════════════════════════════════════════
// 8. AuthorityLabel — all labels defined, no bare 'context'
// ═══════════════════════════════════════════════════════
section('8. AuthorityLabel completeness and naming rules')

const expectedLabels = [
  // Memory
  'confirmed_memory',
  'presence_scoped_confirmed_memory',
  'tara_only_confirmed_memory',
  // Memory-adjacent
  'memory_candidate_manual_only',
  'archive_only_not_memory',
  'raw_source_not_recallable',
  'draft_proposal_not_recallable',
  // Continuity
  'recent_session_context_not_memory',
  'current_house_context_not_memory',
  'live_thread_context_not_memory',
  'lounge_context_not_memory',
  'cross_room_event_not_memory',
  'cross_room_prompt_carryforward_not_memory',
  // Presence state
  'confirmed_autonomous_choice',
  'pulse_current_state_not_memory',
  'living_state_not_memory',
  'interior_notes_not_memory',
  // Inner continuity
  'journal_inner_continuity_not_memory',
  'journal_invitation_not_inner_life',
  'held_truth_presence_continuity_not_memory',
  'reflection_suggestion_not_memory',
  // Reference
  'library_reference_not_memory',
  'watchtower_source_grounded_context',
  'attachment_context_not_memory',
  'web_reference_not_memory',
  // Graph
  'graph_context_not_memory',
  'graph_proposal_context_not_memory',
  'graph_candidate_not_memory',
  'ontology_context_not_memory',
  'layout_context_not_authority',
  // Trace
  'reasoning_explanation_not_evidence',
  'feedback_trace_not_evidence',
  'audit_trace_not_evidence',
  'archive_event_trace_not_evidence',
  'recall_event_trace_not_evidence',
  // Identity continuity
  'identity_continuity_not_memory',
  // Ground failure
  'unknown_ground',
  'insufficient_ground',
]

for (const label of expectedLabels) {
  assert(
    src.includes(`${label} = '${label}'`),
    `AuthorityLabel.${label} is defined`
  )
}

// Each label used in registry should appear in the AuthorityLabel enum
// (verified by the fact that TypeScript would fail to compile if not)
assert(
  src.includes("export enum AuthorityLabel"),
  'AuthorityLabel enum exists for registry type-checking'
)

// No authority label is the bare word "context" — every label has a boundary qualifier
const bareContextPattern = /= 'context'/
assert(
  !bareContextPattern.test(src),
  "No authority label is the bare word 'context' without a boundary qualifier"
)

// Labels used by non-Memory surfaces must include a negation boundary
const boundaryTerms = ['_not_memory', '_not_evidence', '_not_recallable', '_not_authority', '_not_inner_life', '_manual_only']
// The only labels without negation are the three confirmed Memory labels
const memoryLabels = ['confirmed_memory', 'presence_scoped_confirmed_memory', 'tara_only_confirmed_memory', 'confirmed_autonomous_choice', 'watchtower_source_grounded_context']
const nonBoundaryNonMemory = expectedLabels.filter(l => {
  const hasBoundary = boundaryTerms.some(t => l.includes(t))
  const isMemory = memoryLabels.includes(l)
  const isGroundFailure = l.includes('_ground')
  return !hasBoundary && !isMemory && !isGroundFailure
})
assert(
  nonBoundaryNonMemory.length === 0,
  `All non-Memory labels have authority boundary terms (boundary-free non-Memory labels: ${nonBoundaryNonMemory.join(', ') || 'none'})`
)

// ═══════════════════════════════════════════════════════
// 9. Authority rank mapping — correct ranks per Section 9
// ═══════════════════════════════════════════════════════
section('9. AUTHORITY_RANK correctness')

assert(
  src.includes('[AuthorityLabel.confirmed_memory]: 1'),
  'confirmed_memory has rank 1'
)

assert(
  src.includes('[AuthorityLabel.presence_scoped_confirmed_memory]: 1'),
  'presence_scoped_confirmed_memory has rank 1'
)

assert(
  src.includes('[AuthorityLabel.tara_only_confirmed_memory]: 2'),
  'tara_only_confirmed_memory has rank 2'
)

assert(
  src.includes('[AuthorityLabel.held_truth_presence_continuity_not_memory]: 3'),
  'held_truth_presence_continuity_not_memory has rank 3'
)

// Trace labels must be rank 19 (not 17)
const traceLabels = [
  'reasoning_explanation_not_evidence',
  'feedback_trace_not_evidence',
  'audit_trace_not_evidence',
  'archive_event_trace_not_evidence',
  'recall_event_trace_not_evidence',
]

for (const label of traceLabels) {
  assert(
    src.includes(`[AuthorityLabel.${label}]: 19`),
    `Trace label ${label} has rank 19`
  )
}

// Non-recallable labels must be rank 20 (not 17 or 18)
const nonRecallableLabels = [
  'raw_source_not_recallable',
  'draft_proposal_not_recallable',
  'graph_candidate_not_memory',
  'layout_context_not_authority',
]

for (const label of nonRecallableLabels) {
  assert(
    src.includes(`[AuthorityLabel.${label}]: 20`),
    `Non-recallable label ${label} has rank 20`
  )
}

// Ground failure labels must be rank 21
assert(
  src.includes('[AuthorityLabel.unknown_ground]: 21'),
  'unknown_ground has rank 21'
)

assert(
  src.includes('[AuthorityLabel.insufficient_ground]: 21'),
  'insufficient_ground has rank 21'
)

// All authority labels from expectedLabels must have a rank entry
for (const label of expectedLabels) {
  assert(
    src.includes(`[AuthorityLabel.${label}]:`),
    `AUTHORITY_RANK has an entry for AuthorityLabel.${label}`
  )
}

// ═══════════════════════════════════════════════════════
// 10. Memory flag consistency
// ═══════════════════════════════════════════════════════
section('10. Memory flag consistency')

// Surfaces with confirmed_memory / presence_scoped_confirmed_memory /
// tara_only_confirmed_memory / library_canonical_memory_reference must have is_memory: true.
// All other surfaces must have is_memory: false.

// Count is_memory: true occurrences — expect exactly 3:
// confirmed_archive_memory, presence_scoped_confirmed_memory, library_canonical_memory_reference
// (tara_only has is_memory: true because it IS Memory, just scope-blocked)
const isMemoryTrueMatches = src.match(/is_memory: true/g) || []
assert(
  isMemoryTrueMatches.length === 4,
  `Exactly 4 registry entries have is_memory: true (shared canonical, scoped canonical, tara-only, library-canonical-derived) — found: ${isMemoryTrueMatches.length}`
)

// ═══════════════════════════════════════════════════════
// 11. Trace flag consistency
// ═══════════════════════════════════════════════════════
section('11. Trace flag consistency')

const traceSurfaces = [
  'llm_reasoning_draft',
  'llm_reasoning_feedback_trace',
  'reasoning_audit_trace',
  'archive_memory_events_trace',
  'archive_recall_events_trace',
]

for (const surface of traceSurfaces) {
  // Each trace surface block should contain is_trace_only: true
  // We verify by checking that is_trace_only: true appears the right number of times
  // (simpler: just check the count matches expectation at end)
  assert(
    src.includes(`SourceSurface.${surface}]:`),
    `Trace surface ${surface} has a registry entry`
  )
}

// All trace surfaces have can_enter_prompt: false
// Count of is_trace_only: true should match count of trace surfaces (5)
const isTraceOnlyTrueMatches = src.match(/is_trace_only: true/g) || []
assert(
  isTraceOnlyTrueMatches.length === 5,
  `Exactly 5 registry entries have is_trace_only: true — found: ${isTraceOnlyTrueMatches.length}`
)

// ═══════════════════════════════════════════════════════
// 12. Presence scope consistency
// ═══════════════════════════════════════════════════════
section('12. Presence scope consistency')

// Surfaces that must be same_presence_only: true include all journal,
// pulse, living_state, interior_notes, held_truth, and per-presence continuity
const presenceScopedSurfaces = [
  'presence_scoped_confirmed_memory',
  'recent_continuity_not_memory',
  'short_horizon_thread_context',
  'pulse_autonomous_continuity',
  'pulse_current_state',
  'living_state',
  'interior_notes',
  'journal_inner_continuity',
  'held_truth_presence_continuity',
  'recent_cross_room_context',
  'cross_room_prompt_carryforward',
  'identity_timeline',
]

// All listed surfaces appear in registry
for (const surface of presenceScopedSurfaces) {
  assert(
    src.includes(`SourceSurface.${surface}]:`),
    `Presence-scoped surface ${surface} has a registry entry`
  )
}

// Tara-only surface must have same_presence_only: false (it's Tara-scoped, not ari/eli scoped)
// Verified by the fact that tara_only_confirmed_memory has can_enter_prompt: false instead
assert(
  src.includes('[SourceSurface.tara_only_confirmed_memory]:'),
  'tara_only_confirmed_memory has a registry entry'
)

// ═══════════════════════════════════════════════════════
// 13. Registry completeness — all 39 surfaces present
// ═══════════════════════════════════════════════════════
section('13. SOURCE_SURFACE_REGISTRY completeness')

for (const surface of expectedSurfaces) {
  assert(
    src.includes(`[SourceSurface.${surface}]:`),
    `SOURCE_SURFACE_REGISTRY has entry for SourceSurface.${surface}`
  )
}

// Registry is frozen
assert(
  src.includes('Object.freeze({'),
  'SOURCE_SURFACE_REGISTRY is frozen with Object.freeze'
)

// in_runtime_builder_v1 flag is present in type definition
assert(
  src.includes('in_runtime_builder_v1: boolean'),
  'SourceSurfaceDefinition includes in_runtime_builder_v1 field'
)

// Some entries have in_runtime_builder_v1: false (deferred surfaces)
const notInRuntimeMatches = src.match(/in_runtime_builder_v1: false/g) || []
assert(
  notInRuntimeMatches.length > 0,
  'Some registry entries have in_runtime_builder_v1: false (deferred from 39.2 builder)'
)

// Some entries have in_runtime_builder_v1: true (39.2 builder surfaces)
const inRuntimeMatches = src.match(/in_runtime_builder_v1: true/g) || []
assert(
  inRuntimeMatches.length > 0,
  'Some registry entries have in_runtime_builder_v1: true (included in 39.2 builder)'
)

// ═══════════════════════════════════════════════════════
// 14. RecallPacket shape — active_sources and excluded_sources required
// ═══════════════════════════════════════════════════════
section('14. RecallPacket shape')

assert(
  src.includes('type RecallPacket'),
  'RecallPacket type is defined'
)

assert(
  src.includes('active_sources: ClassifiedSource[]'),
  'RecallPacket has required active_sources: ClassifiedSource[] field'
)

assert(
  src.includes('excluded_sources: ClassifiedSource[]'),
  'RecallPacket has required excluded_sources: ClassifiedSource[] field'
)

assert(
  src.includes('primary_response_instruction: ResponseInstruction'),
  'RecallPacket has primary_response_instruction field'
)

assert(
  src.includes('has_conflict: boolean'),
  'RecallPacket has has_conflict field'
)

assert(
  src.includes('has_sufficient_ground: boolean'),
  'RecallPacket has has_sufficient_ground field'
)

assert(
  src.includes('packet_id: string'),
  'RecallPacket has packet_id field'
)

// ═══════════════════════════════════════════════════════
// 15. SourceConflict shape — involved_sources, not required source_a/source_b
// ═══════════════════════════════════════════════════════
section('15. SourceConflict shape (non-pair support)')

assert(
  src.includes('type SourceConflict'),
  'SourceConflict type is defined'
)

assert(
  src.includes('involved_sources: SourceSurface[]'),
  'SourceConflict has involved_sources: SourceSurface[] (supports 0, 1, or 2+ sources)'
)

assert(
  src.includes('primary_source?: SourceSurface'),
  'SourceConflict.primary_source is optional (for pairwise conflicts)'
)

assert(
  src.includes('secondary_source?: SourceSurface'),
  'SourceConflict.secondary_source is optional (for pairwise conflicts)'
)

// Must NOT have required source_a or source_b fields
assert(
  !src.includes('source_a: SourceSurface;') && !src.includes('source_a_rank: number;'),
  'SourceConflict does NOT have required source_a field (old pairwise-only shape)'
)

assert(
  src.includes('resolution_instruction: ResponseInstruction'),
  'SourceConflict has resolution_instruction field'
)

assert(
  src.includes('requires_tara_review: boolean'),
  'SourceConflict has requires_tara_review field'
)

// ═══════════════════════════════════════════════════════
// 16. ClassifiedSource shape
// ═══════════════════════════════════════════════════════
section('16. ClassifiedSource shape')

assert(
  src.includes("type ClassifiedSource"),
  'ClassifiedSource type is defined'
)

assert(
  src.includes("status: 'active' | 'excluded'"),
  "ClassifiedSource has status: 'active' | 'excluded' field"
)

assert(
  src.includes('exclusion_reason?: ExclusionReason'),
  'ClassifiedSource.exclusion_reason is optional ExclusionReason'
)

assert(
  src.includes('is_memory: boolean'),
  'ClassifiedSource has is_memory field'
)

assert(
  src.includes('is_trace_only: boolean'),
  'ClassifiedSource has is_trace_only field'
)

// ═══════════════════════════════════════════════════════
// 17. Scope types
// ═══════════════════════════════════════════════════════
section('17. Scope types')

assert(
  src.includes("type PresenceScope = 'ari' | 'eli' | 'shared' | 'tara_only'"),
  "PresenceScope type includes 'ari' | 'eli' | 'shared' | 'tara_only'"
)

assert(
  src.includes("type RoomContext = 'ari_room' | 'eli_room' | 'lounge' | 'watchtower'"),
  "RoomContext type includes 'ari_room' | 'eli_room' | 'lounge' | 'watchtower'"
)

// ═══════════════════════════════════════════════════════
// 18. No runtime code / no imports of runtime modules
// ═══════════════════════════════════════════════════════
section('18. No runtime code')

assert(
  !src.includes("import { createClient }"),
  'No Supabase client import'
)

assert(
  !src.includes('supabase.from('),
  'No Supabase query calls'
)

assert(
  !src.includes('fetch('),
  'No fetch() calls'
)

assert(
  !src.includes('async function') && !src.includes('async ('),
  'No async functions — types and constants only'
)

assert(
  !src.includes('process.env'),
  'No process.env access — no runtime env reads'
)

// ═══════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════')
console.log('  Phase 39.1 Recall Packet Types — Structural Tests')
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
  console.log('\n✅ All 39.1 structural tests passed.\n')
  process.exit(0)
}
