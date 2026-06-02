// Phase 38.1 — Deterministic Reasoning Types
//
// Reasoning explains evidence. Reasoning does not create authority.
// A reasoning-supported candidate is still only a candidate.
// Reasoning output is not evidence.

// ─── Deterministic Reasoning Categories ────────────────────────────────────

export const REASONING_CATEGORIES = [
  'direct_archive_support',
  'indirect_archive_support',
  'graph_support_only',
  'mixed_archive_and_graph',
  'missing_primary_evidence',
  'missing_tara_authored',
  'status_changed_since_suggestion',
  'candidate_type_mismatch',
  'prompt_ineligible_by_design',
  'non_authoritative_suggestion',
  'review_required',
  'dismissed_suggestion',
  'deleted_or_missing_source',
  'insufficient_packet',
] as const

export type ReasoningCategory = typeof REASONING_CATEGORIES[number]

// ─── Category Labels ───────────────────────────────────────────────────────

export const REASONING_CATEGORY_LABELS: Record<ReasoningCategory, string> = {
  direct_archive_support:           'Directly supported by archive evidence',
  indirect_archive_support:         'Indirectly supported — archive context present but not primary',
  graph_support_only:               'Graph-supported only — no weighted archive evidence',
  mixed_archive_and_graph:          'Mixed archive and graph support',
  missing_primary_evidence:         'Missing primary weighted evidence',
  missing_tara_authored:            'Missing Tara-authored evidence',
  status_changed_since_suggestion:  'Status changed since suggestion was created',
  candidate_type_mismatch:          'Candidate type fields incomplete',
  prompt_ineligible_by_design:      'Not prompt eligible (by design)',
  non_authoritative_suggestion:     'Non-authoritative suggestion',
  review_required:                  'Human review required',
  dismissed_suggestion:             'Suggestion was dismissed',
  deleted_or_missing_source:        'Referenced evidence could not be found',
  insufficient_packet:              'Insufficient evidence packet — reasoning not available.',
}

// ─── Evidence Condition (qualitative, never numeric) ───────────────────────

export const EVIDENCE_CONDITIONS = [
  'directly_supported',
  'partially_supported',
  'graph_supported_only',
  'inferred_only',
  'missing_primary',
  'conflicting_or_unresolved',
  'insufficient',
] as const

export type EvidenceCondition = typeof EVIDENCE_CONDITIONS[number]

export const EVIDENCE_CONDITION_LABELS: Record<EvidenceCondition, string> = {
  directly_supported:       'Directly supported',
  partially_supported:      'Partially supported',
  graph_supported_only:     'Graph-supported only',
  inferred_only:            'Inferred only',
  missing_primary:          'Missing primary evidence',
  conflicting_or_unresolved:'Conflicting / unresolved',
  insufficient:             'Not enough evidence to reason',
}

// ─── Reasoning Baseline Result ─────────────────────────────────────────────

export interface ReasoningBaseline {
  /** Active deterministic categories for this packet */
  categories: ReasoningCategory[]

  /** Overall evidence condition (qualitative label, not a score) */
  evidenceCondition: EvidenceCondition

  /** Whether the packet passed sufficiency checks */
  packetSufficient: boolean

  /** Human-readable insufficiency reasons if packet failed */
  insufficiencyReasons: string[]

  /** Whether any status drift was detected */
  hasStatusDrift: boolean

  /** Summary of what types of evidence are present */
  evidenceProfile: {
    hasWeightedArchiveEvidence: boolean
    hasUnweightedArchiveEvidence: boolean
    hasGraphProposalEvidence: boolean
    hasLegacyGraphEvidence: boolean
    hasMissingEvidence: boolean
    totalArchiveSources: number
    totalGraphSources: number
    weightedArchiveSources: number
  }
}
