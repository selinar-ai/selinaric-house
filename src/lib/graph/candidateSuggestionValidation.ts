// Phase 37H.1 — Graph-Assisted Candidate Suggestion Validation
//
// Graph assistance is evidence support, not Memory authority.
// A graph-supported candidate is still only a candidate.
// prompt_eligible is always false on suggestions.

import {
  isValidCandidateType,
  isValidSuggestionStatus,
  isValidEvidenceRole,
  isValidEvidenceStrength,
  isValidCanonicalStatusSnapshot,
  type SupportingArchiveSource,
} from './candidateSuggestionTypes'

// ─── Result Types ──────────────────────────────────────────────────────────

export interface CandidateSuggestionValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface CircularEvidenceResult {
  hasCircularEvidence: boolean
  overlappingArchiveIds: string[]
  warnings: string[]
}

export interface EvidenceRoleConsistencyResult {
  valid: boolean
  errors: string[]
}

// ─── Input Shape ───────────────────────────────────────────────────────────

export interface CandidateSuggestionInput {
  candidate_type?: string
  status?: string
  prompt_eligible?: boolean
  proposed_label?: string
  proposed_summary?: string | null
  proposed_truth_text?: string | null
  target_presence_id?: string | null
  target_archive_item_id?: string | null
  supporting_graph_node_ids?: string[]
  supporting_graph_edge_ids?: string[]
  supporting_proposal_ids?: string[]
  supporting_archive_sources?: SupportingArchiveSource[]
  deduplicated_evidence_sources?: string[]
  evidence_strength?: string
  reason_for_candidate?: string
  limits_or_uncertainties?: string | null
}

// ─── Main Validator ────────────────────────────────────────────────────────

export function validateCandidateSuggestion(
  input: CandidateSuggestionInput
): CandidateSuggestionValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // candidate_type
  if (!input.candidate_type || !isValidCandidateType(input.candidate_type)) {
    errors.push(`Invalid candidate_type: "${input.candidate_type ?? ''}"`)
  }

  // status
  if (input.status !== undefined && !isValidSuggestionStatus(input.status)) {
    errors.push(`Invalid status: "${input.status}"`)
  }

  // prompt_eligible — hard reject
  if (input.prompt_eligible !== false) {
    errors.push(
      'prompt_eligible must be false. Graph assistance is evidence support, not Memory authority.'
    )
  }

  // proposed_label
  if (!input.proposed_label || input.proposed_label.trim().length === 0) {
    errors.push('proposed_label is required and must be non-empty')
  }

  // reason_for_candidate
  if (!input.reason_for_candidate || input.reason_for_candidate.trim().length === 0) {
    errors.push('reason_for_candidate is required and must be non-empty')
  }

  // evidence_strength
  if (input.evidence_strength !== undefined && !isValidEvidenceStrength(input.evidence_strength)) {
    errors.push(`Invalid evidence_strength: "${input.evidence_strength}"`)
  }

  // ── Candidate-type-specific field requirements ───────────────────────────

  if (input.candidate_type === 'memory_candidate') {
    if (!input.target_archive_item_id) {
      errors.push('memory_candidate requires target_archive_item_id')
    }
  }

  if (input.candidate_type === 'held_truth_candidate') {
    if (!input.target_presence_id) {
      errors.push('held_truth_candidate requires target_presence_id')
    }
    if (!input.proposed_truth_text || input.proposed_truth_text.trim().length === 0) {
      errors.push('held_truth_candidate requires proposed_truth_text')
    }
  }

  // ── Supporting archive sources ───────────────────────────────────────────

  if (input.supporting_archive_sources) {
    for (let i = 0; i < input.supporting_archive_sources.length; i++) {
      const src = input.supporting_archive_sources[i]

      if (!isValidEvidenceRole(src.evidence_role)) {
        errors.push(`supporting_archive_sources[${i}]: invalid evidence_role "${src.evidence_role}"`)
      }

      if (!isValidCanonicalStatusSnapshot(src.canonical_status_snapshot)) {
        errors.push(
          `supporting_archive_sources[${i}]: invalid canonical_status_snapshot "${src.canonical_status_snapshot}"`
        )
      }
    }

    const roleResult = validateEvidenceRoleConsistency(input.supporting_archive_sources)
    errors.push(...roleResult.errors)
  }

  // ── Deduplicated evidence sources ────────────────────────────────────────

  if (!input.deduplicated_evidence_sources) {
    errors.push('deduplicated_evidence_sources is required')
  }

  // ── Warnings ─────────────────────────────────────────────────────────────

  if (!input.supporting_graph_node_ids || input.supporting_graph_node_ids.length === 0) {
    warnings.push('No graph node evidence linked')
  }

  if (!input.limits_or_uncertainties) {
    warnings.push('Consider documenting limits or uncertainties')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

// ─── Evidence Role Consistency ─────────────────────────────────────────────

export function validateEvidenceRoleConsistency(
  sources: SupportingArchiveSource[]
): EvidenceRoleConsistencyResult {
  const errors: string[] = []

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i]
    const snap = src.canonical_status_snapshot
    const role = src.evidence_role

    if (snap === 'canonical') {
      // canonical items may be confirmed_memory_evidence OR archive_provenance
      if (role !== 'confirmed_memory_evidence' && role !== 'archive_provenance') {
        errors.push(
          `supporting_archive_sources[${i}]: canonical item must have evidence_role ` +
          `"confirmed_memory_evidence" or "archive_provenance", got "${role}"`
        )
      }
    } else if (snap === 'canonical_candidate') {
      // canonical_candidate must NEVER be confirmed_memory_evidence
      if (role !== 'candidate_context') {
        errors.push(
          `supporting_archive_sources[${i}]: canonical_candidate must have evidence_role ` +
          `"candidate_context", got "${role}". A canonical_candidate is not confirmed Memory.`
        )
      }
    } else {
      // All other statuses must be archive_provenance
      if (role !== 'archive_provenance') {
        errors.push(
          `supporting_archive_sources[${i}]: ${snap} item must have evidence_role ` +
          `"archive_provenance", got "${role}"`
        )
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

// ─── Circular Evidence Detection ───────────────────────────────────────────

export function validateCircularEvidence(input: {
  supporting_archive_sources: SupportingArchiveSource[]
  supporting_graph_node_ids: string[]
  graphNodeSourceItemIds: Record<string, string[]>
}): CircularEvidenceResult {
  const warnings: string[] = []

  // Collect archive item IDs used for weighting
  const weightedArchiveIds = new Set<string>()
  for (const src of input.supporting_archive_sources) {
    if (src.used_for_weighting) {
      weightedArchiveIds.add(src.archive_item_id)
    }
  }

  // Collect archive item IDs that graph nodes were derived from
  const graphDerivedArchiveIds = new Set<string>()
  for (const nodeId of input.supporting_graph_node_ids) {
    const sourceIds = input.graphNodeSourceItemIds[nodeId]
    if (sourceIds) {
      for (const sid of sourceIds) {
        graphDerivedArchiveIds.add(sid)
      }
    }
  }

  // Find overlap
  const overlapping: string[] = Array.from(weightedArchiveIds).filter(
    id => graphDerivedArchiveIds.has(id)
  )

  if (overlapping.length > 0) {
    warnings.push(
      `Circular evidence: ${overlapping.length} archive item(s) appear as both direct ` +
      `weighted evidence and as source(s) of supporting graph nodes. ` +
      `Graph evidence derived from the same archive item must not be double-weighted.`
    )
  }

  return {
    hasCircularEvidence: overlapping.length > 0,
    overlappingArchiveIds: overlapping,
    warnings,
  }
}
