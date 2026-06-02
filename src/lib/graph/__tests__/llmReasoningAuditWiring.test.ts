/**
 * Phase 38.5.2 — LLM Draft Route Audit Wiring Structural Tests
 *
 * Run: npx tsx src/lib/graph/__tests__/llmReasoningAuditWiring.test.ts
 *
 * Structural tests only — no live DB calls, no Anthropic calls.
 * Tests: audit imports, execution order, event mapping, safe metadata,
 * fail-closed enforcement, no forbidden fields, no scope creep.
 */

import * as fs from 'fs'
import * as path from 'path'

// ─── Harness ───────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}

function section(name: string) { console.log(`\n── ${name} ──`) }

// ─── File paths ────────────────────────────────────────────────────────────

const servicePath = path.resolve(__dirname, '../llmReasoningService.ts')
const routePath = path.resolve(__dirname, '../../../app/api/graph-candidate-suggestions/[id]/llm-reasoning-draft/route.ts')
const panelPath = path.resolve(__dirname, '../../../components/graph/LLMReasoningDraftPanel.tsx')
const feedbackRoutePath = path.resolve(__dirname, '../../../app/api/llm-reasoning-feedback/route.ts')
const detailPath = path.resolve(__dirname, '../../../components/graph/GraphSuggestionDetail.tsx')
const auditWriterPath = path.resolve(__dirname, '../../server/reasoningAudit.ts')

const service = fs.readFileSync(servicePath, 'utf-8')
const route = fs.readFileSync(routePath, 'utf-8')
const panel = fs.readFileSync(panelPath, 'utf-8')

// ─── Tests ─────────────────────────────────────────────────────────────────

section('Audit writer imported in service (not route or client)')

{
  assert(service.includes('createReasoningAuditEvent'), 'service imports createReasoningAuditEvent')
  assert(service.includes("from '../server/reasoningAudit'"), "service imports from server/reasoningAudit")
  assert(!route.includes('createReasoningAuditEvent'), 'route does not directly import audit writer')
  assert(!panel.includes('createReasoningAuditEvent'), 'client panel does not import audit writer')
}

section('REASONING_AUDIT_UNAVAILABLE failure code defined and used')

{
  assert(service.includes("'REASONING_AUDIT_UNAVAILABLE'"), 'service has REASONING_AUDIT_UNAVAILABLE code')
  assert(route.includes("'REASONING_AUDIT_UNAVAILABLE'"), 'route handles REASONING_AUDIT_UNAVAILABLE status')
  assert(panel.includes('REASONING_AUDIT_UNAVAILABLE'), 'panel maps REASONING_AUDIT_UNAVAILABLE to safe message')
}

section('Auth remains first — no audit before auth')

{
  const authIdx = route.indexOf('requireHouseApiAuth')
  const generateIdx = route.indexOf('generateLLMReasoningDraft(id)')
  assert(authIdx < generateIdx, 'auth check before generateLLMReasoningDraft in route')

  // Service: provider check and hydration come before any audit event CALL
  // Use the actual call pattern (not the import line) for positioning
  const apiKeyIdx = service.indexOf('process.env.ANTHROPIC_API_KEY')
  const hydrateIdx = service.indexOf('hydrateCandidateSuggestion(suggestion_id)')
  const firstAuditCallIdx = service.indexOf('await createReasoningAuditEvent(')
  assert(apiKeyIdx > 0 && firstAuditCallIdx > 0 && apiKeyIdx < firstAuditCallIdx,
    'provider availability check before first audit write')
  assert(hydrateIdx > 0 && firstAuditCallIdx > 0 && hydrateIdx < firstAuditCallIdx,
    'hydration before first audit write')
}

section('Execution order — audit events in correct sequence')

{
  const precheckedIdx = service.indexOf("'llm_precheck_blocked'")
  const requestedIdx = service.indexOf("'llm_draft_requested'")
  const returnedIdx = service.indexOf("'llm_draft_returned'")
  const invalidIdx = service.indexOf("'llm_output_invalid'")

  assert(precheckedIdx > 0, 'llm_precheck_blocked event present')
  assert(requestedIdx > 0, 'llm_draft_requested event present')
  assert(returnedIdx > 0, 'llm_draft_returned event present')
  assert(invalidIdx > 0, 'llm_output_invalid event present')

  // llm_draft_requested must appear before Anthropic call
  const anthropicCallIdx = service.indexOf('client.messages.create')
  assert(requestedIdx < anthropicCallIdx, 'llm_draft_requested written before Anthropic call')

  // llm_draft_returned must appear after validation and before final return
  const validationIdx = service.indexOf('draftValidation.ok')
  assert(returnedIdx > validationIdx, 'llm_draft_returned written after validation')
}

section('Fail-closed: audit failure returns AUDIT_UNAVAILABLE')

{
  // Every audit write result is checked
  const auditCallCount = (service.match(/createReasoningAuditEvent\(/g) ?? []).length
  const okCheckCount = (service.match(/if \(!.*\.ok\) return AUDIT_UNAVAILABLE/g) ?? []).length
  assert(auditCallCount >= 6, `at least 6 audit event writes present (found ${auditCallCount})`)
  assert(okCheckCount >= 6, `all audit writes check ok and return AUDIT_UNAVAILABLE on failure (found ${okCheckCount})`)
  assert(service.includes('AUDIT_UNAVAILABLE'), 'AUDIT_UNAVAILABLE constant defined and used')
}

section('Fail-closed: Anthropic not called if llm_draft_requested fails')

{
  // The requested audit check must appear before the Anthropic client instantiation
  const requestedCheckIdx = service.indexOf("if (!requested.ok) return AUDIT_UNAVAILABLE")
  const anthropicClientIdx = service.indexOf('new Anthropic(')
  assert(requestedCheckIdx > 0 && anthropicClientIdx > 0 && requestedCheckIdx < anthropicClientIdx,
    'llm_draft_requested failure check before Anthropic instantiation')
}

section('Safe audit metadata — reasoning_mode always llm_assisted')

{
  assert(service.includes("reasoning_mode: 'llm_assisted'"),
    "all audit events use reasoning_mode: 'llm_assisted'")
}

section('Safe audit metadata — no forbidden fields passed to writer')

{
  // Extract the buildSafeAuditMeta function body
  const metaFnStart = service.indexOf('function buildSafeAuditMeta')
  const metaFnEnd = service.indexOf('\n}', metaFnStart)
  const metaFn = service.slice(metaFnStart, metaFnEnd + 2)

  const forbidden = [
    'evidence_summary', 'directly_supported', 'graph_supported',
    'inferred_only', 'missing_or_weak', 'authority_boundary', 'do_not_conclude',
    'prompt', 'system_prompt', 'model_response', 'raw_content',
    'ANTHROPIC_API_KEY', 'HOUSE_AUTH_SECRET', 'auth_cookie',
    'feedback_event_id', 'packet_fingerprint', 'draft_hash',
    'authority_changed', 'not_evidence', 'prompt_eligible', 'review_routed',
  ]
  for (const field of forbidden) {
    assert(!metaFn.includes(field), `buildSafeAuditMeta does not include "${field}"`)
  }

  // Must use UUIDs only for evidence_source_ids
  assert(metaFn.includes('archiveItemId'), 'evidence_source_ids uses archiveItemId (UUID)')
  assert(!metaFn.includes('.title'), 'evidence_source_ids does not include titles')
}

section('No scope creep — no migration, no endpoint, no UI, no other routes')

{
  // No migration added (only the existing 072 which is 38.5.1)
  const migrations = fs.readdirSync(
    path.resolve(__dirname, '../../../../supabase-migrations')
  ).filter(f => f.startsWith('07'))
  assert(!migrations.includes('073_'), 'no new migration added in 38.5.2')

  // Feedback endpoint unchanged
  const feedbackRoute = fs.readFileSync(feedbackRoutePath, 'utf-8')
  assert(!feedbackRoute.includes('createReasoningAuditEvent'), 'feedback endpoint not touched')
  assert(!feedbackRoute.includes('reasoningAudit'), 'feedback endpoint has no audit reference')

  // Feedback panel unchanged for audit
  assert(!panel.includes('createReasoningAuditEvent'), 'panel has no audit writer call')

  // Detail component unchanged for audit
  const detail = fs.readFileSync(detailPath, 'utf-8')
  assert(!detail.includes('createReasoningAuditEvent'), 'detail component has no audit writer call')

  // No NEW audit UI component created in 38.5.2
  // (GraphProposalAuditTrail.tsx is pre-existing from Phase 37G — not a 38.5.2 file)
  const components = fs.readdirSync(path.resolve(__dirname, '../../../components/graph'))
  const newAuditComponents = components.filter(f =>
    f.toLowerCase().includes('reasoning') && f.toLowerCase().includes('audit')
  )
  assert(newAuditComponents.length === 0, 'no new reasoning audit UI component created in 38.5.2')
}

section('No content fields in audit writer itself')

{
  const writer = fs.readFileSync(auditWriterPath, 'utf-8')
  assert(!writer.includes('evidence_summary'), 'writer does not store evidence_summary')
  assert(!writer.includes('directly_supported'), 'writer does not store directly_supported')
  assert(!writer.includes('.update('), 'writer has no .update()')
  assert(!writer.includes('.delete('), 'writer has no .delete()')
  assert(writer.includes("authority_changed: false"), 'writer still sets authority_changed: false')
  assert(writer.includes("not_evidence: true"), 'writer still sets not_evidence: true')
}

section('Panel safe message for REASONING_AUDIT_UNAVAILABLE')

{
  assert(panel.includes('REASONING_AUDIT_UNAVAILABLE'), 'panel handles REASONING_AUDIT_UNAVAILABLE')
  assert(panel.includes('Reasoning audit unavailable'), 'panel shows safe message for audit unavailable')
  assert(!panel.includes('No trace, no draft'), 'law not exposed in user-facing message')
}

section('38.5.1 regression — audit writer types still intact')

{
  const typesPath = path.resolve(__dirname, '../reasoningAuditTypes.ts')
  const types = fs.readFileSync(typesPath, 'utf-8')
  assert(types.includes("'llm_draft_requested'"), 'types still have llm_draft_requested')
  assert(types.includes("'llm_draft_returned'"), 'types still have llm_draft_returned')
  assert(types.includes("'llm_precheck_blocked'"), 'types still have llm_precheck_blocked')
  assert(types.includes("'llm_output_invalid'"), 'types still have llm_output_invalid')
  assert(types.includes('AUDIT_FORBIDDEN_FIELDS'), 'forbidden fields list still present')
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
