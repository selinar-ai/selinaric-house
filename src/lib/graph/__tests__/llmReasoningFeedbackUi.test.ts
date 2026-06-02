/**
 * Phase 38.4.2 — Feedback UI Structural Tests
 *
 * Run: npx tsx src/lib/graph/__tests__/llmReasoningFeedbackUi.test.ts
 *
 * Structural tests only — no React DOM framework.
 * Tests: labels/values, fetch shape, single-submit, regenerate reset,
 * no authority controls, no persistence, no forbidden patterns.
 */

import * as fs from 'fs'
import * as path from 'path'

import {
  FEEDBACK_CHIPS,
  mapFeedbackError,
} from '../../../components/graph/LLMReasoningDraftPanel'

// ─── Harness ───────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}

function section(name: string) { console.log(`\n── ${name} ──`) }

// ─── Tests ─────────────────────────────────────────────────────────────────

section('Feedback chips — labels and internal values')

{
  // Verify all 5 chips exist with correct value/label mapping
  const pairs: Array<[string, string]> = [
    ['useful',           'Useful'],
    ['not_useful',       'Not useful'],
    ['needs_evidence',   'Needs more evidence'],
    ['misread',          'Misread'],
    ['candidate_signal', 'Flag for future review'],
  ]
  assert(FEEDBACK_CHIPS.length === 5, 'exactly 5 feedback chips defined')
  for (const [value, label] of pairs) {
    const chip = FEEDBACK_CHIPS.find(c => c.value === value)
    assert(chip !== undefined, `chip '${value}' exists`)
    assert(chip?.label === label, `chip '${value}' has label '${label}' (got '${chip?.label}')`)
  }

  // No potential_candidate
  const values = FEEDBACK_CHIPS.map(c => c.value)
  assert(!values.includes('potential_candidate' as never), 'potential_candidate NOT a chip value')
  assert(!values.includes('approved' as never), 'approved NOT a chip value')
  assert(!values.includes('promote' as never), 'promote NOT a chip value')

  // No "Potential candidate" label
  const labels = FEEDBACK_CHIPS.map(c => c.label)
  assert(!labels.some(l => l.toLowerCase().includes('potential candidate')), 'no Potential candidate label')
}

section('mapFeedbackError — safe messages only')

{
  const msg401 = mapFeedbackError(401)
  assert(msg401.includes('log back into the House'), '401 maps to login message')
  assert(!msg401.match(/sk-|HOUSE_AUTH|secret|stack/i), '401 message has no secrets')

  const msgGeneric = mapFeedbackError(500)
  assert(msgGeneric.includes('could not be recorded safely'), 'generic failure message correct')
  assert(!msgGeneric.match(/sk-|HOUSE_AUTH|secret|stack/i), 'generic message has no secrets')

  const msgInvalid = mapFeedbackError(400, 'invalid_feedback_type')
  assert(msgInvalid.includes('not accepted'), 'invalid type message correct')

  const msgNote = mapFeedbackError(400, 'note_too_long')
  assert(msgNote.includes('too long'), 'note too long message correct')
}

section('Component — feedback inside success block only')

{
  const panelPath = path.resolve(__dirname, '../../../components/graph/LLMReasoningDraftPanel.tsx')
  const content = fs.readFileSync(panelPath, 'utf-8')

  // Feedback section header appears inside success rendering (after state.phase === 'success')
  const successIdx = content.indexOf("state.phase === 'success'")
  const feedbackSectionIdx = content.indexOf('Was this reasoning draft useful?')
  assert(feedbackSectionIdx > successIdx,
    'Feedback section appears inside success branch (not in idle/error)')

  // Feedback chips are inside success block
  const chipRenderIdx = content.indexOf('FEEDBACK_CHIPS.map')
  assert(chipRenderIdx > successIdx, 'FEEDBACK_CHIPS.map inside success branch')

  // No feedback UI in idle branch
  const idleSection = content.slice(content.indexOf("{ phase: 'idle' }"), successIdx)
  assert(!idleSection.includes('Was this reasoning draft useful?'),
    'Feedback section not in idle branch')
}

section('Component — feedback labels in UI')

{
  const content = fs.readFileSync(
    path.resolve(__dirname, '../../../components/graph/LLMReasoningDraftPanel.tsx'),
    'utf-8'
  )

  assert(content.includes('Flag for future review'), 'Flag for future review label in UI')
  assert(content.includes('candidate_signal'), 'candidate_signal value in UI')
  assert(!content.includes('Potential candidate'), 'Potential candidate NOT in UI')
  assert(!content.includes('potential_candidate'), 'potential_candidate NOT in UI text')
  assert(content.includes('Feedback is for reasoning quality only'), 'boundary note present')
  assert(content.includes('Feedback recorded. This does not change authority'),
    'success message present')
  assert(content.includes('Was this reasoning draft useful?'), 'section heading present')
}

section('Component — fetch shape')

{
  const content = fs.readFileSync(
    path.resolve(__dirname, '../../../components/graph/LLMReasoningDraftPanel.tsx'),
    'utf-8'
  )

  assert(content.includes("'/api/llm-reasoning-feedback'"), 'calls correct feedback endpoint')
  assert(content.includes("method: 'POST'"), 'uses POST method')
  assert(content.includes("credentials: 'same-origin'"), 'uses same-origin credentials')
  assert(content.includes("'Content-Type': 'application/json'"), 'sends JSON')
  assert(content.includes('suggestion_id: suggestionId'), 'sends suggestion_id')
  assert(content.includes('feedback_type: type'), 'sends feedback_type')
  assert(content.includes('draft_model'), 'may send draft_model from meta')
  assert(content.includes('draft_generated_at'), 'may send draft_generated_at from meta')

  // Must NOT send draft text or sections
  const bodyStart = content.indexOf("body: JSON.stringify")
  const bodySection = content.slice(bodyStart, bodyStart + 300)
  assert(!bodySection.includes('evidence_summary'), 'body does not include evidence_summary')
  assert(!bodySection.includes('directly_supported'), 'body does not include directly_supported')
  assert(!bodySection.includes('authority_boundary'), 'body does not include authority_boundary')
  assert(!bodySection.includes('do_not_conclude'), 'body does not include do_not_conclude')

  // Must NOT send governance flags
  assert(!bodySection.includes('authority_changed'), 'body does not include authority_changed')
  assert(!bodySection.includes('prompt_eligible'), 'body does not include prompt_eligible')
  assert(!bodySection.includes('not_evidence'), 'body does not include not_evidence')
}

section('Component — single-submit behaviour')

{
  const content = fs.readFileSync(
    path.resolve(__dirname, '../../../components/graph/LLMReasoningDraftPanel.tsx'),
    'utf-8'
  )

  // Guard against re-submission
  assert(content.includes("feedback.phase === 'submitted'") &&
    content.includes("feedback.phase === 'submitting'"),
    'guard against submitting/submitted prevents re-submission')

  // Submitting state disables chips
  // disabled uses isFeedbackSubmitting boolean derived from feedback.phase === 'submitting'
  assert(content.includes('isFeedbackSubmitting') && content.includes('disabled={isFeedbackSubmitting}'),
    'chips disabled during submitting (via isFeedbackSubmitting boolean)')

  // Success message correct
  assert(content.includes('Feedback recorded. This does not change authority'),
    'correct success message shown after submission')

  // No overwrite/update/delete/upsert
  assert(!content.includes('.update('), 'no .update() in feedback')
  assert(!content.includes('.delete('), 'no .delete() in feedback')
  assert(!content.includes('.upsert('), 'no .upsert() in feedback')
}

section('Component — regenerate resets feedback state')

{
  const content = fs.readFileSync(
    path.resolve(__dirname, '../../../components/graph/LLMReasoningDraftPanel.tsx'),
    'utf-8'
  )

  // setFeedback({ phase: 'idle' }) called in handleGenerate
  const generateFn = content.slice(content.indexOf('async function handleGenerate'))
  assert(generateFn.includes("setFeedback({ phase: 'idle' })"),
    'handleGenerate resets feedback to idle')
}

section('Component — no persistence, no authority, no forbidden patterns')

{
  const content = fs.readFileSync(
    path.resolve(__dirname, '../../../components/graph/LLMReasoningDraftPanel.tsx'),
    'utf-8'
  )

  assert(!content.includes('localStorage'), 'no localStorage')
  assert(!content.includes('sessionStorage'), 'no sessionStorage')
  assert(!content.includes("from('@/lib/supabase')"), 'no supabase import')
  assert(!content.includes('.insert('), 'no .insert()')
  assert(!content.includes('anthropic'), 'no anthropic import')
  assert(!content.includes('openai'), 'no openai import')

  // No authority controls
  assert(!content.includes('Approve this'), 'no Approve this')
  assert(!content.includes('Promote this'), 'no Promote this')
  assert(!content.includes('Make this Memory'), 'no Make this Memory')
  assert(!content.includes('Make this Held Truth'), 'no Make this Held Truth')
  assert(!content.includes('Send to Review'), 'no Send to Review')
  assert(!content.includes('Confidence Score'), 'no Confidence Score')
  assert(!content.includes('Verdict'), 'no Verdict')

  // No multi-select
  assert(!content.includes('multiple'), 'no multi-select attribute')

  // No note field
  assert(!content.includes('feedback_note'), 'no feedback_note field in UI')
  assert(!content.includes('textarea'), 'no textarea for note')

  // Boundary note present
  assert(content.includes('Feedback is for reasoning quality only'), 'boundary note present')
}

section('38.4.1 regression — feedback endpoint and table unchanged')

{
  const routePath = path.resolve(__dirname, '../../../app/api/llm-reasoning-feedback/route.ts')
  const content = fs.readFileSync(routePath, 'utf-8')
  assert(content.includes('requireHouseApiAuth'), 'feedback route still has auth')
  assert(content.includes("authority_changed: false"), 'route still sets authority_changed: false')
  assert(content.includes("not_evidence: true"), 'route still sets not_evidence: true')
  assert(!content.includes('potential_candidate'), 'route still has no potential_candidate')
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
