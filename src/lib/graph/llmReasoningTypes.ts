// Phase 38.3.1 — LLM Reasoning Contract Types
//
// Reasoning explains evidence. Reasoning does not create authority.
// A reasoning-supported candidate is still only a candidate.
//
// No LLM call exists in this file.
// No API route exists in this file.
// No UI exists in this file.
// No database writes exist in this file.
// No authority movement exists in this file.

// ─── Failure Codes ─────────────────────────────────────────────────────────

export type LLMReasoningFailureCode =
  | 'INSUFFICIENT_PACKET'
  | 'INVALID_CANDIDATE_TYPE'
  | 'UNKNOWN_SUGGESTION_STATUS'
  | 'INPUT_CONTRACT_VIOLATION'
  | 'EXCLUDED_FIELD_DETECTED'
  | 'OUTPUT_SCHEMA_INVALID'
  | 'FORBIDDEN_LANGUAGE_DETECTED'
  | 'AUTHORITY_LANGUAGE_DETECTED'
  | 'REVIEW_ROUTE_NOT_ALLOWED'
  | 'RECURSIVE_EVIDENCE_RISK'

// ─── Safe Result ────────────────────────────────────────────────────────────

export type LLMReasoningContractResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string; code: LLMReasoningFailureCode }

// ─── LLM Input ─────────────────────────────────────────────────────────────

export interface LLMReasoningInput {
  suggestion: {
    suggestion_id: string
    candidate_type: 'memory_candidate' | 'held_truth_candidate'
    suggestion_status: 'pending_review' | 'dismissed'
    target_presence_id?: string | null
  }

  candidateText: {
    proposed_label: string | null
    proposed_summary: string | null
    proposed_truth_text: string | null
    reason_for_candidate: string | null
    limits_or_uncertainties: string | null
    evidence_strength: 'strong' | 'moderate' | 'weak' | null
  }

  targetArchiveItem?: {
    title: string | null
    statusAtSuggestion: string | null
    currentCanonicalStatus: string | null
    statusChanged: boolean
  } | null

  archiveSources: Array<{
    title: string | null
    canonicalStatusSnapshot: string | null
    currentCanonicalStatus: string | null
    statusChanged: boolean
    evidenceRole: string | null
    evidenceRoleLabel: string | null
    usedForWeighting: boolean
    missing: boolean
  }>

  graphEvidence: {
    proposals: Array<{
      label: string | null
      proposalType?: string | null
      nodeType?: string | null
      edgeType?: string | null
      status: string | null
      authorityStatus?: string | null
      summary?: string | null
    }>
    legacyNodes: Array<{
      label: string | null
      nodeType: string | null
      approvalStatus: string | null
    }>
    legacyEdges: Array<{
      edgeType: string | null
      description: string | null
      approvalStatus: string | null
    }>
    deduplicatedSourceTitles: string[]
  }

  baseline: {
    categories: string[]
    evidenceCondition: string
    packetSufficient: boolean
    hasStatusDrift: boolean
    evidenceProfile: Record<string, unknown>
    insufficiencyReasons?: string[]
  }

  boundary: {
    mandatoryBoundaryHeader: string
    doNotConcludeItems: string[]
    forbiddenLanguage: string[]
    safeLanguageAlternatives: string[]
  }
}

// ─── LLM Output Draft ──────────────────────────────────────────────────────
// possible_review_route is permanently null in 38.3.1 and until separately approved.

export interface LLMReasoningDraft {
  evidence_summary: string
  directly_supported: string[]
  graph_supported: string[]
  inferred_only: string[]
  missing_or_weak: string[]
  authority_boundary: string
  possible_review_route: null
  do_not_conclude: string[]
  uncertainty_note: string | null
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const LLM_REASONING_MANDATORY_BOUNDARY_HEADER =
  'Draft explanation only. Not Memory. Not Held Truth. Not prompt eligible. Does not change authority.'

export const LLM_REASONING_BASE_DO_NOT_CONCLUDE: readonly string[] = [
  'Do not conclude this is Memory.',
  'Do not conclude this is Held Truth.',
  'Do not conclude this is prompt truth.',
  'Do not conclude graph support is authority.',
  'Do not conclude reasoning approval has occurred.',
] as const

export const LLM_REASONING_FORBIDDEN_PHRASES: readonly string[] = [
  'Approve this',
  'Promote this',
  'Make this Memory',
  'Make this Held Truth',
  'This is true',
  'This is confirmed',
  'This is canonical',
  'This belongs in prompt',
  'This should be prompt eligible',
  'This proves',
  'The graph confirms',
  'The reasoning confirms',
  'The AI decided',
  'The system decided',
  'Automatically classify as Memory',
  'Automatically classify as Held Truth',
  'Verdict',
  'Decision',
  'Approval Recommendation',
  'Truth Status',
  'AI Judgment',
  'Confidence Score',
] as const

export const LLM_REASONING_SAFE_LANGUAGE_ALTERNATIVES: readonly string[] = [
  'Appears suitable for review',
  'May be worth reviewing',
  'Evidence suggests review may be appropriate',
  'Graph structure supports a relationship, not authority',
  'Archive evidence directly supports part of the claim',
  'Current packet lacks enough direct evidence',
  'This remains non-authoritative',
  'Human review required',
  'Do not treat as Memory',
  'Do not treat as Held Truth',
  'Do not treat as prompt truth',
  'This is an inference, not confirmed evidence',
  'Review route suggestion only',
] as const

// ─── Excluded field patterns ────────────────────────────────────────────────
// These key-name patterns must be rejected from LLM input objects.

export const LLM_INPUT_EXCLUDED_FIELD_PATTERNS: readonly string[] = [
  'raw_content',
  'chat_history',
  'conversation',
  'messages',
  'system_prompt',
  'developer_prompt',
  'prompt_context',
  'prompt_injection',
  'prior_reasoning',
  'reasoning_output',
  'reasoning_audit',
  'supabase',
  'service_role',
  'secret',
  'credential',
  'api_key',
  'access_token',
  'refresh_token',
  'mutation',
  'confirm_memory',
  'promoteToHeldTruth',
  'updateHeldTruthStatus',
  'memory_injection',
  'getHeldTruthsForPrompt',
  'prompt_eligible_mutation',
] as const
