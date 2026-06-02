/**
 * Phase 38.3.3 — LLM Reasoning Draft Panel Structural Tests
 *
 * Run: npx tsx src/lib/graph/__tests__/llmReasoningDraftPanel.test.ts
 *
 * Structural tests only — no React DOM/render framework available.
 * Tests cover: exported pure functions (clientSafetyGuard, mapFailureMessage),
 * structural safety of the component file, no-persistence, no-authority,
 * fetch safety, and integration with GraphSuggestionDetail.
 */

import * as fs from 'fs'
import * as path from 'path'
import { clientSafetyGuard, mapFailureMessage } from '../../../components/graph/LLMReasoningDraftPanel'

// ─── Harness ───────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}

function section(name: string) { console.log(`\n── ${name} ──`) }

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeValidResponse() {
  return {
    ok: true,
    draft: {
      evidence_summary: 'Test summary',
      directly_supported: [],
      graph_supported: [],
      inferred_only: [],
      missing_or_weak: [],
      authority_boundary: 'Draft explanation only. Not Memory. Not Held Truth. Not prompt eligible. Does not change authority.',
      possible_review_route: null,
      do_not_conclude: ['Do not conclude this is Memory.'],
      uncertainty_note: null,
    },
    meta: {
      stored: false,
      evidence: false,
      authority_changed: false,
      possible_review_route: null,
      model: 'claude-haiku-4-5',
    },
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

section('mapFailureMessage — known codes')

{
  assert(mapFailureMessage('UNAUTHENTICATED').includes('log back into the House'), 'UNAUTHENTICATED maps to login message')
  assert(mapFailureMessage('INSUFFICIENT_PACKET').includes('Insufficient evidence packet'), 'INSUFFICIENT_PACKET maps correctly')
  assert(mapFailureMessage('LLM_UNAVAILABLE').includes('temporarily unavailable'), 'LLM_UNAVAILABLE maps correctly')
  assert(mapFailureMessage('LLM_OUTPUT_PARSE_FAILED').includes('could not be parsed'), 'LLM_OUTPUT_PARSE_FAILED maps correctly')
  assert(mapFailureMessage('LLM_OUTPUT_VALIDATION_FAILED').includes('failed safety validation'), 'LLM_OUTPUT_VALIDATION_FAILED maps correctly')
  assert(mapFailureMessage('HYDRATION_FAILED').includes('could not be found'), 'HYDRATION_FAILED maps correctly')
  assert(mapFailureMessage('CLIENT_SAFETY_FAILED').includes('client safety checks'), 'CLIENT_SAFETY_FAILED maps correctly')
  assert(mapFailureMessage(undefined).includes('could not be generated safely'), 'unknown code maps to generic message')
  assert(mapFailureMessage('TOTALLY_UNKNOWN').includes('could not be generated safely'), 'arbitrary code maps to generic message')

  // No secrets or raw output in any message
  for (const code of ['UNAUTHENTICATED', 'INSUFFICIENT_PACKET', 'LLM_UNAVAILABLE', 'LLM_OUTPUT_PARSE_FAILED', 'LLM_OUTPUT_VALIDATION_FAILED', 'CLIENT_SAFETY_FAILED']) {
    const msg = mapFailureMessage(code)
    assert(!msg.match(/sk-|ANTHROPIC|HOUSE_AUTH|secret|password|stack|trace/i), `${code} message contains no secrets/internals`)
  }
}

section('clientSafetyGuard — valid response passes')

{
  const valid = makeValidResponse()
  assert(clientSafetyGuard(valid).ok === true, 'valid response passes guard')
}

section('clientSafetyGuard — non-object inputs rejected')

{
  assert(!clientSafetyGuard(null).ok, 'null rejected')
  assert(!clientSafetyGuard(undefined).ok, 'undefined rejected')
  assert(!clientSafetyGuard('string').ok, 'string rejected')
  assert(!clientSafetyGuard([]).ok, 'array rejected')
  assert(!clientSafetyGuard(42).ok, 'number rejected')
}

section('clientSafetyGuard — ok:false rejected')

{
  assert(!clientSafetyGuard({ ok: false, code: 'INSUFFICIENT_PACKET' }).ok, 'ok:false rejected')
}

section('clientSafetyGuard — possible_review_route must be null')

{
  const routeObj = { ...makeValidResponse(), draft: { ...makeValidResponse().draft, possible_review_route: { route: 'memory_review', reason: 'x' } } }
  assert(!clientSafetyGuard(routeObj).ok, 'non-null possible_review_route rejected')
  const routeStr = { ...makeValidResponse(), draft: { ...makeValidResponse().draft, possible_review_route: 'memory_review' } }
  assert(!clientSafetyGuard(routeStr).ok, 'string possible_review_route rejected')
  const routeFalse = { ...makeValidResponse(), draft: { ...makeValidResponse().draft, possible_review_route: false } }
  assert(!clientSafetyGuard(routeFalse).ok, 'false possible_review_route rejected')
}

section('clientSafetyGuard — meta flags must be false')

{
  assert(!clientSafetyGuard({ ...makeValidResponse(), meta: { ...makeValidResponse().meta, stored: true } }).ok, 'meta.stored:true rejected')
  assert(!clientSafetyGuard({ ...makeValidResponse(), meta: { ...makeValidResponse().meta, evidence: true } }).ok, 'meta.evidence:true rejected')
  assert(!clientSafetyGuard({ ...makeValidResponse(), meta: { ...makeValidResponse().meta, authority_changed: true } }).ok, 'meta.authority_changed:true rejected')
}

section('clientSafetyGuard — authority_boundary must contain mandatory text')

{
  const noHeader = { ...makeValidResponse(), draft: { ...makeValidResponse().draft, authority_boundary: 'Some other text' } }
  assert(!clientSafetyGuard(noHeader).ok, 'missing mandatory boundary text rejected')
  const empty = { ...makeValidResponse(), draft: { ...makeValidResponse().draft, authority_boundary: '' } }
  assert(!clientSafetyGuard(empty).ok, 'empty authority_boundary rejected')
  const missing = { ...makeValidResponse(), draft: { ...makeValidResponse().draft, authority_boundary: undefined } }
  assert(!clientSafetyGuard(missing).ok, 'missing authority_boundary rejected')
}

section('clientSafetyGuard — missing draft or meta rejected')

{
  assert(!clientSafetyGuard({ ok: true, meta: makeValidResponse().meta }).ok, 'missing draft rejected')
  assert(!clientSafetyGuard({ ok: true, draft: makeValidResponse().draft }).ok, 'missing meta rejected')
}

section('Component structural safety')

{
  const panelPath = path.resolve(__dirname, '../../../components/graph/LLMReasoningDraftPanel.tsx')
  const content = fs.readFileSync(panelPath, 'utf-8')

  // No persistence
  assert(!content.includes('localStorage'), 'no localStorage')
  assert(!content.includes('sessionStorage'), 'no sessionStorage')
  assert(!content.includes("from('@/lib/supabase')"), 'no supabase import')
  assert(!content.includes("from('../../lib/supabase')"), 'no supabase relative import')
  assert(!content.includes('.insert('), 'no .insert()')
  assert(!content.includes('.update('), 'no .update()')
  assert(!content.includes('.delete('), 'no .delete()')
  assert(!content.includes('.upsert('), 'no .upsert()')

  // No audit/event writes
  assert(!content.includes('graph_candidate_suggestion_events'), 'no suggestion events write')
  assert(!content.includes('archive_memory_events'), 'no archive memory events write')

  // No authority actions
  assert(!content.includes('Approve'), 'no Approve button text')
  assert(!content.includes('Promote'), 'no Promote button text')
  assert(!content.includes('Make this Memory'), 'no Make Memory text')
  assert(!content.includes('Make this Held Truth'), 'no Make Held Truth text')
  assert(!content.includes('Send to Review'), 'no Send to Review text')
  assert(!content.includes('Confidence Score'), 'no Confidence Score text')
  assert(!content.includes('Verdict'), 'no Verdict text')
  assert(!content.includes('Decision\n'), 'no Decision label')
  assert(!content.includes('confirm_memory'), 'no confirm_memory reference')
  assert(!content.includes('promoteToHeldTruth'), 'no promoteToHeldTruth reference')

  // No possible_review_route rendered as user text
  assert(!content.includes('possible_review_route') || content.includes('possible_review_route !== null'),
    'possible_review_route only referenced in guard check, not rendered')

  // Fetch safety
  assert(content.includes("credentials: 'same-origin'"), "fetch uses credentials: 'same-origin'")
  assert(content.includes("method: 'POST'"), "fetch uses POST method")
  assert(!content.includes('body: JSON.stringify'), 'no request body sent (no JSON evidence packet from client)')

  // No LLM call from client
  assert(!content.includes('anthropic'), 'no anthropic import')
  assert(!content.includes('openai'), 'no openai import')
  assert(!content.includes('generateText'), 'no generateText call')

  // No auto-generation — no useEffect that triggers generation
  // Check that useEffect is not used at all OR that it doesn't call handleGenerate/fetch
  const useEffectBlocks = content.match(/useEffect\s*\(/g) ?? []
  const hasUseEffectWithFetch = useEffectBlocks.length > 0 &&
    content.includes('useEffect') &&
    (content.match(/useEffect[\s\S]{0,200}fetch/) !== null ||
     content.match(/useEffect[\s\S]{0,200}handleGenerate/) !== null)
  assert(!hasUseEffectWithFetch, 'no useEffect that triggers generation')

  // Exports the pure functions for testing
  assert(content.includes('export function clientSafetyGuard'), 'clientSafetyGuard is exported')
  assert(content.includes('export function mapFailureMessage'), 'mapFailureMessage is exported')

  // Mandatory boundary header present
  assert(content.includes('Does not change authority'), 'mandatory boundary text present in component')
  assert(content.includes('Draft explanation only. Not Memory.'), 'boundary header text present')

  // Dismissed note present
  assert(content.includes('does not reopen review'), 'dismissed suggestion note present')
}

section('GraphSuggestionDetail integration')

{
  const detailPath = path.resolve(__dirname, '../../../components/graph/GraphSuggestionDetail.tsx')
  const content = fs.readFileSync(detailPath, 'utf-8')

  assert(content.includes('LLMReasoningDraftPanel'), 'detail imports LLMReasoningDraftPanel')
  assert(content.includes('<LLMReasoningDraftPanel'), 'detail renders LLMReasoningDraftPanel')
  assert(content.includes('suggestionId={s.id}'), 'panel receives suggestionId')
  assert(content.includes('suggestionStatus={s.status}'), 'panel receives suggestionStatus')

  // LLM panel must come after DeterministicReasoningPanel
  const deterministicIdx = content.indexOf('DeterministicReasoningPanel')
  const llmIdx = content.indexOf('LLMReasoningDraftPanel')
  assert(deterministicIdx < llmIdx, 'LLM panel appears after Deterministic panel (visual primacy)')

  // LLM panel must come before CONTEXT GROUP
  const contextIdx = content.indexOf('CONTEXT GROUP')
  assert(llmIdx < contextIdx, 'LLM panel appears before Context Group')
}

section('38.3.2 regression — auth and reasoning still intact')

{
  const authPath = path.resolve(__dirname, '../../server/houseAuth.ts')
  const auth = fs.readFileSync(authPath, 'utf-8')
  assert(auth.includes('requireHouseApiAuth'), 'auth helper still exports requireHouseApiAuth')
  assert(auth.includes('timingSafeEqual'), 'auth still uses timing-safe comparison')

  const routePath = path.resolve(__dirname, '../../../app/api/graph-candidate-suggestions/[id]/llm-reasoning-draft/route.ts')
  const route = fs.readFileSync(routePath, 'utf-8')
  assert(route.includes('requireHouseApiAuth'), 'LLM route still has auth check')
  const authIdx = route.indexOf('auth.ok')
  const generateIdx = route.indexOf('generateLLMReasoningDraft(id)')
  assert(authIdx < generateIdx, 'auth check still precedes LLM generation')
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
