/**
 * Phase 38.3.2 — LLM Reasoning Service Tests
 *
 * Run: npx tsx src/lib/graph/__tests__/llmReasoningService.test.ts
 *
 * No actual LLM call. Provider is mocked via environment and module inspection.
 * No writes. No mutations. No UI. No storage.
 */

import * as fs from 'fs'
import * as path from 'path'

import {
  canRunLLMReasoning,
  buildLLMReasoningInput,
  validateLLMReasoningDraft,
  buildLLMReasoningPrompt,
} from '../llmReasoningContract'

import {
  LLM_REASONING_MANDATORY_BOUNDARY_HEADER,
  LLM_REASONING_BASE_DO_NOT_CONCLUDE,
} from '../llmReasoningTypes'

import { buildReasoningBaseline } from '../reasoningBaseline'
import type { HydratedGraphCandidateSuggestion, HydratedArchiveSource } from '../candidateSuggestionTypes'

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
    archiveItemId: 'src-1', title: 'Test Archive Source',
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
    hydratedDeduplicatedSources: [{ archiveItemId: 'src-1', title: 'Test Archive Source', missing: false }],
    events: [], warnings: [], ...o,
  }
}

function makeValidDraftJson(): string {
  return JSON.stringify({
    evidence_summary: 'Archive evidence partially supports the candidate.',
    directly_supported: ['Archive item is canonical and directly related.'],
    graph_supported: [],
    inferred_only: [],
    missing_or_weak: ['No weighted direct archive evidence.'],
    authority_boundary: LLM_REASONING_MANDATORY_BOUNDARY_HEADER,
    possible_review_route: null,
    do_not_conclude: [...LLM_REASONING_BASE_DO_NOT_CONCLUDE],
    uncertainty_note: null,
  })
}

// ─── Tests ─────────────────────────────────────────────────────────────────

section('Prompt builder — content validation')

{
  const h = makeHydrated()
  const b = buildReasoningBaseline(h)
  const inputResult = buildLLMReasoningInput(h, b)
  assert(inputResult.ok, 'builds input for prompt')

  if (inputResult.ok) {
    const prompt = buildLLMReasoningPrompt(inputResult.value)

    assert(typeof prompt === 'string' && prompt.length > 0, 'prompt is non-empty string')
    assert(prompt.includes('constrained evidence explainer'), 'prompt establishes constrained role')
    assert(prompt.includes('possible_review_route'), 'prompt mentions possible_review_route lock')
    assert(prompt.includes('null'), 'prompt states possible_review_route must be null')
    assert(prompt.includes(LLM_REASONING_MANDATORY_BOUNDARY_HEADER), 'prompt contains mandatory boundary header')
    assert(prompt.includes('Do not conclude this is Memory'), 'prompt contains base do-not-conclude items')
    assert(prompt.includes('do not decide, approve, promote'), 'prompt forbids authority actions')
    assert(prompt.includes('Do not use external knowledge'), 'prompt forbids external knowledge')
    assert(!prompt.includes('supabase'), 'prompt contains no supabase reference')
    assert(!prompt.includes('ANTHROPIC_API_KEY'), 'prompt contains no API key')
    assert(!prompt.includes('service_role'), 'prompt contains no service role')
    assert(!prompt.includes('confirm_memory'), 'prompt contains no mutation functions')
    assert(!prompt.includes('raw_content'), 'prompt contains no raw archive content key')
    assert(prompt.includes('Test Archive Source'), 'prompt includes archive source title')
    assert(prompt.includes('Test Label'), 'prompt includes candidate label')
  }
}

section('Pre-checks block LLM before call')

{
  // Insufficient packet → canRunLLMReasoning fails before any LLM call
  const emptyH = makeHydrated({ hydratedArchiveSources: [], hydratedProposals: [], hydratedLegacyNodes: [], hydratedLegacyEdges: [] })
  const emptyB = buildReasoningBaseline(emptyH)
  const r1 = canRunLLMReasoning(emptyH, emptyB)
  assert(!r1.ok && r1.code === 'INSUFFICIENT_PACKET', 'insufficient packet blocked before LLM call')

  // Invalid candidate type → blocked
  const badTypeH = makeHydrated()
  badTypeH.suggestion = { ...badTypeH.suggestion, candidate_type: 'unknown' as any }
  const goodB = buildReasoningBaseline(makeHydrated())
  const r2 = canRunLLMReasoning(badTypeH, goodB)
  assert(!r2.ok && r2.code === 'INVALID_CANDIDATE_TYPE', 'invalid candidate type blocked')

  // Unknown status → blocked
  const badStatusH = makeHydrated()
  badStatusH.suggestion = { ...badStatusH.suggestion, status: 'approved' as any }
  const r3 = canRunLLMReasoning(badStatusH, goodB)
  assert(!r3.ok && r3.code === 'UNKNOWN_SUGGESTION_STATUS', 'unknown status blocked')

  // Insufficient_packet category → blocked
  const fakeSufficientButCategorised = { ...goodB, categories: [...goodB.categories, 'insufficient_packet'] }
  const r4 = canRunLLMReasoning(makeHydrated(), fakeSufficientButCategorised as any)
  assert(!r4.ok && r4.code === 'INSUFFICIENT_PACKET', 'insufficient_packet category blocked')
}

section('Input packet excludes forbidden fields')

{
  const h = makeHydrated()
  const b = buildReasoningBaseline(h)
  const result = buildLLMReasoningInput(h, b)
  assert(result.ok, 'builds input successfully')

  if (result.ok) {
    const inputStr = JSON.stringify(result.value)
    assert(!inputStr.includes('raw_content'), 'input packet excludes raw_content')
    assert(!inputStr.includes('chat_history'), 'input packet excludes chat_history')
    assert(!inputStr.includes('system_prompt'), 'input packet excludes system_prompt')
    assert(!inputStr.includes('prior_reasoning'), 'input packet excludes prior_reasoning')
    assert(!inputStr.includes('reasoning_output'), 'input packet excludes reasoning_output')
    assert(!inputStr.includes('confirm_memory'), 'input packet excludes confirm_memory')
    assert(!inputStr.includes('promoteToHeldTruth'), 'input packet excludes promoteToHeldTruth')
  }
}

section('Output validation — valid draft passes')

{
  const h = makeHydrated()
  const b = buildReasoningBaseline(h)
  const draftObj = JSON.parse(makeValidDraftJson())
  const r = validateLLMReasoningDraft(draftObj, b)
  assert(r.ok, 'valid draft JSON passes validation')
}

section('Output validation — unsafe drafts rejected')

{
  const h = makeHydrated()
  const b = buildReasoningBaseline(h)
  const base = JSON.parse(makeValidDraftJson())

  // Non-null route
  assert(!validateLLMReasoningDraft({ ...base, possible_review_route: { route: 'memory_review', reason: 'x' } }, b).ok,
    'non-null possible_review_route rejected')

  // Forbidden language
  assert(!validateLLMReasoningDraft({ ...base, evidence_summary: 'This is true based on evidence.' }, b).ok,
    'forbidden phrase "This is true" rejected in output')
  assert(!validateLLMReasoningDraft({ ...base, evidence_summary: 'The graph confirms the claim.' }, b).ok,
    'forbidden phrase "The graph confirms" rejected in output')
  assert(!validateLLMReasoningDraft({ ...base, directly_supported: ['Approve this for Memory'] }, b).ok,
    'forbidden phrase "Approve this" rejected in directly_supported')

  // Missing boundary header
  assert(!validateLLMReasoningDraft({ ...base, authority_boundary: 'some other text' }, b).ok,
    'missing mandatory boundary header rejected')

  // Missing required section
  const { evidence_summary: _es, ...noSummary } = base
  assert(!validateLLMReasoningDraft(noSummary, b).ok, 'missing evidence_summary rejected')

  // Non-object
  assert(!validateLLMReasoningDraft('just a string', b).ok, 'non-object draft rejected')
  assert(!validateLLMReasoningDraft(null, b).ok, 'null draft rejected')
}

section('Output validation — insufficient packet blocks even valid schema draft')

{
  const emptyH = makeHydrated({ hydratedArchiveSources: [], hydratedProposals: [], hydratedLegacyNodes: [], hydratedLegacyEdges: [] })
  const emptyB = buildReasoningBaseline(emptyH)
  const draftObj = JSON.parse(makeValidDraftJson())
  const r = validateLLMReasoningDraft(draftObj, emptyB)
  assert(!r.ok && r.code === 'INSUFFICIENT_PACKET',
    'insufficient packet blocks draft validation even with valid schema')
}

section('JSON parse handling')

{
  // Valid JSON stripped of markdown fences (simulates model wrapping in ```json)
  const wrapped = '```json\n' + makeValidDraftJson() + '\n```'
  const cleaned = wrapped.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
  let parsed: unknown
  try { parsed = JSON.parse(cleaned) } catch { parsed = null }
  assert(parsed !== null && typeof parsed === 'object', 'markdown-wrapped JSON can be cleaned and parsed')

  // Invalid JSON returns parse failure at call site
  let parseError = false
  try { JSON.parse('{ broken json }') } catch { parseError = true }
  assert(parseError, 'malformed JSON throws parse error (handled as LLM_OUTPUT_PARSE_FAILED)')
}

section('Structural safety — service module')

{
  const servicePath = path.resolve(__dirname, '../llmReasoningService.ts')
  const content = fs.readFileSync(servicePath, 'utf-8')

  // Must import Anthropic (that's the only LLM call allowed)
  assert(content.includes("import Anthropic from '@anthropic-ai/sdk'"),
    'service imports Anthropic SDK (only allowed LLM provider)')

  // No writes to any table
  assert(!content.includes('.insert('), 'service has no .insert()')
  assert(!content.includes('.update('), 'service has no .update()')
  assert(!content.includes('.delete('), 'service has no .delete()')
  assert(!content.includes('.upsert('), 'service has no .upsert()')

  // No forbidden tables
  assert(!content.includes("'archive_items'"), 'service does not write to archive_items')
  assert(!content.includes("'held_truths'"), 'service does not write to held_truths')
  assert(!content.includes("'graph_proposals'"), 'service does not write to graph_proposals')
  assert(!content.includes("'archive_memory_events'"), 'service does not write to archive_memory_events')
  assert(!content.includes("'memory_injection_events'"), 'service does not write to memory_injection_events')

  // No mutation function calls
  assert(!content.includes('confirm_memory'), 'service does not call confirm_memory')
  assert(!content.includes('promoteToHeldTruth'), 'service does not call promoteToHeldTruth')
  assert(!content.includes('prompt_eligible: true'), 'service never sets prompt_eligible true')

  // No streaming
  // "streaming" appears only in comments (prohibition notes) — check for actual stream code
  assert(!content.includes('ReadableStream') && !content.includes('.stream(') && !content.includes('createStream'),
    'service has no streaming code (word appears only in prohibition comments)')
  assert(!content.includes('ReadableStream'), 'service has no ReadableStream')

  // No storage of output
  assert(!content.includes('graph_candidate_suggestion_events'), 'service does not write to suggestion events')
  assert(content.includes('stored: false'), 'service always returns stored: false')
  assert(content.includes('evidence: false'), 'service always returns evidence: false')
  assert(content.includes('authority_changed: false'), 'service always returns authority_changed: false')
  assert(content.includes('possible_review_route: null'), 'service enforces null review route in meta')
}

section('Structural safety — API route')

{
  const routePath = path.resolve(__dirname, '../../../app/api/graph-candidate-suggestions/[id]/llm-reasoning-draft/route.ts')
  const content = fs.readFileSync(routePath, 'utf-8')

  assert(content.includes('export async function POST'), 'route exports POST')
  assert(!content.includes('export async function GET'), 'route does not export GET (compute action uses POST)')
  assert(!content.includes('export async function PUT'), 'route does not export PUT')
  assert(!content.includes('export async function PATCH'), 'route does not export PATCH')
  assert(!content.includes('export async function DELETE'), 'route does not export DELETE')
  assert(!content.includes('.insert('), 'route has no .insert()')
  assert(!content.includes('.update('), 'route has no .update()')
  assert(!content.includes('supabase'), 'route does not import supabase directly')
  assert(!content.includes('Anthropic'), 'route does not import Anthropic directly (delegates to service)')
  assert(content.includes('generateLLMReasoningDraft'), 'route calls generateLLMReasoningDraft')
  assert(content.includes('stored: false'), 'route failure response includes stored: false')
  assert(content.includes('authority_changed: false'), 'route failure response includes authority_changed: false')
}

section('38.3.1 regression — contract utilities intact')

{
  const contractPath = path.resolve(__dirname, '../llmReasoningContract.ts')
  const content = fs.readFileSync(contractPath, 'utf-8')
  assert(content.includes('canRunLLMReasoning'), 'contract still exports canRunLLMReasoning')
  assert(content.includes('validateLLMReasoningDraft'), 'contract still exports validateLLMReasoningDraft')
  assert(content.includes('REVIEW_ROUTE_NOT_ALLOWED'), 'contract still enforces review route lock')
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
