/**
 * Phase 38.1 — Deterministic Reasoning Baseline Tests
 *
 * Run: npx tsx src/lib/graph/__tests__/reasoningBaseline.test.ts
 *
 * No Supabase calls, no data writes, no mutations.
 * Pure function testing on mock hydrated DTOs.
 */

import * as fs from 'fs'
import * as path from 'path'

import {
  checkPacketSufficiency,
  computeReasoningCategories,
  computeEvidenceCondition,
  buildReasoningBaseline,
} from '../reasoningBaseline'

import type { HydratedGraphCandidateSuggestion, HydratedArchiveSource } from '../candidateSuggestionTypes'
import type { ReasoningCategory } from '../reasoningTypes'
import { REASONING_CATEGORIES, REASONING_CATEGORY_LABELS, EVIDENCE_CONDITIONS, EVIDENCE_CONDITION_LABELS } from '../reasoningTypes'

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

// ─── Mock Builders ─────────────────────────────────────────────────────────

function makeSource(overrides: Partial<HydratedArchiveSource> = {}): HydratedArchiveSource {
  return {
    archiveItemId: 'src-1',
    title: 'Test Source',
    canonicalStatusSnapshot: 'canonical',
    currentCanonicalStatus: 'canonical',
    statusChanged: false,
    evidenceRole: 'confirmed_memory_evidence',
    evidenceRoleLabel: 'Confirmed Memory evidence',
    evidenceRoleExplanation: '',
    usedForWeighting: true,
    weightingExplanation: '',
    missing: false,
    ...overrides,
  }
}

function makeHydrated(overrides: Partial<HydratedGraphCandidateSuggestion> = {}): HydratedGraphCandidateSuggestion {
  return {
    suggestion: {
      id: 'sug-1',
      candidate_type: 'memory_candidate',
      status: 'pending_review',
      proposed_label: 'Test',
      proposed_summary: null,
      proposed_truth_text: null,
      target_presence_id: null,
      target_archive_item_id: 'target-1',
      supporting_graph_node_ids: [],
      supporting_graph_edge_ids: [],
      supporting_proposal_ids: [],
      supporting_archive_sources: [],
      deduplicated_evidence_sources: ['src-1'],
      evidence_strength: 'moderate',
      reason_for_candidate: 'Test reason',
      limits_or_uncertainties: null,
      governance_context: {},
      prompt_eligible: false,
      canonical_status_before: 'canonical',
      created_by: 'tara',
      reviewed_by: null,
      reviewed_at: null,
      deleted_at: null,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
    },
    targetArchiveItem: {
      id: 'target-1', title: 'Target Item', currentCanonicalStatus: 'canonical',
      statusAtSuggestion: 'canonical', statusChanged: false, missing: false,
    },
    hydratedArchiveSources: [makeSource()],
    hydratedProposals: [],
    hydratedLegacyNodes: [],
    hydratedLegacyEdges: [],
    hydratedDeduplicatedSources: [{ archiveItemId: 'src-1', title: 'Test Source', missing: false }],
    events: [],
    warnings: [],
    ...overrides,
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

section('Type completeness')

{
  assert(REASONING_CATEGORIES.length === 14, `14 reasoning categories defined (got ${REASONING_CATEGORIES.length})`)
  assert(EVIDENCE_CONDITIONS.length === 7, `7 evidence conditions defined (got ${EVIDENCE_CONDITIONS.length})`)

  // Every category has a label
  for (const cat of REASONING_CATEGORIES) {
    assert(typeof REASONING_CATEGORY_LABELS[cat] === 'string' && REASONING_CATEGORY_LABELS[cat].length > 0,
      `category "${cat}" has a label`)
  }
  for (const cond of EVIDENCE_CONDITIONS) {
    assert(typeof EVIDENCE_CONDITION_LABELS[cond] === 'string' && EVIDENCE_CONDITION_LABELS[cond].length > 0,
      `condition "${cond}" has a label`)
  }
}

section('Packet sufficiency — sufficient packet')

{
  const h = makeHydrated()
  const r = checkPacketSufficiency(h)
  assert(r.sufficient, 'well-formed memory candidate is sufficient')
  assert(r.reasons.length === 0, 'no insufficiency reasons')
}

section('Packet sufficiency — missing target')

{
  const h = makeHydrated({
    targetArchiveItem: { id: 'target-1', title: '(unavailable)', currentCanonicalStatus: null,
      statusAtSuggestion: 'canonical', statusChanged: false, missing: true },
  })
  const r = checkPacketSufficiency(h)
  assert(!r.sufficient, 'missing target makes packet insufficient')
  assert(r.reasons.some(r => r.includes('missing or deleted')), 'reason mentions missing target')
}

section('Packet sufficiency — no evidence at all')

{
  const h = makeHydrated({
    hydratedArchiveSources: [],
    hydratedProposals: [],
    hydratedLegacyNodes: [],
    hydratedLegacyEdges: [],
  })
  const r = checkPacketSufficiency(h)
  assert(!r.sufficient, 'zero evidence makes packet insufficient')
  assert(r.reasons.some(r => r.includes('neither archive nor graph')), 'reason mentions no evidence')
}

section('Packet sufficiency — all archive sources missing')

{
  const h = makeHydrated({
    hydratedArchiveSources: [makeSource({ missing: true })],
  })
  const r = checkPacketSufficiency(h)
  assert(!r.sufficient, 'all missing archive sources makes packet insufficient')
}

section('Packet sufficiency — graph only')

{
  const h = makeHydrated({
    hydratedArchiveSources: [],
    hydratedProposals: [{
      proposalId: 'p-1', label: 'Graph Prop', proposalType: 'node',
      nodeType: 'concept', edgeType: null, status: 'approved_graph',
      authorityStatus: 'archive_supported', summary: null, missing: false,
    }],
  })
  const r = checkPacketSufficiency(h)
  assert(!r.sufficient, 'graph-only with no archive evidence is flagged insufficient')
  assert(r.reasons.some(r => r.includes('Graph support only')), 'reason mentions graph-only')
}

section('Packet sufficiency — held truth candidate missing fields')

{
  const h = makeHydrated()
  h.suggestion.candidate_type = 'held_truth_candidate'
  h.suggestion.target_archive_item_id = null
  h.suggestion.target_presence_id = null
  h.suggestion.proposed_truth_text = null
  const r = checkPacketSufficiency(h)
  assert(!r.sufficient, 'held truth candidate without presence/text is insufficient')
  assert(r.reasons.some(r => r.includes('no target presence')), 'mentions missing presence')
  assert(r.reasons.some(r => r.includes('no proposed truth text')), 'mentions missing truth text')
}

section('Deterministic categories — direct archive support')

{
  const h = makeHydrated()
  const cats = computeReasoningCategories(h)
  assert(cats.includes('direct_archive_support'), 'direct confirmed evidence → direct_archive_support')
  assert(cats.includes('prompt_ineligible_by_design'), 'always: prompt_ineligible_by_design')
  assert(cats.includes('non_authoritative_suggestion'), 'always: non_authoritative_suggestion')
  assert(cats.includes('review_required'), 'pending_review → review_required')
}

section('Deterministic categories — graph only')

{
  const h = makeHydrated({
    hydratedArchiveSources: [],
    hydratedProposals: [{
      proposalId: 'p-1', label: 'G', proposalType: 'node', nodeType: 'concept',
      edgeType: null, status: 'approved_graph', authorityStatus: null,
      summary: null, missing: false,
    }],
  })
  const cats = computeReasoningCategories(h)
  assert(cats.includes('graph_support_only'), 'graph-only evidence → graph_support_only')
  assert(cats.includes('missing_primary_evidence'), 'no weighted archive → missing_primary_evidence')
}

section('Deterministic categories — status drift')

{
  const h = makeHydrated({
    targetArchiveItem: {
      id: 'target-1', title: 'Target', currentCanonicalStatus: 'needs_review',
      statusAtSuggestion: 'canonical', statusChanged: true, missing: false,
    },
  })
  const cats = computeReasoningCategories(h)
  assert(cats.includes('status_changed_since_suggestion'), 'target drift → status_changed_since_suggestion')
}

section('Deterministic categories — source drift')

{
  const h = makeHydrated({
    hydratedArchiveSources: [makeSource({ statusChanged: true, currentCanonicalStatus: 'archive_only' })],
  })
  const cats = computeReasoningCategories(h)
  assert(cats.includes('status_changed_since_suggestion'), 'source drift → status_changed_since_suggestion')
}

section('Deterministic categories — dismissed')

{
  const h = makeHydrated()
  h.suggestion.status = 'dismissed'
  const cats = computeReasoningCategories(h)
  assert(cats.includes('dismissed_suggestion'), 'dismissed → dismissed_suggestion')
  assert(!cats.includes('review_required'), 'dismissed does not include review_required')
}

section('Deterministic categories — missing evidence')

{
  const h = makeHydrated({
    hydratedArchiveSources: [makeSource({ missing: true })],
  })
  const cats = computeReasoningCategories(h)
  assert(cats.includes('deleted_or_missing_source'), 'missing source → deleted_or_missing_source')
}

section('Deterministic categories — mixed archive and graph')

{
  const h = makeHydrated({
    hydratedProposals: [{
      proposalId: 'p-1', label: 'G', proposalType: 'node', nodeType: 'concept',
      edgeType: null, status: 'approved_graph', authorityStatus: null,
      summary: null, missing: false,
    }],
  })
  const cats = computeReasoningCategories(h)
  assert(cats.includes('mixed_archive_and_graph'), 'archive + graph → mixed_archive_and_graph')
}

section('Evidence condition — directly supported')

{
  const h = makeHydrated()
  const cond = computeEvidenceCondition(h, true)
  assert(cond === 'directly_supported', 'direct confirmed evidence → directly_supported')
}

section('Evidence condition — graph only')

{
  const h = makeHydrated({
    hydratedArchiveSources: [],
    hydratedProposals: [{
      proposalId: 'p-1', label: 'G', proposalType: 'node', nodeType: 'concept',
      edgeType: null, status: 'approved_graph', authorityStatus: null,
      summary: null, missing: false,
    }],
  })
  const cond = computeEvidenceCondition(h, true)
  assert(cond === 'graph_supported_only', 'graph-only → graph_supported_only')
}

section('Evidence condition — status drift → conflicting')

{
  const h = makeHydrated({
    targetArchiveItem: {
      id: 'target-1', title: 'Target', currentCanonicalStatus: 'archive_only',
      statusAtSuggestion: 'canonical', statusChanged: true, missing: false,
    },
  })
  const cond = computeEvidenceCondition(h, true)
  assert(cond === 'conflicting_or_unresolved', 'status drift → conflicting_or_unresolved')
}

section('Evidence condition — insufficient packet')

{
  const cond = computeEvidenceCondition(makeHydrated(), false)
  assert(cond === 'insufficient', 'insufficient packet → insufficient condition')
}

section('Full baseline — integration')

{
  const h = makeHydrated()
  const b = buildReasoningBaseline(h)
  assert(b.packetSufficient, 'well-formed packet is sufficient')
  assert(b.evidenceCondition === 'directly_supported', 'correct evidence condition')
  assert(b.categories.includes('direct_archive_support'), 'has direct_archive_support')
  assert(b.categories.includes('review_required'), 'has review_required')
  assert(!b.hasStatusDrift, 'no status drift')
  assert(b.evidenceProfile.hasWeightedArchiveEvidence, 'has weighted evidence')
  assert(b.evidenceProfile.weightedArchiveSources === 1, 'one weighted source')
  assert(b.insufficiencyReasons.length === 0, 'no insufficiency reasons')
}

section('Full baseline — insufficient packet gets category')

{
  const h = makeHydrated({ hydratedArchiveSources: [], hydratedProposals: [], hydratedLegacyNodes: [], hydratedLegacyEdges: [] })
  const b = buildReasoningBaseline(h)
  assert(!b.packetSufficient, 'insufficient packet detected')
  assert(b.categories.includes('insufficient_packet'), 'insufficient_packet category added')
  assert(b.evidenceCondition === 'insufficient', 'evidence condition is insufficient')
  assert(b.insufficiencyReasons.length > 0, 'has insufficiency reasons')
}

section('Structural safety — no authority in reasoning modules')

{
  const baselinePath = path.resolve(__dirname, '../reasoningBaseline.ts')
  const content = fs.readFileSync(baselinePath, 'utf-8')

  assert(!content.includes('supabase'), 'reasoningBaseline does not import supabase')
  assert(!content.includes('.insert('), 'reasoningBaseline contains no .insert()')
  assert(!content.includes('.update('), 'reasoningBaseline contains no .update()')
  assert(!content.includes('.delete('), 'reasoningBaseline contains no .delete()')
  assert(!content.includes('archive-memory'), 'reasoningBaseline does not import archive-memory')
  assert(!content.includes('held-truths'), 'reasoningBaseline does not import held-truths')
  assert(!content.includes('memory-injection'), 'reasoningBaseline does not import memory-injection')
  assert(!content.includes('prompt_eligible: true'), 'reasoningBaseline never sets prompt_eligible true')
  assert(!content.includes('confirm_memory'), 'reasoningBaseline does not reference confirm_memory')
  assert(!content.includes('promoteToHeldTruth'), 'reasoningBaseline does not reference promoteToHeldTruth')

  const typesPath = path.resolve(__dirname, '../reasoningTypes.ts')
  const typesContent = fs.readFileSync(typesPath, 'utf-8')
  assert(!typesContent.includes('supabase'), 'reasoningTypes does not import supabase')
  // "not a score" is the anti-scoring comment — check for actual scoring patterns
  assert(!typesContent.includes('numeric_score'), 'reasoningTypes contains no numeric scoring')
  assert(!typesContent.includes('confidence_score'), 'reasoningTypes contains no confidence scoring')
  assert(!typesContent.includes('rank'), 'reasoningTypes contains no ranking')
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
