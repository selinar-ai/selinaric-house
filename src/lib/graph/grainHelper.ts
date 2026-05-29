// Phase 37F — Graph Grain Helper
//
// The graph is not a list of memories.
// The graph is a high-level relationship map supported by memories.
// Archive entries provide provenance, not automatic nodes.
// Detail belongs in drilldown, not the default map.
//
// Default graph nodes should be stable named entities,
// not memory-shaped fragments.
//
// This helper:
//   - Reads existing graph proposals, legacy archive graph, and archive items
//   - Identifies high-level entity candidates deterministically
//   - Creates pending graph proposals for Ontology Lab review
//   - Never creates truth directly
//   - Never writes to archive_items, Memory tables, Archive Graph tables,
//     or final graph tables
//   - Forces prompt_eligible = false

import { supabase } from '@/lib/supabase'
import { createProposal, type CreateProposalInput } from './proposals'
import { normalizeLabel } from './proposals'
import { isOverviewLabel, type GraphGrainLevel, type GraphEntityKind } from './graphGrain'
import type { GraphPresenceScope, GraphAuthorityStatus, GraphNodeType } from './types'

// ─── Constants ────────────────────────────────────────────────────────────

const MAX_SOURCES_PER_RUN = 20
const MAX_CANDIDATES_PER_RUN = 10
const MAX_ALIASES_PER_CANDIDATE = 12
const MAX_SUPPORTING_SOURCES = 25

// ─── Entity Kind → Node Type Mapping ──────────────────────────────────────

const ENTITY_KIND_TO_NODE_TYPE: Record<GraphEntityKind, GraphNodeType> = {
  person: 'person',
  presence: 'presence',
  being: 'presence',
  room: 'room',
  place: 'room',
  system: 'project',
  platform: 'project',
  provider: 'project',
  project: 'project',
  relationship_arc: 'relationship_arc',
  protocol: 'architecture_law',
  law: 'architecture_law',
  archive_room: 'room',
  concept: 'concept',
  ritual: 'ritual',
  object: 'concept',
}

// ─── Types ────────────────────────────────────────────────────────────────

export interface GrainCandidate {
  canonicalLabel: string
  entityKind: GraphEntityKind
  grainLevel: GraphGrainLevel
  aliases: string[]
  supportingSources: Array<{
    sourceType: 'graph_proposal' | 'archive_graph_node' | 'archive_graph_edge' | 'archive_item'
    sourceId: string
    label: string
  }>
  presenceScope: GraphPresenceScope
  authorityStatus: GraphAuthorityStatus
  confidence: number
  reason: string
}

export interface GrainPreview {
  candidates: GrainCandidate[]
  sourceStats: {
    graphProposals: number
    archiveGraphNodes: number
    archiveItems: number
  }
}

export interface GrainCreateResult {
  created: number
  skipped: number
  proposals: Array<{
    proposalId?: string
    label: string
    status: 'created' | 'duplicate' | 'error'
    error?: string
  }>
}

// ─── Read Sources ─────────────────────────────────────────────────────────

async function readExistingProposals(): Promise<Array<{
  id: string
  label: string
  nodeType: string
  presenceScope: string
  status: string
}>> {
  const { data } = await supabase
    .from('graph_proposals')
    .select('id, proposed_label, node_type, presence_scope, status')
    .is('deleted_at', null)
    .eq('proposal_type', 'node')
    .in('status', ['pending_review', 'approved_graph', 'needs_more_evidence'])
    .limit(MAX_SOURCES_PER_RUN)

  return (data ?? []).map(p => ({
    id: p.id,
    label: p.proposed_label,
    nodeType: p.node_type ?? 'concept',
    presenceScope: p.presence_scope,
    status: p.status,
  }))
}

async function readLegacyArchiveGraphNodes(): Promise<Array<{
  id: string
  label: string
  nodeType: string
  archiveName: string
  approvalStatus: string
}>> {
  const { data } = await supabase
    .from('archive_graph_nodes')
    .select('id, label, node_type, archive_name, approval_status')
    .in('approval_status', ['pending', 'approved'])
    .limit(MAX_SOURCES_PER_RUN)

  return (data ?? []).map(n => ({
    id: n.id,
    label: n.label,
    nodeType: n.node_type,
    archiveName: n.archive_name,
    approvalStatus: n.approval_status,
  }))
}

async function readCanonicalArchiveItems(): Promise<Array<{
  id: string
  title: string
  category: string
  archiveName: string
  ownerPresence: string
  sensitivity: string
}>> {
  const { data } = await supabase
    .from('archive_items')
    .select('id, title, category, archive_name, owner_presence, sensitivity')
    .is('deleted_at', null)
    .in('canonical_status', ['canonical', 'canonical_candidate'])
    .not('sensitivity', 'in', '("sacred","sensitive","technical")')
    .limit(MAX_SOURCES_PER_RUN)

  return (data ?? []).map(a => ({
    id: a.id,
    title: a.title,
    category: a.category,
    archiveName: a.archive_name,
    ownerPresence: a.owner_presence,
    sensitivity: a.sensitivity,
  }))
}

// ─── Label Grouping ───────────────────────────────────────────────────────

interface LabelGroup {
  normalizedLabel: string
  canonicalLabel: string
  aliases: Set<string>
  sources: Array<{
    sourceType: 'graph_proposal' | 'archive_graph_node' | 'archive_graph_edge' | 'archive_item'
    sourceId: string
    label: string
  }>
  presenceScopes: Set<string>
  nodeTypes: Set<string>
  hasApprovedSource: boolean
}

function groupLabels(
  proposals: Awaited<ReturnType<typeof readExistingProposals>>,
  legacyNodes: Awaited<ReturnType<typeof readLegacyArchiveGraphNodes>>,
  archiveItems: Awaited<ReturnType<typeof readCanonicalArchiveItems>>
): Map<string, LabelGroup> {
  const groups = new Map<string, LabelGroup>()

  function getOrCreate(label: string): LabelGroup {
    const norm = normalizeLabel(label)
    let group = groups.get(norm)
    if (!group) {
      group = {
        normalizedLabel: norm,
        canonicalLabel: label.trim(),
        aliases: new Set(),
        sources: [],
        presenceScopes: new Set(),
        nodeTypes: new Set(),
        hasApprovedSource: false,
      }
      groups.set(norm, group)
    }
    // Prefer shorter canonical label
    if (label.trim().length < group.canonicalLabel.length) {
      group.canonicalLabel = label.trim()
    }
    group.aliases.add(label.trim())
    return group
  }

  for (const p of proposals) {
    const group = getOrCreate(p.label)
    group.sources.push({ sourceType: 'graph_proposal', sourceId: p.id, label: p.label })
    group.presenceScopes.add(p.presenceScope)
    group.nodeTypes.add(p.nodeType)
    if (p.status === 'approved_graph') group.hasApprovedSource = true
  }

  for (const n of legacyNodes) {
    const group = getOrCreate(n.label)
    group.sources.push({ sourceType: 'archive_graph_node', sourceId: n.id, label: n.label })
    group.nodeTypes.add(n.nodeType)
    // Map archive_name to scope
    const scope = n.archiveName === 'velvet' ? 'ari' : n.archiveName === 'violet' ? 'eli' : 'shared'
    group.presenceScopes.add(scope)
    if (n.approvalStatus === 'approved') group.hasApprovedSource = true
  }

  // Archive items — use title for label grouping but only as supporting evidence
  for (const a of archiveItems) {
    // Only add as supporting evidence if title matches an existing group
    const norm = normalizeLabel(a.title)
    if (groups.has(norm)) {
      const group = groups.get(norm)!
      group.sources.push({ sourceType: 'archive_item', sourceId: a.id, label: a.title })
    }
  }

  return groups
}

// ─── Candidate Selection ──────────────────────────────────────────────────

function selectCandidates(groups: Map<string, LabelGroup>): GrainCandidate[] {
  const candidates: GrainCandidate[] = []

  for (const group of groups.values()) {
    // Must be an overview-quality label
    if (!isOverviewLabel(group.canonicalLabel)) continue

    // Must have multiple supporting sources OR be an approved source
    if (group.sources.length < 2 && !group.hasApprovedSource) continue

    // Determine entity kind from most common node type
    const nodeTypeCounts = new Map<string, number>()
    for (const nt of group.nodeTypes) {
      nodeTypeCounts.set(nt, (nodeTypeCounts.get(nt) ?? 0) + 1)
    }
    const topNodeType = [...nodeTypeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'concept'

    // Map node type to entity kind
    const entityKind: GraphEntityKind =
      topNodeType === 'person' ? 'person' :
      topNodeType === 'presence' ? 'presence' :
      topNodeType === 'room' || topNodeType === 'wing' ? 'room' :
      topNodeType === 'project' ? 'project' :
      topNodeType === 'ritual' ? 'ritual' :
      topNodeType === 'architecture_law' ? 'law' :
      topNodeType === 'relationship_arc' ? 'relationship_arc' :
      'concept'

    // Determine scope (prefer shared if mixed)
    const scopes = [...group.presenceScopes]
    const presenceScope: GraphPresenceScope =
      scopes.length > 1 ? 'shared' :
      scopes[0] === 'ari' ? 'ari' :
      scopes[0] === 'eli' ? 'eli' :
      'shared'

    // Authority: archive_supported if approved source exists, candidate otherwise
    const authorityStatus: GraphAuthorityStatus =
      group.hasApprovedSource ? 'archive_supported' : 'candidate'

    // Confidence: higher with more sources
    const confidence = Math.min(0.95, 0.5 + group.sources.length * 0.08)

    candidates.push({
      canonicalLabel: group.canonicalLabel,
      entityKind,
      grainLevel: 'overview',
      aliases: [...group.aliases].slice(0, MAX_ALIASES_PER_CANDIDATE),
      supportingSources: group.sources.slice(0, MAX_SUPPORTING_SOURCES),
      presenceScope,
      authorityStatus,
      confidence,
      reason: `High-level entity "${group.canonicalLabel}" supported by ${group.sources.length} source(s). ` +
        `Entity kind: ${entityKind}. Grain: overview.`,
    })
  }

  // Sort by confidence descending, cap at max candidates per run
  candidates.sort((a, b) => b.confidence - a.confidence)
  return candidates.slice(0, MAX_CANDIDATES_PER_RUN)
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Preview grain candidates without creating proposals.
 * Reads from graph_proposals, archive_graph_nodes, and archive_items.
 * Never writes to any table.
 */
export async function previewGrainCandidates(): Promise<GrainPreview> {
  const [proposals, legacyNodes, archiveItems] = await Promise.all([
    readExistingProposals(),
    readLegacyArchiveGraphNodes(),
    readCanonicalArchiveItems(),
  ])

  const groups = groupLabels(proposals, legacyNodes, archiveItems)
  const candidates = selectCandidates(groups)

  return {
    candidates,
    sourceStats: {
      graphProposals: proposals.length,
      archiveGraphNodes: legacyNodes.length,
      archiveItems: archiveItems.length,
    },
  }
}

/**
 * Create pending graph proposals for selected grain candidates.
 * All proposals start as pending_review with prompt_eligible = false.
 * Only writes to graph_proposals, graph_proposal_sources, graph_proposal_events.
 */
export async function createGrainProposals(
  candidates: GrainCandidate[]
): Promise<GrainCreateResult> {
  const result: GrainCreateResult = {
    created: 0,
    skipped: 0,
    proposals: [],
  }

  for (const candidate of candidates.slice(0, MAX_CANDIDATES_PER_RUN)) {
    const nodeType = ENTITY_KIND_TO_NODE_TYPE[candidate.entityKind] ?? 'concept'

    // Find the primary source (first graph_proposal or archive_graph_node)
    const primarySource = candidate.supportingSources[0]
    if (!primarySource) {
      result.skipped++
      result.proposals.push({
        label: candidate.canonicalLabel,
        status: 'error',
        error: 'No supporting sources',
      })
      continue
    }

    const payload: Record<string, unknown> = {
      // Standard node proposal fields
      nodeType,
      label: candidate.canonicalLabel,
      summary: candidate.reason,
      suggestedAuthorityStatus: candidate.authorityStatus,
      suggestedPresenceScope: candidate.presenceScope,
      // Phase 37F grain metadata
      grain_level: candidate.grainLevel,
      entity_kind: candidate.entityKind,
      canonical_label: candidate.canonicalLabel,
      aliases: candidate.aliases,
      consolidates: candidate.supportingSources.map(s => ({
        source_type: s.sourceType,
        source_id: s.sourceId,
        label: s.label,
      })),
      supporting_graph_proposal_ids: candidate.supportingSources
        .filter(s => s.sourceType === 'graph_proposal')
        .map(s => s.sourceId),
      supporting_archive_graph_node_ids: candidate.supportingSources
        .filter(s => s.sourceType === 'archive_graph_node')
        .map(s => s.sourceId),
      supporting_archive_item_ids: candidate.supportingSources
        .filter(s => s.sourceType === 'archive_item')
        .map(s => s.sourceId),
      detail_policy: 'drilldown_only',
      grain_reason: candidate.reason,
    }

    const input: CreateProposalInput = {
      proposalType: 'node',
      nodeType: nodeType as GraphNodeType,
      label: candidate.canonicalLabel,
      summary: candidate.reason,
      payload,
      confidence: candidate.confidence,
      salience: 0.7,
      reason: candidate.reason,
      safeWording: `High-level graph entity: ${candidate.canonicalLabel}. ` +
        `Organises evidence from ${candidate.supportingSources.length} source(s).`,
      authorityStatus: candidate.authorityStatus,
      presenceScope: candidate.presenceScope,
      primarySourceType: primarySource.sourceType as 'graph_proposal' | 'archive_graph_node' | 'archive_graph_edge' | 'archive_item',
      primarySourceId: primarySource.sourceId,
      generationModel: undefined, // deterministic grouping, no model call
      sourceRecord: {
        sourceType: primarySource.sourceType as 'graph_proposal' | 'archive_graph_node' | 'archive_graph_edge' | 'archive_item',
        sourceTable: primarySource.sourceType === 'graph_proposal' ? 'graph_proposals' :
          primarySource.sourceType === 'archive_graph_node' ? 'archive_graph_nodes' :
          primarySource.sourceType === 'archive_graph_edge' ? 'archive_graph_edges' :
          'archive_items',
        sourceId: primarySource.sourceId,
        sourceLabel: primarySource.label,
        sourceMetadata: {
          grain_role: 'consolidated_source',
          legacy_system: primarySource.sourceType.startsWith('archive_graph_') ? 'phase_29B' : undefined,
        },
      },
    }

    const createResult = await createProposal(input)

    if (createResult.ok) {
      result.created++
      result.proposals.push({
        proposalId: createResult.proposalId,
        label: candidate.canonicalLabel,
        status: 'created',
      })

      // Insert additional source rows for remaining supporting sources
      for (const source of candidate.supportingSources.slice(1, MAX_SUPPORTING_SOURCES)) {
        await supabase
          .from('graph_proposal_sources')
          .insert({
            proposal_id: createResult.proposalId,
            source_type: source.sourceType,
            source_table:
              source.sourceType === 'graph_proposal' ? 'graph_proposals' :
              source.sourceType === 'archive_graph_node' ? 'archive_graph_nodes' :
              source.sourceType === 'archive_graph_edge' ? 'archive_graph_edges' :
              'archive_items',
            source_id: source.sourceId,
            source_label: source.label,
            source_metadata: {
              grain_role: 'consolidated_source',
              legacy_system: source.sourceType.startsWith('archive_graph_') ? 'phase_29B' : undefined,
            },
          })
          .then(({ error }) => {
            if (error) console.error('[grain-helper] Additional source insert failed:', error.message)
          })
      }
    } else if (createResult.code === 'duplicate_pending') {
      result.skipped++
      result.proposals.push({
        label: candidate.canonicalLabel,
        status: 'duplicate',
      })
    } else {
      result.skipped++
      result.proposals.push({
        label: candidate.canonicalLabel,
        status: 'error',
        error: createResult.error,
      })
    }
  }

  return result
}
