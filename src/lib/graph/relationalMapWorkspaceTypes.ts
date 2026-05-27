// Phase 37E — Relational Map Workspace Types
//
// Layout is not ontology.
// Position is not relationship.
// Distance is not strength.
// Cluster is not truth.
// Dragging does not mutate graph semantics.
//
// These types represent visual layout metadata only.
// They do not represent graph authority, Memory, Archive, or prompt truth.

// ─── Workspace Scope ──────────────────────────────────────────────────────
// Visual workspace context. NOT graph presence_scope.
// workspace_scope describes who arranged the view.
// graph presence_scope describes what the graph data belongs to.
// These must never be collapsed.

export const WORKSPACE_SCOPES = [
  'house_default',
  'ari_workspace',
  'eli_workspace',
  'tara_workspace',
  'shared_workspace',
] as const

export type RelationalMapWorkspaceScope = typeof WORKSPACE_SCOPES[number]

// ─── Workspace Status ─────────────────────────────────────────────────────

export const WORKSPACE_STATUSES = ['active', 'archived'] as const

export type RelationalMapWorkspaceStatus = typeof WORKSPACE_STATUSES[number]

// ─── Node Layout ──────────────────────────────────────────────────────────

export type RelationalMapNodeLayout = {
  x: number
  y: number
  pinned: boolean
}

// ─── Visual Cluster ───────────────────────────────────────────────────────
// Manual clusters are visual containers only.
// A visual cluster does not create: graph node, graph edge,
// ontology group, semantic relationship, Memory candidate,
// Archive entry, prompt context, or graph proposal.

export type RelationalMapVisualCluster = {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  nodeKeys: string[]
  collapsed?: boolean
  colourKey?: string
}

// ─── Layout Data ──────────────────────────────────────────────────────────
// Positions keyed by stable runtime node keys (node:<scope>:<type>:<label>),
// NOT by display labels.

export type RelationalMapLayoutData = {
  version: 1
  nodes: Record<string, RelationalMapNodeLayout>
  clusters: RelationalMapVisualCluster[]
}

// ─── Viewport ─────────────────────────────────────────────────────────────

export type RelationalMapViewport = {
  x: number
  y: number
  zoom: number
}

// ─── Filter Preset ────────────────────────────────────────────────────────

export type RelationalMapFilterPreset = {
  nodeType?: string
  edgeType?: string
  presenceScope?: string
  authorityStatus?: string
  sourceType?: string
  search?: string
}

// ─── Workspace Record ─────────────────────────────────────────────────────

export type RelationalMapWorkspace = {
  id: string
  name: string
  description: string | null
  workspaceScope: RelationalMapWorkspaceScope
  isDefault: boolean
  layoutVersion: number
  layoutData: RelationalMapLayoutData
  filterPreset: RelationalMapFilterPreset
  viewport: RelationalMapViewport | null
  status: RelationalMapWorkspaceStatus
  createdBy: string
  createdAt: string
  updatedAt: string
}

// ─── DB Row Shape ─────────────────────────────────────────────────────────

export type RelationalMapWorkspaceRow = {
  id: string
  name: string
  description: string | null
  workspace_scope: string
  is_default: boolean
  layout_version: number
  layout_data: unknown
  filter_preset: unknown
  viewport: unknown
  status: string
  created_by: string
  created_at: string
  updated_at: string
}

// ─── Scope Display Labels ─────────────────────────────────────────────────

export const WORKSPACE_SCOPE_LABELS: Record<RelationalMapWorkspaceScope, string> = {
  house_default: 'House Default',
  ari_workspace: 'Ari Workspace',
  eli_workspace: 'Eli Workspace',
  tara_workspace: 'Tara Workspace',
  shared_workspace: 'Shared Workspace',
}
