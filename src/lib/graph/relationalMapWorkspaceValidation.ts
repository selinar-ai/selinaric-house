// Phase 37E — Relational Map Workspace Validation
//
// Layout is not ontology.
// Position is not relationship.
// Distance is not strength.
// Cluster is not truth.
// Dragging does not mutate graph semantics.
//
// Validates workspace payloads. Rejects semantic fields.
// No database writes. No graph authority.

import {
  WORKSPACE_SCOPES,
  WORKSPACE_STATUSES,
  type RelationalMapWorkspaceScope,
  type RelationalMapWorkspaceStatus,
  type RelationalMapLayoutData,
  type RelationalMapNodeLayout,
  type RelationalMapVisualCluster,
  type RelationalMapViewport,
  type RelationalMapFilterPreset,
} from './relationalMapWorkspaceTypes'

// ─── Constants ────────────────────────────────────────────────────────────

const MAX_LAYOUT_PAYLOAD_BYTES = 512 * 1024 // 512 KB

const SUPPORTED_LAYOUT_VERSIONS = [1]

const ALLOWED_FILTER_KEYS = new Set([
  'nodeType', 'edgeType', 'presenceScope', 'authorityStatus', 'sourceType', 'search',
])

// Semantic fields that must be rejected in layout payloads
const FORBIDDEN_LAYOUT_FIELDS = new Set([
  'nodeLabel', 'edgeType', 'relationship', 'memoryStatus', 'archiveStatus',
  'promptEligible', 'prompt_eligible', 'authorityStatus', 'authority_status',
  'confidence', 'salience', 'proposalId', 'proposal_id', 'proposalType',
  'proposal_type', 'reviewStatus', 'review_status', 'canonicalStatus',
  'canonical_status', 'sourceType', 'source_type',
])

// ─── Result Type ──────────────────────────────────────────────────────────

export type ValidationResult = {
  valid: boolean
  errors: string[]
}

function ok(): ValidationResult {
  return { valid: true, errors: [] }
}

function fail(...errors: string[]): ValidationResult {
  return { valid: false, errors }
}

function merge(...results: ValidationResult[]): ValidationResult {
  const errors: string[] = []
  for (const r of results) {
    errors.push(...r.errors)
  }
  return { valid: errors.length === 0, errors }
}

// ─── Scope & Status Validation ────────────────────────────────────────────

export function isValidWorkspaceScope(val: unknown): val is RelationalMapWorkspaceScope {
  return typeof val === 'string' && (WORKSPACE_SCOPES as readonly string[]).includes(val)
}

export function isValidWorkspaceStatus(val: unknown): val is RelationalMapWorkspaceStatus {
  return typeof val === 'string' && (WORKSPACE_STATUSES as readonly string[]).includes(val)
}

// ─── Finite Number Check ──────────────────────────────────────────────────

function isFiniteNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val)
}

// ─── Runtime Node Key Shape ───────────────────────────────────────────────

const NODE_KEY_PATTERN = /^node:[a-z]+:[a-z_]+:.+$/

export function isValidNodeKey(key: string): boolean {
  return NODE_KEY_PATTERN.test(key)
}

// ─── Layout Data Validation ───────────────────────────────────────────────

export function validateLayoutData(data: unknown): ValidationResult {
  if (data == null || typeof data !== 'object') {
    return fail('layout_data must be an object.')
  }

  // Size check (approximate — JSON serialization)
  const serialized = JSON.stringify(data)
  if (serialized.length > MAX_LAYOUT_PAYLOAD_BYTES) {
    return fail(`layout_data exceeds maximum size of ${MAX_LAYOUT_PAYLOAD_BYTES} bytes.`)
  }

  const obj = data as Record<string, unknown>

  // Check for forbidden semantic fields at top level
  const forbiddenFound = Object.keys(obj).filter(k => FORBIDDEN_LAYOUT_FIELDS.has(k))
  if (forbiddenFound.length > 0) {
    return fail(`layout_data contains forbidden semantic fields: ${forbiddenFound.join(', ')}. Layout is not ontology.`)
  }

  // Version check
  if (!SUPPORTED_LAYOUT_VERSIONS.includes(obj.version as number)) {
    return fail(`layout_data.version must be one of: ${SUPPORTED_LAYOUT_VERSIONS.join(', ')}.`)
  }

  // Nodes validation
  if (obj.nodes != null && typeof obj.nodes !== 'object') {
    return fail('layout_data.nodes must be an object.')
  }

  const errors: string[] = []

  if (obj.nodes && typeof obj.nodes === 'object') {
    const nodes = obj.nodes as Record<string, unknown>
    for (const [key, value] of Object.entries(nodes)) {
      if (!isValidNodeKey(key)) {
        errors.push(`layout_data.nodes key "${key}" is not a valid runtime node key. Expected format: node:<scope>:<type>:<label>.`)
      }
      const nodeResult = validateNodeLayout(value, key)
      if (!nodeResult.valid) {
        errors.push(...nodeResult.errors)
      }
    }
  }

  // Clusters validation
  if (obj.clusters != null && !Array.isArray(obj.clusters)) {
    return fail('layout_data.clusters must be an array.')
  }

  if (Array.isArray(obj.clusters)) {
    for (let i = 0; i < obj.clusters.length; i++) {
      const clusterResult = validateVisualCluster(obj.clusters[i], i)
      if (!clusterResult.valid) {
        errors.push(...clusterResult.errors)
      }
    }
  }

  return errors.length > 0 ? { valid: false, errors } : ok()
}

// ─── Node Layout Validation ───────────────────────────────────────────────

function validateNodeLayout(data: unknown, key: string): ValidationResult {
  if (data == null || typeof data !== 'object') {
    return fail(`layout_data.nodes["${key}"] must be an object.`)
  }

  const node = data as Record<string, unknown>

  // Check for forbidden semantic fields in node layout
  const forbiddenFound = Object.keys(node).filter(k => FORBIDDEN_LAYOUT_FIELDS.has(k))
  if (forbiddenFound.length > 0) {
    return fail(`layout_data.nodes["${key}"] contains forbidden semantic fields: ${forbiddenFound.join(', ')}. Layout is not ontology.`)
  }

  const errors: string[] = []

  if (!isFiniteNumber(node.x)) {
    errors.push(`layout_data.nodes["${key}"].x must be a finite number.`)
  }
  if (!isFiniteNumber(node.y)) {
    errors.push(`layout_data.nodes["${key}"].y must be a finite number.`)
  }
  if (typeof node.pinned !== 'boolean') {
    errors.push(`layout_data.nodes["${key}"].pinned must be a boolean.`)
  }

  return errors.length > 0 ? { valid: false, errors } : ok()
}

// ─── Visual Cluster Validation ────────────────────────────────────────────

function validateVisualCluster(data: unknown, index: number): ValidationResult {
  if (data == null || typeof data !== 'object') {
    return fail(`layout_data.clusters[${index}] must be an object.`)
  }

  const cluster = data as Record<string, unknown>

  // Check for forbidden semantic fields in cluster
  const forbiddenFound = Object.keys(cluster).filter(k => FORBIDDEN_LAYOUT_FIELDS.has(k))
  if (forbiddenFound.length > 0) {
    return fail(`layout_data.clusters[${index}] contains forbidden semantic fields: ${forbiddenFound.join(', ')}. Clusters are visual only, not ontology.`)
  }

  const errors: string[] = []

  if (typeof cluster.id !== 'string' || cluster.id.length === 0) {
    errors.push(`layout_data.clusters[${index}].id must be a non-empty string.`)
  }
  if (typeof cluster.label !== 'string' || cluster.label.length === 0) {
    errors.push(`layout_data.clusters[${index}].label must be a non-empty string.`)
  }
  if (!isFiniteNumber(cluster.x)) {
    errors.push(`layout_data.clusters[${index}].x must be a finite number.`)
  }
  if (!isFiniteNumber(cluster.y)) {
    errors.push(`layout_data.clusters[${index}].y must be a finite number.`)
  }
  if (!isFiniteNumber(cluster.width)) {
    errors.push(`layout_data.clusters[${index}].width must be a finite number.`)
  }
  if (!isFiniteNumber(cluster.height)) {
    errors.push(`layout_data.clusters[${index}].height must be a finite number.`)
  }
  if (!Array.isArray(cluster.nodeKeys)) {
    errors.push(`layout_data.clusters[${index}].nodeKeys must be an array.`)
  } else {
    for (let j = 0; j < cluster.nodeKeys.length; j++) {
      const nk = cluster.nodeKeys[j]
      if (typeof nk !== 'string') {
        errors.push(`layout_data.clusters[${index}].nodeKeys[${j}] must be a string.`)
      } else if (!isValidNodeKey(nk)) {
        errors.push(`layout_data.clusters[${index}].nodeKeys[${j}] "${nk}" is not a valid runtime node key.`)
      }
    }
  }

  // Optional fields
  if (cluster.collapsed !== undefined && typeof cluster.collapsed !== 'boolean') {
    errors.push(`layout_data.clusters[${index}].collapsed must be a boolean if present.`)
  }
  if (cluster.colourKey !== undefined && typeof cluster.colourKey !== 'string') {
    errors.push(`layout_data.clusters[${index}].colourKey must be a string if present.`)
  }

  return errors.length > 0 ? { valid: false, errors } : ok()
}

// ─── Viewport Validation ──────────────────────────────────────────────────

export function validateViewport(data: unknown): ValidationResult {
  if (data == null) return ok() // viewport is optional (nullable)
  if (typeof data !== 'object') {
    return fail('viewport must be an object or null.')
  }

  const vp = data as Record<string, unknown>
  const errors: string[] = []

  if (!isFiniteNumber(vp.x)) {
    errors.push('viewport.x must be a finite number.')
  }
  if (!isFiniteNumber(vp.y)) {
    errors.push('viewport.y must be a finite number.')
  }
  if (!isFiniteNumber(vp.zoom)) {
    errors.push('viewport.zoom must be a finite number.')
  } else if (typeof vp.zoom === 'number' && (vp.zoom < 0.05 || vp.zoom > 10)) {
    errors.push('viewport.zoom must be between 0.05 and 10.')
  }

  return errors.length > 0 ? { valid: false, errors } : ok()
}

// ─── Filter Preset Validation ─────────────────────────────────────────────

export function validateFilterPreset(data: unknown): ValidationResult {
  if (data == null) return ok()
  if (typeof data !== 'object' || Array.isArray(data)) {
    return fail('filter_preset must be an object.')
  }

  const preset = data as Record<string, unknown>
  const errors: string[] = []

  for (const [key, value] of Object.entries(preset)) {
    if (!ALLOWED_FILTER_KEYS.has(key)) {
      errors.push(`filter_preset contains unknown key: "${key}".`)
    }
    if (value !== undefined && typeof value !== 'string') {
      errors.push(`filter_preset.${key} must be a string.`)
    }
  }

  return errors.length > 0 ? { valid: false, errors } : ok()
}

// ─── Full Workspace Payload Validation ────────────────────────────────────

export interface WorkspaceCreatePayload {
  name: string
  description?: string
  workspaceScope: RelationalMapWorkspaceScope
  isDefault?: boolean
  layoutData: RelationalMapLayoutData
  filterPreset?: RelationalMapFilterPreset
  viewport?: RelationalMapViewport | null
}

export interface WorkspaceUpdatePayload {
  name?: string
  description?: string
  isDefault?: boolean
  layoutData?: RelationalMapLayoutData
  filterPreset?: RelationalMapFilterPreset
  viewport?: RelationalMapViewport | null
  status?: RelationalMapWorkspaceStatus
}

export function validateCreatePayload(data: unknown): ValidationResult {
  if (data == null || typeof data !== 'object') {
    return fail('Request body must be an object.')
  }

  const obj = data as Record<string, unknown>
  const errors: string[] = []

  // Required fields
  if (typeof obj.name !== 'string' || obj.name.trim().length === 0) {
    errors.push('name is required and must be a non-empty string.')
  }
  if (typeof obj.name === 'string' && obj.name.length > 200) {
    errors.push('name must be 200 characters or fewer.')
  }

  if (!isValidWorkspaceScope(obj.workspaceScope)) {
    errors.push(`workspaceScope must be one of: ${WORKSPACE_SCOPES.join(', ')}.`)
  }

  if (obj.layoutData === undefined) {
    errors.push('layoutData is required.')
  }

  // Optional fields type checks
  if (obj.description !== undefined && typeof obj.description !== 'string') {
    errors.push('description must be a string if provided.')
  }
  if (obj.isDefault !== undefined && typeof obj.isDefault !== 'boolean') {
    errors.push('isDefault must be a boolean if provided.')
  }

  if (errors.length > 0) return { valid: false, errors }

  // Deep validation
  return merge(
    ok(),
    validateLayoutData(obj.layoutData),
    validateFilterPreset(obj.filterPreset),
    validateViewport(obj.viewport),
  )
}

export function validateUpdatePayload(data: unknown): ValidationResult {
  if (data == null || typeof data !== 'object') {
    return fail('Request body must be an object.')
  }

  const obj = data as Record<string, unknown>
  const errors: string[] = []

  // Type checks for optional fields
  if (obj.name !== undefined) {
    if (typeof obj.name !== 'string' || obj.name.trim().length === 0) {
      errors.push('name must be a non-empty string if provided.')
    }
    if (typeof obj.name === 'string' && obj.name.length > 200) {
      errors.push('name must be 200 characters or fewer.')
    }
  }
  if (obj.description !== undefined && obj.description !== null && typeof obj.description !== 'string') {
    errors.push('description must be a string or null if provided.')
  }
  if (obj.isDefault !== undefined && typeof obj.isDefault !== 'boolean') {
    errors.push('isDefault must be a boolean if provided.')
  }
  if (obj.status !== undefined && !isValidWorkspaceStatus(obj.status)) {
    errors.push(`status must be one of: ${WORKSPACE_STATUSES.join(', ')}.`)
  }

  // Reject workspaceScope updates (immutable after creation)
  if (obj.workspaceScope !== undefined) {
    errors.push('workspaceScope cannot be changed after creation.')
  }

  if (errors.length > 0) return { valid: false, errors }

  // Deep validation for optional nested fields
  const results: ValidationResult[] = [ok()]
  if (obj.layoutData !== undefined) {
    results.push(validateLayoutData(obj.layoutData))
  }
  if (obj.filterPreset !== undefined) {
    results.push(validateFilterPreset(obj.filterPreset))
  }
  if (obj.viewport !== undefined) {
    results.push(validateViewport(obj.viewport))
  }

  return merge(...results)
}
