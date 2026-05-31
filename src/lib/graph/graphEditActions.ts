// Phase 37G.0 — Governed Graph Edit Action Contract
//
// A graph edit action is never a graph edit.
// It is a proposal to be reviewed.
//
// The map may suggest.
// Ontology Lab governs.
// Memory Review crowns Memory.
// Archive proves.
// Layout never edits meaning.
//
// No graph UI action may directly create truth.
//
// All edit action proposals:
//   status = pending_review
//   prompt_eligible = false
//   proposed_by = tara
//   approval via Ontology Lab only

import {
  isValidGraphNodeType,
  isValidGraphEdgeType,
  isValidGraphPresenceScope,
} from './validation'
import { isValidGrainLevel, type GraphGrainLevel } from './graphGrain'

// ─── Edit Action Types ────────────────────────────────────────────────────

export const GRAPH_EDIT_ACTION_TYPES = [
  'suggest_node',
  'suggest_edge',
  'suggest_alias',
  'suggest_merge',
  'suggest_split',
  'suggest_reclassify',
  'suggest_confidence_change',
  'suggest_salience_change',
  'suggest_retire_or_supersede',
] as const

export type GraphEditActionType = typeof GRAPH_EDIT_ACTION_TYPES[number]

/** Actions supported in 37G.1 — first build slice */
export const SUPPORTED_EDIT_ACTIONS: readonly GraphEditActionType[] = [
  'suggest_node',
  'suggest_edge',
] as const

/** Actions deferred to later phases */
export const DEFERRED_EDIT_ACTIONS: readonly GraphEditActionType[] = [
  'suggest_alias',
  'suggest_merge',
  'suggest_split',
  'suggest_reclassify',
  'suggest_confidence_change',
  'suggest_salience_change',
  'suggest_retire_or_supersede',
] as const

export function isValidEditActionType(value: string): value is GraphEditActionType {
  return (GRAPH_EDIT_ACTION_TYPES as readonly string[]).includes(value)
}

export function isSupportedEditAction(value: string): boolean {
  return (SUPPORTED_EDIT_ACTIONS as readonly string[]).includes(value)
}

export function isDeferredEditAction(value: string): boolean {
  return (DEFERRED_EDIT_ACTIONS as readonly string[]).includes(value)
}

// ─── Proposal Type Mapping ────────────────────────────────────────────────

/**
 * Maps an edit action type to the existing DB-compatible proposal_type.
 * The DB CHECK constraint only allows 'node' or 'edge'.
 * The specific edit action is stored in proposed_payload.edit_action_type.
 */
export function editActionToProposalType(action: GraphEditActionType): 'node' | 'edge' {
  switch (action) {
    case 'suggest_edge':
      return 'edge'
    case 'suggest_node':
    case 'suggest_alias':
    case 'suggest_merge':
    case 'suggest_split':
    case 'suggest_reclassify':
    case 'suggest_confidence_change':
    case 'suggest_salience_change':
    case 'suggest_retire_or_supersede':
      return 'node'
  }
}

// ─── Context Types ────────────────────────────────────────────────────────

/** Node context passed from the Relational Map UI */
export interface GraphEditNodeContext {
  runtimeKey: string
  label: string
  nodeType: string
  presenceScope: string
  proposalIds: string[]
  grainLevel: GraphGrainLevel
  authority: string
}

/** Edge context passed from the Relational Map UI */
export interface GraphEditEdgeContext {
  runtimeKey: string
  label: string
  edgeType: string
  sourceRuntimeKey: string
  targetRuntimeKey: string
  grainLevel: GraphGrainLevel
  proposalIds: string[]
}

/** Workspace context (provenance only, not graph meaning) */
export interface GraphEditWorkspaceContext {
  workspaceId: string | null
  grainMode: 'overview' | 'detail'
  includeMidlevel: boolean
}

// ─── Payload Contract ─────────────────────────────────────────────────────

/** Base payload fields present in all graph edit action proposals */
export interface GraphEditActionPayloadBase {
  edit_action_type: GraphEditActionType
  edit_origin: 'relational_map'
  edit_origin_phase: string
  grain_level: GraphGrainLevel
  detail_policy: 'review_required'
  requires_review: true
  review_surface: 'ontology_lab'
  governance_note: string
  selected_context?: GraphEditWorkspaceContext
}

/** Payload for suggest_node */
export interface GraphEditSuggestNodePayload extends GraphEditActionPayloadBase {
  edit_action_type: 'suggest_node'
  label: string
  node_type: string
  presence_scope: string
  entity_kind?: string
  aliases: string[]
  canonical_label: string
  rationale: string
}

/** Payload for suggest_edge */
export interface GraphEditSuggestEdgePayload extends GraphEditActionPayloadBase {
  edit_action_type: 'suggest_edge'
  from: {
    label: string
    nodeType: string
    presenceScope: string
    runtimeKey: string
  }
  to: {
    label: string
    nodeType: string
    presenceScope: string
    runtimeKey: string
  }
  edge_type: string
  canonical_label: string
  rationale: string
}

export type GraphEditActionPayload =
  | GraphEditSuggestNodePayload
  | GraphEditSuggestEdgePayload

// ─── Validation ───────────────────────────────────────────────────────────

export interface EditActionValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Validates an edit action payload before proposal creation.
 * Does NOT create proposals — validation only.
 */
export function validateEditActionPayload(
  payload: Record<string, unknown>
): EditActionValidationResult {
  const errors: string[] = []

  // Action type
  const actionType = payload.edit_action_type
  if (typeof actionType !== 'string' || !isValidEditActionType(actionType)) {
    errors.push(`Invalid edit_action_type: "${actionType}"`)
    return { valid: false, errors }
  }

  if (!isSupportedEditAction(actionType)) {
    errors.push(`Edit action "${actionType}" is deferred and not yet supported`)
    return { valid: false, errors }
  }

  // Required base fields
  if (payload.edit_origin !== 'relational_map') {
    errors.push('edit_origin must be "relational_map"')
  }
  if (typeof payload.grain_level !== 'string' || !isValidGrainLevel(payload.grain_level)) {
    errors.push(`Invalid grain_level: "${payload.grain_level}"`)
  }
  if (payload.requires_review !== true) {
    errors.push('requires_review must be true')
  }
  if (payload.review_surface !== 'ontology_lab') {
    errors.push('review_surface must be "ontology_lab"')
  }

  // Action-specific validation
  if (actionType === 'suggest_node') {
    validateSuggestNode(payload, errors)
  } else if (actionType === 'suggest_edge') {
    validateSuggestEdge(payload, errors)
  }

  return { valid: errors.length === 0, errors }
}

function validateSuggestNode(payload: Record<string, unknown>, errors: string[]): void {
  const label = payload.label
  if (typeof label !== 'string' || label.trim().length === 0) {
    errors.push('label is required and must be non-empty')
  } else if (label.trim().length > 60) {
    errors.push(`label too long (${label.trim().length} chars, max 60)`)
  }

  const nodeType = payload.node_type
  if (typeof nodeType !== 'string' || !isValidGraphNodeType(nodeType)) {
    errors.push(`Invalid node_type: "${nodeType}"`)
  }

  const scope = payload.presence_scope
  if (typeof scope !== 'string' || !isValidGraphPresenceScope(scope)) {
    errors.push(`Invalid presence_scope: "${scope}"`)
  }

  if (typeof payload.rationale !== 'string' || payload.rationale.trim().length === 0) {
    errors.push('rationale is required')
  }

  if (typeof payload.canonical_label !== 'string' || payload.canonical_label.trim().length === 0) {
    errors.push('canonical_label is required')
  }
}

function validateSuggestEdge(payload: Record<string, unknown>, errors: string[]): void {
  const from = payload.from as Record<string, unknown> | undefined
  const to = payload.to as Record<string, unknown> | undefined

  if (!from || typeof from !== 'object') {
    errors.push('from endpoint is required')
  } else {
    if (typeof from.label !== 'string' || !from.label) errors.push('from.label is required')
    if (typeof from.nodeType !== 'string' || !isValidGraphNodeType(from.nodeType)) errors.push(`Invalid from.nodeType: "${from.nodeType}"`)
    if (typeof from.presenceScope !== 'string' || !isValidGraphPresenceScope(from.presenceScope)) errors.push(`Invalid from.presenceScope: "${from.presenceScope}"`)
    if (typeof from.runtimeKey !== 'string' || !from.runtimeKey) errors.push('from.runtimeKey is required')
  }

  if (!to || typeof to !== 'object') {
    errors.push('to endpoint is required')
  } else {
    if (typeof to.label !== 'string' || !to.label) errors.push('to.label is required')
    if (typeof to.nodeType !== 'string' || !isValidGraphNodeType(to.nodeType)) errors.push(`Invalid to.nodeType: "${to.nodeType}"`)
    if (typeof to.presenceScope !== 'string' || !isValidGraphPresenceScope(to.presenceScope)) errors.push(`Invalid to.presenceScope: "${to.presenceScope}"`)
    if (typeof to.runtimeKey !== 'string' || !to.runtimeKey) errors.push('to.runtimeKey is required')
  }

  const edgeType = payload.edge_type
  if (typeof edgeType !== 'string' || !isValidGraphEdgeType(edgeType)) {
    errors.push(`Invalid edge_type: "${edgeType}"`)
  }

  if (typeof payload.rationale !== 'string' || payload.rationale.trim().length === 0) {
    errors.push('rationale is required')
  }

  if (typeof payload.canonical_label !== 'string' || payload.canonical_label.trim().length === 0) {
    errors.push('canonical_label is required')
  }

  // Self-reference check
  if (from && to && from.runtimeKey === to.runtimeKey) {
    errors.push('from and to endpoints must be different nodes')
  }
}

// ─── Dedupe Key Generation ────────────────────────────────────────────────

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Generates a dedupe key for a graph edit action proposal.
 * Uses the existing partial unique index on dedupe_key
 * WHERE status = 'pending_review' AND deleted_at IS NULL.
 */
export function generateEditActionDedupeKey(
  payload: Record<string, unknown>
): string {
  const action = payload.edit_action_type as string

  if (action === 'suggest_node') {
    const scope = (payload.presence_scope as string) || 'shared'
    const label = (payload.canonical_label as string) || (payload.label as string) || ''
    return `node:map_ui:relational_map_ui:${scope}:${normalizeLabel(label)}`
  }

  if (action === 'suggest_edge') {
    const scope = ((payload.from as Record<string, unknown>)?.presenceScope as string) || 'shared'
    const edgeType = (payload.edge_type as string) || 'relates_to'
    const fromLabel = ((payload.from as Record<string, unknown>)?.label as string) || ''
    const toLabel = ((payload.to as Record<string, unknown>)?.label as string) || ''
    return `edge:map_ui:relational_map_ui:${scope}:${edgeType}:${normalizeLabel(fromLabel)}:${normalizeLabel(toLabel)}`
  }

  // Fallback for deferred actions
  const label = (payload.canonical_label as string) || (payload.label as string) || ''
  return `edit:map_ui:${action}:${normalizeLabel(label)}`
}

// ─── Proposal Defaults ────────────────────────────────────────────────────

/**
 * Constants for all graph edit action proposals.
 * These are enforced at creation time, never overridden.
 */
export const EDIT_ACTION_PROPOSAL_DEFAULTS = {
  status: 'pending_review' as const,
  prompt_eligible: false as const,
  proposed_by: 'tara' as const,
  primary_source_type: 'map_ui' as const,
  primary_source_id: 'relational_map_ui' as const,
} as const
