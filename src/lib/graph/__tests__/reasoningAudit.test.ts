/**
 * Phase 38.5.1 — Reasoning Audit Writer Structural Tests
 *
 * Run: npx tsx src/lib/graph/__tests__/reasoningAudit.test.ts
 *
 * No Supabase calls. No data writes.
 * Tests: pure input validator, forbidden fields, governance enforcement,
 * schema safety, no forbidden content fields, no route wiring yet.
 */

import * as fs from 'fs'
import * as path from 'path'

// Import pure types/validation only — no Supabase chain
import {
  validateReasoningAuditInput,
  AUDIT_FORBIDDEN_FIELDS,
} from '../reasoningAuditTypes'

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

section('Forbidden fields list completeness')

{
  const forbidden = AUDIT_FORBIDDEN_FIELDS as readonly string[]
  // Draft body fields
  assert(forbidden.includes('evidence_summary'), 'evidence_summary in forbidden list')
  assert(forbidden.includes('directly_supported'), 'directly_supported in forbidden list')
  assert(forbidden.includes('graph_supported'), 'graph_supported in forbidden list')
  assert(forbidden.includes('inferred_only'), 'inferred_only in forbidden list')
  assert(forbidden.includes('missing_or_weak'), 'missing_or_weak in forbidden list')
  assert(forbidden.includes('authority_boundary'), 'authority_boundary in forbidden list')
  assert(forbidden.includes('do_not_conclude'), 'do_not_conclude in forbidden list')
  assert(forbidden.includes('uncertainty_note'), 'uncertainty_note in forbidden list')
  // Prompt/model
  assert(forbidden.includes('prompt'), 'prompt in forbidden list')
  assert(forbidden.includes('model_response'), 'model_response in forbidden list')
  assert(forbidden.includes('system_prompt'), 'system_prompt in forbidden list')
  // Secrets
  assert(forbidden.includes('ANTHROPIC_API_KEY'), 'ANTHROPIC_API_KEY in forbidden list')
  assert(forbidden.includes('HOUSE_AUTH_SECRET'), 'HOUSE_AUTH_SECRET in forbidden list')
  assert(forbidden.includes('HOUSE_AUTH_PASSWORD'), 'HOUSE_AUTH_PASSWORD in forbidden list')
  // Deferred fields
  assert(forbidden.includes('feedback_event_id'), 'feedback_event_id in forbidden list (deferred)')
  assert(forbidden.includes('packet_fingerprint'), 'packet_fingerprint in forbidden list (deferred)')
  assert(forbidden.includes('draft_hash'), 'draft_hash in forbidden list (deferred)')
  // Governance fields — caller must not supply
  assert(forbidden.includes('authority_changed'), 'authority_changed in forbidden list')
  assert(forbidden.includes('not_evidence'), 'not_evidence in forbidden list')
  assert(forbidden.includes('prompt_eligible'), 'prompt_eligible in forbidden list')
  assert(forbidden.includes('review_routed'), 'review_routed in forbidden list')
  assert(forbidden.includes('created_by'), 'created_by in forbidden list')
}

section('validateReasoningAuditInput — valid inputs')

{
  const valid = {
    suggestion_id: 'sug-1',
    event_type: 'llm_draft_returned',
    reasoning_mode: 'llm_assisted',
    event_status: 'success',
    llm_model: 'claude-haiku-4-5',
    baseline_packet_sufficient: true,
    archive_source_count: 1,
  }
  assert(validateReasoningAuditInput(valid).ok, 'valid input passes')

  const minimal = {
    suggestion_id: 'sug-1',
    event_type: 'llm_precheck_blocked',
    reasoning_mode: 'llm_assisted',
    event_status: 'blocked',
  }
  assert(validateReasoningAuditInput(minimal).ok, 'minimal valid input passes')
}

section('validateReasoningAuditInput — non-object inputs rejected')

{
  assert(!validateReasoningAuditInput(null).ok, 'null rejected')
  assert(!validateReasoningAuditInput(undefined).ok, 'undefined rejected')
  assert(!validateReasoningAuditInput('string').ok, 'string rejected')
  assert(!validateReasoningAuditInput([]).ok, 'array rejected')
  assert(!validateReasoningAuditInput(42).ok, 'number rejected')
}

section('validateReasoningAuditInput — forbidden fields rejected')

{
  const base = { suggestion_id: 'sug-1', event_type: 'llm_draft_returned', reasoning_mode: 'llm_assisted', event_status: 'success' }

  // Draft body
  assert(!validateReasoningAuditInput({ ...base, evidence_summary: 'test' }).ok, 'evidence_summary rejected')
  assert(!validateReasoningAuditInput({ ...base, directly_supported: [] }).ok, 'directly_supported rejected')
  assert(!validateReasoningAuditInput({ ...base, prompt: 'raw prompt text' }).ok, 'prompt rejected')
  assert(!validateReasoningAuditInput({ ...base, model_response: '...' }).ok, 'model_response rejected')
  assert(!validateReasoningAuditInput({ ...base, system_prompt: '...' }).ok, 'system_prompt rejected')
  assert(!validateReasoningAuditInput({ ...base, raw_content: '...' }).ok, 'raw_content rejected')
  assert(!validateReasoningAuditInput({ ...base, ANTHROPIC_API_KEY: 'sk-test' }).ok, 'ANTHROPIC_API_KEY rejected')
  assert(!validateReasoningAuditInput({ ...base, HOUSE_AUTH_SECRET: 'secret' }).ok, 'HOUSE_AUTH_SECRET rejected')
  assert(!validateReasoningAuditInput({ ...base, feedback_event_id: 'abc' }).ok, 'feedback_event_id rejected (deferred)')
  assert(!validateReasoningAuditInput({ ...base, packet_fingerprint: 'hash' }).ok, 'packet_fingerprint rejected (deferred)')
  assert(!validateReasoningAuditInput({ ...base, authority_changed: false }).ok, 'authority_changed rejected (server-set)')
  assert(!validateReasoningAuditInput({ ...base, not_evidence: true }).ok, 'not_evidence rejected (server-set)')
  assert(!validateReasoningAuditInput({ ...base, created_by: 'hacker' }).ok, 'created_by rejected (server-set)')
}

section('validateReasoningAuditInput — missing required fields')

{
  assert(!validateReasoningAuditInput({ event_type: 'llm_draft_returned', reasoning_mode: 'llm_assisted', event_status: 'success' }).ok,
    'missing suggestion_id rejected')
  assert(!validateReasoningAuditInput({ suggestion_id: 'x', reasoning_mode: 'llm_assisted', event_status: 'success' }).ok,
    'missing event_type rejected')
  assert(!validateReasoningAuditInput({ suggestion_id: 'x', event_type: 'llm_draft_returned', event_status: 'success' }).ok,
    'missing reasoning_mode rejected')
  assert(!validateReasoningAuditInput({ suggestion_id: 'x', event_type: 'llm_draft_returned', reasoning_mode: 'llm_assisted' }).ok,
    'missing event_status rejected')
}

section('Writer module — structural safety')

{
  const writerPath = path.resolve(__dirname, '../../server/reasoningAudit.ts')
  const content = fs.readFileSync(writerPath, 'utf-8')

  // Must write to reasoning_audit_events only
  assert(content.includes("from('reasoning_audit_events')"), 'writer queries reasoning_audit_events')
  const tableMatches = content.match(/\.from\(['"]([^'"]+)['"]\)/g) ?? []
  const tables = tableMatches.map(m => m.match(/\.from\(['"]([^'"]+)['"]\)/)?.[1]).filter(Boolean)
  const forbidden = tables.filter(t => t !== 'reasoning_audit_events')
  assert(forbidden.length === 0, `writer only touches reasoning_audit_events (found: ${[...new Set(tables)].join(', ')})`)

  // No update/delete/upsert
  assert(!content.includes('.update('), 'no .update()')
  assert(!content.includes('.delete('), 'no .delete()')
  assert(!content.includes('.upsert('), 'no .upsert()')

  // Governance fields server-set
  assert(content.includes('authority_changed: false'), 'writer sets authority_changed: false')
  assert(content.includes('not_evidence: true'), 'writer sets not_evidence: true')
  assert(content.includes('prompt_eligible: false'), 'writer sets prompt_eligible: false')
  assert(content.includes('review_routed: false'), 'writer sets review_routed: false')
  assert(content.includes("created_by: 'system'"), "writer sets created_by: 'system'")

  // No draft/prompt/model content stored
  assert(!content.includes('evidence_summary'), 'no evidence_summary stored')
  assert(!content.includes('directly_supported'), 'no directly_supported stored')
  assert(!content.includes('raw_prompt'), 'no raw_prompt stored')
  assert(!content.includes('model_response'), 'no model_response stored')

  // No Anthropic/OpenAI
  assert(!content.includes('anthropic'), 'no anthropic import')
  assert(!content.includes('openai'), 'no openai import')

  // No deferred fields stored
  assert(!content.includes('feedback_event_id'), 'no feedback_event_id stored')
  assert(!content.includes('packet_fingerprint'), 'no packet_fingerprint stored')
  assert(!content.includes('draft_hash'), 'no draft_hash stored')

  // Fail-closed contract: writer returns ok:false shape
  assert(content.includes("code: 'REASONING_AUDIT_WRITE_FAILED'"), 'write failure code defined')
  assert(content.includes("code: 'REASONING_AUDIT_INPUT_INVALID'"), 'input invalid code defined')
  // 'stack' appears in comments ("stack traces") — check for actual stack access
  assert(!content.includes('.stack'), 'no .stack property access in error handling')
}

section('Migration — schema structure')

{
  const migPath = path.resolve(__dirname, '../../../../supabase-migrations/072_reasoning_audit_events.sql')
  const content = fs.readFileSync(migPath, 'utf-8')

  assert(content.includes('create table reasoning_audit_events'), 'table created')
  assert(content.includes('references graph_candidate_suggestions(id) on delete restrict'), 'FK with RESTRICT')

  // Named constraints
  assert(content.includes('rae_event_type_check'), 'rae_event_type_check constraint')
  assert(content.includes('rae_reasoning_mode_check'), 'rae_reasoning_mode_check constraint')
  assert(content.includes('rae_event_status_check'), 'rae_event_status_check constraint')
  assert(content.includes('rae_authority_never_changes'), 'rae_authority_never_changes constraint')
  assert(content.includes('rae_not_evidence_always_true'), 'rae_not_evidence_always_true constraint')
  assert(content.includes('rae_not_prompt_eligible'), 'rae_not_prompt_eligible constraint')
  assert(content.includes('rae_not_review_routed'), 'rae_not_review_routed constraint')
  assert(content.includes('rae_archive_source_count_nonneg'), 'rae_archive_source_count_nonneg constraint')
  assert(content.includes('rae_graph_source_count_nonneg'), 'rae_graph_source_count_nonneg constraint')

  // All 4 event types present
  assert(content.includes("'llm_draft_requested'"), "event_type has 'llm_draft_requested'")
  assert(content.includes("'llm_precheck_blocked'"), "event_type has 'llm_precheck_blocked'")
  assert(content.includes("'llm_output_invalid'"), "event_type has 'llm_output_invalid'")
  assert(content.includes("'llm_draft_returned'"), "event_type has 'llm_draft_returned'")

  // Reasoning modes
  assert(content.includes("'llm_assisted'"), "reasoning_mode has 'llm_assisted'")
  assert(content.includes("'deterministic'"), "reasoning_mode has 'deterministic'")

  // Deferred fields NOT in schema
  assert(!content.includes('feedback_event_id'), 'feedback_event_id not in schema (deferred)')
  assert(!content.includes('packet_fingerprint'), 'packet_fingerprint not in schema (deferred)')
  assert(!content.includes('draft_hash'), 'draft_hash not in schema (deferred)')

  // No draft body fields
  assert(!content.includes('evidence_summary'), 'no evidence_summary column')
  assert(!content.includes('directly_supported'), 'no directly_supported column')
  assert(!content.includes('prompt_text'), 'no prompt_text column')
  assert(!content.includes('model_response'), 'no model_response column')

  // RLS enabled
  assert(content.includes('enable row level security'), 'RLS enabled')
  assert(content.includes('Allow all access to reasoning_audit_events'), 'RLS policy')
}

section('No route wiring yet — LLM draft route unchanged')

{
  const routePath = path.resolve(__dirname, '../../../app/api/graph-candidate-suggestions/[id]/llm-reasoning-draft/route.ts')
  const content = fs.readFileSync(routePath, 'utf-8')
  assert(!content.includes('reasoningAudit'), 'LLM draft route does not yet import audit writer')
  assert(!content.includes('createReasoningAuditEvent'), 'LLM draft route does not yet call audit writer')
  assert(!content.includes('REASONING_AUDIT_UNAVAILABLE'), 'LLM draft route does not yet have audit failure code')
}

section('No route wiring yet — feedback endpoint unchanged')

{
  const routePath = path.resolve(__dirname, '../../../app/api/llm-reasoning-feedback/route.ts')
  const content = fs.readFileSync(routePath, 'utf-8')
  assert(!content.includes('reasoningAudit'), 'feedback endpoint does not reference audit writer')
}

section('No client component wiring')

{
  const panelPath = path.resolve(__dirname, '../../../components/graph/LLMReasoningDraftPanel.tsx')
  const content = fs.readFileSync(panelPath, 'utf-8')
  assert(!content.includes('reasoningAudit'), 'LLM draft panel does not import audit writer')
  assert(!content.includes('createReasoningAuditEvent'), 'LLM draft panel does not call audit writer')

  const detailPath = path.resolve(__dirname, '../../../components/graph/GraphSuggestionDetail.tsx')
  const detailContent = fs.readFileSync(detailPath, 'utf-8')
  assert(!detailContent.includes('reasoningAudit'), 'detail component does not import audit writer')
}

section('Fail-closed contract shape for 38.5.2')

{
  const writerPath = path.resolve(__dirname, '../../server/reasoningAudit.ts')
  const content = fs.readFileSync(writerPath, 'utf-8')

  // Must return ReasoningAuditResult with ok:false on failure
  assert(content.includes('ok: false'), 'writer can return ok: false (fail-closed-ready)')
  assert(content.includes('ok: true'), 'writer can return ok: true')
  assert(content.includes('audit_event_id'), 'success result has audit_event_id')

  // The fail-closed law is documented
  assert(content.includes('No trace, no draft'), 'fail-closed law documented in writer')
}

section('38.4.2 regression — feedback UI and endpoints intact')

{
  const routePath = path.resolve(__dirname, '../../../app/api/llm-reasoning-feedback/route.ts')
  const r = fs.readFileSync(routePath, 'utf-8')
  assert(r.includes('requireHouseApiAuth'), 'feedback route still has auth')
  assert(r.includes("authority_changed: false"), 'feedback route still sets authority_changed: false')

  const panelPath = path.resolve(__dirname, '../../../components/graph/LLMReasoningDraftPanel.tsx')
  const p = fs.readFileSync(panelPath, 'utf-8')
  assert(p.includes('candidate_signal'), 'feedback panel still has candidate_signal')
  assert(p.includes('Flag for future review'), 'feedback panel still has correct label')
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
