'use client'

// Phase 29B — Graph Candidates review tab
//
// Shows pending (or filtered) archive_graph_nodes and archive_graph_edges
// for a given archive room. Tara approves or rejects each candidate.
//
// PATCH /api/archive-graph/nodes/[id] — { action: 'approve' | 'reject' }
// PATCH /api/archive-graph/edges/[id] — { action: 'approve' | 'reject' }
//
// Edge approval is blocked if either endpoint node is rejected (409 response).
// Node rejection cascades to pending edges on the server side.
//
// Status filter: pending | approved | rejected | all
// Default: pending

import { useState, useEffect, useCallback } from 'react'
import type { GraphNode, GraphEdge } from '@/lib/archive-graph'
import { NODE_TYPE_LABELS, EDGE_TYPE_LABELS } from '@/lib/archive-graph'

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all'

interface Props {
  archiveName: string
}

export default function GraphCandidatesTab({ archiveName }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [nodes,        setNodes]        = useState<GraphNode[]>([])
  const [edges,        setEdges]        = useState<GraphEdge[]>([])
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [actioning,    setActioning]    = useState<string | null>(null)  // id currently being actioned
  const [actionErr,    setActionErr]    = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setActionErr(null)
    try {
      const res  = await fetch(
        `/api/archive-graph/candidates?archive=${encodeURIComponent(archiveName)}&status=${statusFilter}`
      )
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Load failed'); return }
      setNodes(data.nodes ?? [])
      setEdges(data.edges ?? [])
    } catch {
      setError('Request failed')
    } finally {
      setLoading(false)
    }
  }, [archiveName, statusFilter])

  useEffect(() => { void load() }, [load])

  async function actOnNode(id: string, action: 'approve' | 'reject') {
    setActioning(id)
    setActionErr(null)
    try {
      const res  = await fetch(`/api/archive-graph/nodes/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) {
        setActionErr(data.error ?? 'Action failed')
        return
      }
      await load()
    } catch {
      setActionErr('Request failed')
    } finally {
      setActioning(null)
    }
  }

  async function actOnEdge(id: string, action: 'approve' | 'reject') {
    setActioning(id)
    setActionErr(null)
    try {
      const res  = await fetch(`/api/archive-graph/edges/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) {
        setActionErr(data.error ?? 'Action failed')
        return
      }
      await load()
    } catch {
      setActionErr('Request failed')
    } finally {
      setActioning(null)
    }
  }

  const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
    { id: 'pending',  label: 'Pending' },
    { id: 'approved', label: 'Approved' },
    { id: 'rejected', label: 'Rejected' },
    { id: 'all',      label: 'All' },
  ]

  return (
    <div className="space-y-0">

      {/* Status filter row */}
      <div className="px-4 py-2.5 border-b border-house-border/60 flex items-center gap-1 flex-wrap">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setStatusFilter(f.id)}
            className={`
              font-body text-xs px-2.5 py-1 border transition-colors
              ${statusFilter === f.id
                ? 'border-house-muted text-text-secondary bg-house-bg'
                : 'border-house-border text-text-muted hover:text-text-secondary hover:border-house-border'
              }
            `}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={() => void load()}
          disabled={loading}
          className="ml-auto font-body text-[10px] text-text-muted hover:text-text-secondary transition-colors disabled:opacity-40"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Global action error */}
      {actionErr && (
        <div className="px-4 py-2 border-b border-red-400/20 bg-red-400/5">
          <p className="font-body text-xs text-red-400">{actionErr}</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="px-4 py-8 text-center">
          <p className="font-body text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {loading && !error && (
        <div className="flex items-center justify-center py-12">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" />
            <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.2s' }} />
            <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.4s' }} />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && nodes.length === 0 && edges.length === 0 && (
        <div className="px-4 py-12 text-center space-y-1">
          <p className="font-body text-sm text-text-muted">
            {statusFilter === 'pending'
              ? 'No pending graph candidates.'
              : `No ${statusFilter} graph candidates.`}
          </p>
          {statusFilter === 'pending' && (
            <p className="font-body text-xs text-text-muted">
              Run Graph Extraction above to propose nodes and edges from eligible archive items.
            </p>
          )}
        </div>
      )}

      {!loading && !error && (nodes.length > 0 || edges.length > 0) && (
        <div>

          {/* ── Nodes ──────────────────────────────────────────────────── */}
          {nodes.length > 0 && (
            <div>
              <div className="px-4 py-2 border-b border-house-border/40">
                <p className="font-body text-[10px] text-text-muted uppercase tracking-widest">
                  Nodes · {nodes.length}
                </p>
              </div>
              {nodes.map(node => (
                <div
                  key={node.id}
                  className="px-4 py-3 border-b border-house-border/30 flex flex-col gap-1.5"
                >
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className="font-body text-xs text-text-primary font-medium">
                      {node.label}
                    </span>
                    <span className="font-body text-[10px] text-text-muted bg-house-surface border border-house-border px-1.5 py-0.5">
                      {NODE_TYPE_LABELS[node.node_type] ?? node.node_type}
                    </span>
                    <ApprovalBadge status={node.approval_status} />
                  </div>

                  {node.description && (
                    <p className="font-body text-xs text-text-muted">{node.description}</p>
                  )}

                  <p className="font-body text-[10px] text-text-muted/60">
                    {node.source_item_ids.length} source item{node.source_item_ids.length !== 1 ? 's' : ''}
                    {' · '}created {new Date(node.created_at).toLocaleDateString()}
                  </p>

                  {node.approval_status === 'pending' && (
                    <div className="flex gap-2 pt-0.5">
                      <button
                        onClick={() => void actOnNode(node.id, 'approve')}
                        disabled={actioning === node.id}
                        className="
                          h-7 px-3 font-body text-xs border border-green-400/30
                          text-green-400 hover:bg-green-400/10 transition-all disabled:opacity-40
                        "
                      >
                        {actioning === node.id ? '…' : 'Approve'}
                      </button>
                      <button
                        onClick={() => void actOnNode(node.id, 'reject')}
                        disabled={actioning === node.id}
                        className="
                          h-7 px-3 font-body text-xs border border-red-400/20
                          text-red-400/60 hover:bg-red-400/10 transition-all disabled:opacity-40
                        "
                      >
                        {actioning === node.id ? '…' : 'Reject'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Edges ──────────────────────────────────────────────────── */}
          {edges.length > 0 && (
            <div>
              <div className="px-4 py-2 border-b border-house-border/40 mt-2">
                <p className="font-body text-[10px] text-text-muted uppercase tracking-widest">
                  Edges · {edges.length}
                </p>
              </div>
              {edges.map(edge => {
                const fromLabel = edge.from_node?.label ?? edge.from_node_id.slice(0, 8)
                const toLabel   = edge.to_node?.label   ?? edge.to_node_id.slice(0, 8)
                const fromStatus = edge.from_node?.approval_status
                const toStatus   = edge.to_node?.approval_status
                const edgeBlocked = (fromStatus === 'rejected' || toStatus === 'rejected')

                return (
                  <div
                    key={edge.id}
                    className="px-4 py-3 border-b border-house-border/30 flex flex-col gap-1.5"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-body text-xs text-text-secondary">{fromLabel}</span>
                      <span className="font-body text-[10px] text-text-muted/60">→</span>
                      <span className="font-body text-xs text-text-muted bg-house-surface border border-house-border px-1.5 py-0.5">
                        {EDGE_TYPE_LABELS[edge.edge_type] ?? edge.edge_type}
                      </span>
                      <span className="font-body text-[10px] text-text-muted/60">→</span>
                      <span className="font-body text-xs text-text-secondary">{toLabel}</span>
                      <ApprovalBadge status={edge.approval_status} />
                    </div>

                    {edge.description && (
                      <p className="font-body text-xs text-text-muted">{edge.description}</p>
                    )}

                    {edgeBlocked && edge.approval_status === 'pending' && (
                      <p className="font-body text-[10px] text-orange-300/70">
                        Blocked — one or both endpoint nodes are rejected.
                      </p>
                    )}

                    <p className="font-body text-[10px] text-text-muted/60">
                      {edge.source_item_ids.length} source item{edge.source_item_ids.length !== 1 ? 's' : ''}
                      {' · '}created {new Date(edge.created_at).toLocaleDateString()}
                    </p>

                    {edge.approval_status === 'pending' && !edgeBlocked && (
                      <div className="flex gap-2 pt-0.5">
                        <button
                          onClick={() => void actOnEdge(edge.id, 'approve')}
                          disabled={actioning === edge.id}
                          className="
                            h-7 px-3 font-body text-xs border border-green-400/30
                            text-green-400 hover:bg-green-400/10 transition-all disabled:opacity-40
                          "
                        >
                          {actioning === edge.id ? '…' : 'Approve'}
                        </button>
                        <button
                          onClick={() => void actOnEdge(edge.id, 'reject')}
                          disabled={actioning === edge.id}
                          className="
                            h-7 px-3 font-body text-xs border border-red-400/20
                            text-red-400/60 hover:bg-red-400/10 transition-all disabled:opacity-40
                          "
                        >
                          {actioning === edge.id ? '…' : 'Reject'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

        </div>
      )}
    </div>
  )
}

// ─── ApprovalBadge ────────────────────────────────────────────────────────────

function ApprovalBadge({ status }: { status: string }) {
  if (status === 'approved') {
    return (
      <span className="font-body text-[10px] text-green-400 border border-green-400/30 px-1.5 py-0.5">
        approved
      </span>
    )
  }
  if (status === 'rejected') {
    return (
      <span className="font-body text-[10px] text-red-400/60 border border-red-400/20 px-1.5 py-0.5">
        rejected
      </span>
    )
  }
  return (
    <span className="font-body text-[10px] text-amber-400/80 border border-amber-400/20 px-1.5 py-0.5">
      pending
    </span>
  )
}
