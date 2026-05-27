'use client'

// Phase 37E — Inspector panel for node and edge details.
// Display only. No mutations. No Memory authority.
//
// Layout is not ontology.
// Position is not relationship.

import { useState } from 'react'
import { getNodeTypeLabel, getEdgeTypeLabel } from '@/lib/graph/graphDisplayUtils'
import type {
  GraphMapNode,
  GraphMapEdge,
  GraphMapProposalSummary,
  GraphMapSourceSummary,
  GraphMapAuditEvent,
} from '@/lib/graph/relationalMapTypes'
import type { RelationalMapNodeLayout } from '@/lib/graph/relationalMapWorkspaceTypes'

// ─── Types ─────────────────────────────────────────────────────────────────

type InspectorSelection =
  | { type: 'node'; node: GraphMapNode }
  | { type: 'edge'; edge: GraphMapEdge }
  | null

interface InspectorProps {
  selection: InspectorSelection
  proposals: GraphMapProposalSummary[]
  sources: GraphMapSourceSummary[]
  auditEvents: GraphMapAuditEvent[]
  allNodes: GraphMapNode[]
  onClose: () => void
  // 37E workspace layout context
  nodeLayout?: RelationalMapNodeLayout | null
  hasWorkspace?: boolean
  arrangeMode?: boolean
  onTogglePin?: (nodeId: string) => void
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    }) + ' · ' + d.toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function ConfidenceDots({ value }: { value: number | null }) {
  if (value == null) return <span className="text-text-muted">—</span>
  const filled = Math.round(value * 5)
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${
            i <= filled ? 'bg-purple-400' : 'bg-house-border'
          }`}
        />
      ))}
      <span className="text-text-muted ml-1">
        {value < 0.4 ? 'Low' : value < 0.7 ? 'Mid' : 'High'} ({value.toFixed(2)})
      </span>
    </span>
  )
}

function MetadataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start py-1.5 border-b border-house-border/30 last:border-0">
      <span className="text-text-muted text-xs shrink-0 mr-3">{label}</span>
      <span className="text-text-secondary text-xs text-right">{value}</span>
    </div>
  )
}

// ─── Source Card ────────────────────────────────────────────────────────────

function SourceCard({ source }: { source: GraphMapSourceSummary }) {
  return (
    <div className="border border-house-border/50 rounded px-3 py-2 bg-house-bg/30 space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-text-muted font-mono">
          {source.sourceType.replace(/_/g, ' ')}
        </span>
        {source.sourceTable && (
          <span className="text-[10px] text-text-muted opacity-60">
            {source.sourceTable}
          </span>
        )}
      </div>
      {source.sourceLabel && (
        <div className="text-text-secondary text-xs">{source.sourceLabel}</div>
      )}
      {source.sourceExcerpt && (
        <div className="text-text-muted text-[11px] leading-relaxed line-clamp-3">
          {source.sourceExcerpt}
        </div>
      )}
      <div className="text-[10px] text-text-muted opacity-60 font-mono truncate">
        {source.sourceId}
      </div>
    </div>
  )
}

// ─── Audit Event ───────────────────────────────────────────────────────────

function AuditEventRow({ event }: { event: GraphMapAuditEvent }) {
  return (
    <div className="border-l-2 border-house-border/40 pl-3 py-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary">
          {event.eventType.replace(/_/g, ' ')}
        </span>
        <span className="text-[10px] text-text-muted">{event.actor}</span>
      </div>
      {event.previousStatus && event.newStatus && (
        <div className="text-[10px] text-text-muted mt-0.5">
          {event.previousStatus} → {event.newStatus}
        </div>
      )}
      {event.reason && (
        <div className="text-[11px] text-text-muted mt-0.5 line-clamp-2">{event.reason}</div>
      )}
      <div className="text-[10px] text-text-muted opacity-60 mt-0.5">
        {formatDate(event.createdAt)}
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function RelationalMapInspector({
  selection,
  proposals,
  sources,
  auditEvents,
  allNodes,
  onClose,
  nodeLayout,
  hasWorkspace,
  arrangeMode,
  onTogglePin,
}: InspectorProps) {
  const [showPayload, setShowPayload] = useState(false)

  if (!selection) {
    return (
      <div className="w-[360px] shrink-0 border-l border-house-border bg-house-surface/50 flex items-center justify-center">
        <p className="text-text-muted text-xs font-body text-center px-6">
          Select a node or edge to inspect its provenance.
        </p>
      </div>
    )
  }

  // Gather data based on selection
  const isNode = selection.type === 'node'
  const proposalIds = isNode ? selection.node.proposalIds : [selection.edge.proposalId]
  const relatedProposals = proposals.filter(p => proposalIds.includes(p.id))
  const relatedSources = sources.filter(s => proposalIds.includes(s.proposalId))
  const relatedEvents = auditEvents
    .filter(e => proposalIds.includes(e.proposalId))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const promptEligible = isNode ? selection.node.promptEligible : selection.edge.promptEligible

  // Node-specific: connected entities
  let connectedCount = 0
  let topRelationTypes: Record<string, number> = {}
  if (isNode) {
    // Count from allNodes perspective — not perfect without edges, but we can use
    // the parent page's data
  }

  return (
    <div className="w-[360px] shrink-0 border-l border-house-border bg-house-surface/50 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-house-surface/90 backdrop-blur-sm border-b border-house-border px-4 py-3 z-10">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-text-primary text-sm font-display truncate">
              {isNode ? selection.node.label : selection.edge.label}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] uppercase tracking-wider text-text-muted font-mono px-1.5 py-0.5 border border-house-border rounded">
                {isNode ? getNodeTypeLabel(selection.node.nodeType) : getEdgeTypeLabel(selection.edge.edgeType)}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-secondary text-sm ml-2 shrink-0"
            aria-label="Close inspector"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="px-4 py-3 space-y-4">
        {/* Edge direction display */}
        {!isNode && (
          <div className="bg-house-bg/40 border border-house-border/40 rounded px-3 py-2">
            <div className="text-xs text-text-secondary flex items-center gap-2 flex-wrap">
              <span>{(() => {
                const fromNode = allNodes.find(n => n.id === selection.edge.fromNodeId)
                return fromNode?.label ?? selection.edge.fromNodeId
              })()}</span>
              <span className="text-text-muted">→</span>
              <span className="text-purple-300/80 font-mono text-[11px]">
                {getEdgeTypeLabel(selection.edge.edgeType)}
              </span>
              <span className="text-text-muted">→</span>
              <span>{(() => {
                const toNode = allNodes.find(n => n.id === selection.edge.toNodeId)
                return toNode?.label ?? selection.edge.toNodeId
              })()}</span>
            </div>
          </div>
        )}

        {/* Metadata grid */}
        <div>
          {isNode ? (
            <>
              <MetadataRow label="Type" value={getNodeTypeLabel(selection.node.nodeType)} />
              <MetadataRow label="Scope" value={selection.node.presenceScope} />
              <MetadataRow label="Authority" value={selection.node.authorityStatus.replace(/_/g, ' ')} />
              <MetadataRow label="Confidence" value={<ConfidenceDots value={selection.node.confidence} />} />
              <MetadataRow label="Salience" value={<ConfidenceDots value={selection.node.salience} />} />
              <MetadataRow label="Derived from edge" value={selection.node.derivedFromEdge ? 'Yes' : 'No'} />
              <MetadataRow
                label="Prompt eligible"
                value={
                  <span className={promptEligible ? 'text-amber-400' : ''}>
                    {promptEligible ? 'True' : 'False'}
                  </span>
                }
              />
            </>
          ) : (
            <>
              <MetadataRow label="Edge type" value={getEdgeTypeLabel(selection.edge.edgeType)} />
              <MetadataRow label="Scope" value={selection.edge.presenceScope} />
              <MetadataRow label="Authority" value={selection.edge.authorityStatus.replace(/_/g, ' ')} />
              <MetadataRow label="Confidence" value={<ConfidenceDots value={selection.edge.confidence} />} />
              <MetadataRow label="Salience" value={<ConfidenceDots value={selection.edge.salience} />} />
              <MetadataRow
                label="Prompt eligible"
                value={
                  <span className={promptEligible ? 'text-amber-400' : ''}>
                    {promptEligible ? 'True' : 'False'}
                  </span>
                }
              />
            </>
          )}
        </div>

        {/* Layout metadata section (37E) */}
        {isNode && nodeLayout && (
          <div>
            <div className="text-text-muted uppercase tracking-wider text-[10px] mb-2 font-mono">
              Layout
            </div>
            <MetadataRow label="Position" value={`${Math.round(nodeLayout.x)}, ${Math.round(nodeLayout.y)}`} />
            <MetadataRow
              label="Pinned"
              value={
                <span className="flex items-center gap-1.5">
                  <span>{nodeLayout.pinned ? 'Yes 📌' : 'No'}</span>
                  {arrangeMode && onTogglePin && (
                    <button
                      onClick={() => onTogglePin(selection.node.id)}
                      className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      {nodeLayout.pinned ? 'Unpin' : 'Pin'}
                    </button>
                  )}
                </span>
              }
            />
            <MetadataRow
              label="Source"
              value={hasWorkspace ? 'Saved workspace' : 'Default layout'}
            />
            <div className="text-[10px] text-text-muted opacity-50 italic mt-1">
              Node position is workspace layout metadata only. It does not change graph meaning.
            </div>
          </div>
        )}

        {/* Prompt eligibility warning */}
        {promptEligible && (
          <div className="bg-amber-900/20 border border-amber-700/30 rounded px-3 py-2">
            <p className="text-amber-400 text-xs">
              Unexpected prompt eligibility. This map should not make prompt truth.
            </p>
          </div>
        )}

        {/* Governance reminder */}
        <div className="text-[10px] text-text-muted opacity-60 italic">
          Graph structure only. Not canonical Memory. Not prompt truth.
        </div>

        {/* Proposal details */}
        {relatedProposals.length > 0 && (
          <div>
            <div className="text-text-muted uppercase tracking-wider text-[10px] mb-2 font-mono">
              Supporting Proposals ({relatedProposals.length})
            </div>
            <div className="space-y-2">
              {relatedProposals.map(p => (
                <div key={p.id} className="border border-house-border/50 rounded px-3 py-2 bg-house-bg/30 space-y-1">
                  <div className="text-xs text-text-secondary">{p.proposedLabel}</div>
                  {p.proposedSummary && (
                    <div className="text-[11px] text-text-muted leading-relaxed line-clamp-3">
                      {p.proposedSummary}
                    </div>
                  )}
                  {p.reason && (
                    <div className="text-[11px] text-text-muted leading-relaxed line-clamp-2">
                      <span className="opacity-60">Reason:</span> {p.reason}
                    </div>
                  )}
                  {p.safeWording && (
                    <div className="text-[11px] text-text-muted leading-relaxed italic line-clamp-2">
                      {p.safeWording}
                    </div>
                  )}
                  <div className="text-[10px] text-text-muted opacity-60 font-mono truncate">{p.id}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Proposed Payload (collapsible) */}
        {relatedProposals.length > 0 && (
          <div>
            <button
              onClick={() => setShowPayload(!showPayload)}
              className="text-text-muted text-[10px] uppercase tracking-wider font-mono hover:text-text-secondary transition-colors"
            >
              {showPayload ? '▾' : '▸'} Proposed Payload
            </button>
            {showPayload && (
              <pre className="mt-2 text-[10px] text-text-muted bg-house-bg/50 border border-house-border/30 rounded p-2 overflow-x-auto max-h-[200px] overflow-y-auto font-mono">
                {JSON.stringify(relatedProposals[0]?.proposedPayload, null, 2)}
              </pre>
            )}
          </div>
        )}

        {/* Source provenance */}
        <div>
          <div className="text-text-muted uppercase tracking-wider text-[10px] mb-2 font-mono">
            Source Provenance ({relatedSources.length})
          </div>
          {relatedSources.length > 0 ? (
            <div className="space-y-2">
              {relatedSources.map((s, i) => (
                <SourceCard key={`${s.proposalId}-${i}`} source={s} />
              ))}
            </div>
          ) : (
            <p className="text-text-muted text-xs opacity-60">
              No source provenance found. This item should be reviewed.
            </p>
          )}
        </div>

        {/* Audit history */}
        <div>
          <div className="text-text-muted uppercase tracking-wider text-[10px] mb-2 font-mono">
            Audit History ({relatedEvents.length})
          </div>
          {relatedEvents.length > 0 ? (
            <div className="space-y-1">
              {relatedEvents.map((e, i) => (
                <AuditEventRow key={`${e.proposalId}-${i}`} event={e} />
              ))}
            </div>
          ) : (
            <p className="text-text-muted text-xs opacity-60">No audit events.</p>
          )}
        </div>
      </div>
    </div>
  )
}

export type { InspectorSelection }
