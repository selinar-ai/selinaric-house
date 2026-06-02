// Phase 38.5.1 — Reasoning Audit Types and Pure Validation
//
// Pure module — no Supabase, no network, no side effects.
// Safe to import in tests via tsx harness.
//
// Audit records trace. Audit does not create truth.
// Audit does not become evidence. Audit does not move authority.

// ─── Types ────────────────────────────────────────────────────────────────

export type ReasoningAuditEventType =
  | 'llm_draft_requested'
  | 'llm_precheck_blocked'
  | 'llm_output_invalid'
  | 'llm_draft_returned'

export type ReasoningMode =
  | 'llm_assisted'
  | 'deterministic'

export type ReasoningAuditStatus =
  | 'success'
  | 'blocked'
  | 'failed'

export interface ReasoningAuditInput {
  suggestion_id: string
  event_type: ReasoningAuditEventType
  reasoning_mode: ReasoningMode
  event_status: ReasoningAuditStatus
  failure_code?: string | null
  baseline_evidence_condition?: string | null
  baseline_packet_sufficient?: boolean | null
  baseline_categories?: string[] | null
  archive_source_count?: number | null
  graph_source_count?: number | null
  evidence_source_ids?: string[] | null
  llm_model?: string | null
  llm_validation_passed?: boolean | null
}

export type ReasoningAuditResult =
  | {
      ok: true
      audit_event_id: string
      authority_changed: false
      not_evidence: true
      prompt_eligible: false
      review_routed: false
    }
  | {
      ok: false
      code: 'REASONING_AUDIT_WRITE_FAILED' | 'REASONING_AUDIT_INPUT_INVALID'
      reason: string
    }

// ─── Forbidden fields — must never appear in audit input ──────────────────

export const AUDIT_FORBIDDEN_FIELDS: readonly string[] = [
  // Draft body/sections — not evidence, never stored
  'draft', 'evidence_summary', 'directly_supported', 'graph_supported',
  'inferred_only', 'missing_or_weak', 'authority_boundary', 'do_not_conclude',
  'uncertainty_note',
  // Prompt and model output — never stored
  'prompt', 'prompt_text', 'prompt_json', 'model_response', 'raw_response',
  'raw_output', 'system_prompt', 'developer_prompt', 'prompt_context',
  // Archive/chat content — never stored
  'raw_content', 'content', 'messages', 'chat_history', 'archive_content',
  // Provider and credential material — security
  'ANTHROPIC_API_KEY', 'HOUSE_AUTH_SECRET', 'HOUSE_AUTH_PASSWORD',
  'service_role', 'api_key', 'access_token', 'auth_cookie', 'cookie',
  'prompt_injection',
  // Deferred future fields — not in 38.5.1
  'feedback_event_id', 'packet_fingerprint', 'draft_hash',
  // Governance fields — server-set only, never from caller
  'authority_changed', 'not_evidence', 'prompt_eligible', 'review_routed',
  'created_by',
] as const

// ─── Pure input validation ────────────────────────────────────────────────

export function validateReasoningAuditInput(
  input: unknown
): { ok: boolean; reason?: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, reason: 'Audit input must be a non-null object' }
  }

  const obj = input as Record<string, unknown>

  // Forbidden field check
  for (const key of Object.keys(obj)) {
    if ((AUDIT_FORBIDDEN_FIELDS as readonly string[]).includes(key)) {
      return { ok: false, reason: `Forbidden field in audit input: "${key}"` }
    }
  }

  // Required fields
  if (!obj.suggestion_id || typeof obj.suggestion_id !== 'string') {
    return { ok: false, reason: 'suggestion_id is required' }
  }
  if (!obj.event_type || typeof obj.event_type !== 'string') {
    return { ok: false, reason: 'event_type is required' }
  }
  if (!obj.reasoning_mode || typeof obj.reasoning_mode !== 'string') {
    return { ok: false, reason: 'reasoning_mode is required' }
  }
  if (!obj.event_status || typeof obj.event_status !== 'string') {
    return { ok: false, reason: 'event_status is required' }
  }

  return { ok: true }
}
