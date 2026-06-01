// Phase 37H.3 — Evidence Display Helpers
//
// Graph assistance explains evidence.
// Graph assistance does not create authority.
// Evidence explanation is not promotion.

import type { EvidenceRole, HydrationWarning } from './candidateSuggestionTypes'

// ─── Evidence Role Labels ──────────────────────────────────────────────────

export function evidenceRoleLabel(role: EvidenceRole): string {
  switch (role) {
    case 'confirmed_memory_evidence': return 'Confirmed Memory evidence'
    case 'candidate_context':         return 'Candidate context'
    case 'archive_provenance':        return 'Archive provenance'
    default:                          return role
  }
}

export function evidenceRoleExplanation(role: EvidenceRole): string {
  switch (role) {
    case 'confirmed_memory_evidence':
      return 'This source was canonical at suggestion time and may support the suggestion as stronger evidence.'
    case 'candidate_context':
      return 'This source was a canonical candidate at suggestion time. It is context only, not confirmed Memory evidence.'
    case 'archive_provenance':
      return 'This source provides archive provenance but is not treated as confirmed Memory evidence.'
    default:
      return ''
  }
}

// ─── Weighting Labels ──────────────────────────────────────────────────────

export function weightingExplanation(usedForWeighting: boolean): string {
  if (usedForWeighting) {
    return 'Weighted evidence — contributes to evidence strength assessment.'
  }
  return 'Not weighted — shown for context/provenance, not counted toward evidence strength.'
}

// ─── Warning Helpers ───────────────────────────────────────────────────────

export function makeStatusDriftWarning(
  label: string,
  snapshotStatus: string,
  currentStatus: string | null
): HydrationWarning {
  return {
    code: 'source_status_changed',
    message: `${label}: status changed since suggestion (was "${snapshotStatus}", now "${currentStatus ?? 'unknown'}").`,
    severity: 'warning',
  }
}

export function makeTargetStatusDriftWarning(
  snapshotStatus: string,
  currentStatus: string | null
): HydrationWarning {
  return {
    code: 'target_status_changed',
    message: `Target archive item status changed since suggestion (was "${snapshotStatus}", now "${currentStatus ?? 'unknown'}").`,
    severity: 'warning',
  }
}

export function makeMissingEvidenceWarning(type: string, id: string): HydrationWarning {
  return {
    code: 'evidence_not_found',
    message: `Referenced ${type} could not be found: ${id}`,
    severity: 'warning',
  }
}

export const STANDING_WARNINGS: HydrationWarning[] = [
  { code: 'suggestion_not_memory', message: 'This suggestion is not Memory.', severity: 'info' },
  { code: 'suggestion_not_prompt_eligible', message: 'This suggestion is not prompt eligible.', severity: 'info' },
]
