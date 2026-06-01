/**
 * Phase 37H.3 — Evidence Display + Hydration Boundary Tests
 *
 * Run: npx tsx src/lib/graph/__tests__/candidateSuggestionDisplay.test.ts
 *
 * No Supabase calls, no data writes.
 * Tests display helpers, structural safety of hydration, and boundary checks.
 */

import * as fs from 'fs'
import * as path from 'path'

import {
  evidenceRoleLabel,
  evidenceRoleExplanation,
  weightingExplanation,
  makeStatusDriftWarning,
  makeTargetStatusDriftWarning,
  makeMissingEvidenceWarning,
  STANDING_WARNINGS,
} from '../candidateSuggestionDisplay'

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

// ─── Tests ─────────────────────────────────────────────────────────────────

section('Evidence role labels')

{
  assert(evidenceRoleLabel('confirmed_memory_evidence') === 'Confirmed Memory evidence',
    'confirmed_memory_evidence label correct')
  assert(evidenceRoleLabel('candidate_context') === 'Candidate context',
    'candidate_context label correct')
  assert(evidenceRoleLabel('archive_provenance') === 'Archive provenance',
    'archive_provenance label correct')
}

section('Evidence role explanations')

{
  const e1 = evidenceRoleExplanation('confirmed_memory_evidence')
  assert(e1.includes('canonical'), 'confirmed_memory_evidence explanation mentions canonical')
  assert(e1.includes('stronger evidence'), 'confirmed_memory_evidence explanation mentions stronger evidence')

  const e2 = evidenceRoleExplanation('candidate_context')
  assert(e2.includes('context only'), 'candidate_context explanation mentions context only')
  assert(e2.includes('not confirmed Memory'), 'candidate_context explanation mentions not confirmed Memory')

  const e3 = evidenceRoleExplanation('archive_provenance')
  assert(e3.includes('archive provenance'), 'archive_provenance explanation mentions provenance')
}

section('Weighting explanations')

{
  const w1 = weightingExplanation(true)
  assert(w1.includes('Weighted evidence'), 'weighted=true produces Weighted evidence')
  assert(w1.includes('contributes'), 'weighted=true explains contribution')

  const w2 = weightingExplanation(false)
  assert(w2.includes('Not weighted'), 'weighted=false produces Not weighted')
  assert(w2.includes('context'), 'weighted=false explains context role')
}

section('Warning generators')

{
  const w1 = makeStatusDriftWarning('Test Item', 'canonical', 'needs_review')
  assert(w1.code === 'source_status_changed', 'status drift warning has correct code')
  assert(w1.severity === 'warning', 'status drift warning has warning severity')
  assert(w1.message.includes('Test Item'), 'status drift includes label')
  assert(w1.message.includes('canonical'), 'status drift includes old status')
  assert(w1.message.includes('needs_review'), 'status drift includes new status')

  const w2 = makeTargetStatusDriftWarning('canonical', 'archive_only')
  assert(w2.code === 'target_status_changed', 'target drift warning has correct code')
  assert(w2.message.includes('Target archive item'), 'target drift mentions target')

  const w3 = makeMissingEvidenceWarning('archive item', 'abc-123')
  assert(w3.code === 'evidence_not_found', 'missing evidence warning has correct code')
  assert(w3.severity === 'warning', 'missing evidence has warning severity')
  assert(w3.message.includes('abc-123'), 'missing evidence includes ID')
  assert(w3.message.includes('could not be found'), 'missing evidence says not found')
}

section('Standing warnings')

{
  assert(STANDING_WARNINGS.length >= 2, 'at least 2 standing warnings')
  assert(STANDING_WARNINGS.some(w => w.code === 'suggestion_not_memory'), 'standing: not memory')
  assert(STANDING_WARNINGS.some(w => w.code === 'suggestion_not_prompt_eligible'), 'standing: not prompt eligible')
  assert(STANDING_WARNINGS.every(w => w.severity === 'info'), 'standing warnings are info severity')
}

section('Hydration function — structural safety')

{
  const servicePath = path.resolve(__dirname, '../candidateSuggestionService.ts')
  const content = fs.readFileSync(servicePath, 'utf-8')

  // Extract hydrateCandidateSuggestion function body
  const hydrateStart = content.indexOf('export async function hydrateCandidateSuggestion')
  assert(hydrateStart !== -1, 'hydrateCandidateSuggestion function exists')

  const hydrateBody = content.slice(hydrateStart)

  // No writes in hydration
  assert(!hydrateBody.includes('.insert('), 'hydration contains no .insert()')
  assert(!hydrateBody.includes('.update('), 'hydration contains no .update()')
  assert(!hydrateBody.includes('.delete('), 'hydration contains no .delete()')

  // No forbidden table references in hydration
  assert(!hydrateBody.includes("'archive_memory_events'"), 'hydration does not reference archive_memory_events')
  assert(!hydrateBody.includes("'held_truths'"), 'hydration does not reference held_truths')
  assert(!hydrateBody.includes("'memory_injection_events'"), 'hydration does not reference memory_injection_events')
  assert(!hydrateBody.includes("'graph_proposal_events'"), 'hydration does not reference graph_proposal_events')

  // No Memory/HeldTruth imports in hydration context
  assert(!hydrateBody.includes('promoteToHeldTruth'), 'hydration does not reference promoteToHeldTruth')
  assert(!hydrateBody.includes('confirm_memory'), 'hydration does not reference confirm_memory')
  assert(!hydrateBody.includes('prompt_eligible: true'), 'hydration never sets prompt_eligible true')
}

section('Detail API route — GET-only')

{
  const routePath = path.resolve(__dirname, '../../../app/api/graph-candidate-suggestions/[id]/route.ts')
  const content = fs.readFileSync(routePath, 'utf-8')

  assert(content.includes('export async function GET'), 'detail route exports GET')
  assert(!content.includes('export async function POST'), 'detail route does not export POST')
  assert(!content.includes('export async function PATCH'), 'detail route does not export PATCH')
  assert(!content.includes('export async function PUT'), 'detail route does not export PUT')
  assert(!content.includes('export async function DELETE'), 'detail route does not export DELETE')
  assert(!content.includes('.insert('), 'detail route contains no .insert()')
  assert(!content.includes('.update('), 'detail route contains no .update()')
  assert(!content.includes('supabase'), 'detail route does not import supabase directly')
}

section('Hydrated DTO types — structural completeness')

{
  const typesPath = path.resolve(__dirname, '../candidateSuggestionTypes.ts')
  const content = fs.readFileSync(typesPath, 'utf-8')

  assert(content.includes('HydratedGraphCandidateSuggestion'), 'types contain HydratedGraphCandidateSuggestion')
  assert(content.includes('HydratedTargetArchiveItem'), 'types contain HydratedTargetArchiveItem')
  assert(content.includes('HydratedArchiveSource'), 'types contain HydratedArchiveSource')
  assert(content.includes('HydratedProposal'), 'types contain HydratedProposal')
  assert(content.includes('HydratedLegacyNode'), 'types contain HydratedLegacyNode')
  assert(content.includes('HydratedLegacyEdge'), 'types contain HydratedLegacyEdge')
  assert(content.includes('HydratedDeduplicatedSource'), 'types contain HydratedDeduplicatedSource')
  assert(content.includes('HydrationWarning'), 'types contain HydrationWarning')

  // Every hydrated type must have a 'missing' field for graceful degradation
  assert(content.includes('missing: boolean'), 'hydrated types include missing field for graceful degradation')
}

section('Display helper — no forbidden imports')

{
  const displayPath = path.resolve(__dirname, '../candidateSuggestionDisplay.ts')
  const content = fs.readFileSync(displayPath, 'utf-8')

  assert(!content.includes('supabase'), 'display helper does not import supabase')
  assert(!content.includes('.insert('), 'display helper contains no .insert()')
  assert(!content.includes('.update('), 'display helper contains no .update()')
  assert(!content.includes('archive-memory'), 'display helper does not import archive-memory')
  assert(!content.includes('held-truths'), 'display helper does not import held-truths')
  assert(!content.includes('memory-injection'), 'display helper does not import memory-injection')
}

section('UI detail panel — no approve/promote controls')

{
  const detailPath = path.resolve(__dirname, '../../../components/graph/GraphSuggestionDetail.tsx')
  const content = fs.readFileSync(detailPath, 'utf-8')

  // "Approved graph structure" is explanatory text, not a button. Check for approve action patterns.
  assert(!content.includes('Approve Suggestion'), 'detail panel has no Approve Suggestion button')
  assert(!content.includes('Approve as Memory'), 'detail panel has no Approve as Memory button')
  assert(!content.includes('Promote'), 'detail panel has no Promote button text')
  assert(!content.includes('confirm_memory'), 'detail panel does not reference confirm_memory')
  assert(!content.includes('promoteToHeldTruth'), 'detail panel does not reference promoteToHeldTruth')
  assert(content.includes('Dismiss Suggestion'), 'detail panel has Dismiss button')
  assert(content.includes('Not prompt eligible'), 'detail panel shows not prompt eligible')
  assert(content.includes('Not Memory'), 'detail panel shows Not Memory')
  assert(content.includes('Not Held Truth'), 'detail panel shows Not Held Truth')
}

section('37H.1 + 37H.2 regression — existing tests still structurally valid')

{
  // Verify 37H.1 validation types still intact
  const typesPath = path.resolve(__dirname, '../candidateSuggestionTypes.ts')
  const content = fs.readFileSync(typesPath, 'utf-8')
  assert(content.includes('prompt_eligible: false'), 'types still enforce prompt_eligible literal false')
  assert(content.includes('CANDIDATE_TYPES'), 'types still export CANDIDATE_TYPES')
  assert(content.includes('EVIDENCE_ROLES'), 'types still export EVIDENCE_ROLES')

  // Verify service still has create + list + dismiss
  const servicePath = path.resolve(__dirname, '../candidateSuggestionService.ts')
  const sContent = fs.readFileSync(servicePath, 'utf-8')
  assert(sContent.includes('createCandidateSuggestion'), 'service still exports createCandidateSuggestion')
  assert(sContent.includes('listCandidateSuggestions'), 'service still exports listCandidateSuggestions')
  assert(sContent.includes('dismissCandidateSuggestion'), 'service still exports dismissCandidateSuggestion')
  assert(sContent.includes('hydrateCandidateSuggestion'), 'service exports hydrateCandidateSuggestion')
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
