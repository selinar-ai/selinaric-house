// Phase 37D + 37F — Relational Map Runtime Types
//
// These types represent the runtime graph derived from approved proposals.
// They are display/runtime only — no database writes, no Memory authority.
//
// The graph may reveal relationship.
// The graph does not crown truth.
//
// Phase 37F: grainLevel classifies nodes for Overview vs Detail mode.
// Grain level is display metadata, not Memory or Archive authority.

// ─── Runtime Graph Node ────────────────────────────────────────────────────

export type GraphMapNode = {
  /** Runtime key: node:<scope>:<nodeType>:<normalizedLabel> */
  id: string
  label: string
  nodeType: string
  presenceScope: string
  authorityStatus: string
  confidence: number | null
  salience: number | null
  sourceTypes: string[]
  /** Proposal IDs that contributed to this node */
  proposalIds: string[]
  /** True if this node was implied from an edge proposal endpoint */
  derivedFromEdge: boolean
  promptEligible: boolean
  /** Phase 37F — view-time grain classification. Display metadata only. */
  grainLevel: 'overview' | 'midlevel' | 'detail' | 'evidence'
}

// ─── Runtime Graph Edge ────────────────────────────────────────────────────

export type GraphMapEdge = {
  /** Runtime key: edge:<proposalId> */
  id: string
  fromNodeId: string
  toNodeId: string
  edgeType: string
  label: string
  presenceScope: string
  authorityStatus: string
  confidence: number | null
  salience: number | null
  proposalId: string
  promptEligible: boolean
}

// ─── Proposal Summary (for inspector) ──────────────────────────────────────

export type GraphMapProposalSummary = {
  id: string
  proposalType: 'node' | 'edge'
  status: string
  proposedLabel: string
  proposedSummary: string | null
  proposedPayload: unknown
  reason: string
  safeWording: string | null
  confidence: number
  salience: number
  promptEligible: boolean
  createdAt: string
  updatedAt: string
}

// ─── Source Summary (for inspector) ────────────────────────────────────────

export type GraphMapSourceSummary = {
  proposalId: string
  sourceType: string
  sourceTable: string | null
  sourceId: string
  sourceLabel: string | null
  sourceExcerpt: string | null
  sourceMetadata: unknown
}

// ─── Audit Event (for inspector) ───────────────────────────────────────────

export type GraphMapAuditEvent = {
  proposalId: string
  eventType: string
  previousStatus: string | null
  newStatus: string | null
  actor: string
  reason: string | null
  createdAt: string
}

// ─── API Response ──────────────────────────────────────────────────────────

export type RelationalMapResponse = {
  nodes: GraphMapNode[]
  edges: GraphMapEdge[]
  proposals: GraphMapProposalSummary[]
  sources: GraphMapSourceSummary[]
  auditEvents: GraphMapAuditEvent[]
  diagnostics: {
    skippedProposals: number
    warnings: string[]
  }
}
