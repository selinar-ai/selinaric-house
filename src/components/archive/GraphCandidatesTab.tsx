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
//
// Bulk actions: select multiple nodes/edges and approve/reject in batch.
// Only writes approval_status + reviewed_at on archive_graph_nodes / archive_graph_edges.
// Does NOT create Memory, change canonical_status, modify archive_items,
// touch graph_proposals, or feed the Phase 37 Relational Map.

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

  // ── Bulk selection state ───────────────────────────────────────────────────
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(new Set())
  const [bulkLoading,     setBulkLoading]     = useState(false)
  const [bulkResult,      setBulkResult]      = useState<{ message: string; type: 'success' | 'warning' | 'error' } | null>(null)

  // Clear selections when filter or archive changes
  useEffect(() => {
    setSelectedNodeIds(new Set())
    setSelectedEdgeIds(new Set())
    setBulkResult(null)
  }, [statusFilter, archiveName])

  // Auto-dismiss bulk result toast after 5 seconds
  useEffect(() => {
    if (!bulkResult) return
    const t = setTimeout(() => setBulkResult(null), 5000)
    return () => clearTimeout(t)
  }, [bulkResult])

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

  // ── Individual actions ─────────────────────────────────────────────────────

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

  // ── Bulk selection helpers ─────────────────────────────────────────────────

  const pendingNodes = nodes.filter(n => n.approval_status === 'pending')
  const pendingEdges = edges.filter(e => {
    if (e.approval_status !== 'pending') return false
    const fromStatus = e.from_node?.approval_status
    const toStatus   = e.to_node?.approval_status
    return fromStatus !== 'rejected' && toStatus !== 'rejected'
  })

  function toggleNodeSelect(id: string) {
    setSelectedNodeIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleEdgeSelect(id: string) {
    setSelectedEdgeIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllNodes() {
    if (selectedNodeIds.size === pendingNodes.length && pendingNodes.length > 0) {
      setSelectedNodeIds(new Set())
    } else {
      setSelectedNodeIds(new Set(pendingNodes.map(n => n.id)))
    }
  }

  function toggleAllEdges() {
    if (selectedEdgeIds.size === pendingEdges.length && pendingEdges.length > 0) {
      setSelectedEdgeIds(new Set())
    } else {
      setSelectedEdgeIds(new Set(pendingEdges.map(e => e.id)))
    }
  }

  function clearAllSelections() {
    setSelectedNodeIds(new Set())
    setSelectedEdgeIds(new Set())
  }

  const totalSelected = selectedNodeIds.size + selectedEdgeIds.size

  // ── Bulk action handler ────────────────────────────────────────────────────

  async function handleBulkAction(action: 'approve' | 'reject') {
    const nodeIds = [...selectedNodeIds]
    const edgeIds = [...selectedEdgeIds]
    const total = nodeIds.length + edgeIds.length
    if (total === 0) return

    const verb = action === 'approve' ? 'approve' : 'reject'
    const confirmed = window.confirm(
      `${verb.charAt(0).toUpperCase() + verb.slice(1)} ${total} selected item${total === 1 ? '' : 's'}?\n\n` +
      (nodeIds.length > 0 ? `• ${nodeIds.length} node${nodeIds.length === 1 ? '' : 's'}\n` : '') +
      (edgeIds.length > 0 ? `• ${edgeIds.length} edge${edgeIds.length === 1 ? '' : 's'}\n` : '') +
      '\nApproving archive graph items does not promote source Archive entries to Memory.\n' +
      'This only updates approval_status on archive_graph_nodes / archive_graph_edges.'
    )
    if (!confirmed) return

    setBulkLoading(true)
    setBulkResult(null)
    setActionErr(null)

    let succeeded = 0
    let failed = 0
    let blocked = 0

    // Process nodes first (rejecting nodes cascades to edges server-side)
    for (const id of nodeIds) {
      try {
        const res = await fetch(`/api/archive-graph/nodes/${id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ action }),
        })
        if (res.ok) {
          succeeded++
        } else {
          failed++
        }
      } catch {
        failed++
      }
    }

    // Then process edges
    for (const id of edgeIds) {
      try {
        const res = await fetch(`/api/archive-graph/edges/${id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ action }),
        })
        if (res.ok) {
          succeeded++
        } else {
          const data = await res.json().catch(() => ({}))
          if (data.blocked) {
            blocked++
          } else {
            failed++
          }
        }
      } catch {
        failed++
      }
    }

    // Build result message
    const parts: string[] = []
    if (succeeded > 0) parts.push(`${succeeded} ${verb === 'approve' ? 'approved' : 'rejected'}`)
    if (blocked > 0) parts.push(`${blocked} blocked (endpoint rejected)`)
    if (failed > 0) parts.push(`${failed} failed`)

    setBulkResult({
      message: parts.join(', ') + '.',
      type: failed > 0 || blocked > 0 ? 'warning' : 'success',
    })

    setSelectedNodeIds(new Set())
    setSelectedEdgeIds(new Set())
    setBulkLoading(false)
    await load()
  }

  const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
    { id: 'pending',  label: 'Pending' },
    { id: 'approved', label: 'Approved' },
    { id: 'rejected', label: 'Rejected' },
    { id: 'all',      label: 'All' },
  ]

  const showBulkBar = totalSelected > 0

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

      {/* Bulk action bar */}
      {showBulkBar && (
        <div className="sticky top-0 z-10 px-4 py-2 bg-house-surface border-b border-house-border flex flex-wrap items-center gap-2">
          <span className="font-body text-xs text-text-muted">
            {totalSelected} selected
            {selectedNodeIds.size > 0 && ` (${selectedNodeIds.size} node${selectedNodeIds.size !== 1 ? 's' : ''})`}
            {selectedEdgeIds.size > 0 && ` (${selectedEdgeIds.size} edge${selectedEdgeIds.size !== 1 ? 's' : ''})`}
          </span>
          <button
            onClick={() => void handleBulkAction('approve')}
            disabled={bulkLoading || !!actioning}
            className="font-body text-xs px-3 py-1 border border-green-400/30 text-green-400 hover:bg-green-400/10 transition-all disabled:opacity-40"
          >
            {bulkLoading ? 'Processing…' : 'Approve selected'}
          </button>
          <button
            onClick={() => void handleBulkAction('reject')}
            disabled={bulkLoading || !!actioning}
            className="font-body text-xs px-3 py-1 border border-red-400/20 text-red-400/60 hover:bg-red-400/10 transition-all disabled:opacity-40"
          >
            {bulkLoading ? 'Processing…' : 'Reject selected'}
          </button>
          <button
            onClick={clearAllSelections}
            className="ml-auto font-body text-[10px] text-text-muted hover:text-text-secondary transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Bulk result toast */}
      {bulkResult && (
        <div className={`
          px-4 py-2 border-b
          ${bulkResult.type === 'success' ? 'bg-emerald-900/20 border-emerald-700/30' : ''}
          ${bulkResult.type === 'warning' ? 'bg-amber-900/20 border-amber-700/30' : ''}
          ${bulkResult.type === 'error'   ? 'bg-red-900/20 border-red-700/30' : ''}
        `}>
          <p className={`font-body text-xs ${
            bulkResult.type === 'success' ? 'text-emerald-300' :
            bulkResult.type === 'warning' ? 'text-amber-300' :
            'text-red-300'
          }`}>
            {bulkResult.message}
          </p>
        </div>
      )}

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
              <div className="px-4 py-2 border-b border-house-border/40 flex items-center gap-3">
                {pendingNodes.length > 0 && (
                  <input
                    type="checkbox"
                    checked={selectedNodeIds.size === pendingNodes.length && pendingNodes.length > 0}
                    ref={el => { if (el) el.indeterminate = selectedNodeIds.size > 0 && selectedNodeIds.size < pendingNodes.length }}
                    onChange={toggleAllNodes}
                    disabled={bulkLoading}
                    className="accent-house-muted"
                  />
                )}
                <p className="font-body text-[10px] text-text-muted uppercase tracking-widest">
                  Nodes · {nodes.length}
                </p>
              </div>
              {nodes.map(node => {
                const isPending = node.approval_status === 'pending'
                return (
                  <div
                    key={node.id}
                    className={`px-4 py-3 border-b border-house-border/30 flex flex-col gap-1.5 ${
                      selectedNodeIds.has(node.id) ? 'bg-house-bg/60' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2 flex-wrap">
                      {isPending && (
                        <input
                          type="checkbox"
                          checked={selectedNodeIds.has(node.id)}
                          onChange={() => toggleNodeSelect(node.id)}
                          disabled={bulkLoading}
                          className="accent-house-muted mt-0.5 shrink-0"
                        />
                      )}
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

                    {isPending && (
                      <div className="flex gap-2 pt-0.5">
                        <button
                          onClick={() => void actOnNode(node.id, 'approve')}
                          disabled={actioning === node.id || bulkLoading}
                          className="
                            h-7 px-3 font-body text-xs border border-green-400/30
                            text-green-400 hover:bg-green-400/10 transition-all disabled:opacity-40
                          "
                        >
                          {actioning === node.id ? '…' : 'Approve'}
                        </button>
                        <button
                          onClick={() => void actOnNode(node.id, 'reject')}
                          disabled={actioning === node.id || bulkLoading}
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
                )
              })}
            </div>
          )}

          {/* ── Edges ──────────────────────────────────────────────────── */}
          {edges.length > 0 && (
            <div>
              <div className="px-4 py-2 border-b border-house-border/40 mt-2 flex items-center gap-3">
                {pendingEdges.length > 0 && (
                  <input
                    type="checkbox"
                    checked={selectedEdgeIds.size === pendingEdges.length && pendingEdges.length > 0}
                    ref={el => { if (el) el.indeterminate = selectedEdgeIds.size > 0 && selectedEdgeIds.size < pendingEdges.length }}
                    onChange={toggleAllEdges}
                    disabled={bulkLoading}
                    className="accent-house-muted"
                  />
                )}
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
                const isPending = edge.approval_status === 'pending'
                const isSelectable = isPending && !edgeBlocked

                return (
                  <div
                    key={edge.id}
                    className={`px-4 py-3 border-b border-house-border/30 flex flex-col gap-1.5 ${
                      selectedEdgeIds.has(edge.id) ? 'bg-house-bg/60' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      {isSelectable && (
                        <input
                          type="checkbox"
                          checked={selectedEdgeIds.has(edge.id)}
                          onChange={() => toggleEdgeSelect(edge.id)}
                          disabled={bulkLoading}
                          className="accent-house-muted shrink-0"
                        />
                      )}
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

                    {edgeBlocked && isPending && (
                      <p className="font-body text-[10px] text-orange-300/70">
                        Blocked — one or both endpoint nodes are rejected.
                      </p>
                    )}

                    <p className="font-body text-[10px] text-text-muted/60">
                      {edge.source_item_ids.length} source item{edge.source_item_ids.length !== 1 ? 's' : ''}
                      {' · '}created {new Date(edge.created_at).toLocaleDateString()}
                    </p>

                    {isSelectable && (
                      <div className="flex gap-2 pt-0.5">
                        <button
                          onClick={() => void actOnEdge(edge.id, 'approve')}
                          disabled={actioning === edge.id || bulkLoading}
                          className="
                            h-7 px-3 font-body text-xs border border-green-400/30
                            text-green-400 hover:bg-green-400/10 transition-all disabled:opacity-40
                          "
                        >
                          {actioning === edge.id ? '…' : 'Approve'}
                        </button>
                        <button
                          onClick={() => void actOnEdge(edge.id, 'reject')}
                          disabled={actioning === edge.id || bulkLoading}
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
