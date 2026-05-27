// Phase 37D — Graph Display Utilities
//
// Pure display helpers for the Relational Map.
// No database writes. No Memory authority. No prompt injection.

// ─── Label Normalization ───────────────────────────────────────────────────

/**
 * Normalize a label for runtime node key generation.
 * Trims, lowercases, collapses repeated whitespace.
 */
export function normalizeGraphLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

// ─── Node Key Generation ───────────────────────────────────────────────────

/**
 * Generate a runtime node key from scope, type, and label.
 * This key is display/runtime only — never stored in DB.
 *
 * Merge rule: nodes merge only when all three match:
 *   presence_scope + node_type + normalized_label
 */
export function makeNodeKey(
  presenceScope: string,
  nodeType: string,
  label: string
): string {
  return `node:${presenceScope}:${nodeType}:${normalizeGraphLabel(label)}`
}

// ─── Node Colour Mapping ──────────────────────────────────────────────────

/** Muted colour palette for node types. Returns [bgColor, borderColor] */
export function getNodeColours(nodeType: string): { bg: string; border: string; text: string } {
  switch (nodeType) {
    case 'person':
      return { bg: '#2D2640', border: '#6B5B8A', text: '#B8A9D4' }
    case 'presence':
      return { bg: '#2D2640', border: '#6B5B8A', text: '#B8A9D4' }

    case 'concept':
    case 'theme':
      return { bg: '#2E1F3D', border: '#7B4FA2', text: '#C4A0E0' }

    case 'room':
    case 'wing':
      return { bg: '#1D2E30', border: '#3D7A7F', text: '#7FC4C9' }

    case 'system':
      return { bg: '#1D2438', border: '#3D6BA0', text: '#7FADD4' }

    case 'ritual':
      return { bg: '#2E2718', border: '#8A7A3D', text: '#C4B870' }

    case 'project':
    case 'relationship_arc':
    case 'relationship_milestone':
    case 'bond_event':
      return { bg: '#2E1F2E', border: '#8A5B8A', text: '#C4A0C4' }

    case 'archive_item':
      return { bg: '#242424', border: '#6B6B6B', text: '#A8A8A8' }

    case 'memory_item':
    case 'memory_candidate':
    case 'held_truth':
      return { bg: '#1F2E2E', border: '#4A7A6B', text: '#8AC4B0' }

    case 'journal_entry':
    case 'interior_note':
    case 'reflection':
      return { bg: '#2A2030', border: '#6B5070', text: '#B090B8' }

    case 'continuity_item':
    case 'library_item':
    case 'watchtower_evidence':
      return { bg: '#24242E', border: '#5B5B7A', text: '#9898B8' }

    case 'question':
      return { bg: '#2E2420', border: '#7A6B5B', text: '#B8A898' }

    case 'architecture_law':
      return { bg: '#201E2E', border: '#5B4F7A', text: '#9888B8' }

    case 'event':
      return { bg: '#282028', border: '#6B5B6B', text: '#A898A8' }

    default:
      return { bg: '#242424', border: '#5B5B5B', text: '#989898' }
  }
}

// ─── Node Type Display Label ──────────────────────────────────────────────

const NODE_TYPE_LABELS: Record<string, string> = {
  person: 'Person',
  relationship_arc: 'Project / Arc',
  presence: 'Presence',
  relationship_milestone: 'Milestone',
  bond_event: 'Bond Event',
  room: 'Place / Room',
  wing: 'Place / Room',
  concept: 'Concept',
  theme: 'Theme',
  event: 'Event',
  project: 'Project / Arc',
  memory_item: 'Memory',
  memory_candidate: 'Memory Candidate',
  held_truth: 'Held Truth',
  archive_item: 'Archive',
  journal_entry: 'Journal',
  interior_note: 'Interior Note',
  reflection: 'Reflection',
  continuity_item: 'Continuity',
  library_item: 'Library',
  watchtower_evidence: 'Evidence',
  question: 'Question',
  ritual: 'Ritual',
  architecture_law: 'Architecture Law',
  system: 'System',
}

export function getNodeTypeLabel(nodeType: string): string {
  return NODE_TYPE_LABELS[nodeType] ?? nodeType.replace(/_/g, ' ')
}

// ─── Legend Entries ─────────────────────────────────────────────────────────

export type LegendEntry = {
  label: string
  colour: string
}

/** Canonical legend entries for the Relational Map */
export const LEGEND_ENTRIES: LegendEntry[] = [
  { label: 'Person', colour: '#6B5B8A' },
  { label: 'Concept', colour: '#7B4FA2' },
  { label: 'Place / Room', colour: '#3D7A7F' },
  { label: 'System', colour: '#3D6BA0' },
  { label: 'Ritual', colour: '#8A7A3D' },
  { label: 'Project / Arc', colour: '#8A5B8A' },
  { label: 'Archive', colour: '#6B6B6B' },
  { label: 'Derived from edge', colour: '#4A4A4A' },
]

// ─── Edge Type Display ────────────────────────────────────────────────────

export function getEdgeTypeLabel(edgeType: string): string {
  return edgeType.replace(/_/g, ' ')
}

// ─── Confidence / Salience Display ────────────────────────────────────────

/** Returns node size multiplier based on salience (1.0 = default, up to 1.4) */
export function getNodeSizeMultiplier(salience: number | null): number {
  if (salience == null) return 1.0
  return 1.0 + Math.max(0, Math.min(1, salience)) * 0.4
}

/** Returns edge stroke width based on confidence (1 = default, up to 2.5) */
export function getEdgeStrokeWidth(confidence: number | null): number {
  if (confidence == null) return 1
  return 1 + Math.max(0, Math.min(1, confidence)) * 1.5
}
