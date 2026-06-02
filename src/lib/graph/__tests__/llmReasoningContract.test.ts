/**
 * Phase 38.3.1 — LLM Reasoning Contract Tests
 *
 * Run: npx tsx src/lib/graph/__tests__/llmReasoningContract.test.ts
 *
 * No LLM call. No API route. No UI. No database. No Supabase. No writes.
 * No authority movement. Pure contract and validation tests.
 */

import * as fs from 'fs'
import * as path from 'path'

import {
  containsForbiddenLLMReasoningLanguage,
  assertNoExcludedLLMInputFields,
  canRunLLMReasoning,
  buildLLMReasoningInput,
  validateLLMReasoningInput,
  validateLLMReasoningDraft,
} from '../llmReasoningContract'

import {
  LLM_REASONING_MANDATORY_BOUNDARY_HEADER,
  LLM_REASONING_BASE_DO_NOT_CONCLUDE,
  LLM_REASONING_FORBIDDEN_PHRASES,
  LLM_INPUT_EXCLUDED_FIELD_PATTERNS,
  type LLMReasoningDraft,
} from '../llmReasoningTypes'

import { buildReasoningBaseline } from '../reasoningBaseline'
import type { HydratedGraphCandidateSuggestion, HydratedArchiveSource } from '../candidateSuggestionTypes'
import type { ReasoningBaseline } from '../reasoningTypes'

// ─── Harness ───────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}

function section(name: string) { console.log(`\n── ${name} ──`) }

// ─── Fixtures ──────────────────────────────────────────────────────────────

function makeSource(o: Partial<HydratedArchiveSource> = {}): HydratedArchiveSource {
  return {
    archiveItemId: 'src-1', title: 'Test Source',
    canonicalStatusSnapshot: 'canonical', currentCanonicalStatus: 'canonical',
    statusChanged: false, evidenceRole: 'confirmed_memory_evidence',
    evidenceRoleLabel: 'Confirmed Memory evidence', evidenceRoleExplanation: '',
    usedForWeighting: true, weightingExplanation: '', missing: false, ...o,
  }
}

function makeHydrated(o: Partial<HydratedGraphCandidateSuggestion> = {}): HydratedGraphCandidateSuggestion {
  return {
    suggestion: {
      id: 'sug-1', candidate_type: 'memory_candidate', status: 'pending_review',
      proposed_label: 'Test Label', proposed_summary: 'Summary',
      proposed_truth_text: null, target_presence_id: null,
      target_archive_item_id: 'target-1', supporting_graph_node_ids: [],
      supporting_graph_edge_ids: [], supporting_proposal_ids: [],
      supporting_archive_sources: [], deduplicated_evidence_sources: ['src-1'],
      evidence_strength: 'moderate', reason_for_candidate: 'Test reason',
      limits_or_uncertainties: null, governance_context: {}, prompt_eligible: false,
      canonical_status_before: 'canonical', created_by: 'tara',
      reviewed_by: null, reviewed_at: null, deleted_at: null,
      created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z',
    },
    targetArchiveItem: {
      id: 'target-1', title: 'Target Item', currentCanonicalStatus: 'canonical',
      statusAtSuggestion: 'canonical', statusChanged: false, missing: false,
    },
    hydratedArchiveSources: [makeSource()],
    hydratedProposals: [], hydratedLegacyNodes: [], hydratedLegacyEdges: [],
    hydratedDeduplicatedSources: [{ archiveItemId: 'src-1', title: 'Test Source', missing: false }],
    events: [], warnings: [], ...o,
  }
}

function makeValidDraft(overrides: Partial<LLMReasoningDraft> = {}): LLMReasoningDraft {
  return {
    evidence_summary: 'Archive evidence partially supports the candidate.',
    directly_supported: [],
    graph_supported: [],
    inferred_only: [],
    missing_or_weak: ['Missing weighted evidence'],
    authority_boundary: LLM_REASONING_MANDATORY_BOUNDARY_HEADER,
    possible_review_route: null,
    do_not_conclude: [...LLM_REASONING_BASE_DO_NOT_CONCLUDE],
    uncertainty_note: null,
    ...overrides,
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

section('Constants completeness')

{
  assert(typeof LLM_REASONING_MANDATORY_BOUNDARY_HEADER === 'string' && LLM_REASONING_MANDATORY_BOUNDARY_HEADER.length > 0,
    'mandatory boundary header is non-empty')
  assert(LLM_REASONING_MANDATORY_BOUNDARY_HEADER.includes('Not Memory'),
    'boundary header mentions Not Memory')
  assert(LLM_REASONING_MANDATORY_BOUNDARY_HEADER.includes('Not Held Truth'),
    'boundary header mentions Not Held Truth')
  assert(LLM_REASONING_MANDATORY_BOUNDARY_HEADER.includes('Not prompt eligible'),
    'boundary header mentions Not prompt eligible')
  assert(LLM_REASONING_MANDATORY_BOUNDARY_HEADER.includes('Does not change authority'),
    'boundary header mentions Does not change authority')
  assert(LLM_REASONING_BASE_DO_NOT_CONCLUDE.length >= 5,
    '5+ base do-not-conclude items')
  assert(LLM_REASONING_FORBIDDEN_PHRASES.length >= 20,
    '20+ forbidden phrases defined')
  assert(LLM_INPUT_EXCLUDED_FIELD_PATTERNS.length >= 15,
    '15+ excluded field patterns defined')
}

section('Forbidden language detection')

{
  // Each forbidden phrase is detected
  for (const phrase of LLM_REASONING_FORBIDDEN_PHRASES) {
    const matches = containsForbiddenLLMReasoningLanguage(phrase)
    assert(matches.length > 0, `detects forbidden phrase: "${phrase}"`)
  }

  // Case insensitive
  assert(containsForbiddenLLMReasoningLanguage('APPROVE THIS candidate').length > 0,
    'case-insensitive detection works')

  // Safe text clears
  assert(containsForbiddenLLMReasoningLanguage('Archive evidence directly supports part of the claim').length === 0,
    'safe text passes without matches')

  // Empty string returns no matches
  assert(containsForbiddenLLMReasoningLanguage('').length === 0,
    'empty string returns no matches')
}

section('Excluded field guard')

{
  assert(assertNoExcludedLLMInputFields({ proposed_label: 'ok', candidate_type: 'memory_candidate' }).ok,
    'safe object passes field guard')

  // Each dangerous pattern is caught
  const dangerousObjects = [
    { raw_content: 'should be excluded' },
    { chat_history: [] },
    { system_prompt: 'injected' },
    { developer_prompt: 'injected' },
    { supabase: {} },
    { service_role: 'key' },
    { api_key: 'abc' },
    { confirm_memory: true },
    { promoteToHeldTruth: () => {} },
    { updateHeldTruthStatus: () => {} },
    { memory_injection: true },
    { prior_reasoning: 'last output' },
    { reasoning_output: 'stored text' },
  ]
  for (const obj of dangerousObjects) {
    const key = Object.keys(obj)[0]
    assert(!assertNoExcludedLLMInputFields(obj).ok, `rejects excluded field: "${key}"`)
  }

  // Nested exclusion
  assert(!assertNoExcludedLLMInputFields({ nested: { supabase: {} } }).ok,
    'rejects nested excluded field')

  // Allowed keys with "status" in them are not blocked
  assert(assertNoExcludedLLMInputFields({ currentCanonicalStatus: 'canonical', statusChanged: false }).ok,
    'allows statusChanged and currentCanonicalStatus (does not overblock)')
}

section('Deterministic pre-checks — canRunLLMReasoning')

{
  const h = makeHydrated()
  const b = buildReasoningBaseline(h)
  assert(canRunLLMReasoning(h, b).ok, 'valid hydrated + sufficient baseline passes')

  // Insufficient packet blocks
  const emptyH = makeHydrated({ hydratedArchiveSources: [], hydratedProposals: [], hydratedLegacyNodes: [], hydratedLegacyEdges: [] })
  const emptyB = buildReasoningBaseline(emptyH)
  const r1 = canRunLLMReasoning(emptyH, emptyB)
  assert(!r1.ok, 'insufficient packet blocks LLM reasoning')
  assert(r1.ok === false && r1.code === 'INSUFFICIENT_PACKET', 'correct failure code: INSUFFICIENT_PACKET')
  assert(r1.ok === false && r1.reason.includes('Insufficient evidence packet'), 'correct failure message')

  // Manually inject insufficient_packet category
  const fakeBaseline: ReasoningBaseline = {
    ...b, packetSufficient: false, categories: [...b.categories, 'insufficient_packet']
  }
  assert(!canRunLLMReasoning(h, fakeBaseline).ok, 'insufficient_packet category blocks LLM reasoning')

  // Invalid candidate_type
  const badTypeH = makeHydrated()
  badTypeH.suggestion = { ...badTypeH.suggestion, candidate_type: 'unknown_type' as any }
  assert(!canRunLLMReasoning(badTypeH, b).ok, 'invalid candidate_type fails pre-check')
  const r2 = canRunLLMReasoning(badTypeH, b)
  assert(r2.ok === false && r2.code === 'INVALID_CANDIDATE_TYPE', 'correct code for invalid type')

  // Unknown status
  const badStatusH = makeHydrated()
  badStatusH.suggestion = { ...badStatusH.suggestion, status: 'expired' as any }
  const r3 = canRunLLMReasoning(badStatusH, b)
  assert(!r3.ok, 'unknown status fails pre-check')
  assert(r3.ok === false && r3.code === 'UNKNOWN_SUGGESTION_STATUS', 'correct code for unknown status')
}

section('Allowed input builder — buildLLMReasoningInput')

{
  const h = makeHydrated()
  const b = buildReasoningBaseline(h)
  const result = buildLLMReasoningInput(h, b)
  assert(result.ok, 'builds input from valid hydrated + baseline')

  if (result.ok) {
    const input = result.value

    // Required fields present
    assert(input.suggestion.suggestion_id === 'sug-1', 'suggestion_id present')
    assert(input.suggestion.candidate_type === 'memory_candidate', 'candidate_type present')
    assert(input.suggestion.suggestion_status === 'pending_review', 'suggestion_status present')
    assert(input.candidateText.proposed_label === 'Test Label', 'proposed_label present')
    assert(input.candidateText.reason_for_candidate === 'Test reason', 'reason_for_candidate present')
    assert(input.archiveSources.length === 1, 'archive sources included')
    assert(input.archiveSources[0].title === 'Test Source', 'archive source title included')
    assert(input.archiveSources[0].evidenceRole === 'confirmed_memory_evidence', 'evidence role included')
    assert(input.baseline.packetSufficient === true, 'baseline packetSufficient included')
    assert(Array.isArray(input.baseline.categories), 'baseline categories included')
    assert(input.boundary.mandatoryBoundaryHeader === LLM_REASONING_MANDATORY_BOUNDARY_HEADER, 'boundary header included')
    assert(input.boundary.forbiddenLanguage.length > 0, 'forbidden language list included')
    assert(input.boundary.doNotConcludeItems.length >= 5, 'do-not-conclude items included')

    // Excluded fields structurally absent
    assert(!('raw_content' in (input as any)), 'raw_content absent from built input')
    assert(!('supabase' in (input as any)), 'supabase absent from built input')
    assert(!('chat_history' in (input as any)), 'chat_history absent from built input')
    assert(!('prior_reasoning' in (input as any)), 'prior_reasoning absent from built input')

    // Held Truth truth text excluded from Memory candidate
    assert(input.candidateText.proposed_truth_text === null, 'truth text null for memory_candidate')

    // possible_review_route not present in input
    assert(!('possible_review_route' in input), 'possible_review_route not in input (belongs only in draft)')
  }

  // Insufficient packet blocks build
  const emptyH = makeHydrated({ hydratedArchiveSources: [], hydratedProposals: [], hydratedLegacyNodes: [], hydratedLegacyEdges: [] })
  const emptyB = buildReasoningBaseline(emptyH)
  const badResult = buildLLMReasoningInput(emptyH, emptyB)
  assert(!badResult.ok, 'insufficient packet blocks buildLLMReasoningInput')
  assert(badResult.ok === false && badResult.code === 'INSUFFICIENT_PACKET', 'correct code')
}

section('Input validator — validateLLMReasoningInput')

{
  const h = makeHydrated()
  const b = buildReasoningBaseline(h)
  const built = buildLLMReasoningInput(h, b)
  assert(built.ok, 'fixture builds successfully')
  if (built.ok) {
    const validation = validateLLMReasoningInput(built.value)
    assert(validation.ok, 'valid input passes validateLLMReasoningInput')
  }

  // Non-object fails
  assert(!validateLLMReasoningInput('string').ok, 'non-object input rejected')
  assert(!validateLLMReasoningInput(null).ok, 'null input rejected')
  assert(!validateLLMReasoningInput([]).ok, 'array input rejected')

  // Missing required key fails
  assert(!validateLLMReasoningInput({ suggestion: {}, candidateText: {}, archiveSources: [] }).ok,
    'input missing required keys rejected')

  // Excluded field rejected
  assert(!validateLLMReasoningInput({ suggestion: { suggestion_id: 'x', candidate_type: 'memory_candidate', suggestion_status: 'pending_review' }, candidateText: {}, archiveSources: [], graphEvidence: {}, baseline: { packetSufficient: true, categories: [] }, boundary: {}, supabase: {} }).ok,
    'input with excluded field (supabase) rejected')

  // Insufficient packet via validator
  const insufficientInput = { suggestion: { suggestion_id: 'x', candidate_type: 'memory_candidate', suggestion_status: 'pending_review' }, candidateText: {}, archiveSources: [], graphEvidence: {}, baseline: { packetSufficient: false, categories: [] }, boundary: {} }
  const r = validateLLMReasoningInput(insufficientInput)
  assert(!r.ok && r.code === 'INSUFFICIENT_PACKET', 'insufficient packet rejected in validator')
}

section('Output schema validation — validateLLMReasoningDraft')

{
  const h = makeHydrated()
  const b = buildReasoningBaseline(h)

  // Valid draft passes
  const validDraft = makeValidDraft()
  const r1 = validateLLMReasoningDraft(validDraft, b)
  assert(r1.ok, 'valid draft passes')

  // possible_review_route must be null
  const routeDraft = makeValidDraft({ possible_review_route: { route: 'memory_review', reason: 'x' } as any })
  const r2 = validateLLMReasoningDraft(routeDraft, b)
  assert(!r2.ok, 'non-null possible_review_route rejected')
  assert(r2.ok === false && r2.code === 'REVIEW_ROUTE_NOT_ALLOWED', 'correct code: REVIEW_ROUTE_NOT_ALLOWED')

  // Missing section
  const { evidence_summary, ...noSummary } = makeValidDraft()
  assert(!validateLLMReasoningDraft(noSummary, b).ok, 'missing evidence_summary rejected')

  const { authority_boundary, ...noAuthority } = makeValidDraft()
  assert(!validateLLMReasoningDraft(noAuthority, b).ok, 'missing authority_boundary rejected')

  const { do_not_conclude, ...noConc } = makeValidDraft()
  assert(!validateLLMReasoningDraft(noConc, b).ok, 'missing do_not_conclude rejected')

  // Missing mandatory header
  const badHeaderDraft = makeValidDraft({ authority_boundary: 'Some text without the required header' })
  assert(!validateLLMReasoningDraft(badHeaderDraft, b).ok, 'authority_boundary missing mandatory header rejected')

  // Missing base do-not-conclude item
  const missingConclude = makeValidDraft({ do_not_conclude: ['Do not conclude this is Memory.'] })
  assert(!validateLLMReasoningDraft(missingConclude, b).ok, 'draft missing base do-not-conclude items rejected')

  // Insufficient packet blocks even valid-schema draft
  const emptyH = makeHydrated({ hydratedArchiveSources: [], hydratedProposals: [], hydratedLegacyNodes: [], hydratedLegacyEdges: [] })
  const emptyB = buildReasoningBaseline(emptyH)
  assert(!validateLLMReasoningDraft(makeValidDraft(), emptyB).ok,
    'insufficient packet blocks draft validation')

  // Non-object
  assert(!validateLLMReasoningDraft('string', b).ok, 'non-object draft rejected')
  assert(!validateLLMReasoningDraft(null, b).ok, 'null draft rejected')
}

section('Forbidden language — draft rejection')

{
  const h = makeHydrated()
  const b = buildReasoningBaseline(h)

  const forbiddenTests: Array<[string, string]> = [
    ['Approve this candidate', 'Approve this'],
    ['Promote this to Memory', 'Promote this'],
    ['Make this Memory', 'Make this Memory'],
    ['Make this Held Truth immediately', 'Make this Held Truth'],
    ['This is true based on evidence', 'This is true'],
    ['This is confirmed by the archive', 'This is confirmed'],
    ['The graph confirms the relationship', 'The graph confirms'],
    ['The reasoning confirms the claim', 'The reasoning confirms'],
    ['Decision: archive candidate', 'Decision'],
    ['Verdict: should be promoted', 'Verdict'],
    ['AI Judgment: strong', 'AI Judgment'],
    ['Confidence Score: 85%', 'Confidence Score'],
  ]

  for (const [text, phrase] of forbiddenTests) {
    const draft = makeValidDraft({ evidence_summary: text })
    const r = validateLLMReasoningDraft(draft, b)
    assert(!r.ok && r.code === 'FORBIDDEN_LANGUAGE_DETECTED',
      `draft with "${phrase}" is rejected`)
  }
}

section('Route lock — possible_review_route must be null')

{
  const h = makeHydrated()
  const b = buildReasoningBaseline(h)

  // null passes
  assert(validateLLMReasoningDraft(makeValidDraft({ possible_review_route: null }), b).ok,
    'possible_review_route: null passes')

  // Any non-null value fails
  const nonNullValues = [
    { route: 'memory_review', reason: 'x' },
    'memory_review',
    { route: 'none' },
    false,
    0,
    [],
  ]
  for (const val of nonNullValues) {
    assert(!validateLLMReasoningDraft(makeValidDraft({ possible_review_route: val as any }), b).ok,
      `possible_review_route: ${JSON.stringify(val)} is rejected`)
  }
}

section('Structural safety — no authority in contract modules')

{
  const contractPath = path.resolve(__dirname, '../llmReasoningContract.ts')
  const content = fs.readFileSync(contractPath, 'utf-8')

  assert(!content.includes('supabase'), 'contract does not import supabase')
  assert(!content.includes('anthropic'), 'contract does not import anthropic')
  assert(!content.includes('openai'), 'contract does not import openai')
  assert(!content.includes('generateText'), 'contract does not call generateText')
  assert(!content.includes('fetch('), 'contract does not call fetch')
  assert(!content.includes('.insert('), 'contract has no .insert()')
  assert(!content.includes('.update('), 'contract has no .update()')
  assert(!content.includes('.delete('), 'contract has no .delete()')
  assert(!content.includes('archive-memory'), 'contract does not import archive-memory')
  assert(!content.includes('held-truths'), 'contract does not import held-truths')
  assert(!content.includes('memory-injection'), 'contract does not import memory-injection')
  assert(!content.includes('prompt_eligible: true'), 'contract never sets prompt_eligible true')
  assert(!content.includes('confirm_memory'), 'contract does not reference confirm_memory')
  assert(!content.includes('promoteToHeldTruth'), 'contract does not reference promoteToHeldTruth')
  // Enforcement is via REVIEW_ROUTE_NOT_ALLOWED failure code when route is non-null
  assert(content.includes('REVIEW_ROUTE_NOT_ALLOWED'), 'contract enforces null review route via REVIEW_ROUTE_NOT_ALLOWED code')

  const typesPath = path.resolve(__dirname, '../llmReasoningTypes.ts')
  const typesContent = fs.readFileSync(typesPath, 'utf-8')

  // 'supabase' legitimately appears in LLM_INPUT_EXCLUDED_FIELD_PATTERNS (blocked list).
  // Check for actual import statement, not just the word.
  assert(!typesContent.includes("import.*supabase") && !typesContent.match(/^import.+supabase/m),
    'types do not import supabase (word appears only in excluded-patterns list)')
  assert(typesContent.includes('possible_review_route: null'), 'types enforce null review route')
  assert(!typesContent.includes('numeric_score'), 'types have no numeric scoring')
  assert(!typesContent.includes('ranking'), 'types have no ranking')
}

section('38.1/38.2 regression — prior suites still intact')

{
  const baselinePath = path.resolve(__dirname, '../reasoningBaseline.ts')
  const content = fs.readFileSync(baselinePath, 'utf-8')
  assert(content.includes('buildReasoningBaseline'), 'reasoning baseline still exports buildReasoningBaseline')
  assert(!content.includes('supabase'), 'reasoning baseline still has no supabase')

  const typesPath = path.resolve(__dirname, '../candidateSuggestionTypes.ts')
  const typesContent = fs.readFileSync(typesPath, 'utf-8')
  assert(typesContent.includes('prompt_eligible: false'), 'candidate types still enforce prompt_eligible: false')
}

// ─── Summary ───────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
if (failures.length > 0) {
  console.log('\n  Failures:')
  for (const f of failures) console.log(`    ✗ ${f}`)
}
console.log('══════════════════════════════════════════\n')
process.exit(failed > 0 ? 1 : 0)
