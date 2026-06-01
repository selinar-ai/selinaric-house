// Phase 37H.1 — Graph-Assisted Candidate Suggestion Types
//
// Graph assistance is evidence support, not Memory authority.
// A graph-supported candidate is still only a candidate.
// prompt_eligible is always false on suggestions.

// ─── Candidate Types ───────────────────────────────────────────────────────

export const CANDIDATE_TYPES = [
  'memory_candidate',
  'held_truth_candidate',
] as const

export type CandidateType = typeof CANDIDATE_TYPES[number]

// ─── Suggestion Statuses ───────────────────────────────────────────────────

export const SUGGESTION_STATUSES = [
  'pending_review',
  'approved',
  'dismissed',
  'expired',
] as const

export type SuggestionStatus = typeof SUGGESTION_STATUSES[number]

// ─── Evidence Roles ────────────────────────────────────────────────────────

export const EVIDENCE_ROLES = [
  'confirmed_memory_evidence',
  'candidate_context',
  'archive_provenance',
] as const

export type EvidenceRole = typeof EVIDENCE_ROLES[number]

// ─── Evidence Strengths ────────────────────────────────────────────────────

export const EVIDENCE_STRENGTHS = [
  'strong',
  'moderate',
  'weak',
] as const

export type EvidenceStrength = typeof EVIDENCE_STRENGTHS[number]

// ─── Suggestion Event Types ────────────────────────────────────────────────

export const SUGGESTION_EVENT_TYPES = [
  'suggestion_created',
  'status_changed',
  'approved',
  'dismissed',
  'expired',
  'restored',
] as const

export type SuggestionEventType = typeof SUGGESTION_EVENT_TYPES[number]

// ─── Suggestion Actors ─────────────────────────────────────────────────────

export const SUGGESTION_ACTORS = [
  'tara',
  'ari',
  'eli',
  'system',
  'claude_code',
] as const

export type SuggestionActor = typeof SUGGESTION_ACTORS[number]

// ─── Canonical Status Snapshots ────────────────────────────────────────────

export const CANONICAL_STATUS_SNAPSHOTS = [
  'staged',
  'needs_review',
  'canonical_candidate',
  'canonical',
  'duplicate',
  'superseded',
  'archive_only',
  'excluded',
] as const

export type CanonicalStatusSnapshot = typeof CANONICAL_STATUS_SNAPSHOTS[number]

// ─── Supporting Archive Source ─────────────────────────────────────────────

export interface SupportingArchiveSource {
  archive_item_id: string
  canonical_status_snapshot: CanonicalStatusSnapshot
  evidence_role: EvidenceRole
  used_for_weighting: boolean
}

// ─── Graph Candidate Suggestion Row ────────────────────────────────────────

export interface GraphCandidateSuggestion {
  id: string
  candidate_type: CandidateType
  status: SuggestionStatus
  proposed_label: string
  proposed_summary: string | null
  proposed_truth_text: string | null
  target_presence_id: 'ari' | 'eli' | null
  target_archive_item_id: string | null
  supporting_graph_node_ids: string[]
  supporting_graph_edge_ids: string[]
  supporting_proposal_ids: string[]
  supporting_archive_sources: SupportingArchiveSource[]
  deduplicated_evidence_sources: string[]
  evidence_strength: EvidenceStrength
  reason_for_candidate: string
  limits_or_uncertainties: string | null
  governance_context: Record<string, unknown>
  prompt_eligible: false
  canonical_status_before: string | null
  created_by: string
  reviewed_by: string | null
  reviewed_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

// ─── Graph Candidate Suggestion Event Row ──────────────────────────────────

export interface GraphCandidateSuggestionEvent {
  id: string
  suggestion_id: string
  event_type: SuggestionEventType
  previous_status: string | null
  new_status: string | null
  actor: SuggestionActor
  reason: string | null
  metadata: Record<string, unknown>
  created_at: string
}

// ─── Type Guards ───────────────────────────────────────────────────────────

export function isValidCandidateType(value: string): value is CandidateType {
  return (CANDIDATE_TYPES as readonly string[]).includes(value)
}

export function isValidSuggestionStatus(value: string): value is SuggestionStatus {
  return (SUGGESTION_STATUSES as readonly string[]).includes(value)
}

export function isValidEvidenceRole(value: string): value is EvidenceRole {
  return (EVIDENCE_ROLES as readonly string[]).includes(value)
}

export function isValidEvidenceStrength(value: string): value is EvidenceStrength {
  return (EVIDENCE_STRENGTHS as readonly string[]).includes(value)
}

export function isValidCanonicalStatusSnapshot(value: string): value is CanonicalStatusSnapshot {
  return (CANONICAL_STATUS_SNAPSHOTS as readonly string[]).includes(value)
}

export function isValidSuggestionEventType(value: string): value is SuggestionEventType {
  return (SUGGESTION_EVENT_TYPES as readonly string[]).includes(value)
}
