// Graph ontology defines allowed relationship structure.
// It does not grant Memory authority.

// ─── Node Types ─────────────────────────────────────────────────────────────

export const GRAPH_NODE_TYPES = [
  'person',
  'relationship_arc',
  'presence',
  'relationship_milestone',
  'bond_event',
  'room',
  'wing',
  'concept',
  'theme',
  'event',
  'project',
  'memory_item',
  'memory_candidate',
  'held_truth',
  'archive_item',
  'journal_entry',
  'interior_note',
  'reflection',
  'continuity_item',
  'library_item',
  'watchtower_evidence',
  'question',
  'ritual',
  'architecture_law',
] as const

export type GraphNodeType = typeof GRAPH_NODE_TYPES[number]

// ─── Edge Types ─────────────────────────────────────────────────────────────

export const GRAPH_EDGE_TYPES = [
  'relates_to',
  'continues',
  'recurs',
  'supports',
  'clarifies',
  'contrasts_with',
  'drifts_from',
  'generated_from',
  'derived_from',
  'confirmed_by',
  'candidate_from',
  'belongs_to',
  'discussed_in',
  'proposed_by',
  'reviewed_by',
  'held_as_truth',
  'supported_by_archive',
  'derived_from_journal',
  'promoted_to_candidate',
  'rejected_as_memory',
  'unresolved_with',
  'not_same_as',
  'safe_for_prompt',
  'not_safe_for_prompt',
  'deepens',
  'repairs',
  'reaffirms',
  'evolves_from',
  'marks_milestone_in',
  // Phase 43 Option A — archive_graph semantic edge types, admitted so approved archive-derived
  // relationships can be promoted into graph_proposals honestly (no coercion). Governed graph-
  // vocabulary expansion (TS const; the DB edge_type column is open text — no migration).
  //   shaped_by = "X was shaped/influenced by Y" (relational influence, an archive-derived
  //               proposed relationship — never an authority claim).
  //   precedes  = "X precedes Y" in chronological/relational sequence — NOT superiority/ranking.
  'shaped_by',
  'precedes',
  // Phase 43 Wave 1 — another recurring archive_graph semantic type (governed TS-const, no migration).
  //   anchors = "X anchors/grounds Y" (a relationship of grounding/support the archive extracted).
  'anchors',
] as const

export type GraphEdgeType = typeof GRAPH_EDGE_TYPES[number]

// ─── Symmetric Edge Types ───────────────────────────────────────────────────

export const SYMMETRIC_GRAPH_EDGE_TYPES: readonly GraphEdgeType[] = [
  'relates_to',
  'contrasts_with',
  'not_same_as',
  'unresolved_with',
] as const

// ─── Authority Statuses ─────────────────────────────────────────────────────

export const GRAPH_AUTHORITY_STATUSES = [
  'canonical_supported',
  'candidate',
  'held_truth',
  'archive_supported',
  'library_reference',
  'inferred',
  'workspace_only',
  'rejected',
  'superseded',
] as const

export type GraphAuthorityStatus = typeof GRAPH_AUTHORITY_STATUSES[number]

// ─── Review Statuses ────────────────────────────────────────────────────────

export const GRAPH_REVIEW_STATUSES = [
  'unreviewed',
  'pending_review',
  'approved_graph',
  'rejected',
  'needs_more_evidence',
  'workspace_only',
  'superseded',
] as const

export type GraphReviewStatus = typeof GRAPH_REVIEW_STATUSES[number]

// ─── Presence Scopes ────────────────────────────────────────────────────────

export const GRAPH_PRESENCE_SCOPES = [
  'ari',
  'eli',
  'shared',
  'house',
  'none',
] as const

export type GraphPresenceScope = typeof GRAPH_PRESENCE_SCOPES[number]

// ─── Source Types ───────────────────────────────────────────────────────────

export const GRAPH_SOURCE_TYPES = [
  'canonical_memory',
  'memory_candidate',
  'held_truth',
  'archive_item',
  'journal_entry',
  'interior_note',
  'reflection_output',
  'lounge_capture',
  'recent_continuity',
  'living_state',
  'carryforward',
  'carryback',
  'library_item',
  'watchtower_evidence',
  'architecture_law',
  'manual_tara',
  'manual_ari',
  'manual_eli',
  'relationship_arc_entry',
  'system_candidate',
  // Phase 37F — graph grain consolidation provenance
  'graph_proposal',
  'archive_graph_node',
  'archive_graph_edge',
  // Phase 37G — map UI edit action provenance
  'map_ui',
] as const

export type GraphSourceType = typeof GRAPH_SOURCE_TYPES[number]

// ─── Prompt Context Types ───────────────────────────────────────────────────

export type PromptContextType =
  | 'presence_chat'
  | 'lounge_chat'
  | 'watchtower'
  | 'reflection'
  | 'journal_prompt'
  | 'memory_candidate_generation'
  | 'graph_review'

// ─── Composite Types ────────────────────────────────────────────────────────

export type GraphOntologyValidationInput = {
  nodeType?: string
  edgeType?: string
  authorityStatus: string
  reviewStatus: string
  presenceScope: string
  sourceType?: string
  sourceId?: string | null
  promptEligible?: boolean
}

export type GraphOntologyValidationResult = {
  valid: boolean
  errors: string[]
  warnings: string[]
}
