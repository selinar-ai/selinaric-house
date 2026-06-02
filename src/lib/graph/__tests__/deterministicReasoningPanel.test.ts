/**
 * Phase 38.2 — Deterministic Reasoning Panel Tests
 *
 * Run: npx tsx src/lib/graph/__tests__/deterministicReasoningPanel.test.ts
 *
 * No Supabase calls, no data writes, no mutations.
 * Structural and boundary tests for the panel component and reasoning integration.
 */

import * as fs from 'fs'
import * as path from 'path'

import { buildReasoningBaseline } from '../reasoningBaseline'
import { EVIDENCE_CONDITION_LABELS, REASONING_CATEGORY_LABELS } from '../reasoningTypes'
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

// ─── Mock helpers ──────────────────────────────────────────────────────────

function makeSource(overrides: Partial<HydratedArchiveSource> = {}): HydratedArchiveSource {
  return {
    archiveItemId: 'src-1', title: 'Test Source',
    canonicalStatusSnapshot: 'canonical', currentCanonicalStatus: 'canonical',
    statusChanged: false, evidenceRole: 'confirmed_memory_evidence',
    evidenceRoleLabel: 'Confirmed Memory evidence', evidenceRoleExplanation: '',
    usedForWeighting: true, weightingExplanation: '', missing: false, ...overrides,
  }
}

function makeHydrated(overrides: Partial<HydratedGraphCandidateSuggestion> = {}): HydratedGraphCandidateSuggestion {
  return {
    suggestion: {
      id: 'sug-1', candidate_type: 'memory_candidate', status: 'pending_review',
      proposed_label: 'Test', proposed_summary: null, proposed_truth_text: null,
      target_presence_id: null, target_archive_item_id: 'target-1',
      supporting_graph_node_ids: [], supporting_graph_edge_ids: [],
      supporting_proposal_ids: [], supporting_archive_sources: [],
      deduplicated_evidence_sources: ['src-1'], evidence_strength: 'moderate',
      reason_for_candidate: 'Test reason', limits_or_uncertainties: null,
      governance_context: {}, prompt_eligible: false, canonical_status_before: 'canonical',
      created_by: 'tara', reviewed_by: null, reviewed_at: null,
      deleted_at: null, created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z',
    },
    targetArchiveItem: {
      id: 'target-1', title: 'Target Item', currentCanonicalStatus: 'canonical',
      statusAtSuggestion: 'canonical', statusChanged: false, missing: false,
    },
    hydratedArchiveSources: [makeSource()],
    hydratedProposals: [], hydratedLegacyNodes: [], hydratedLegacyEdges: [],
    hydratedDeduplicatedSources: [{ archiveItemId: 'src-1', title: 'Test Source', missing: false }],
    events: [], warnings: [], ...overrides,
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

section('Panel component — structural safety')

{
  const panelPath = path.resolve(__dirname, '../../../components/graph/DeterministicReasoningPanel.tsx')
  const content = fs.readFileSync(panelPath, 'utf-8')

  // Mandatory boundary header text present
  assert(content.includes('Reasoning aid only. Not Memory. Not Held Truth. Not prompt eligible.'),
    'panel contains mandatory boundary header text')
  assert(content.includes('Review required before authority changes.'),
    'panel contains review required notice')

  // Panel title
  assert(content.includes('Deterministic Reasoning'), 'panel has Deterministic Reasoning title')
  assert(content.includes('Evidence condition and boundary checks from structured data only'),
    'panel has appropriate subtitle')

  // Calls buildReasoningBaseline — not reimplementing logic
  assert(content.includes('buildReasoningBaseline'), 'panel imports and calls buildReasoningBaseline')
  assert(!content.includes('checkPacketSufficiency'), 'panel does not reimplement sufficiency check')
  assert(!content.includes('computeReasoningCategories'), 'panel does not reimplement category logic')

  // No authority imports
  assert(!content.includes('archive-memory'), 'panel does not import archive-memory')
  assert(!content.includes('held-truths'), 'panel does not import held-truths')
  assert(!content.includes('memory-injection'), 'panel does not import memory-injection')
  assert(!content.includes('supabase'), 'panel does not import supabase')

  // No writes
  assert(!content.includes('.insert('), 'panel contains no .insert()')
  assert(!content.includes('.update('), 'panel contains no .update()')
  assert(!content.includes('.delete('), 'panel contains no .delete()')

  // No authority language
  assert(!content.includes('Approve this'), 'panel has no Approve this')
  assert(!content.includes('Promote this'), 'panel has no Promote this')
  assert(!content.includes('Make this Memory'), 'panel has no Make this Memory')
  assert(!content.includes('Make this Held Truth'), 'panel has no Make this Held Truth')
  assert(!content.includes('Confidence Score'), 'panel has no Confidence Score')
  assert(!content.includes('Verdict'), 'panel has no Verdict label')
  assert(!content.includes('AI Judgment'), 'panel has no AI Judgment')
  assert(!content.includes('Approval Recommendation'), 'panel has no Approval Recommendation')

  // No scoring
  assert(!content.includes('numeric_score'), 'panel has no numeric scoring')
  assert(!content.includes('percentage'), 'panel has no percentage')
  assert(!content.includes('confidence_score'), 'panel has no confidence score')

  // No LLM
  assert(!content.includes('anthropic'), 'panel has no anthropic import')
  assert(!content.includes('openai'), 'panel has no openai import')
  assert(!content.includes('generateText'), 'panel has no LLM text generation')
}

section('Panel renders correct content — well-formed packet')

{
  const h = makeHydrated()
  const baseline = buildReasoningBaseline(h)

  assert(baseline.packetSufficient, 'baseline: well-formed packet is sufficient')
  assert(baseline.evidenceCondition === 'directly_supported', 'baseline: directly_supported condition')
  assert(EVIDENCE_CONDITION_LABELS[baseline.evidenceCondition] === 'Directly supported',
    'evidence condition label is "Directly supported"')
  assert(baseline.categories.includes('direct_archive_support'),
    'baseline has direct_archive_support category')
  assert(!baseline.categories.includes('insufficient_packet'),
    'baseline does not have insufficient_packet')
  assert(!baseline.hasStatusDrift, 'baseline has no status drift')
  assert(baseline.evidenceProfile.weightedArchiveSources === 1, 'one weighted archive source')
}

section('Insufficient packet — wording and stop behaviour')

{
  const h = makeHydrated({ hydratedArchiveSources: [], hydratedProposals: [], hydratedLegacyNodes: [], hydratedLegacyEdges: [] })
  const baseline = buildReasoningBaseline(h)

  assert(!baseline.packetSufficient, 'insufficient packet detected')
  assert(baseline.categories.includes('insufficient_packet'), 'insufficient_packet category present')
  assert(baseline.evidenceCondition === 'insufficient', 'evidence condition is insufficient')
  assert(baseline.insufficiencyReasons.length > 0, 'insufficiency reasons present')

  // The label text for the stop condition
  const label = REASONING_CATEGORY_LABELS['insufficient_packet']
  assert(label === 'Insufficient evidence packet — reasoning not available.',
    `insufficient_packet label reads correctly: "${label}"`)
}

section('Graph-only boundary warning')

{
  const h = makeHydrated({
    hydratedArchiveSources: [],
    hydratedProposals: [{
      proposalId: 'p-1', label: 'Graph Prop', proposalType: 'node',
      nodeType: 'concept', edgeType: null, status: 'approved_graph',
      authorityStatus: null, summary: null, missing: false,
    }],
  })
  const baseline = buildReasoningBaseline(h)

  assert(baseline.categories.includes('graph_support_only'), 'graph_support_only category present')
  assert(baseline.evidenceCondition === 'insufficient', 'graph-only insufficient packet → insufficient condition')

  const panelPath = path.resolve(__dirname, '../../../components/graph/DeterministicReasoningPanel.tsx')
  const content = fs.readFileSync(panelPath, 'utf-8')
  assert(content.includes('Graph-only support. Graph structure supports a relationship, not Memory or Held Truth authority.'),
    'panel contains graph-only boundary warning text')
}

section('Status drift warning')

{
  const h = makeHydrated({
    targetArchiveItem: {
      id: 'target-1', title: 'Target', currentCanonicalStatus: 'needs_review',
      statusAtSuggestion: 'canonical', statusChanged: true, missing: false,
    },
  })
  const baseline = buildReasoningBaseline(h)

  assert(baseline.hasStatusDrift, 'status drift detected')
  assert(baseline.categories.includes('status_changed_since_suggestion'),
    'status_changed_since_suggestion category present')
  assert(baseline.evidenceCondition === 'conflicting_or_unresolved',
    'evidence condition is conflicting_or_unresolved on drift')

  const panelPath = path.resolve(__dirname, '../../../components/graph/DeterministicReasoningPanel.tsx')
  const content = fs.readFileSync(panelPath, 'utf-8')
  assert(content.includes('Status changed since suggestion. Current governed status overrides suggestion-time status.'),
    'panel contains status drift warning text')
}

section('Do-not-conclude section present')

{
  const panelPath = path.resolve(__dirname, '../../../components/graph/DeterministicReasoningPanel.tsx')
  const content = fs.readFileSync(panelPath, 'utf-8')

  assert(content.includes('Do Not Conclude'), 'panel has Do Not Conclude section')
  assert(content.includes('Do not conclude this is Memory.'), 'do-not-conclude: not Memory')
  assert(content.includes('Do not conclude this is Held Truth.'), 'do-not-conclude: not Held Truth')
  assert(content.includes('Do not conclude this is prompt truth.'), 'do-not-conclude: not prompt truth')
  assert(content.includes('Do not conclude graph support is authority.'), 'do-not-conclude: graph authority')
  assert(content.includes('Do not conclude reasoning approval has occurred.'), 'do-not-conclude: no reasoning approval')
}

section('No mutation controls in panel')

{
  const panelPath = path.resolve(__dirname, '../../../components/graph/DeterministicReasoningPanel.tsx')
  const content = fs.readFileSync(panelPath, 'utf-8')

  // No interactive controls that would mutate state
  assert(!content.includes("onClick={() => approve"), 'no approve onClick handler')
  assert(!content.includes("onClick={() => promote"), 'no promote onClick handler')
  assert(!content.includes('confirm_memory'), 'no confirm_memory reference')
  assert(!content.includes('promoteToHeldTruth'), 'no promoteToHeldTruth reference')
  assert(!content.includes('prompt_eligible: true'), 'never sets prompt_eligible true')
}

section('GraphSuggestionDetail integration')

{
  const detailPath = path.resolve(__dirname, '../../../components/graph/GraphSuggestionDetail.tsx')
  const content = fs.readFileSync(detailPath, 'utf-8')

  assert(content.includes('DeterministicReasoningPanel'), 'detail panel imports DeterministicReasoningPanel')
  assert(content.includes('<DeterministicReasoningPanel hydrated={hydrated}'),
    'detail panel renders DeterministicReasoningPanel with hydrated prop')
}

section('38.1 regression — baseline module unchanged')

{
  const baselinePath = path.resolve(__dirname, '../reasoningBaseline.ts')
  const content = fs.readFileSync(baselinePath, 'utf-8')

  assert(content.includes('checkPacketSufficiency'), 'baseline still exports checkPacketSufficiency')
  assert(content.includes('computeReasoningCategories'), 'baseline still exports computeReasoningCategories')
  assert(content.includes('computeEvidenceCondition'), 'baseline still exports computeEvidenceCondition')
  assert(content.includes('buildReasoningBaseline'), 'baseline still exports buildReasoningBaseline')
  assert(!content.includes('supabase'), 'baseline still has no supabase')
  assert(!content.includes('.insert('), 'baseline still has no .insert()')
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
