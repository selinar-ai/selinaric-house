// Graph Ontology — Phase 37A
//
// Graph ontology defines allowed relationship structure.
// It does not grant Memory authority.
//
// The graph may reveal relationship.
// The graph may propose meaning.
// The graph does not crown truth.

// ─── Re-exports ─────────────────────────────────────────────────────────────

export {
  GRAPH_NODE_TYPES,
  GRAPH_EDGE_TYPES,
  SYMMETRIC_GRAPH_EDGE_TYPES,
  GRAPH_AUTHORITY_STATUSES,
  GRAPH_REVIEW_STATUSES,
  GRAPH_PRESENCE_SCOPES,
  GRAPH_SOURCE_TYPES,
  type GraphNodeType,
  type GraphEdgeType,
  type GraphAuthorityStatus,
  type GraphReviewStatus,
  type GraphPresenceScope,
  type GraphSourceType,
  type PromptContextType,
  type GraphOntologyValidationInput,
  type GraphOntologyValidationResult,
} from './types'

export {
  requiresSourceReference,
  isAuthorityAllowedWithoutSource,
} from './authority'

export {
  isValidGraphNodeType,
  isValidGraphEdgeType,
  isValidGraphAuthorityStatus,
  isValidGraphReviewStatus,
  isValidGraphPresenceScope,
  isValidGraphSourceType,
  isSymmetricGraphEdgeType,
  isDirectionalGraphEdgeType,
  validateGraphOntology,
} from './validation'

export {
  canGraphItemEnterPrompt,
  getGraphPromptAuthorityLabel,
} from './promptEligibility'
