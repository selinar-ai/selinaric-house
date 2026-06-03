/**
 * Phase 39.2 Structural + Logic Tests — Deterministic Recall Packet Builder
 *
 * Mix of:
 *   - Structural tests: file-content checks (purity, no side effects)
 *   - Logic tests: actual builder invocations verifying classification,
 *     scope gates, conflict detection, response instructions, sorting, summary
 *
 * Run: npx tsx src/lib/__tests__/phase-39-2-recall-packet-builder.test.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import { buildRecallPacket } from '../recall/recallPacketBuilder'
import {
  ConflictType,
  ExclusionReason,
  RecallPacketBuilderInput,
  ResponseInstruction,
  SourceSurface,
} from '../recall/recallPacketTypes'

// ─── test harness ────────────────────────────────────────────────────────────

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

// ─── input helper ────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<RecallPacketBuilderInput> = {}): RecallPacketBuilderInput {
  return {
    packet_id:        'test-packet',
    computed_at:      '2026-06-03T00:00:00Z',
    presence:         'ari',
    room:             'ari_room',
    candidate_sources: [],
    ...overrides,
  }
}

const BUILDER_PATH = 'src/lib/recall/recallPacketBuilder.ts'
const builderSrc = readFile(BUILDER_PATH)

// ═══════════════════════════════════════════════════════
// 1. Pure function safety — structural
// ═══════════════════════════════════════════════════════
section('1. Pure function safety (structural)')

assert(
  fs.existsSync(path.join(ROOT, BUILDER_PATH)),
  'recallPacketBuilder.ts exists'
)

assert(
  builderSrc.includes('export function buildRecallPacket'),
  'buildRecallPacket is exported'
)

// Purity checks — check for actual code-site usage patterns, not comment mentions.
// Comments in the file document what the builder doesn't do, so we use call-site
// patterns (parentheses, property-access dots, import paths) to distinguish
// documentation from code usage.
const forbiddenPatterns: Array<[string, string]> = [
  ['fetch(',            'fetch( call'],
  ['createClient',      'createClient call'],
  ['supabase.from(',    'supabase.from( call'],
  ['process.env.',      'process.env. property access'],
  ['Date.now()',        'Date.now() call'],
  ['crypto.randomUUID()', 'crypto.randomUUID() call'],
  ["from 'openai'",    "import from 'openai'"],
  ["from '@anthropic-ai", "import from '@anthropic-ai'"],
  ['localStorage.',     'localStorage. property access'],
  ['sessionStorage.',   'sessionStorage. property access'],
  ['window.',           'window. property access'],
  ['document.getElement', 'document.getElement DOM call'],
]

for (const [pattern, label] of forbiddenPatterns) {
  assert(
    !builderSrc.includes(pattern),
    `Builder does not contain ${label}`
  )
}

assert(
  !builderSrc.includes('async function') && !builderSrc.includes('async ('),
  'buildRecallPacket has no async functions — pure sync only'
)

assert(
  builderSrc.includes('EXCLUSION_PRIORITY'),
  'Builder declares EXCLUSION_PRIORITY constant'
)

assert(
  builderSrc.includes('TOPIC_SHIFT_SENSITIVE_SURFACES'),
  'Builder declares TOPIC_SHIFT_SENSITIVE_SURFACES constant'
)

assert(
  builderSrc.includes('CONFLICT_RESOLUTION_TABLE'),
  'Builder declares CONFLICT_RESOLUTION_TABLE constant'
)

assert(
  builderSrc.includes('graph_only_authority_risk'),
  'Builder contains graph_only_authority_risk conflict detection code'
)

assert(
  builderSrc.includes('trace_only_source_used_as_content'),
  'Builder contains trace_only_source_used_as_content bug-detection code'
)

// ═══════════════════════════════════════════════════════
// 2. Basic packet construction
// ═══════════════════════════════════════════════════════
section('2. Basic packet construction — confirmed Memory, ari_room')

{
  const packet = buildRecallPacket(makeInput({
    candidate_sources: [{
      surface:        SourceSurface.confirmed_archive_memory,
      presence_scope: 'shared',
      relevance:      'strong',
    }],
  }))

  assert(packet.active_sources.length === 1,  'active_sources has 1 entry')
  assert(packet.excluded_sources.length === 0, 'excluded_sources is empty')
  assert(
    packet.primary_response_instruction === ResponseInstruction.answer_confidently_from_confirmed_memory,
    'primary instruction: answer_confidently_from_confirmed_memory'
  )
  assert(packet.has_sufficient_ground === true, 'has_sufficient_ground is true')
  assert(packet.has_conflict === false,          'has_conflict is false')
  assert(packet.summary.memory_count === 1,      'summary.memory_count is 1')
  assert(packet.summary.active_count === 1,      'summary.active_count is 1')
  assert(packet.summary.excluded_count === 0,    'summary.excluded_count is 0')
  assert(
    packet.active_sources[0].is_memory === true,
    'classified source has is_memory true'
  )
}

// ═══════════════════════════════════════════════════════
// 3. Active / excluded separation — no candidate disappears
// ═══════════════════════════════════════════════════════
section('3. Active / excluded separation and completeness')

{
  const candidates = [
    { surface: SourceSurface.confirmed_archive_memory,    presence_scope: 'shared' as const, relevance: 'strong' as const },
    { surface: SourceSurface.reasoning_audit_trace },
    { surface: SourceSurface.archive_source_raw_material },
    { surface: SourceSurface.graph_candidate_suggestion },
  ]

  const packet = buildRecallPacket(makeInput({ candidate_sources: candidates }))

  assert(
    packet.active_sources.length + packet.excluded_sources.length === candidates.length,
    'total classified equals total candidates — no source disappears'
  )

  const activeSurfaces   = packet.active_sources.map(s => s.surface)
  const excludedSurfaces = packet.excluded_sources.map(s => s.surface)

  assert(
    activeSurfaces.includes(SourceSurface.confirmed_archive_memory),
    'confirmed_archive_memory is active'
  )
  assert(
    excludedSurfaces.includes(SourceSurface.reasoning_audit_trace),
    'reasoning_audit_trace is excluded'
  )
  assert(
    excludedSurfaces.includes(SourceSurface.archive_source_raw_material),
    'archive_source_raw_material is excluded'
  )
  assert(
    excludedSurfaces.includes(SourceSurface.graph_candidate_suggestion),
    'graph_candidate_suggestion is excluded'
  )

  const auditEntry = packet.excluded_sources.find(s => s.surface === SourceSurface.reasoning_audit_trace)
  assert(auditEntry?.exclusion_reason === ExclusionReason.trace_only, 'reasoning_audit_trace exclusion_reason: trace_only')

  const rawEntry = packet.excluded_sources.find(s => s.surface === SourceSurface.archive_source_raw_material)
  assert(rawEntry?.exclusion_reason === ExclusionReason.raw_source, 'archive_source_raw_material exclusion_reason: raw_source')

  const gcEntry = packet.excluded_sources.find(s => s.surface === SourceSurface.graph_candidate_suggestion)
  assert(gcEntry?.exclusion_reason === ExclusionReason.not_prompt_eligible, 'graph_candidate_suggestion exclusion_reason: not_prompt_eligible')

  assert(packet.summary.trace_count === 1, 'summary.trace_count: 1')
}

// ═══════════════════════════════════════════════════════
// 4. Scope gates
// ═══════════════════════════════════════════════════════
section('4. Scope gates')

// 4a — Eli-scoped journal in Ari room
{
  const packet = buildRecallPacket(makeInput({
    room:    'ari_room',
    presence: 'ari',
    candidate_sources: [{
      surface:        SourceSurface.journal_inner_continuity,
      presence_scope: 'eli',
      relevance:      'strong',
    }],
  }))

  const entry = packet.excluded_sources[0]
  assert(entry?.exclusion_reason === ExclusionReason.scope_prohibited,
    '4a: Eli journal in Ari room → scope_prohibited')
  assert(entry?.surface === SourceSurface.journal_inner_continuity,
    '4a: excluded surface is journal_inner_continuity')
}

// 4b — Private Ari journal in Lounge (lounge_allowed: false)
{
  const packet = buildRecallPacket(makeInput({
    room:    'lounge',
    presence: 'shared',
    candidate_sources: [{
      surface:        SourceSurface.journal_inner_continuity,
      presence_scope: 'ari',
      relevance:      'strong',
    }],
  }))

  const entry = packet.excluded_sources[0]
  assert(entry?.exclusion_reason === ExclusionReason.scope_prohibited,
    '4b: Ari journal in Lounge → scope_prohibited')
}

// 4c — Shared confirmed Memory in Lounge (allowed)
{
  const packet = buildRecallPacket(makeInput({
    room:    'lounge',
    presence: 'shared',
    candidate_sources: [{
      surface:        SourceSurface.confirmed_archive_memory,
      presence_scope: 'shared',
      relevance:      'strong',
    }],
  }))

  assert(packet.active_sources.length === 1,
    '4c: Shared confirmed Memory in Lounge → active')
}

// 4d — Ari-scoped source in Eli room
{
  const packet = buildRecallPacket(makeInput({
    room:    'eli_room',
    presence: 'eli',
    candidate_sources: [{
      surface:        SourceSurface.recent_continuity_not_memory,
      presence_scope: 'ari',
      relevance:      'strong',
    }],
  }))

  const entry = packet.excluded_sources[0]
  assert(entry?.exclusion_reason === ExclusionReason.scope_prohibited,
    '4d: Ari recent continuity in Eli room → scope_prohibited')
}

// ═══════════════════════════════════════════════════════
// 5. Tara-only gate
// ═══════════════════════════════════════════════════════
section('5. Tara-only gate')

{
  const packet = buildRecallPacket(makeInput({
    room:    'ari_room',
    presence: 'ari',
    candidate_sources: [{
      surface:        SourceSurface.tara_only_confirmed_memory,
      presence_scope: 'tara_only',
      relevance:      'strong',
    }],
  }))

  const entry = packet.excluded_sources[0]
  assert(entry?.exclusion_reason === ExclusionReason.tara_only,
    'tara_only_confirmed_memory in ari_room → tara_only')
  assert(packet.active_sources.length === 0,
    'No active sources after tara_only exclusion')
}

// ═══════════════════════════════════════════════════════
// 6. Expiry gate
// ═══════════════════════════════════════════════════════
section('6. Expiry gate')

{
  const packet = buildRecallPacket(makeInput({
    candidate_sources: [{
      surface:        SourceSurface.cross_room_prompt_carryforward,
      presence_scope: 'ari',
      expired:        true,
      relevance:      'strong',
    }],
  }))

  const entry = packet.excluded_sources[0]
  assert(entry?.exclusion_reason === ExclusionReason.expired,
    'cross_room_prompt_carryforward expired:true → expired')
}

// ═══════════════════════════════════════════════════════
// 7. Prompt eligibility gate
// ═══════════════════════════════════════════════════════
section('7. Prompt eligibility gate')

// 7a — Caller override: prompt_eligible: false on an otherwise-eligible surface
{
  const packet = buildRecallPacket(makeInput({
    candidate_sources: [{
      surface:         SourceSurface.confirmed_archive_memory,
      presence_scope:  'shared',
      prompt_eligible: false,
      relevance:       'strong',
    }],
  }))

  const entry = packet.excluded_sources[0]
  assert(entry?.exclusion_reason === ExclusionReason.not_prompt_eligible,
    '7a: confirmed_archive_memory with prompt_eligible:false → not_prompt_eligible')
}

// 7b — Registry policy: can_enter_prompt:false surface
{
  const packet = buildRecallPacket(makeInput({
    candidate_sources: [{
      surface:   SourceSurface.graph_candidate_suggestion,
      relevance: 'strong',
    }],
  }))

  const entry = packet.excluded_sources[0]
  assert(entry?.exclusion_reason === ExclusionReason.not_prompt_eligible,
    '7b: graph_candidate_suggestion (can_enter_prompt:false) → not_prompt_eligible')
}

// ═══════════════════════════════════════════════════════
// 8. Runtime builder v1 gate
// ═══════════════════════════════════════════════════════
section('8. Runtime builder v1 gate')

{
  const packet = buildRecallPacket(makeInput({
    candidate_sources: [{
      surface:   SourceSurface.graph_context,  // in_runtime_builder_v1: false
      relevance: 'strong',
    }],
  }))

  const entry = packet.excluded_sources[0]
  assert(entry?.exclusion_reason === ExclusionReason.not_in_runtime_builder,
    'graph_context (deferred) → not_in_runtime_builder')
}

// ═══════════════════════════════════════════════════════
// 9. Relevance gate
// ═══════════════════════════════════════════════════════
section('9. Relevance gate')

// 9a — relevance:none → excluded
{
  const packet = buildRecallPacket(makeInput({
    candidate_sources: [{
      surface:        SourceSurface.confirmed_archive_memory,
      presence_scope: 'shared',
      relevance:      'none',
    }],
  }))

  const entry = packet.excluded_sources[0]
  assert(entry?.exclusion_reason === ExclusionReason.relevance_too_weak,
    'confirmed_archive_memory relevance:none → relevance_too_weak')
  assert(packet.has_sufficient_ground === false, 'has_sufficient_ground false when only source is irrelevant')
}

// 9b — relevance:weak → active (v1 simpler model: weak passes if other gates pass)
{
  const packet = buildRecallPacket(makeInput({
    candidate_sources: [{
      surface:        SourceSurface.confirmed_archive_memory,
      presence_scope: 'shared',
      relevance:      'weak',
    }],
  }))

  assert(packet.active_sources.length === 1,
    'confirmed_archive_memory relevance:weak → active (v1 simpler model)')
}

// ═══════════════════════════════════════════════════════
// 10. Topic shift gate
// ═══════════════════════════════════════════════════════
section('10. Topic shift gate')

{
  const packet = buildRecallPacket(makeInput({
    query_context: { topic_shift_detected: true },
    candidate_sources: [
      {
        surface:        SourceSurface.short_horizon_thread_context,
        presence_scope: 'ari',
        relevance:      'strong',
      },
      {
        surface:        SourceSurface.recent_continuity_not_memory,
        presence_scope: 'ari',
        relevance:      'strong',
      },
    ],
  }))

  const excluded = packet.excluded_sources
  const threadEntry     = excluded.find(s => s.surface === SourceSurface.short_horizon_thread_context)
  const recentEntry     = excluded.find(s => s.surface === SourceSurface.recent_continuity_not_memory)

  assert(threadEntry?.exclusion_reason === ExclusionReason.topic_shift,
    'short_horizon_thread_context with topic_shift → topic_shift exclusion')
  assert(recentEntry?.exclusion_reason === ExclusionReason.topic_shift,
    'recent_continuity_not_memory with topic_shift → topic_shift exclusion')

  assert(packet.active_sources.length === 0, 'No active sources after topic shift')
  assert(
    packet.conflicts.some(c => c.conflict_type === ConflictType.topic_shift_relevance_failure),
    'topic_shift_relevance_failure conflict raised when topic-shift exclusions occurred'
  )
}

// 10b — Confirmed Memory is NOT excluded by topic shift
{
  const packet = buildRecallPacket(makeInput({
    query_context: { topic_shift_detected: true },
    candidate_sources: [{
      surface:        SourceSurface.confirmed_archive_memory,
      presence_scope: 'shared',
      relevance:      'strong',
    }],
  }))

  assert(packet.active_sources.length === 1,
    'confirmed_archive_memory not excluded by topic shift')
}

// ═══════════════════════════════════════════════════════
// 11. Ambiguous reference → ask_clarifying_question
// ═══════════════════════════════════════════════════════
section('11. Ambiguous reference')

// 11a — Multiple medium-relevance active sources + reference_ambiguous
{
  const packet = buildRecallPacket(makeInput({
    query_context: { reference_ambiguous: true },
    candidate_sources: [
      {
        surface:        SourceSurface.recent_continuity_not_memory,
        presence_scope: 'ari',
        relevance:      'medium',
      },
      {
        surface:        SourceSurface.library_rag_reference,
        presence_scope: 'shared',
        relevance:      'medium',
      },
    ],
  }))

  assert(
    packet.primary_response_instruction === ResponseInstruction.ask_clarifying_question,
    '11a: multiple active + reference_ambiguous → ask_clarifying_question'
  )
  assert(
    packet.conflicts.some(c => c.conflict_type === ConflictType.ambiguous_reference),
    '11a: ambiguous_reference conflict raised'
  )
}

// 11b — Single confirmed Memory + reference_ambiguous → no clarification needed
{
  const packet = buildRecallPacket(makeInput({
    query_context: { reference_ambiguous: true },
    candidate_sources: [{
      surface:        SourceSurface.confirmed_archive_memory,
      presence_scope: 'shared',
      relevance:      'strong',
    }],
  }))

  assert(
    packet.primary_response_instruction === ResponseInstruction.answer_confidently_from_confirmed_memory,
    '11b: single confirmed Memory + reference_ambiguous → answer_confidently (no clarification needed)'
  )
}

// ═══════════════════════════════════════════════════════
// 12. Authority sorting
// ═══════════════════════════════════════════════════════
section('12. Authority sorting')

{
  const packet = buildRecallPacket(makeInput({
    candidate_sources: [
      {
        surface:        SourceSurface.library_rag_reference,  // rank 15
        presence_scope: 'shared',
        relevance:      'strong',
      },
      {
        surface:        SourceSurface.recent_continuity_not_memory,  // rank 4
        presence_scope: 'ari',
        relevance:      'strong',
      },
      {
        surface:        SourceSurface.confirmed_archive_memory,  // rank 1
        presence_scope: 'shared',
        relevance:      'strong',
      },
    ],
  }))

  assert(packet.active_sources.length === 3, '12: all 3 sources are active')

  const [first, second, third] = packet.active_sources

  assert(
    first.surface === SourceSurface.confirmed_archive_memory,
    '12: confirmed_archive_memory sorts first (rank 1)'
  )
  assert(
    second.surface === SourceSurface.recent_continuity_not_memory,
    '12: recent_continuity_not_memory sorts second (rank 4)'
  )
  assert(
    third.surface === SourceSurface.library_rag_reference,
    '12: library_rag_reference sorts third (rank 15)'
  )
  assert(
    first.authority_rank < second.authority_rank &&
    second.authority_rank < third.authority_rank,
    '12: authority ranks strictly ascending in active_sources'
  )
  assert(
    packet.primary_response_instruction === ResponseInstruction.answer_confidently_from_confirmed_memory,
    '12: primary instruction from highest-authority source'
  )
}

// ═══════════════════════════════════════════════════════
// 13. Graph-only authority risk — code presence
// ═══════════════════════════════════════════════════════
section('13. Graph-only authority risk (structural + note)')

// In v1, graph_context has in_runtime_builder_v1:false, so it is always excluded.
// The conflict detection logic is implemented but won't trigger with standard v1 inputs.
// This test verifies the detection code exists and is wired to the correct conflict type.

assert(
  builderSrc.includes("ConflictType.graph_only_authority_risk"),
  'Builder references graph_only_authority_risk ConflictType in conflict detection'
)

assert(
  builderSrc.includes('AuthorityTier.Graph'),
  'Builder checks AuthorityTier.Graph when detecting graph-only risk'
)

assert(
  builderSrc.includes('hasActiveMemory'),
  'Builder checks hasActiveMemory to guard graph-only risk conflict'
)

// Confirm graph_context is excluded with not_in_runtime_builder (not active) in v1
{
  const packet = buildRecallPacket(makeInput({
    candidate_sources: [{
      surface:   SourceSurface.graph_context,
      relevance: 'strong',
    }],
  }))
  assert(
    packet.excluded_sources[0]?.exclusion_reason === ExclusionReason.not_in_runtime_builder,
    '13: graph_context excluded as not_in_runtime_builder in v1 — graph_only_authority_risk not triggered'
  )
}

// ═══════════════════════════════════════════════════════
// 14. Insufficient ground — empty candidate list
// ═══════════════════════════════════════════════════════
section('14. Insufficient ground (empty input)')

{
  const packet = buildRecallPacket(makeInput({ candidate_sources: [] }))

  assert(packet.has_sufficient_ground === false,
    '14: has_sufficient_ground false for empty input')
  assert(
    packet.primary_response_instruction === ResponseInstruction.say_not_enough_grounded_recall,
    '14: primary instruction say_not_enough_grounded_recall'
  )
  assert(packet.active_sources.length === 0,
    '14: no active sources')
  assert(packet.excluded_sources.length === 1,
    '14: synthetic insufficient source in excluded_sources')
  assert(
    packet.excluded_sources[0]?.surface === SourceSurface.insufficient,
    '14: synthetic source has surface: insufficient'
  )
  assert(
    packet.excluded_sources[0]?.exclusion_reason === ExclusionReason.insufficient_ground,
    '14: synthetic source exclusion_reason: insufficient_ground'
  )
  assert(
    packet.conflicts.some(c => c.conflict_type === ConflictType.insufficient_ground),
    '14: insufficient_ground conflict raised'
  )
  assert(packet.summary.total_surfaces_considered === 0,
    '14: total_surfaces_considered is 0 for empty input')
}

// ═══════════════════════════════════════════════════════
// 15. Caller-provided conflict metadata
// ═══════════════════════════════════════════════════════
section('15. Caller-provided conflict metadata')

{
  const packet = buildRecallPacket(makeInput({
    candidate_sources: [
      {
        surface:        SourceSurface.confirmed_archive_memory,
        presence_scope: 'shared',
        relevance:      'strong',
        conflict_types: [ConflictType.confirmed_memory_vs_held_truth],
        conflicts_with: [SourceSurface.held_truth_presence_continuity],
      },
      {
        surface:        SourceSurface.held_truth_presence_continuity,
        presence_scope: 'ari',
        relevance:      'strong',
      },
    ],
  }))

  assert(packet.active_sources.length === 2,
    '15: both Memory and held truth are active')

  const conflict = packet.conflicts.find(
    c => c.conflict_type === ConflictType.confirmed_memory_vs_held_truth
  )

  assert(conflict !== undefined,
    '15: confirmed_memory_vs_held_truth conflict created from caller metadata')
  assert(
    conflict?.resolution_instruction === ResponseInstruction.surface_source_conflict,
    '15: conflict resolution_instruction: surface_source_conflict'
  )
  assert(
    conflict?.requires_tara_review === true,
    '15: conflict requires_tara_review: true'
  )
  assert(
    conflict?.primary_source === SourceSurface.confirmed_archive_memory,
    '15: primary_source is confirmed_archive_memory'
  )
  assert(
    conflict?.secondary_source === SourceSurface.held_truth_presence_continuity,
    '15: secondary_source is held_truth_presence_continuity'
  )
  assert(
    packet.primary_response_instruction === ResponseInstruction.surface_source_conflict,
    '15: primary instruction escalated to surface_source_conflict when Tara-review conflict exists'
  )
}

// ═══════════════════════════════════════════════════════
// 16. Summary counts
// ═══════════════════════════════════════════════════════
section('16. Summary counts')

{
  const packet = buildRecallPacket(makeInput({
    candidate_sources: [
      {
        surface:        SourceSurface.confirmed_archive_memory,
        presence_scope: 'shared',
        relevance:      'strong',
      },
      {
        surface:        SourceSurface.recent_continuity_not_memory,
        presence_scope: 'ari',
        relevance:      'strong',
      },
      {
        surface:   SourceSurface.reasoning_audit_trace,  // excluded trace
      },
    ],
  }))

  assert(packet.summary.total_surfaces_considered === 3, 'summary.total_surfaces_considered: 3')
  assert(packet.summary.active_count === 2,              'summary.active_count: 2')
  assert(packet.summary.excluded_count === 1,            'summary.excluded_count: 1')
  assert(packet.summary.memory_count === 1,              'summary.memory_count: 1')
  assert(packet.summary.continuity_count === 1,          'summary.continuity_count: 1')
  assert(packet.summary.reference_count === 0,           'summary.reference_count: 0')
  assert(packet.summary.trace_count === 1,               'summary.trace_count: 1')

  // active + excluded === total
  assert(
    packet.summary.active_count + packet.summary.excluded_count === packet.summary.total_surfaces_considered,
    'summary: active_count + excluded_count === total_surfaces_considered'
  )
}

// ═══════════════════════════════════════════════════════
// 17. response_instructions array mirrors active sources
// ═══════════════════════════════════════════════════════
section('17. response_instructions array')

{
  const packet = buildRecallPacket(makeInput({
    candidate_sources: [
      {
        surface:        SourceSurface.confirmed_archive_memory,
        presence_scope: 'shared',
        relevance:      'strong',
      },
      {
        surface:        SourceSurface.recent_continuity_not_memory,
        presence_scope: 'ari',
        relevance:      'strong',
      },
    ],
  }))

  assert(
    packet.response_instructions.length === 2,
    'response_instructions has one entry per active source'
  )
  assert(
    packet.response_instructions[0].source_surface === SourceSurface.confirmed_archive_memory,
    'response_instructions[0] matches highest-authority active source'
  )
  assert(
    packet.response_instructions[0].authority_rank === 1,
    'response_instructions[0].authority_rank is 1 (confirmed_memory)'
  )
  assert(
    packet.response_instructions[0].authority_rank <= packet.response_instructions[1].authority_rank,
    'response_instructions is ordered by authority_rank ascending'
  )
}

// ═══════════════════════════════════════════════════════
// 18. Exclusion priority ordering
// ═══════════════════════════════════════════════════════
section('18. Exclusion priority ordering')

{
  // trace_only (priority 2) should sort before not_in_runtime_builder (priority 9)
  const packet = buildRecallPacket(makeInput({
    candidate_sources: [
      { surface: SourceSurface.graph_context },         // not_in_runtime_builder (9)
      { surface: SourceSurface.reasoning_audit_trace }, // trace_only (2)
    ],
  }))

  assert(packet.excluded_sources.length === 2, '18: both sources excluded')
  assert(
    packet.excluded_sources[0]?.exclusion_reason === ExclusionReason.trace_only,
    '18: trace_only exclusion sorts before not_in_runtime_builder'
  )
  assert(
    packet.excluded_sources[1]?.exclusion_reason === ExclusionReason.not_in_runtime_builder,
    '18: not_in_runtime_builder exclusion sorts after trace_only'
  )
}

// ═══════════════════════════════════════════════════════
// 19. Packet identity fields pass through
// ═══════════════════════════════════════════════════════
section('19. Packet identity fields pass through')

{
  const packet = buildRecallPacket(makeInput({
    packet_id:    'custom-packet-id-123',
    computed_at:  '2026-06-03T09:00:00Z',
    presence:     'eli',
    room:         'eli_room',
    candidate_sources: [],
  }))

  assert(packet.packet_id   === 'custom-packet-id-123', 'packet_id passes through')
  assert(packet.computed_at === '2026-06-03T09:00:00Z', 'computed_at passes through')
  assert(packet.presence    === 'eli',                   'presence passes through')
  assert(packet.room        === 'eli_room',              'room passes through')
}

// ═══════════════════════════════════════════════════════
// 20. Draft and raw-source gates use correct reasons
// ═══════════════════════════════════════════════════════
section('20. Draft and raw-source gates')

{
  const packet = buildRecallPacket(makeInput({
    candidate_sources: [
      { surface: SourceSurface.archive_entry_draft },
      { surface: SourceSurface.archive_source_raw_material },
    ],
  }))

  const draftEntry = packet.excluded_sources.find(s => s.surface === SourceSurface.archive_entry_draft)
  const rawEntry   = packet.excluded_sources.find(s => s.surface === SourceSurface.archive_source_raw_material)

  assert(draftEntry?.exclusion_reason === ExclusionReason.draft_source,
    'archive_entry_draft → draft_source')
  assert(rawEntry?.exclusion_reason === ExclusionReason.raw_source,
    'archive_source_raw_material → raw_source')
}

// ═══════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════')
console.log('  Phase 39.2 Recall Packet Builder Tests')
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
  console.log('\n✅ All 39.2 builder tests passed.\n')
  process.exit(0)
}
