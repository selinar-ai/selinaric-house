// Phase 38.5.1 — Reasoning Audit Writer (Server-Only)
//
// Server-only. Never import in 'use client' components.
// Imports Supabase — must stay server-side.
//
// Audit records trace. Audit does not create truth.
// Audit does not become evidence. Audit does not move authority.
//
// Append-only. No update. No delete. No upsert.
// Never stores: draft text, prompt, model output, archive content,
// chat history, secrets, cookies, or provider response body.
//
// Fail-closed contract for 38.5.2:
//   If createReasoningAuditEvent returns { ok: false },
//   the caller (LLM draft route) must not proceed or return a draft.
//   No trace, no draft.

import { supabase } from '@/lib/supabase'
import {
  validateReasoningAuditInput,
  type ReasoningAuditInput,
  type ReasoningAuditResult,
} from '@/lib/graph/reasoningAuditTypes'

// Re-export for callers that need the types
export type {
  ReasoningAuditInput,
  ReasoningAuditResult,
  ReasoningAuditEventType,
  ReasoningMode,
  ReasoningAuditStatus,
} from '@/lib/graph/reasoningAuditTypes'

export { validateReasoningAuditInput, AUDIT_FORBIDDEN_FIELDS } from '@/lib/graph/reasoningAuditTypes'

// ─── Audit writer ─────────────────────────────────────────────────────────

export async function createReasoningAuditEvent(
  input: ReasoningAuditInput
): Promise<ReasoningAuditResult> {
  // Validate input — pure check before any DB call
  const validation = validateReasoningAuditInput(input)
  if (!validation.ok) {
    return {
      ok: false,
      code: 'REASONING_AUDIT_INPUT_INVALID',
      reason: validation.reason ?? 'Audit input invalid',
    }
  }

  // Insert — server-set governance fields, never from caller
  const { data, error } = await supabase
    .from('reasoning_audit_events')
    .insert({
      suggestion_id: input.suggestion_id,
      event_type: input.event_type,
      reasoning_mode: input.reasoning_mode,
      event_status: input.event_status,
      failure_code: input.failure_code ?? null,
      baseline_evidence_condition: input.baseline_evidence_condition ?? null,
      baseline_packet_sufficient: input.baseline_packet_sufficient ?? null,
      baseline_categories: input.baseline_categories ?? null,
      archive_source_count: input.archive_source_count ?? null,
      graph_source_count: input.graph_source_count ?? null,
      evidence_source_ids: input.evidence_source_ids ?? null,
      llm_model: input.llm_model ?? null,
      llm_validation_passed: input.llm_validation_passed ?? null,
      // Server-set governance — never accept from caller:
      authority_changed: false,
      not_evidence: true,
      prompt_eligible: false,
      review_routed: false,
      created_by: 'system',
    })
    .select('id')
    .single()

  if (error || !data) {
    // Never expose DB error details, SQL, stack, or payload
    console.error('[reasoningAudit] Write failed:', error?.message?.slice(0, 60) ?? 'unknown')
    return {
      ok: false,
      code: 'REASONING_AUDIT_WRITE_FAILED',
      reason: 'Audit event could not be written.',
    }
  }

  return {
    ok: true,
    audit_event_id: data.id,
    authority_changed: false,
    not_evidence: true,
    prompt_eligible: false,
    review_routed: false,
  }
}
