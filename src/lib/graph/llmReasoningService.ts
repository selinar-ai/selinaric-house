// Phase 38.3.2 / 38.5.2 — LLM Reasoning Draft Service
//
// Reasoning explains evidence. Reasoning does not create authority.
// Audit records trace. Audit does not create truth.
// Audit does not become evidence. Audit does not move authority.
//
// No trace, no draft. Fail-closed audit enforcement from Phase 38.5.2.
// If a required audit write fails, no draft is returned.
//
// Server-only. Never import in client components.

import Anthropic from '@anthropic-ai/sdk'
import { hydrateCandidateSuggestion } from './candidateSuggestionService'
import { buildReasoningBaseline } from './reasoningBaseline'
import {
  canRunLLMReasoning,
  buildLLMReasoningInput,
  validateLLMReasoningInput,
  validateLLMReasoningDraft,
  buildLLMReasoningPrompt,
} from './llmReasoningContract'
import {
  type LLMReasoningDraft,
  type LLMReasoningFailureCode,
} from './llmReasoningTypes'
import { createReasoningAuditEvent } from '../server/reasoningAudit'
import type { ReasoningAuditInput } from '../server/reasoningAudit'
import type {
  HydratedGraphCandidateSuggestion,
} from './candidateSuggestionTypes'
import type { ReasoningBaseline } from './reasoningTypes'

// ─── Extended failure codes ────────────────────────────────────────────────

export type LLMDraftFailureCode =
  | LLMReasoningFailureCode
  | 'LLM_UNAVAILABLE'
  | 'HYDRATION_FAILED'
  | 'LLM_OUTPUT_PARSE_FAILED'
  | 'LLM_OUTPUT_VALIDATION_FAILED'
  | 'REASONING_AUDIT_UNAVAILABLE'

export type LLMDraftResult =
  | {
      ok: true
      draft: LLMReasoningDraft
      meta: {
        suggestion_id: string
        generated_at: string
        stored: false
        evidence: false
        authority_changed: false
        possible_review_route: null
        model: string
      }
    }
  | {
      ok: false
      code: LLMDraftFailureCode
      reason: string
      stored: false
      evidence: false
      authority_changed: false
    }

// ─── Safe failure builder ──────────────────────────────────────────────────

function fail(code: LLMDraftFailureCode, reason: string): LLMDraftResult {
  return { ok: false, code, reason, stored: false, evidence: false, authority_changed: false }
}

const AUDIT_UNAVAILABLE = fail(
  'REASONING_AUDIT_UNAVAILABLE',
  'Reasoning audit unavailable. No draft was returned.'
)

// ─── Safe audit metadata builder ──────────────────────────────────────────
// Derives only safe trace metadata — no titles, excerpts, content, or secrets.

function buildSafeAuditMeta(
  suggestion_id: string,
  hydrated: HydratedGraphCandidateSuggestion,
  baseline: ReasoningBaseline,
  llm_model: string | null = null
): Omit<ReasoningAuditInput, 'event_type' | 'event_status' | 'failure_code'> {
  return {
    suggestion_id,
    reasoning_mode: 'llm_assisted',
    baseline_evidence_condition: baseline.evidenceCondition,
    baseline_packet_sufficient: baseline.packetSufficient,
    baseline_categories: baseline.categories,
    archive_source_count: baseline.evidenceProfile.totalArchiveSources,
    graph_source_count: baseline.evidenceProfile.totalGraphSources,
    // UUIDs only — no titles, excerpts, or content
    evidence_source_ids: hydrated.hydratedDeduplicatedSources.map(s => s.archiveItemId),
    llm_model,
    llm_validation_passed: null,
  }
}

// ─── Main Draft Generator ──────────────────────────────────────────────────

const LLM_REASONING_MODEL = 'claude-haiku-4-5'
const LLM_REASONING_MAX_TOKENS = 1200

export async function generateLLMReasoningDraft(
  suggestion_id: string
): Promise<LLMDraftResult> {
  // ── Step 1: Provider availability ─────────────────────────────────────────
  // No audit before this point — we don't yet have suggestion context.
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return fail('LLM_UNAVAILABLE', 'ANTHROPIC_API_KEY not configured')
  }

  // ── Step 2: Hydrate suggestion (read-only) ─────────────────────────────────
  // No audit — if hydration fails, suggestion context is not available.
  const hydrated = await hydrateCandidateSuggestion(suggestion_id)
  if (!hydrated) {
    return fail('HYDRATION_FAILED', 'Suggestion not found or could not be hydrated')
  }

  // ── Step 3: Build deterministic baseline (pure computation, no audit) ──────
  const baseline = buildReasoningBaseline(hydrated)

  // Safe audit metadata now available — derived from structured data only.
  // No titles, excerpts, summaries, raw text, or secrets.
  const auditBase = buildSafeAuditMeta(suggestion_id, hydrated, baseline, null)

  // ── Step 4: Pre-check gate ─────────────────────────────────────────────────
  const preCheck = canRunLLMReasoning(hydrated, baseline)
  if (!preCheck.ok) {
    const blocked = await createReasoningAuditEvent({
      ...auditBase,
      event_type: 'llm_precheck_blocked',
      event_status: 'blocked',
      failure_code: preCheck.code,
    })
    if (!blocked.ok) return AUDIT_UNAVAILABLE
    return fail(preCheck.code, preCheck.reason)
  }

  // ── Step 5: Build and validate LLM input packet ────────────────────────────
  const inputResult = buildLLMReasoningInput(hydrated, baseline)
  if (!inputResult.ok) {
    const blocked = await createReasoningAuditEvent({
      ...auditBase,
      event_type: 'llm_precheck_blocked',
      event_status: 'blocked',
      failure_code: inputResult.code,
    })
    if (!blocked.ok) return AUDIT_UNAVAILABLE
    return fail(inputResult.code, inputResult.reason)
  }

  const inputValidation = validateLLMReasoningInput(inputResult.value)
  if (!inputValidation.ok) {
    const blocked = await createReasoningAuditEvent({
      ...auditBase,
      event_type: 'llm_precheck_blocked',
      event_status: 'blocked',
      failure_code: inputValidation.code,
    })
    if (!blocked.ok) return AUDIT_UNAVAILABLE
    return fail(inputValidation.code, inputValidation.reason)
  }

  // ── Step 6: Write llm_draft_requested BEFORE Anthropic call ───────────────
  // No trace, no draft. If this write fails, Anthropic must not be called.
  const requested = await createReasoningAuditEvent({
    ...auditBase,
    event_type: 'llm_draft_requested',
    event_status: 'success',
    failure_code: null,
    llm_model: LLM_REASONING_MODEL,
  })
  if (!requested.ok) return AUDIT_UNAVAILABLE

  // ── Step 7: Build prompt and call LLM ─────────────────────────────────────
  const prompt = buildLLMReasoningPrompt(inputResult.value)
  let rawText: string
  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: LLM_REASONING_MODEL,
      max_tokens: LLM_REASONING_MAX_TOKENS,
      temperature: 0.1,
      system: 'You are a constrained evidence explainer. Return only valid JSON. No markdown. No prose outside JSON. No tools.',
      messages: [{ role: 'user', content: prompt }],
    })

    const firstContent = response.content[0]
    if (!firstContent || firstContent.type !== 'text') {
      const outcome = await createReasoningAuditEvent({
        ...buildSafeAuditMeta(suggestion_id, hydrated, baseline, LLM_REASONING_MODEL),
        event_type: 'llm_output_invalid',
        event_status: 'failed',
        failure_code: 'LLM_OUTPUT_PARSE_FAILED',
        llm_validation_passed: false,
      })
      if (!outcome.ok) return AUDIT_UNAVAILABLE
      return fail('LLM_OUTPUT_PARSE_FAILED', 'LLM returned no text content')
    }
    rawText = firstContent.text
  } catch (err) {
    const safeMsg = err instanceof Error ? err.message.slice(0, 100) : 'provider error'
    const outcome = await createReasoningAuditEvent({
      ...buildSafeAuditMeta(suggestion_id, hydrated, baseline, LLM_REASONING_MODEL),
      event_type: 'llm_output_invalid',
      event_status: 'failed',
      failure_code: 'LLM_UNAVAILABLE',
      llm_validation_passed: false,
    })
    if (!outcome.ok) return AUDIT_UNAVAILABLE
    return fail('LLM_UNAVAILABLE', `LLM call failed: ${safeMsg}`)
  }

  // ── Step 8: Parse JSON ─────────────────────────────────────────────────────
  let parsed: unknown
  try {
    const cleaned = rawText.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    const outcome = await createReasoningAuditEvent({
      ...buildSafeAuditMeta(suggestion_id, hydrated, baseline, LLM_REASONING_MODEL),
      event_type: 'llm_output_invalid',
      event_status: 'failed',
      failure_code: 'LLM_OUTPUT_PARSE_FAILED',
      llm_validation_passed: false,
    })
    if (!outcome.ok) return AUDIT_UNAVAILABLE
    return fail('LLM_OUTPUT_PARSE_FAILED', 'LLM output could not be parsed as JSON')
  }

  // ── Step 9: Validate output ────────────────────────────────────────────────
  const draftValidation = validateLLMReasoningDraft(parsed, baseline)
  if (!draftValidation.ok) {
    const outcome = await createReasoningAuditEvent({
      ...buildSafeAuditMeta(suggestion_id, hydrated, baseline, LLM_REASONING_MODEL),
      event_type: 'llm_output_invalid',
      event_status: 'failed',
      failure_code: 'LLM_OUTPUT_VALIDATION_FAILED',
      llm_validation_passed: false,
    })
    if (!outcome.ok) return AUDIT_UNAVAILABLE
    return fail('LLM_OUTPUT_VALIDATION_FAILED', draftValidation.reason)
  }

  // ── Step 10: Write llm_draft_returned BEFORE returning the draft ───────────
  // No trace, no draft. If this write fails, discard the draft.
  const returned = await createReasoningAuditEvent({
    ...buildSafeAuditMeta(suggestion_id, hydrated, baseline, LLM_REASONING_MODEL),
    event_type: 'llm_draft_returned',
    event_status: 'success',
    failure_code: null,
    llm_validation_passed: true,
  })
  if (!returned.ok) return AUDIT_UNAVAILABLE

  // ── Step 11: Return validated draft — no storage, no mutation ─────────────
  return {
    ok: true,
    draft: draftValidation.value,
    meta: {
      suggestion_id,
      generated_at: new Date().toISOString(),
      stored: false,
      evidence: false,
      authority_changed: false,
      possible_review_route: null,
      model: LLM_REASONING_MODEL,
    },
  }
}
