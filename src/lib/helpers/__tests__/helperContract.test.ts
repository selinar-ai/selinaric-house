/**
 * Phase 41.1 — Helper Contract Tests
 *
 * Run: npx tsx src/lib/helpers/__tests__/helperContract.test.ts
 *
 * No LLM call. No API route. No UI. No database. No Supabase. No writes.
 * No authority movement. Pure contract and validation tests.
 */

import {
  // vocab / classification
  type HelperType,
  type HelperOutputDraft,
  type HelperSourceSurface,
  ALL_HELPER_TYPES,
  classifyHelperAvailability,
  isHelperTypeAllowedInV1,
  isHelperTypeExcluded,
  // invariants
  assertHelperOutputInvariants,
  validateHelperOutputInvariants,
  // source surfaces
  HELPER_READABLE_SOURCE_SURFACES,
  HELPER_FORBIDDEN_SOURCE_SURFACES,
  isForbiddenSourceSurface,
  canHelperReadSource,
  // actions
  HELPER_FORBIDDEN_ACTIONS,
  isForbiddenSuggestedAction,
  // created_by
  isValidHelperCreatedBy,
  // anti-aggregation
  canHelperOutputBePromptVisible,
  canHelperOutputBeEvidence,
  canHelperReadHelperOutputAsInput,
  canBulkAcceptHelperOutputs,
  // validation / queueing
  validateHelperOutputDraft,
  canQueueHelperOutputForReview,
  // v1 library contract
  LIBRARY_METADATA_HELPER_CONTRACT,
} from '../helperContract'

// ─── Harness ───────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}

function section(name: string) { console.log(`\n── ${name} ──`) }

function threw(fn: () => unknown): boolean {
  try { fn(); return false } catch { return true }
}

// ─── Fixtures ──────────────────────────────────────────────────────────────

/** A valid v1 Library Metadata Helper draft. Overrides let tests break one thing. */
function makeDraft(overrides: Partial<HelperOutputDraft> = {}): HelperOutputDraft {
  return {
    helper_type: 'library_metadata_helper',
    source_refs: [{ source_surface: 'library_item', source_id: 'lib-1' }],
    presence_scope: 'house',
    output_status: 'draft_only',
    suggested_action: 'review_metadata',
    suggestion_payload: { note: 'missing summary' },
    confidence_label: 'structural',
    human_review_required: true,
    not_memory: true,
    not_evidence: true,
    prompt_eligible: false,
    authority_changed: false,
    review_routed: false,
    created_by: 'helper_contract',
    ...overrides,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// A. Allowed v1 helper
// ═════════════════════════════════════════════════════════════════════════════

section('A. Allowed v1 helper (library_metadata_helper)')
{
  assert(isHelperTypeAllowedInV1('library_metadata_helper'), 'library_metadata_helper is v1 allowed')
  assert(classifyHelperAvailability('library_metadata_helper') === 'v1_allowed', 'classified v1_allowed')
  assert(canHelperReadSource('library_metadata_helper', 'library_item'), 'can read library_item')
  assert(canHelperReadSource('library_metadata_helper', 'library_item_file'), 'can read library_item_file')
  assert(!canHelperReadSource('library_metadata_helper', 'helper_output'), 'cannot read helper_output')
  assert(!canHelperReadSource('library_metadata_helper', 'raw_chat_message'), 'cannot read raw_chat_message')
  assert(!canHelperReadSource('library_metadata_helper', 'lounge_message'), 'cannot read lounge_message')
  assert(!canHelperReadSource('library_metadata_helper', 'archive_item_metadata'), 'cannot read archive metadata (not on v1 allow-list)')
  assert(canHelperOutputBePromptVisible(makeDraft()) === false, 'cannot be prompt visible')
  assert(canHelperOutputBeEvidence(makeDraft()) === false, 'cannot be evidence')
}

// ═════════════════════════════════════════════════════════════════════════════
// B. Deferred helpers
// ═════════════════════════════════════════════════════════════════════════════

section('B. Deferred helpers')
{
  const deferred: HelperType[] = [
    'retrieval_gap_helper',
    'source_comparison_helper',
    'ontology_proposal_helper',
    'evaluation_case_helper',
    'build_workshop_preparation_helper',
    'housekeeping_stale_document_helper',
    'reasoning_readiness_checker',
  ]
  for (const h of deferred) {
    assert(!isHelperTypeAllowedInV1(h), `${h} is not v1 allowed`)
    assert(classifyHelperAvailability(h) === 'deferred', `${h} classified deferred`)
    // A deferred helper cannot be executed by the v1 read guard for any surface.
    assert(!canHelperReadSource(h, 'library_item'), `${h} cannot read library_item in v1`)
    // A deferred helper cannot produce a valid v1 draft.
    assert(!validateHelperOutputDraft(makeDraft({ helper_type: h })).valid, `${h} cannot produce a valid v1 draft`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// C. Excluded helpers
// ═════════════════════════════════════════════════════════════════════════════

section('C. Excluded helpers')
{
  assert(isHelperTypeExcluded('reasoning_evidence_helper'), 'reasoning_evidence_helper is excluded')
  assert(isHelperTypeExcluded('memory_candidate_preparation_helper'), 'memory_candidate_preparation_helper is excluded')
  assert(!isHelperTypeAllowedInV1('reasoning_evidence_helper'), 'reasoning_evidence_helper not v1 allowed')
  assert(!isHelperTypeAllowedInV1('memory_candidate_preparation_helper'), 'memory_candidate_preparation_helper not v1 allowed')

  // Excluded helpers cannot be executed by the v1 read guard.
  assert(!canHelperReadSource('reasoning_evidence_helper', 'library_item'), 'reasoning_evidence_helper cannot read anything in v1')
  assert(!canHelperReadSource('memory_candidate_preparation_helper', 'library_item'), 'memory_candidate_preparation_helper cannot read anything in v1')

  // Excluded helpers cannot produce a valid draft or queue review.
  assert(!validateHelperOutputDraft(makeDraft({ helper_type: 'reasoning_evidence_helper' })).valid, 'reasoning_evidence_helper draft rejected')
  assert(!canQueueHelperOutputForReview(makeDraft({ helper_type: 'reasoning_evidence_helper', output_status: 'queued_for_review' })), 'reasoning_evidence_helper cannot queue review')
  assert(!canQueueHelperOutputForReview(makeDraft({ helper_type: 'memory_candidate_preparation_helper', output_status: 'queued_for_review' })), 'memory_candidate_preparation_helper cannot queue review')
}

// ═════════════════════════════════════════════════════════════════════════════
// D. Invariant flags
// ═════════════════════════════════════════════════════════════════════════════

section('D. Invariant flags')
{
  assert(validateHelperOutputInvariants(makeDraft()).valid, 'valid draft passes invariants')
  assert(!threw(() => assertHelperOutputInvariants(makeDraft())), 'assert does not throw on valid draft')

  // Each broken flag must fail. Cast through unknown since the literal types forbid the bad value.
  const bad = (o: Partial<Record<string, unknown>>) =>
    validateHelperOutputInvariants({ ...makeDraft(), ...o } as unknown as HelperOutputDraft).valid
  assert(!bad({ not_memory: false }), 'not_memory:false fails')
  assert(!bad({ not_evidence: false }), 'not_evidence:false fails')
  assert(!bad({ prompt_eligible: true }), 'prompt_eligible:true fails')
  assert(!bad({ authority_changed: true }), 'authority_changed:true fails')
  assert(!bad({ human_review_required: false }), 'human_review_required:false fails')
  assert(threw(() => assertHelperOutputInvariants({ ...makeDraft(), prompt_eligible: true } as unknown as HelperOutputDraft)), 'assert throws on prompt_eligible:true')
}

// ═════════════════════════════════════════════════════════════════════════════
// E. Review-routed semantics
// ═════════════════════════════════════════════════════════════════════════════

section('E. Review-routed semantics')
{
  const queued = makeDraft({ output_status: 'queued_for_review', review_routed: true })
  assert(canQueueHelperOutputForReview(queued), 'valid queued output may be queued')
  assert(validateHelperOutputDraft(queued).valid, 'queued output is still valid')
  // review_routed = true changes nothing about authority.
  assert(queued.not_memory === true, 'queued output remains not_memory')
  assert(queued.not_evidence === true, 'queued output remains not_evidence')
  assert(queued.prompt_eligible === false, 'queued output remains not prompt_eligible')
  assert(queued.authority_changed === false, 'queued output does not change authority')
  assert(queued.human_review_required === true, 'queued output still requires human review')
  assert(canHelperOutputBePromptVisible(queued) === false, 'queued output is not prompt visible')
  assert(canHelperOutputBeEvidence(queued) === false, 'queued output is not evidence')
}

// ═════════════════════════════════════════════════════════════════════════════
// F. Anti-aggregation (C1–C7)
// ═════════════════════════════════════════════════════════════════════════════

section('F. Anti-aggregation controls')
{
  // C1 / C3 — no helper output as input; helper_output is a forbidden surface for all.
  assert(canHelperReadHelperOutputAsInput() === false, 'C1: helper cannot read helper output as input')
  for (const h of ALL_HELPER_TYPES) {
    assert(!canHelperReadSource(h, 'helper_output'), `C1: ${h} blocked from reading helper_output`)
  }
  // C6 — never evidence.
  assert(canHelperOutputBeEvidence(makeDraft()) === false, 'C6: helper output is never evidence')
  // C4 — no bulk accept-all.
  assert(canBulkAcceptHelperOutputs() === false, 'C4: bulk accept-all is disallowed')
  // C5 — self-citation impossible: helper_output cannot be a provenance surface.
  const selfCite = makeDraft({ source_refs: [{ source_surface: 'helper_output' as never, source_id: 'h-1' }] })
  assert(!validateHelperOutputDraft(selfCite).valid, 'C5: self-citation via helper_output provenance is rejected')
}

// ═════════════════════════════════════════════════════════════════════════════
// G. Forbidden actions
// ═════════════════════════════════════════════════════════════════════════════

section('G. Forbidden actions')
{
  const forbidden = [
    'promote_to_memory',
    'make_canonical',
    'approve_graph',
    'create_held_truth',
    'make_prompt_eligible',
    'inject_into_prompt',
    'submit_build',
    'commit_code',
    'auto_fix',
    'bulk_accept',
  ]
  for (const a of forbidden) {
    assert(isForbiddenSuggestedAction(a), `${a} is a forbidden action`)
    // A draft carrying a forbidden action (via cast) must be rejected.
    assert(!validateHelperOutputDraft(makeDraft({ suggested_action: a as never })).valid, `${a} draft rejected`)
  }
  assert(HELPER_FORBIDDEN_ACTIONS.length === forbidden.length, 'forbidden action list count matches')
}

// ═════════════════════════════════════════════════════════════════════════════
// H. Confidence labels
// ═════════════════════════════════════════════════════════════════════════════

section('H. Confidence labels (calibration only)')
{
  const high = makeDraft({ confidence_label: 'high' })
  const structural = makeDraft({ confidence_label: 'structural' })
  assert(validateHelperOutputDraft(high).valid, 'high-confidence draft is valid')
  // Confidence does not move any authority flag.
  assert(high.not_evidence === true, 'high confidence remains not_evidence')
  assert(high.prompt_eligible === false, 'high confidence remains not prompt_eligible')
  assert(high.authority_changed === false, 'high confidence does not change authority')
  assert(canHelperOutputBeEvidence(high) === false, 'high confidence is not evidence')
  assert(canHelperOutputBePromptVisible(high) === false, 'high confidence is not prompt visible')
  assert(structural.not_memory === true, 'structural confidence remains not_memory')
}

// ═════════════════════════════════════════════════════════════════════════════
// I. Source provenance
// ═════════════════════════════════════════════════════════════════════════════

section('I. Source provenance')
{
  // Provenance mandatory for a normal suggestion.
  assert(!validateHelperOutputDraft(makeDraft({ source_refs: [] })).valid, 'empty source_refs rejected for a normal suggestion')
  // Narrow safe exception: a no_action deterministic_check may have empty provenance.
  assert(validateHelperOutputDraft(makeDraft({ source_refs: [], suggested_action: 'no_action', output_status: 'deterministic_check' })).valid, 'no_action deterministic_check may have empty provenance')
  // helper-output-as-source rejected (C5).
  assert(!validateHelperOutputDraft(makeDraft({ source_refs: [{ source_surface: 'helper_output' as never, source_id: 'h-1' }] })).valid, 'helper_output provenance rejected')
  // A surface the helper may not read is rejected as provenance.
  assert(!validateHelperOutputDraft(makeDraft({ source_refs: [{ source_surface: 'archive_item_metadata' as never, source_id: 'a-1' }] })).valid, 'unreadable surface as provenance rejected')
  // Empty source_id rejected.
  assert(!validateHelperOutputDraft(makeDraft({ source_refs: [{ source_surface: 'library_item', source_id: '' }] })).valid, 'empty source_id rejected')
}

// ═════════════════════════════════════════════════════════════════════════════
// J. created_by closed union (Refinement 2)
// ═════════════════════════════════════════════════════════════════════════════

section('J. created_by closed union')
{
  for (const v of ['helper_contract', 'system_candidate', 'tara', 'test']) {
    assert(isValidHelperCreatedBy(v), `${v} is a valid created_by`)
  }
  assert(!isValidHelperCreatedBy('claude_code'), 'open string created_by rejected')
  assert(!validateHelperOutputDraft(makeDraft({ created_by: 'claude_code' as never })).valid, 'draft with open-string created_by rejected')
}

// ═════════════════════════════════════════════════════════════════════════════
// K. Source-surface partition integrity (Refinement 1)
// ═════════════════════════════════════════════════════════════════════════════

section('K. Source-surface partition integrity')
{
  // Readable and forbidden sets are disjoint.
  const overlap = HELPER_READABLE_SOURCE_SURFACES.filter((s) =>
    (HELPER_FORBIDDEN_SOURCE_SURFACES as readonly string[]).includes(s),
  )
  assert(overlap.length === 0, 'readable and forbidden surface sets are disjoint')
  // Every forbidden surface is reported forbidden and is unreadable by every helper.
  for (const s of HELPER_FORBIDDEN_SOURCE_SURFACES) {
    assert(isForbiddenSourceSurface(s as HelperSourceSurface), `${s} reported forbidden`)
    for (const h of ALL_HELPER_TYPES) {
      assert(!canHelperReadSource(h, s as HelperSourceSurface), `${s} unreadable by ${h}`)
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// L. v1 Library Metadata Helper contract
// ═════════════════════════════════════════════════════════════════════════════

section('L. v1 Library Metadata Helper contract')
{
  assert(LIBRARY_METADATA_HELPER_CONTRACT.helper_type === 'library_metadata_helper', 'contract helper_type correct')
  assert(LIBRARY_METADATA_HELPER_CONTRACT.availability === 'v1_allowed', 'contract availability v1_allowed')
  assert(LIBRARY_METADATA_HELPER_CONTRACT.readable_source_surfaces.length === 2, 'contract reads exactly two surfaces')
  assert((LIBRARY_METADATA_HELPER_CONTRACT.forbidden as readonly string[]).includes('library_chunks_writes'), 'contract forbids library_chunks writes')
  assert((LIBRARY_METADATA_HELPER_CONTRACT.forbidden as readonly string[]).includes('embeddings'), 'contract forbids embeddings')
  assert((LIBRARY_METADATA_HELPER_CONTRACT.forbidden as readonly string[]).includes('chat_retrieval_path_changes'), 'contract forbids chat retrieval path changes')
  assert((LIBRARY_METADATA_HELPER_CONTRACT.forbidden as readonly string[]).includes('prompt_injection'), 'contract forbids prompt injection')
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
if (failures.length > 0) {
  console.log('\n  Failures:')
  for (const f of failures) console.log(`    ✗ ${f}`)
}
console.log('══════════════════════════════════════════\n')
process.exit(failed > 0 ? 1 : 0)
