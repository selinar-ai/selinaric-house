// Phase 38.3.2 — LLM Reasoning Draft Service
//
// Reasoning explains evidence. Reasoning does not create authority.
// A reasoning-supported candidate is still only a candidate.
//
// Read-only. No writes. No storage. No UI. No streaming. No audit logging.
// No authority movement. No prompt injection.
//
// This service is server-only. It imports the Anthropic SDK for the
// actual model call and must never be imported by client components.

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
  type LLMReasoningContractResult,
  type LLMReasoningFailureCode,
} from './llmReasoningTypes'

// ─── Extended failure codes for service-level failures ─────────────────────

export type LLMDraftFailureCode =
  | LLMReasoningFailureCode
  | 'LLM_UNAVAILABLE'
  | 'HYDRATION_FAILED'
  | 'LLM_OUTPUT_PARSE_FAILED'
  | 'LLM_OUTPUT_VALIDATION_FAILED'

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

// ─── Main Draft Generator ──────────────────────────────────────────────────

const LLM_REASONING_MODEL = 'claude-haiku-4-5'
const LLM_REASONING_MAX_TOKENS = 1200

export async function generateLLMReasoningDraft(
  suggestion_id: string
): Promise<LLMDraftResult> {
  // 1. Check provider availability
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return fail('LLM_UNAVAILABLE', 'ANTHROPIC_API_KEY not configured')
  }

  // 2. Hydrate suggestion (read-only)
  const hydrated = await hydrateCandidateSuggestion(suggestion_id)
  if (!hydrated) {
    return fail('HYDRATION_FAILED', 'Suggestion not found or could not be hydrated')
  }

  // 3. Build deterministic baseline
  const baseline = buildReasoningBaseline(hydrated)

  // 4. Pre-check gate — must pass before any LLM call
  const preCheck = canRunLLMReasoning(hydrated, baseline)
  if (!preCheck.ok) {
    return fail(preCheck.code, preCheck.reason)
  }

  // 5. Build and validate input packet
  const inputResult = buildLLMReasoningInput(hydrated, baseline)
  if (!inputResult.ok) {
    return fail(inputResult.code, inputResult.reason)
  }

  const inputValidation = validateLLMReasoningInput(inputResult.value)
  if (!inputValidation.ok) {
    return fail(inputValidation.code, inputValidation.reason)
  }

  // 6. Build constrained prompt from validated input only
  const prompt = buildLLMReasoningPrompt(inputResult.value)

  // 7. Call LLM — no tools, no retrieval, no streaming
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
      return fail('LLM_OUTPUT_PARSE_FAILED', 'LLM returned no text content')
    }
    rawText = firstContent.text
  } catch (err) {
    // Do not expose provider errors that include secrets or prompt payload
    const safeMsg = err instanceof Error ? err.message.slice(0, 100) : 'provider error'
    return fail('LLM_UNAVAILABLE', `LLM call failed: ${safeMsg}`)
  }

  // 8. Parse JSON — do not expose raw output on failure
  let parsed: unknown
  try {
    // Strip potential markdown code fences if model wraps JSON
    const cleaned = rawText.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    return fail('LLM_OUTPUT_PARSE_FAILED', 'LLM output could not be parsed as JSON')
  }

  // 9. Validate output — do not return unsafe draft
  const draftValidation = validateLLMReasoningDraft(parsed, baseline)
  if (!draftValidation.ok) {
    return fail('LLM_OUTPUT_VALIDATION_FAILED', draftValidation.reason)
  }

  // 10. Return validated draft — no storage, no mutation
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
