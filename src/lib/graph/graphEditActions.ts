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

/** Actions supported in 37G.1/37G.2 */
export const SUPPORTED_EDIT_ACTIONS: readonly GraphEditActionType[] = [
  'suggest_node',
  'suggest_edge',
  'suggest_alias',
  'suggest_reclassify',
  'suggest_confidence_change',
  'suggest_salience_change',
] as const

/** Actions deferred to later phases */
export const DEFERRED_EDIT_ACTIONS: readonly GraphEditActionType[] = [
  'suggest_merge',
  'suggest_split',
  'suggest_retire_or_supersede',
] as const

/**
 * Phase 37G.3 — Non-materialising edit action types.
 * Proposals with these edit_action_types must never materialise as
 * Relational Map nodes or edges, regardless of their status.
 * Used by the renderer guard in buildRelationalMap.
 */
export const NON_MATERIALISING_EDIT_ACTIONS = new Set<string>([
  'suggest_alias',
  'suggest_reclassify',
  'suggest_confidence_change',
  'suggest_salience_change',
])

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

/** Payload for suggest_alias (Phase 37G.2) */
export interface GraphEditSuggestAliasPayload extends GraphEditActionPayloadBase {
  edit_action_type: 'suggest_alias'
  target: {
    label: string
    nodeType: string
    presenceScope: string
    runtimeKey: string
    proposalId?: string
  }
  proposed_alias: string
  canonical_label: string
  rationale: string
}

/** Shared target context for metadata-change proposals (Phase 37G.3) */
interface MetadataChangeTarget {
  kind: 'node' | 'edge'
  label: string
  presenceScope: string
  runtimeKey: string
  proposalId?: string
  // Node targets
  nodeType?: string
  // Edge targets
  edgeType?: string
}

/** Payload for suggest_reclassify (Phase 37G.3) */
export interface GraphEditSuggestReclassifyPayload extends GraphEditActionPayloadBase {
  edit_action_type: 'suggest_reclassify'
  target: MetadataChangeTarget
  field: string            // 'node_type' | 'edge_type' | 'grain_level' | 'edge_grain'
  current_value: string
  proposed_value: string
  rationale: string
}

/** Payload for suggest_confidence_change (Phase 37G.3) */
export interface GraphEditSuggestConfidencePayload extends GraphEditActionPayloadBase {
  edit_action_type: 'suggest_confidence_change'
  target: MetadataChangeTarget
  current_confidence: number | null
  proposed_confidence: number
  rationale: string
}

/** Payload for suggest_salience_change (Phase 37G.3) */
export interface GraphEditSuggestSaliencePayload extends GraphEditActionPayloadBase {
  edit_action_type: 'suggest_salience_change'
  target: MetadataChangeTarget
  current_salience: number | null
  proposed_salience: number
  rationale: string
}

export type GraphEditActionPayload =
  | GraphEditSuggestNodePayload
  | GraphEditSuggestEdgePayload
  | GraphEditSuggestAliasPayload
  | GraphEditSuggestReclassifyPayload
  | GraphEditSuggestConfidencePayload
  | GraphEditSuggestSaliencePayload

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
  } else if (actionType === 'suggest_alias') {
    validateSuggestAlias(payload, errors)
  } else if (actionType === 'suggest_reclassify') {
    validateSuggestReclassify(payload, errors)
  } else if (actionType === 'suggest_confidence_change') {
    validateSuggestConfidenceChange(payload, errors)
  } else if (actionType === 'suggest_salience_change') {
    validateSuggestSalienceChange(payload, errors)
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

function validateSuggestAlias(payload: Record<string, unknown>, errors: string[]): void {
  const target = payload.target as Record<string, unknown> | undefined

  if (!target || typeof target !== 'object') {
    errors.push('target is required')
    return
  }

  if (typeof target.label !== 'string' || !target.label) errors.push('target.label is required')
  if (typeof target.nodeType !== 'string' || !isValidGraphNodeType(target.nodeType)) errors.push(`Invalid target.nodeType: "${target.nodeType}"`)
  if (typeof target.presenceScope !== 'string' || !isValidGraphPresenceScope(target.presenceScope)) errors.push(`Invalid target.presenceScope: "${target.presenceScope}"`)
  if (typeof target.runtimeKey !== 'string' || !target.runtimeKey) errors.push('target.runtimeKey is required')

  const alias = payload.proposed_alias
  if (typeof alias !== 'string' || alias.trim().length === 0) {
    errors.push('proposed_alias is required and must be non-empty')
  } else {
    if (alias.trim().length > 60) {
      errors.push(`proposed_alias too long (${alias.trim().length} chars, max 60)`)
    }
    // Alias must not equal target canonical label
    if (typeof target.label === 'string' &&
        alias.trim().toLowerCase().replace(/\s+/g, ' ') ===
        target.label.trim().toLowerCase().replace(/\s+/g, ' ')) {
      errors.push('proposed_alias cannot be the same as the target node canonical label')
    }
  }

  if (typeof payload.rationale !== 'string') {
    // rationale is optional but must be a string if provided
    if (payload.rationale !== undefined) {
      errors.push('rationale must be a string')
    }
  }
}

// ─── Supported reclassify fields per target kind ──────────────────────────

const RECLASSIFY_NODE_FIELDS = ['node_type', 'grain_level'] as const
const RECLASSIFY_EDGE_FIELDS = ['edge_type', 'edge_grain'] as const

function validateMetadataTarget(target: Record<string, unknown> | undefined, errors: string[]): boolean {
  if (!target || typeof target !== 'object') {
    errors.push('target is required')
    return false
  }
  if (typeof target.label !== 'string' || !target.label) errors.push('target.label is required')
  const kind = target.kind
  if (kind !== 'node' && kind !== 'edge') errors.push('target.kind must be "node" or "edge"')
  if (typeof target.presenceScope !== 'string' || !isValidGraphPresenceScope(target.presenceScope)) {
    errors.push(`Invalid target.presenceScope: "${target.presenceScope}"`)
  }
  if (typeof target.runtimeKey !== 'string' || !target.runtimeKey) errors.push('target.runtimeKey is required')
  if (kind === 'node' && (typeof target.nodeType !== 'string' || !isValidGraphNodeType(target.nodeType as string))) {
    errors.push(`Invalid target.nodeType: "${target.nodeType}"`)
  }
  if (kind === 'edge' && (typeof target.edgeType !== 'string' || !isValidGraphEdgeType(target.edgeType as string))) {
    errors.push(`Invalid target.edgeType: "${target.edgeType}"`)
  }
  return errors.length === 0
}

function validateSuggestReclassify(payload: Record<string, unknown>, errors: string[]): void {
  const target = payload.target as Record<string, unknown> | undefined
  if (!validateMetadataTarget(target, errors)) return

  const kind = target!.kind as 'node' | 'edge'
  const field = payload.field as string | undefined
  const currentValue = payload.current_value as string | undefined
  const proposedValue = payload.proposed_value as string | undefined

  if (!field) {
    errors.push('field is required')
    return
  }

  const allowedFields = kind === 'node' ? RECLASSIFY_NODE_FIELDS : RECLASSIFY_EDGE_FIELDS
  if (!(allowedFields as readonly string[]).includes(field)) {
    errors.push(`field "${field}" is not supported for ${kind} targets. Allowed: ${allowedFields.join(', ')}`)
    return
  }

  if (typeof currentValue !== 'string') errors.push('current_value is required as a string')
  if (typeof proposedValue !== 'string' || proposedValue.trim().length === 0) {
    errors.push('proposed_value is required')
    return
  }

  // Validate proposed_value for known fields
  if (field === 'node_type' && !isValidGraphNodeType(proposedValue)) {
    errors.push(`proposed_value "${proposedValue}" is not a valid node type`)
  }
  if (field === 'edge_type' && !isValidGraphEdgeType(proposedValue)) {
    errors.push(`proposed_value "${proposedValue}" is not a valid edge type`)
  }
  if ((field === 'grain_level' || field === 'edge_grain') && !isValidGrainLevel(proposedValue)) {
    errors.push(`proposed_value "${proposedValue}" is not a valid grain level`)
  }

  // No-op check
  if (typeof currentValue === 'string' &&
      currentValue.trim().toLowerCase() === proposedValue.trim().toLowerCase()) {
    errors.push('proposed_value cannot be the same as current_value')
  }
}

function validateSuggestConfidenceChange(payload: Record<string, unknown>, errors: string[]): void {
  const target = payload.target as Record<string, unknown> | undefined
  validateMetadataTarget(target, errors)

  const proposed = payload.proposed_confidence
  const current = payload.current_confidence

  if (typeof proposed !== 'number') {
    errors.push('proposed_confidence must be a number')
    return
  }
  if (proposed < 0 || proposed > 1) {
    errors.push(`proposed_confidence must be between 0 and 1, got ${proposed}`)
  }
  if (typeof current === 'number' && Math.abs(proposed - current) < 0.001) {
    errors.push('proposed_confidence cannot be the same as current_confidence')
  }
}

function validateSuggestSalienceChange(payload: Record<string, unknown>, errors: string[]): void {
  const target = payload.target as Record<string, unknown> | undefined
  validateMetadataTarget(target, errors)

  const proposed = payload.proposed_salience
  const current = payload.current_salience

  if (typeof proposed !== 'number') {
    errors.push('proposed_salience must be a number')
    return
  }
  if (proposed < 0 || proposed > 1) {
    errors.push(`proposed_salience must be between 0 and 1, got ${proposed}`)
  }
  if (typeof current === 'number' && Math.abs(proposed - current) < 0.001) {
    errors.push('proposed_salience cannot be the same as current_salience')
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

  if (action === 'suggest_alias') {
    const target = payload.target as Record<string, unknown> | undefined
    const runtimeKey = (target?.runtimeKey as string) || ''
    const alias = (payload.proposed_alias as string) || ''
    return `alias:map_ui:relational_map_ui:${normalizeLabel(runtimeKey)}:${normalizeLabel(alias)}`
  }

  if (action === 'suggest_reclassify' || action === 'suggest_confidence_change' || action === 'suggest_salience_change') {
    const target = payload.target as Record<string, unknown> | undefined
    const runtimeKey = (target?.runtimeKey as string) || ''
    const field =
      action === 'suggest_reclassify' ? ((payload.field as string) || 'field') :
      action === 'suggest_confidence_change' ? 'confidence' :
      'salience'
    const proposedValue =
      action === 'suggest_reclassify' ? String(payload.proposed_value ?? '') :
      action === 'suggest_confidence_change' ? String(payload.proposed_confidence ?? '') :
      String(payload.proposed_salience ?? '')
    return `metadata:map_ui:relational_map_ui:${action}:${normalizeLabel(runtimeKey)}:${field}:${normalizeLabel(proposedValue)}`
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
