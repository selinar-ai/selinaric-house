// Graph ontology validation helpers.
// The graph may reveal relationship. The graph may propose meaning.
// The graph does not crown truth.

import {
  GRAPH_NODE_TYPES,
  GRAPH_EDGE_TYPES,
  GRAPH_AUTHORITY_STATUSES,
  GRAPH_REVIEW_STATUSES,
  GRAPH_PRESENCE_SCOPES,
  GRAPH_SOURCE_TYPES,
  SYMMETRIC_GRAPH_EDGE_TYPES,
  type GraphNodeType,
  type GraphEdgeType,
  type GraphAuthorityStatus,
  type GraphReviewStatus,
  type GraphPresenceScope,
  type GraphSourceType,
  type GraphOntologyValidationInput,
  type GraphOntologyValidationResult,
} from './types'
import { requiresSourceReference } from './authority'

// ─── Type Guards ────────────────────────────────────────────────────────────

export function isValidGraphNodeType(value: string): value is GraphNodeType {
  return (GRAPH_NODE_TYPES as readonly string[]).includes(value)
}

export function isValidGraphEdgeType(value: string): value is GraphEdgeType {
  return (GRAPH_EDGE_TYPES as readonly string[]).includes(value)
}

export function isValidGraphAuthorityStatus(value: string): value is GraphAuthorityStatus {
  return (GRAPH_AUTHORITY_STATUSES as readonly string[]).includes(value)
}

export function isValidGraphReviewStatus(value: string): value is GraphReviewStatus {
  return (GRAPH_REVIEW_STATUSES as readonly string[]).includes(value)
}

export function isValidGraphPresenceScope(value: string): value is GraphPresenceScope {
  return (GRAPH_PRESENCE_SCOPES as readonly string[]).includes(value)
}

export function isValidGraphSourceType(value: string): value is GraphSourceType {
  return (GRAPH_SOURCE_TYPES as readonly string[]).includes(value)
}

// ─── Directionality ─────────────────────────────────────────────────────────

export function isSymmetricGraphEdgeType(value: GraphEdgeType): boolean {
  return (SYMMETRIC_GRAPH_EDGE_TYPES as readonly GraphEdgeType[]).includes(value)
}

export function isDirectionalGraphEdgeType(value: GraphEdgeType): boolean {
  return !isSymmetricGraphEdgeType(value)
}

// ─── Composite Validation ───────────────────────────────────────────────────

export function validateGraphOntology(
  input: GraphOntologyValidationInput
): GraphOntologyValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Validate node type if provided
  if (input.nodeType !== undefined && !isValidGraphNodeType(input.nodeType)) {
    errors.push(`Invalid node type: "${input.nodeType}"`)
  }

  // Validate edge type if provided
  if (input.edgeType !== undefined && !isValidGraphEdgeType(input.edgeType)) {
    errors.push(`Invalid edge type: "${input.edgeType}"`)
  }

  // Validate authority status
  if (!isValidGraphAuthorityStatus(input.authorityStatus)) {
    errors.push(`Invalid authority status: "${input.authorityStatus}"`)
  }

  // Validate review status
  if (!isValidGraphReviewStatus(input.reviewStatus)) {
    errors.push(`Invalid review status: "${input.reviewStatus}"`)
  }

  // Validate presence scope
  if (!isValidGraphPresenceScope(input.presenceScope)) {
    errors.push(`Invalid presence scope: "${input.presenceScope}"`)
  }

  // Validate source type if provided
  if (input.sourceType !== undefined && !isValidGraphSourceType(input.sourceType)) {
    errors.push(`Invalid source type: "${input.sourceType}"`)
  }

  // Source requirement checks (only if authority status is valid)
  if (isValidGraphAuthorityStatus(input.authorityStatus)) {
    const authority = input.authorityStatus as GraphAuthorityStatus
    const hasSource = input.sourceId != null && input.sourceId !== ''

    if (requiresSourceReference(authority) && !hasSource) {
      errors.push(`Authority status "${authority}" requires a source reference`)
    }

    if (authority === 'workspace_only' && !hasSource) {
      warnings.push('workspace_only without source reference — recommended but not required')
    }

    // canonical_supported without canonical source type
    if (authority === 'canonical_supported' && input.sourceType !== undefined) {
      const canonicalSourceTypes = ['canonical_memory', 'held_truth', 'manual_tara']
      if (!canonicalSourceTypes.includes(input.sourceType)) {
        errors.push(
          `Authority status "canonical_supported" requires a canonical source type ` +
          `(canonical_memory, held_truth, manual_tara), got "${input.sourceType}"`
        )
      }
    }

    // Rejected/superseded cannot be prompt eligible
    if ((authority === 'rejected' || authority === 'superseded') && input.promptEligible === true) {
      errors.push(`Authority status "${authority}" cannot be prompt eligible`)
    }

    // workspace_only cannot be prompt eligible
    if (authority === 'workspace_only' && input.promptEligible === true) {
      errors.push('workspace_only cannot be prompt eligible')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
