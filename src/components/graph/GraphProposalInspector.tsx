'use client'

// Phase 37C — Inspector panel for a single graph proposal

import { useState, useEffect } from 'react'
import GraphProposalStatusChip from './GraphProposalStatusChip'
import GraphProposalSourceCards from './GraphProposalSourceCards'
import GraphProposalAuditTrail from './GraphProposalAuditTrail'
import { getAllowedTransitionsFrom } from '@/lib/graph/proposalStatus'

interface Proposal {
  id: string
  proposal_type: string
  status: string
  presence_scope: string
  authority_status: string
  node_type: string | null
  edge_type: string | null
  proposed_label: string
  proposed_summary: string | null
  proposed_payload: Record<string, unknown>
  confidence: number
  salience: number
  reason: string
  safe_wording: string | null
  prompt_eligible: boolean
  primary_source_type: string
  primary_source_id: string
  proposed_by: string
  generation_model: string | null
  generation_version: string
  created_at: string
  updated_at: string
}

interface ProposalSource {
  id: string
  source_type: string
  source_table: string | null
  source_id: string
  source_label: string | null
  source_excerpt: string | null
  source_metadata: Record<string, unknown>
  created_at: string
}

interface ProposalEvent {
  id: string
  proposal_id: string
  event_type: string
  previous_status: string | null
  new_status: string | null
  actor: string
  reason: string | null
  metadata: Record<string, unknown>
  created_at: string
}

const ACTION_LABELS: Record<string, { label: string; style: string }> = {
  approved_graph: {
    label: 'Approve Graph',
    style: 'bg-emerald-900/20 text-emerald-300 hover:bg-emerald-900/40 border-emerald-700/40',
  },
  rejected: {
    label: 'Reject',
    style: 'bg-red-900/20 text-red-300 hover:bg-red-900/40 border-red-700/40',
  },
  needs_more_evidence: {
    label: 'Needs Evidence',
    style: 'bg-blue-900/20 text-blue-300 hover:bg-blue-900/40 border-blue-700/40',
  },
  workspace_only: {
    label: 'Workspace Only',
    style: 'bg-slate-800/30 text-slate-300 hover:bg-slate-800/50 border-slate-600/40',
  },
  superseded: {
    label: 'Supersede',
    style: 'bg-purple-900/20 text-purple-300 hover:bg-purple-900/40 border-purple-700/40',
  },
  pending_review: {
    label: 'Restore',
    style: 'bg-amber-900/20 text-amber-300 hover:bg-amber-900/40 border-amber-700/40',
  },
}

export default function GraphProposalInspector({
  proposalId,
  onStatusChange,
  onClose,
}: {
  proposalId: string
  onStatusChange: () => void
  onClose: () => void
}) {
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [sources, setSources] = useState<ProposalSource[]>([])
  const [events, setEvents] = useState<ProposalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPayload, setShowPayload] = useState(false)

  useEffect(() => {
    loadProposal()
  }, [proposalId])

  async function loadProposal() {
    setLoading(true)
    setError(null)

    try {
      const resp = await fetch(`/api/graph-proposals/${proposalId}`)
      if (!resp.ok) {
        setError('Failed to load proposal')
        return
      }
      const data = await resp.json()
      setProposal(data.proposal)
      setSources(data.sources ?? [])

      // Load events separately via Supabase REST
      const evtResp = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/graph_proposal_events?proposal_id=eq.${proposalId}&order=created_at.asc`,
        {
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
          },
        }
      )
      if (evtResp.ok) {
        const evtData = await evtResp.json()
        setEvents(evtData)
      }
    } catch {
      setError('Failed to load proposal')
    } finally {
      setLoading(false)
    }
  }

  async function handleAction(newStatus: string) {
    setActionLoading(true)
    try {
      const resp = await fetch(`/api/graph-proposals/${proposalId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (resp.ok) {
        onStatusChange()
        loadProposal()
      } else {
        const data = await resp.json()
        setError(data.error ?? 'Action failed')
      }
    } catch {
      setError('Action failed')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-4">
        <p className="text-text-muted text-xs font-body animate-pulse">Loading…</p>
      </div>
    )
  }

  if (error && !proposal) {
    return (
      <div className="p-4">
        <p className="text-red-400 text-xs font-body">{error}</p>
      </div>
    )
  }

  if (!proposal) return null

  const allowedTransitions = getAllowedTransitionsFrom(proposal.status)

  // Build edge display label
  const edgeLabel = proposal.proposal_type === 'edge'
    ? (() => {
        const payload = proposal.proposed_payload as {
          from?: { label?: string }
          to?: { label?: string }
        }
        const from = payload?.from?.label ?? '?'
        const to = payload?.to?.label ?? '?'
        return `${from} — ${proposal.edge_type} → ${to}`
      })()
    : null

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-house-border shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-house-muted/30 text-text-muted border border-house-muted/30">
                {proposal.node_type ?? proposal.edge_type ?? proposal.proposal_type}
              </span>
              <GraphProposalStatusChip status={proposal.status} />
            </div>
            <h3 className="font-display text-lg text-text-primary leading-tight">
              {proposal.proposed_label}
            </h3>
            {edgeLabel && (
              <p className="text-text-muted text-xs font-mono mt-1">{edgeLabel}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-secondary text-sm transition-colors p-1"
            aria-label="Close inspector"
          >
            ×
          </button>
        </div>
      </div>

      {/* Content sections */}
      <div className="p-4 space-y-5 flex-1">
        {/* Summary */}
        {proposal.proposed_summary && (
          <section>
            <h4 className="text-text-muted text-[10px] font-body uppercase tracking-widest mb-1.5">Summary</h4>
            <p className="text-text-secondary text-xs font-body leading-relaxed">
              {proposal.proposed_summary}
            </p>
          </section>
        )}

        {/* Reason + Confidence */}
        <section>
          <h4 className="text-text-muted text-[10px] font-body uppercase tracking-widest mb-1.5">Reason</h4>
          <p className="text-text-secondary text-xs font-body leading-relaxed mb-2">
            {proposal.reason}
          </p>
          <div className="flex items-center gap-4">
            <span className="text-text-muted text-[10px] font-mono">
              Confidence: {(proposal.confidence * 100).toFixed(0)}%
            </span>
            <span className="text-text-muted text-[10px] font-mono">
              Salience: {(proposal.salience * 100).toFixed(0)}%
            </span>
          </div>
        </section>

        {/* Safe Wording */}
        <section>
          <h4 className="text-text-muted text-[10px] font-body uppercase tracking-widest mb-1.5">Safe Wording</h4>
          {proposal.safe_wording ? (
            <p className="text-text-secondary text-xs font-body leading-relaxed italic">
              {proposal.safe_wording}
            </p>
          ) : (
            <p className="text-text-muted text-xs italic">No safe wording stored.</p>
          )}
        </section>

        {/* Source Provenance */}
        <section>
          <h4 className="text-text-muted text-[10px] font-body uppercase tracking-widest mb-1.5">Source Provenance</h4>
          <GraphProposalSourceCards sources={sources} />
        </section>

        {/* Proposed Payload */}
        <section>
          <div className="flex items-center gap-2 mb-1.5">
            <h4 className="text-text-muted text-[10px] font-body uppercase tracking-widest">Proposed Payload</h4>
            <button
              onClick={() => setShowPayload(!showPayload)}
              className="text-text-muted text-[10px] hover:text-text-secondary transition-colors"
            >
              {showPayload ? 'Collapse' : 'Expand'}
            </button>
          </div>
          {showPayload && (
            <pre className="text-text-muted text-[10px] font-mono bg-house-bg border border-house-border rounded p-3 overflow-x-auto max-h-48 overflow-y-auto">
              {JSON.stringify(proposal.proposed_payload, null, 2)}
            </pre>
          )}
        </section>

        {/* Prompt Eligible */}
        <section>
          <h4 className="text-text-muted text-[10px] font-body uppercase tracking-widest mb-1.5">Prompt Eligible</h4>
          <p className={`text-xs font-mono ${proposal.prompt_eligible ? 'text-amber-400' : 'text-text-muted'}`}>
            {proposal.prompt_eligible ? '⚠ true — Unexpected prompt eligibility. Review before use.' : 'false'}
          </p>
        </section>

        {/* Metadata */}
        <section>
          <h4 className="text-text-muted text-[10px] font-body uppercase tracking-widest mb-1.5">Metadata</h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-text-muted text-[10px] font-mono">Scope</span>
            <span className="text-text-secondary text-[10px] font-mono">{proposal.presence_scope}</span>
            <span className="text-text-muted text-[10px] font-mono">Authority</span>
            <span className="text-text-secondary text-[10px] font-mono">{proposal.authority_status}</span>
            <span className="text-text-muted text-[10px] font-mono">Proposed by</span>
            <span className="text-text-secondary text-[10px] font-mono">{proposal.proposed_by}</span>
            <span className="text-text-muted text-[10px] font-mono">Model</span>
            <span className="text-text-secondary text-[10px] font-mono">{proposal.generation_model ?? 'none'}</span>
            <span className="text-text-muted text-[10px] font-mono">Version</span>
            <span className="text-text-secondary text-[10px] font-mono">{proposal.generation_version}</span>
          </div>
        </section>

        {/* Audit Trail */}
        <section>
          <h4 className="text-text-muted text-[10px] font-body uppercase tracking-widest mb-1.5">Audit Trail</h4>
          <GraphProposalAuditTrail events={events} />
        </section>

        {/* Actions */}
        {allowedTransitions.length > 0 && (
          <section>
            <h4 className="text-text-muted text-[10px] font-body uppercase tracking-widest mb-2">Actions</h4>

            <div className="bg-house-bg border border-house-border rounded p-2.5 mb-3">
              <p className="text-text-muted text-[10px] font-body leading-relaxed">
                Approving keeps this as graph structure only. It does not create Memory or Archive authority.
              </p>
            </div>

            {error && (
              <p className="text-red-400 text-xs mb-2">{error}</p>
            )}

            <div className="flex flex-wrap gap-2">
              {allowedTransitions.map(status => {
                const config = ACTION_LABELS[status]
                if (!config) return null
                return (
                  <button
                    key={status}
                    disabled={actionLoading}
                    onClick={() => handleAction(status)}
                    className={`
                      px-3 py-1 rounded text-[11px] font-body border
                      transition-colors disabled:opacity-40
                      ${config.style}
                    `}
                  >
                    {config.label}
                  </button>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
