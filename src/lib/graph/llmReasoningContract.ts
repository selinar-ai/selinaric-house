// Phase 38.3.1 — LLM Reasoning Contract Utilities
//
// Reasoning explains evidence. Reasoning does not create authority.
// A reasoning-supported candidate is still only a candidate.
//
// Pure functions only. No LLM call. No API route. No UI. No database.
// No Supabase. No Anthropic. No OpenAI. No writes. No authority movement.

import type { HydratedGraphCandidateSuggestion } from './candidateSuggestionTypes'
import type { ReasoningBaseline } from './reasoningTypes'
import {
  LLM_REASONING_MANDATORY_BOUNDARY_HEADER,
  LLM_REASONING_BASE_DO_NOT_CONCLUDE,
  LLM_REASONING_FORBIDDEN_PHRASES,
  LLM_REASONING_SAFE_LANGUAGE_ALTERNATIVES,
  LLM_INPUT_EXCLUDED_FIELD_PATTERNS,
  type LLMReasoningInput,
  type LLMReasoningDraft,
  type LLMReasoningContractResult,
} from './llmReasoningTypes'

// ─── Forbidden Language Detection ──────────────────────────────────────────

export function containsForbiddenLLMReasoningLanguage(text: string): string[] {
  if (typeof text !== 'string') return []
  const lower = text.toLowerCase()
  return LLM_REASONING_FORBIDDEN_PHRASES.filter(phrase =>
    lower.includes(phrase.toLowerCase())
  )
}

// ─── Excluded Field Guard ──────────────────────────────────────────────────
// Recursively scans an object's keys for excluded field patterns.
// Does not block on harmless overlapping words (e.g. 'status' is not blocked).

export function assertNoExcludedLLMInputFields(
  value: unknown,
  _path: string = 'root'
): LLMReasoningContractResult<true> {
  if (value === null || value === undefined || typeof value !== 'object') {
    return { ok: true, value: true }
  }

  for (const key of Object.keys(value as Record<string, unknown>)) {
    const keyLower = key.toLowerCase()
    const matchedPattern = LLM_INPUT_EXCLUDED_FIELD_PATTERNS.find(pattern =>
      keyLower === pattern.toLowerCase() || keyLower.includes(pattern.toLowerCase())
    )
    if (matchedPattern) {
      return {
        ok: false,
        reason: `Excluded field detected: "${key}" matches pattern "${matchedPattern}"`,
        code: 'EXCLUDED_FIELD_DETECTED',
      }
    }

    // Recurse into nested objects (not arrays of primitives)
    const childValue = (value as Record<string, unknown>)[key]
    if (childValue !== null && typeof childValue === 'object' && !Array.isArray(childValue)) {
      const childResult = assertNoExcludedLLMInputFields(childValue, key)
      if (!childResult.ok) return childResult
    }
  }

  return { ok: true, value: true }
}

// ─── Deterministic Pre-Check ───────────────────────────────────────────────

export function canRunLLMReasoning(
  hydrated: HydratedGraphCandidateSuggestion,
  baseline: ReasoningBaseline
): LLMReasoningContractResult<true> {
  // 1. Packet must be sufficient
  if (!baseline.packetSufficient) {
    return {
      ok: false,
      reason: 'Insufficient evidence packet — reasoning not available.',
      code: 'INSUFFICIENT_PACKET',
    }
  }

  // 2. Insufficient_packet category must not be present
  if (baseline.categories.includes('insufficient_packet')) {
    return {
      ok: false,
      reason: 'Insufficient evidence packet — reasoning not available.',
      code: 'INSUFFICIENT_PACKET',
    }
  }

  // 3. candidate_type must be valid
  const candidateType = hydrated.suggestion.candidate_type
  if (candidateType !== 'memory_candidate' && candidateType !== 'held_truth_candidate') {
    return {
      ok: false,
      reason: 'LLM reasoning unavailable — candidate type invalid.',
      code: 'INVALID_CANDIDATE_TYPE',
    }
  }

  // 4. suggestion status must be known
  const status = hydrated.suggestion.status
  if (status !== 'pending_review' && status !== 'dismissed') {
    return {
      ok: false,
      reason: 'LLM reasoning unavailable — unknown suggestion status.',
      code: 'UNKNOWN_SUGGESTION_STATUS',
    }
  }

  // 5. Suggestion must have identity
  if (!hydrated.suggestion.id) {
    return {
      ok: false,
      reason: 'LLM reasoning unavailable — missing suggestion identity.',
      code: 'INPUT_CONTRACT_VIOLATION',
    }
  }

  return { ok: true, value: true }
}

// ─── Input Builder ─────────────────────────────────────────────────────────
// Maps only allowed fields from hydrated DTO + baseline into the LLM input.
// Excluded fields are structurally absent — they are never included.

export function buildLLMReasoningInput(
  hydrated: HydratedGraphCandidateSuggestion,
  baseline: ReasoningBaseline
): LLMReasoningContractResult<LLMReasoningInput> {
  // Pre-checks first
  const canRun = canRunLLMReasoning(hydrated, baseline)
  if (!canRun.ok) return canRun

  const s = hydrated.suggestion

  // Context-aware do-not-conclude additions
  const doNotConclude = [...LLM_REASONING_BASE_DO_NOT_CONCLUDE]
  if (baseline.categories.includes('graph_support_only')) {
    doNotConclude.push('Do not conclude the graph confirms the claim.')
  }
  if (baseline.hasStatusDrift) {
    doNotConclude.push('Do not rely on stale suggestion-time status as authority.')
  }
  if (!baseline.packetSufficient) {
    doNotConclude.push('Do not infer around missing evidence.')
  }

  const input: LLMReasoningInput = {
    suggestion: {
      suggestion_id: s.id,
      candidate_type: s.candidate_type,
      suggestion_status: s.status as 'pending_review' | 'dismissed', // narrowed by canRunLLMReasoning pre-check
      target_presence_id: s.target_presence_id ?? null,
    },

    candidateText: {
      proposed_label: s.proposed_label ?? null,
      proposed_summary: s.proposed_summary ?? null,
      proposed_truth_text: s.candidate_type === 'held_truth_candidate' ? (s.proposed_truth_text ?? null) : null,
      reason_for_candidate: s.reason_for_candidate ?? null,
      limits_or_uncertainties: s.limits_or_uncertainties ?? null,
      evidence_strength: s.evidence_strength ?? null,
    },

    targetArchiveItem: hydrated.targetArchiveItem ? {
      title: hydrated.targetArchiveItem.title ?? null,
      statusAtSuggestion: hydrated.targetArchiveItem.statusAtSuggestion ?? null,
      currentCanonicalStatus: hydrated.targetArchiveItem.currentCanonicalStatus ?? null,
      statusChanged: hydrated.targetArchiveItem.statusChanged,
    } : null,

    archiveSources: hydrated.hydratedArchiveSources.map(src => ({
      title: src.title ?? null,
      canonicalStatusSnapshot: src.canonicalStatusSnapshot ?? null,
      currentCanonicalStatus: src.currentCanonicalStatus ?? null,
      statusChanged: src.statusChanged,
      evidenceRole: src.evidenceRole ?? null,
      evidenceRoleLabel: src.evidenceRoleLabel ?? null,
      usedForWeighting: src.usedForWeighting,
      missing: src.missing,
    })),

    graphEvidence: {
      proposals: hydrated.hydratedProposals.map(p => ({
        label: p.label ?? null,
        proposalType: p.proposalType ?? null,
        nodeType: p.nodeType ?? null,
        edgeType: p.edgeType ?? null,
        status: p.status ?? null,
        authorityStatus: p.authorityStatus ?? null,
        summary: p.summary ?? null,
      })),
      legacyNodes: hydrated.hydratedLegacyNodes.map(n => ({
        label: n.label ?? null,
        nodeType: n.nodeType ?? null,
        approvalStatus: n.approvalStatus ?? null,
      })),
      legacyEdges: hydrated.hydratedLegacyEdges.map(e => ({
        edgeType: e.edgeType ?? null,
        description: e.description ?? null,
        approvalStatus: e.approvalStatus ?? null,
      })),
      deduplicatedSourceTitles: hydrated.hydratedDeduplicatedSources.map(d => d.title),
    },

    baseline: {
      categories: baseline.categories,
      evidenceCondition: baseline.evidenceCondition,
      packetSufficient: baseline.packetSufficient,
      hasStatusDrift: baseline.hasStatusDrift,
      evidenceProfile: baseline.evidenceProfile as Record<string, unknown>,
      insufficiencyReasons: baseline.insufficiencyReasons,
    },

    boundary: {
      mandatoryBoundaryHeader: LLM_REASONING_MANDATORY_BOUNDARY_HEADER,
      doNotConcludeItems: doNotConclude,
      forbiddenLanguage: [...LLM_REASONING_FORBIDDEN_PHRASES],
      safeLanguageAlternatives: [...LLM_REASONING_SAFE_LANGUAGE_ALTERNATIVES],
    },
  }

  // Final excluded-field guard on the built object
  const guard = assertNoExcludedLLMInputFields(input)
  if (!guard.ok) return guard

  return { ok: true, value: input }
}

// ─── Input Validator ───────────────────────────────────────────────────────

export function validateLLMReasoningInput(
  input: unknown
): LLMReasoningContractResult<LLMReasoningInput> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      reason: 'LLM reasoning input must be an object.',
      code: 'INPUT_CONTRACT_VIOLATION',
    }
  }

  const obj = input as Record<string, unknown>

  // Required top-level keys
  for (const key of ['suggestion', 'candidateText', 'archiveSources', 'graphEvidence', 'baseline', 'boundary']) {
    if (!(key in obj)) {
      return {
        ok: false,
        reason: `LLM reasoning input missing required field: "${key}"`,
        code: 'INPUT_CONTRACT_VIOLATION',
      }
    }
  }

  // Excluded field check
  const guard = assertNoExcludedLLMInputFields(input)
  if (!guard.ok) return guard

  // suggestion sub-check
  const suggestion = obj.suggestion as Record<string, unknown>
  if (!suggestion?.suggestion_id || !suggestion?.candidate_type || !suggestion?.suggestion_status) {
    return {
      ok: false,
      reason: 'LLM reasoning input: suggestion identity fields missing.',
      code: 'INPUT_CONTRACT_VIOLATION',
    }
  }
  if (suggestion.candidate_type !== 'memory_candidate' && suggestion.candidate_type !== 'held_truth_candidate') {
    return {
      ok: false,
      reason: 'LLM reasoning input: invalid candidate_type.',
      code: 'INVALID_CANDIDATE_TYPE',
    }
  }

  // baseline packetSufficient check
  const baseline = obj.baseline as Record<string, unknown>
  if (baseline?.packetSufficient === false) {
    return {
      ok: false,
      reason: 'Insufficient evidence packet — reasoning not available.',
      code: 'INSUFFICIENT_PACKET',
    }
  }
  const categories = Array.isArray(baseline?.categories) ? baseline.categories as string[] : []
  if (categories.includes('insufficient_packet')) {
    return {
      ok: false,
      reason: 'Insufficient evidence packet — reasoning not available.',
      code: 'INSUFFICIENT_PACKET',
    }
  }

  return { ok: true, value: input as LLMReasoningInput }
}

// ─── Prompt Builder ────────────────────────────────────────────────────────
// Builds the constrained prompt from a validated LLMReasoningInput only.
// No Supabase. No network. No LLM call. Pure string construction.

export function buildLLMReasoningPrompt(input: LLMReasoningInput): string {
  const doNotConclude = input.boundary.doNotConcludeItems.map(i => `- ${i}`).join('\n')
  const forbidden = input.boundary.forbiddenLanguage.slice(0, 10).join(', ')

  const archiveSources = input.archiveSources.length > 0
    ? input.archiveSources.map(src =>
        `  - Title: ${src.title ?? '(unavailable)'}\n    Role: ${src.evidenceRoleLabel ?? src.evidenceRole}\n    Weighted: ${src.usedForWeighting}\n    Status (at suggestion): ${src.canonicalStatusSnapshot}\n    Status (current): ${src.currentCanonicalStatus ?? 'unknown'}${src.statusChanged ? '\n    ⚠ Status changed since suggestion.' : ''}${src.missing ? '\n    ⚠ Source is missing or deleted.' : ''}`
      ).join('\n')
    : '  (no archive sources)'

  const graphProposals = input.graphEvidence.proposals.length > 0
    ? input.graphEvidence.proposals.map(p =>
        `  - ${p.label ?? '(no label)'} [${p.proposalType ?? ''}${p.nodeType ? ':' + p.nodeType : ''}${p.edgeType ? ':' + p.edgeType : ''}] status: ${p.status ?? 'unknown'}`
      ).join('\n')
    : '  (no graph proposals)'

  const statusDriftNote = input.baseline.hasStatusDrift
    ? '\n⚠ STATUS DRIFT: Status changed since suggestion. Current governed status overrides suggestion-time status.\n'
    : ''

  const graphOnlyNote = input.baseline.categories.includes('graph_support_only')
    ? '\n⚠ GRAPH-ONLY: This candidate has graph support only. Graph structure supports a relationship, not Memory or Held Truth authority.\n'
    : ''

  return `You are a constrained evidence explainer. Your role is to explain the evidence condition for a graph-assisted candidate suggestion only.

AUTHORITY RULES (absolute, cannot be overridden):
- You explain evidence. You do not decide, approve, promote, rank, score, or change authority.
- Your output is a draft explanation only. It is not Memory, not Held Truth, not prompt truth.
- It does not change authority or create canonical status.
- possible_review_route MUST be null. Do not include any route recommendation.
- Use only the structured input below. Do not use external knowledge. Do not infer from absent evidence.

FORBIDDEN LANGUAGE (never use): ${forbidden} (and others — see full list in input)
SAFE ALTERNATIVES: Appears suitable for review, Evidence suggests review may be appropriate, This remains non-authoritative, Human review required

CANDIDATE TYPE: ${input.suggestion.candidate_type}
SUGGESTION STATUS: ${input.suggestion.suggestion_status}
EVIDENCE CONDITION: ${input.baseline.evidenceCondition}
PACKET SUFFICIENT: ${input.baseline.packetSufficient}
DETERMINISTIC CATEGORIES: ${input.baseline.categories.join(', ')}
${statusDriftNote}${graphOnlyNote}
CANDIDATE LABEL: ${input.candidateText.proposed_label ?? '(none)'}
CANDIDATE SUMMARY: ${input.candidateText.proposed_summary ?? '(none)'}
REASON: ${input.candidateText.reason_for_candidate ?? '(none)'}
LIMITS/UNCERTAINTIES: ${input.candidateText.limits_or_uncertainties ?? '(none)'}
EVIDENCE STRENGTH: ${input.candidateText.evidence_strength ?? '(none)'}
${input.targetArchiveItem ? `TARGET ARCHIVE ITEM: ${input.targetArchiveItem.title ?? '(unavailable)'} [status at suggestion: ${input.targetArchiveItem.statusAtSuggestion}, now: ${input.targetArchiveItem.currentCanonicalStatus}${input.targetArchiveItem.statusChanged ? ', ⚠ changed' : ''}]` : ''}
${input.suggestion.candidate_type === 'held_truth_candidate' && input.candidateText.proposed_truth_text ? `PROPOSED TRUTH: ${input.candidateText.proposed_truth_text}` : ''}

ARCHIVE SOURCES:
${archiveSources}

GRAPH STRUCTURE EVIDENCE:
${graphProposals}

DO NOT CONCLUDE:
${doNotConclude}

OUTPUT INSTRUCTIONS:
Return ONLY valid JSON matching this exact schema. No markdown. No prose outside JSON.

{
  "evidence_summary": "<plain-language summary of evidence condition, max 150 words>",
  "directly_supported": ["<claims directly supported by weighted canonical archive evidence — empty if none>"],
  "graph_supported": ["<relationships supported by approved graph structure — must say this is not Memory/Held Truth authority>"],
  "inferred_only": ["<clearly labelled inferences — each must say 'This is an inference, not confirmed evidence.'>"],
  "missing_or_weak": ["<missing or weak evidence items drawn from deterministic categories>"],
  "authority_boundary": "${LLM_REASONING_MANDATORY_BOUNDARY_HEADER}",
  "possible_review_route": null,
  "do_not_conclude": ${JSON.stringify(input.boundary.doNotConcludeItems)},
  "uncertainty_note": "<brief uncertainty note or null>"
}

REMINDER: authority_boundary must be exactly: "${LLM_REASONING_MANDATORY_BOUNDARY_HEADER}"
REMINDER: possible_review_route must be null.
REMINDER: do_not_conclude must include all items listed above.`
}

// ─── Draft Validator ───────────────────────────────────────────────────────

export function validateLLMReasoningDraft(
  draft: unknown,
  baseline: ReasoningBaseline
): LLMReasoningContractResult<LLMReasoningDraft> {
  // Insufficient packets must never produce drafts
  if (!baseline.packetSufficient || baseline.categories.includes('insufficient_packet')) {
    return {
      ok: false,
      reason: 'Insufficient evidence packet — reasoning not available.',
      code: 'INSUFFICIENT_PACKET',
    }
  }

  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    return {
      ok: false,
      reason: 'LLM reasoning draft must be an object.',
      code: 'OUTPUT_SCHEMA_INVALID',
    }
  }

  const obj = draft as Record<string, unknown>

  // Required sections
  const requiredSections = [
    'evidence_summary',
    'directly_supported',
    'graph_supported',
    'inferred_only',
    'missing_or_weak',
    'authority_boundary',
    'possible_review_route',
    'do_not_conclude',
    'uncertainty_note',
  ]
  for (const section of requiredSections) {
    if (!(section in obj)) {
      return {
        ok: false,
        reason: `LLM reasoning draft missing required section: "${section}"`,
        code: 'OUTPUT_SCHEMA_INVALID',
      }
    }
  }

  // possible_review_route must be null — locked in 38.3.1
  if (obj.possible_review_route !== null) {
    return {
      ok: false,
      reason: 'possible_review_route must be null. Review-route language is deferred.',
      code: 'REVIEW_ROUTE_NOT_ALLOWED',
    }
  }

  // authority_boundary must be non-empty and contain mandatory header
  if (typeof obj.authority_boundary !== 'string' || !obj.authority_boundary.trim()) {
    return {
      ok: false,
      reason: 'LLM reasoning draft: authority_boundary is empty.',
      code: 'OUTPUT_SCHEMA_INVALID',
    }
  }
  if (!obj.authority_boundary.includes(LLM_REASONING_MANDATORY_BOUNDARY_HEADER)) {
    return {
      ok: false,
      reason: 'LLM reasoning draft: authority_boundary missing mandatory boundary header.',
      code: 'OUTPUT_SCHEMA_INVALID',
    }
  }

  // do_not_conclude must be an array and contain all base items
  if (!Array.isArray(obj.do_not_conclude)) {
    return {
      ok: false,
      reason: 'LLM reasoning draft: do_not_conclude must be an array.',
      code: 'OUTPUT_SCHEMA_INVALID',
    }
  }
  for (const item of LLM_REASONING_BASE_DO_NOT_CONCLUDE) {
    if (!(obj.do_not_conclude as string[]).includes(item)) {
      return {
        ok: false,
        reason: `LLM reasoning draft: do_not_conclude missing base item: "${item}"`,
        code: 'OUTPUT_SCHEMA_INVALID',
      }
    }
  }

  // Array sections must be arrays
  for (const arrSection of ['directly_supported', 'graph_supported', 'inferred_only', 'missing_or_weak']) {
    if (!Array.isArray(obj[arrSection])) {
      return {
        ok: false,
        reason: `LLM reasoning draft: "${arrSection}" must be an array.`,
        code: 'OUTPUT_SCHEMA_INVALID',
      }
    }
  }

  // evidence_summary must be a non-empty string
  if (typeof obj.evidence_summary !== 'string' || !obj.evidence_summary.trim()) {
    return {
      ok: false,
      reason: 'LLM reasoning draft: evidence_summary must be a non-empty string.',
      code: 'OUTPUT_SCHEMA_INVALID',
    }
  }

  // uncertainty_note must be string or null
  if (obj.uncertainty_note !== null && typeof obj.uncertainty_note !== 'string') {
    return {
      ok: false,
      reason: 'LLM reasoning draft: uncertainty_note must be a string or null.',
      code: 'OUTPUT_SCHEMA_INVALID',
    }
  }

  // Forbidden language scan across all string fields
  const allText = [
    obj.evidence_summary,
    ...(obj.directly_supported as string[]),
    ...(obj.graph_supported as string[]),
    ...(obj.inferred_only as string[]),
    ...(obj.missing_or_weak as string[]),
    obj.authority_boundary,
    ...(obj.do_not_conclude as string[]),
    obj.uncertainty_note ?? '',
  ].join('\n')

  const forbidden = containsForbiddenLLMReasoningLanguage(allText)
  if (forbidden.length > 0) {
    return {
      ok: false,
      reason: `LLM reasoning draft failed safety validation — forbidden language detected: "${forbidden[0]}"`,
      code: 'FORBIDDEN_LANGUAGE_DETECTED',
    }
  }

  return { ok: true, value: draft as LLMReasoningDraft }
}
