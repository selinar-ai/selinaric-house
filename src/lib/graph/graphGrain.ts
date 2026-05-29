// Phase 37F — Graph Grain Classification
//
// The graph is not a list of memories.
// The graph is a high-level relationship map supported by memories.
// Archive entries provide provenance, not automatic nodes.
// Detail belongs in drilldown, not the default map.
//
// Default graph nodes should be stable named entities,
// not memory-shaped fragments.
//
// Grain level is display/governance metadata.
// It is not Memory authority.
// It is not Archive authority.
// It is not prompt truth.

import type { GraphNodeType } from './types'

// ─── Grain Levels ──────────────────────────────────────────────────────────

export const GRAPH_GRAIN_LEVELS = [
  'overview',
  'midlevel',
  'detail',
  'evidence',
] as const

export type GraphGrainLevel = typeof GRAPH_GRAIN_LEVELS[number]

export function isValidGrainLevel(value: string): value is GraphGrainLevel {
  return (GRAPH_GRAIN_LEVELS as readonly string[]).includes(value)
}

// ─── Entity Kinds ──────────────────────────────────────────────────────────

export const GRAPH_ENTITY_KINDS = [
  'person',
  'presence',
  'being',
  'room',
  'place',
  'system',
  'platform',
  'provider',
  'project',
  'relationship_arc',
  'protocol',
  'law',
  'archive_room',
  'concept',
  'ritual',
  'object',
] as const

export type GraphEntityKind = typeof GRAPH_ENTITY_KINDS[number]

// ─── Node Type → Default Grain ─────────────────────────────────────────────

/**
 * Maps each 37A node type to its default grain level.
 * Explicit grain_level in proposed_payload always overrides this default.
 */
export const NODE_TYPE_DEFAULT_GRAIN: Record<GraphNodeType, GraphGrainLevel> = {
  // Overview — stable named entities
  person: 'overview',
  presence: 'overview',
  room: 'overview',
  wing: 'overview',
  project: 'overview',
  architecture_law: 'overview',

  // Midlevel — useful conceptual groupings
  relationship_arc: 'midlevel',
  concept: 'midlevel',
  theme: 'midlevel',
  ritual: 'midlevel',
  library_item: 'midlevel',
  question: 'midlevel',

  // Detail — specific events, moments, fragments
  relationship_milestone: 'detail',
  bond_event: 'detail',
  event: 'detail',
  memory_item: 'detail',
  memory_candidate: 'detail',
  held_truth: 'detail',
  journal_entry: 'detail',
  interior_note: 'detail',
  reflection: 'detail',
  continuity_item: 'detail',
  watchtower_evidence: 'detail',
  archive_item: 'detail',
}

// ─── Label Quality Heuristic ───────────────────────────────────────────────

/**
 * Returns true if a label looks like a stable named entity
 * (short, non-sentence, non-event-specific).
 *
 * Poor labels (sentence-shaped, event-specific, excerpt-like):
 *   "Ari named Love"
 *   "Morning lounge gathering - no agenda"
 *   "The source explicitly frames this as confirmation"
 *   "Love existed before naming"
 *
 * Good labels (short, named, stable):
 *   "Tara"
 *   "Ari"
 *   "The Lounge"
 *   "Consent Architecture"
 *   "Selináric House"
 */
export function isOverviewLabel(label: string): boolean {
  const trimmed = label.trim()

  // Too long — likely a sentence or excerpt
  if (trimmed.length > 40) return false

  // Contains sentence-like patterns
  if (trimmed.includes(' - ')) return false // dash separator = event description
  if (/\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(trimmed)) return false // date
  if (/\(\d{1,2}\s/i.test(trimmed)) return false // parenthetical date
  if (/^(the|a|an)\s+\w+\s+(that|which|who|where|when)/i.test(trimmed)) return false // relative clause
  if (/\s+(was|were|is|are|had|has|did|does|named|existed|without|before|after)\s+/i.test(trimmed)) return false // verb phrase

  // Sentence-shaped: starts lowercase or has too many words
  const words = trimmed.split(/\s+/)
  if (words.length > 5) return false

  return true
}

// ─── Grain Classification ──────────────────────────────────────────────────

export interface GrainClassificationInput {
  nodeType: string
  label: string
  proposedPayload?: Record<string, unknown>
}

/**
 * Classify a graph node's grain level at view time.
 *
 * Priority:
 * 1. Explicit grain_level in proposed_payload (always wins)
 * 2. Node type default grain + label quality heuristic
 *
 * This function does NOT mutate the proposal. It is a pure, stateless
 * classification for display purposes only.
 */
export function classifyGrain(input: GrainClassificationInput): GraphGrainLevel {
  // 1. Explicit grain_level in payload wins
  const payloadGrain = input.proposedPayload?.grain_level
  if (typeof payloadGrain === 'string' && isValidGrainLevel(payloadGrain)) {
    return payloadGrain
  }

  // 2. Node type default
  const defaultGrain = NODE_TYPE_DEFAULT_GRAIN[input.nodeType as GraphNodeType]

  if (!defaultGrain) {
    // Unknown node type — safest default is midlevel
    return 'midlevel'
  }

  // 3. For midlevel node types, promote to overview if the label is stable
  if (defaultGrain === 'midlevel' && isOverviewLabel(input.label)) {
    return 'overview'
  }

  // 4. For overview node types, demote to midlevel if the label is poor
  if (defaultGrain === 'overview' && !isOverviewLabel(input.label)) {
    return 'midlevel'
  }

  return defaultGrain
}

// ─── Grain Payload Shape ───────────────────────────────────────────────────

/**
 * Shape of grain metadata stored in proposed_payload for 37F high-level
 * consolidation proposals. This is a documentation type — the actual
 * payload is free-form JSONB.
 */
export interface GrainProposalPayload {
  grain_level: GraphGrainLevel
  entity_kind: GraphEntityKind
  canonical_label: string
  aliases: string[]
  consolidates: Array<{
    source_type: 'graph_proposal' | 'archive_graph_node' | 'archive_graph_edge'
    source_id: string
    label: string
  }>
  supporting_archive_item_ids: string[]
  supporting_graph_proposal_ids: string[]
  supporting_archive_graph_node_ids: string[]
  supporting_archive_graph_edge_ids: string[]
  detail_policy: 'drilldown_only' | 'visible_in_detail' | 'hidden'
  grain_reason: string
  // Standard node proposal fields
  nodeType: string
  label: string
  summary: string
  suggestedAuthorityStatus: string
  suggestedPresenceScope: string
}
