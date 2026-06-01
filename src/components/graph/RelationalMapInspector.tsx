'use client'

// Phase 37E — Inspector panel for node and edge details.
// Display only. No mutations. No Memory authority.
//
// Layout is not ontology.
// Position is not relationship.

import { useState } from 'react'
import { getNodeTypeLabel, getEdgeTypeLabel } from '@/lib/graph/graphDisplayUtils'
import { SuggestNodeForm, SuggestEdgeForm, SuggestAliasForm, SuggestMetadataChangeForm, SuggestSplitForm, SuggestMergeForm, SuggestLifecycleForm } from './RelationalMapSuggestPanel'
import GraphSuggestionCreateForm from './GraphSuggestionCreateForm'
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
  // 37G.1 suggest actions — only available in Inspect mode (not Arrange mode)
  onSuggestNodeClick?: () => void
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
  onSuggestNodeClick,
}: InspectorProps) {
  const [showPayload, setShowPayload] = useState(false)
  const [suggestEdgeOpen, setSuggestEdgeOpen] = useState(false)
  const [suggestAliasOpen, setSuggestAliasOpen] = useState(false)
  const [suggestMetaOpen, setSuggestMetaOpen] = useState(false)
  const [suggestSplitOpen, setSuggestSplitOpen] = useState(false)
  const [suggestMergeOpen, setSuggestMergeOpen] = useState(false)
  const [suggestLifecycleOpen, setSuggestLifecycleOpen] = useState(false)
  const [suggestCandidateType, setSuggestCandidateType] = useState<'memory_candidate' | 'held_truth_candidate' | null>(null)

  if (!selection) {
    // Collapsed state — minimal width when nothing is selected
    return (
      <div className="w-[48px] shrink-0 border-l border-house-border bg-house-surface/50 flex flex-col items-center pt-4 gap-2">
        <span className="text-text-muted text-[10px] [writing-mode:vertical-rl] rotate-180 font-body tracking-wider opacity-60">
          Inspector
        </span>
        {!arrangeMode && onSuggestNodeClick && (
          <button
            onClick={onSuggestNodeClick}
            title="Suggest Node"
            className="text-text-muted text-[10px] [writing-mode:vertical-rl] rotate-180 font-body tracking-wider opacity-60 hover:opacity-100 hover:text-purple-300 transition-all mt-1"
          >
            + Node
          </button>
        )}
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
              <MetadataRow
                label="Grain"
                value={
                  <span className={
                    selection.node.grainLevel === 'overview' ? 'text-purple-300' :
                    selection.node.grainLevel === 'midlevel' ? 'text-text-secondary' :
                    'text-text-muted'
                  }>
                    {selection.node.grainLevel}
                  </span>
                }
              />
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

        {/* Phase 37F — aliases from grain payload */}
        {isNode && (() => {
          const payload = relatedProposals[0]?.proposedPayload as Record<string, unknown> | undefined
          const aliases = Array.isArray(payload?.aliases) ? payload.aliases as string[] : []
          const grainReason = typeof payload?.grain_reason === 'string' ? payload.grain_reason : null
          if (aliases.length === 0 && !grainReason) return null
          return (
            <div>
              {aliases.length > 0 && (
                <>
                  <div className="text-text-muted uppercase tracking-wider text-[10px] mb-1.5 font-mono">
                    Aliases
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {aliases.map((a, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-body text-text-secondary bg-house-bg border border-house-border/50 rounded px-1.5 py-0.5"
                      >
                        {String(a)}
                      </span>
                    ))}
                  </div>
                </>
              )}
              {grainReason && (
                <p className="text-[10px] text-text-muted italic">{grainReason}</p>
              )}
            </div>
          )
        })()}

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

        {/* Phase 37G.1 — Suggest Edge (Inspect mode only, real approved nodes only) */}
        {isNode && !arrangeMode && !selection.node.derivedFromEdge && (
          <div>
            {suggestEdgeOpen ? (
              <SuggestEdgeForm
                sourceNode={selection.node}
                approvedNodes={allNodes.filter(n => n.grainLevel === 'overview' && !n.derivedFromEdge)}
                onClose={() => setSuggestEdgeOpen(false)}
              />
            ) : (
              <button
                onClick={() => setSuggestEdgeOpen(true)}
                className="font-body text-[10px] px-2.5 py-1 border border-house-border text-text-muted hover:text-purple-300 hover:border-purple-600/40 transition-all"
              >
                ⟶ Suggest Edge from this node
              </button>
            )}
          </div>
        )}
        {isNode && !arrangeMode && selection.node.derivedFromEdge && (
          <p className="text-[10px] text-text-muted opacity-50 italic">
            Suggest Edge requires an approved graph node. Derived display nodes cannot be used as edge endpoints.
          </p>
        )}

        {/* Phase 37G.2 — Suggest Alias (Inspect mode only, real approved nodes only) */}
        {isNode && !arrangeMode && !selection.node.derivedFromEdge && (
          <div>
            {suggestAliasOpen ? (
              <SuggestAliasForm
                targetNode={selection.node}
                onClose={() => setSuggestAliasOpen(false)}
              />
            ) : (
              <button
                onClick={() => setSuggestAliasOpen(true)}
                className="font-body text-[10px] px-2.5 py-1 border border-house-border text-text-muted hover:text-purple-300 hover:border-purple-600/40 transition-all"
              >
                ≈ Suggest Alias for this node
              </button>
            )}
          </div>
        )}
        {isNode && !arrangeMode && selection.node.derivedFromEdge && (
          <p className="text-[10px] text-text-muted opacity-50 italic">
            Suggest Alias requires an approved graph node. Derived display nodes cannot receive aliases.
          </p>
        )}

        {/* Phase 37G.3 — Suggest Metadata Change (Inspect mode, real nodes only) */}
        {isNode && !arrangeMode && !selection.node.derivedFromEdge && (
          <div>
            {suggestMetaOpen ? (
              <SuggestMetadataChangeForm
                targetNode={selection.node}
                onClose={() => setSuggestMetaOpen(false)}
              />
            ) : (
              <button
                onClick={() => setSuggestMetaOpen(true)}
                className="font-body text-[10px] px-2.5 py-1 border border-house-border text-text-muted hover:text-purple-300 hover:border-purple-600/40 transition-all"
              >
                ⚙ Suggest Metadata Change
              </button>
            )}
          </div>
        )}
        {isNode && !arrangeMode && selection.node.derivedFromEdge && (
          <p className="text-[10px] text-text-muted opacity-50 italic">
            Metadata changes require an approved graph node. Derived display nodes cannot be changed.
          </p>
        )}

        {/* Phase 37G.3a — Suggest Split (Inspect mode, real nodes only) */}
        {isNode && !arrangeMode && !selection.node.derivedFromEdge && (
          <div>
            {suggestSplitOpen ? (
              <SuggestSplitForm
                targetNode={selection.node}
                onClose={() => setSuggestSplitOpen(false)}
              />
            ) : (
              <button
                onClick={() => setSuggestSplitOpen(true)}
                className="font-body text-[10px] px-2.5 py-1 border border-house-border text-text-muted hover:text-purple-300 hover:border-purple-600/40 transition-all"
              >
                ⑂ Suggest Split
              </button>
            )}
          </div>
        )}
        {isNode && !arrangeMode && selection.node.derivedFromEdge && (
          <p className="text-[10px] text-text-muted opacity-50 italic">
            Split proposals require an approved graph node. Derived display nodes cannot be split.
          </p>
        )}

        {/* Phase 37G.3b — Suggest Merge (Inspect mode, real nodes only) */}
        {isNode && !arrangeMode && !selection.node.derivedFromEdge && (
          <div>
            {suggestMergeOpen ? (
              <SuggestMergeForm
                sourceNode={selection.node}
                approvedNodes={allNodes.filter(n => !n.derivedFromEdge)}
                onClose={() => setSuggestMergeOpen(false)}
              />
            ) : (
              <button
                onClick={() => setSuggestMergeOpen(true)}
                className="font-body text-[10px] px-2.5 py-1 border border-house-border text-text-muted hover:text-purple-300 hover:border-purple-600/40 transition-all"
              >
                ⊕ Suggest Merge
              </button>
            )}
          </div>
        )}
        {isNode && !arrangeMode && selection.node.derivedFromEdge && (
          <p className="text-[10px] text-text-muted opacity-50 italic">
            Merge proposals require approved graph nodes. Derived display nodes cannot be merged.
          </p>
        )}

        {/* Phase 37G.3c — Suggest Retire / Supersede (Inspect mode, real nodes only) */}
        {isNode && !arrangeMode && !selection.node.derivedFromEdge && (
          <div>
            {suggestLifecycleOpen ? (
              <SuggestLifecycleForm
                targetNode={selection.node}
                approvedNodes={allNodes.filter(n => !n.derivedFromEdge)}
                onClose={() => setSuggestLifecycleOpen(false)}
              />
            ) : (
              <button
                onClick={() => setSuggestLifecycleOpen(true)}
                className="font-body text-[10px] px-2.5 py-1 border border-house-border text-text-muted hover:text-purple-300 hover:border-purple-600/40 transition-all"
              >
                ⊘ Suggest Retire / Supersede
              </button>
            )}
          </div>
        )}
        {isNode && !arrangeMode && selection.node.derivedFromEdge && (
          <p className="text-[10px] text-text-muted opacity-50 italic">
            Lifecycle proposals require approved graph nodes. Derived display nodes cannot be retired or superseded.
          </p>
        )}
        {isNode && arrangeMode && (
          <p className="text-[10px] text-text-muted opacity-50 italic">
            Switch to Inspect mode to suggest graph changes.
          </p>
        )}

        {/* Phase 37H.2 — Suggest Memory / Held Truth Candidate (Inspect mode, real approved nodes only) */}
        {isNode && !arrangeMode && !selection.node.derivedFromEdge && (
          <div className="border-t border-house-border/30 pt-2 mt-1">
            {suggestCandidateType ? (
              <GraphSuggestionCreateForm
                onClose={() => setSuggestCandidateType(null)}
                onCreated={() => setSuggestCandidateType(null)}
                prefillProposalIds={selection.node.proposalIds}
                prefillLabel={selection.node.label}
              />
            ) : (
              <div className="space-y-1">
                <button
                  onClick={() => setSuggestCandidateType('memory_candidate')}
                  className="font-body text-[10px] px-2.5 py-1 border border-house-border text-text-muted hover:text-blue-300 hover:border-blue-600/40 transition-all w-full text-left"
                >
                  ◈ Suggest Memory Candidate
                </button>
                <button
                  onClick={() => setSuggestCandidateType('held_truth_candidate')}
                  className="font-body text-[10px] px-2.5 py-1 border border-house-border text-text-muted hover:text-amber-300 hover:border-amber-600/40 transition-all w-full text-left"
                >
                  ◇ Suggest Held Truth Candidate
                </button>
                <p className="text-[9px] text-text-muted/50 italic font-body">
                  Creates a graph-assisted suggestion only. Not Memory. Not Held Truth.
                </p>
              </div>
            )}
          </div>
        )}
        {isNode && !arrangeMode && selection.node.derivedFromEdge && (
          <div className="border-t border-house-border/30 pt-2 mt-1">
            <p className="text-[10px] text-text-muted opacity-50 italic">
              Candidate suggestions require an approved graph node. Derived display nodes cannot be used as evidence.
            </p>
          </div>
        )}

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
