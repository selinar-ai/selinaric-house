'use client'

// Phase 37G.1 — Suggest Node / Suggest Edge Panel
//
// The map may suggest. Ontology Lab governs.
// A suggestion is not a graph edit. A graph proposal is not Memory.
// No UI action creates truth directly.
//
// Suggest actions are only available in Inspect mode (not Arrange mode).

import { useState } from 'react'
import { GRAPH_NODE_TYPES, GRAPH_EDGE_TYPES } from '@/lib/graph/types'
import { GRAPH_PRESENCE_SCOPES } from '@/lib/graph/types'
import type { GraphMapNode } from '@/lib/graph/relationalMapTypes'

// ─── Types ─────────────────────────────────────────────────────────────────

interface SuggestNodeFormProps {
  onClose: () => void
}

interface SuggestEdgeFormProps {
  sourceNode: GraphMapNode
  approvedNodes: GraphMapNode[]
  onClose: () => void
}

// ─── Suggest Node Form ──────────────────────────────────────────────────────

export function SuggestNodeForm({ onClose }: SuggestNodeFormProps) {
  const [label, setLabel] = useState('')
  const [nodeType, setNodeType] = useState('concept')
  const [scope, setScope] = useState<string>('shared')
  const [rationale, setRationale] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string; proposalId?: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    setSubmitting(true)
    setResult(null)
    try {
      const resp = await fetch('/api/graph-edit-proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edit_action_type: 'suggest_node',
          label: label.trim(),
          node_type: nodeType,
          presence_scope: scope,
          grain_level: 'overview',
          aliases: [],
          canonical_label: label.trim(),
          rationale: rationale.trim() || 'Proposed from Relational Map UI.',
          selected_context: { mode: 'overview', include_midlevel: false, workspace_id: null },
        }),
      })
      const data = await resp.json()
      if (resp.ok) {
        setResult({ ok: true, message: 'Proposal created for Ontology Lab review.', proposalId: data.proposalId })
      } else if (resp.status === 409) {
        setResult({ ok: false, message: data.error ?? 'A matching proposal already exists.' })
      } else {
        setResult({ ok: false, message: data.error ?? 'Failed to create proposal.' })
      }
    } catch {
      setResult({ ok: false, message: 'Request failed.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-[10px] text-text-muted/70 italic font-body">
        This creates a pending proposal for Ontology Lab review.
        It does not edit the graph directly or create Memory authority.
      </div>

      {result ? (
        <div className={`px-3 py-2 rounded text-xs font-body ${result.ok ? 'bg-emerald-900/20 text-emerald-300 border border-emerald-700/30' : 'bg-amber-900/20 text-amber-300 border border-amber-700/30'}`}>
          {result.message}
        </div>
      ) : null}

      {!result?.ok && (
        <form onSubmit={handleSubmit} className="space-y-2.5">
          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
              Label <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              maxLength={60}
              required
              placeholder="e.g. Graph Proposals"
              className="w-full font-body text-xs bg-house-bg border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Node type</label>
              <select
                value={nodeType}
                onChange={e => setNodeType(e.target.value)}
                className="w-full font-body text-xs bg-house-bg border border-house-border text-text-secondary px-2 py-1.5 outline-none focus:border-house-muted"
              >
                {GRAPH_NODE_TYPES.map(t => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Scope</label>
              <select
                value={scope}
                onChange={e => setScope(e.target.value)}
                className="w-full font-body text-xs bg-house-bg border border-house-border text-text-secondary px-2 py-1.5 outline-none focus:border-house-muted"
              >
                {GRAPH_PRESENCE_SCOPES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Rationale (optional)</label>
            <input
              type="text"
              value={rationale}
              onChange={e => setRationale(e.target.value)}
              maxLength={200}
              placeholder="Why propose this node?"
              className="w-full font-body text-xs bg-house-bg border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting || !label.trim()}
              className="font-body text-xs px-3 py-1.5 border border-purple-600/40 text-purple-300 hover:bg-purple-600/10 transition-all disabled:opacity-40"
            >
              {submitting ? 'Submitting…' : 'Submit for review'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {result?.ok && (
        <button
          onClick={onClose}
          className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          Close
        </button>
      )}
    </div>
  )
}

// ─── Suggest Edge Form ──────────────────────────────────────────────────────

export function SuggestEdgeForm({ sourceNode, approvedNodes, onClose }: SuggestEdgeFormProps) {
  const [targetId, setTargetId] = useState('')
  const [edgeType, setEdgeType] = useState('relates_to')
  const [rationale, setRationale] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string; proposalId?: string } | null>(null)

  // Filter to real approved overview nodes only — exclude source and derived display nodes
  const targetOptions = approvedNodes.filter(n =>
    n.id !== sourceNode.id &&
    n.grainLevel === 'overview' &&
    !n.derivedFromEdge
  )

  const selectedTarget = approvedNodes.find(n => n.id === targetId)
  const canonicalLabel = selectedTarget
    ? `${sourceNode.label} ${edgeType.replace(/_/g, ' ')} ${selectedTarget.label}`
    : ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!targetId || !selectedTarget) return
    setSubmitting(true)
    setResult(null)
    try {
      const resp = await fetch('/api/graph-edit-proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edit_action_type: 'suggest_edge',
          from: {
            label: sourceNode.label,
            nodeType: sourceNode.nodeType,
            presenceScope: sourceNode.presenceScope,
            runtimeKey: sourceNode.id,
          },
          to: {
            label: selectedTarget.label,
            nodeType: selectedTarget.nodeType,
            presenceScope: selectedTarget.presenceScope,
            runtimeKey: selectedTarget.id,
          },
          edge_type: edgeType,
          edge_grain: 'overview',
          canonical_label: canonicalLabel,
          grain_level: 'overview',
          rationale: rationale.trim() || 'Proposed from Relational Map UI.',
          selected_context: { mode: 'overview', include_midlevel: false, workspace_id: null },
        }),
      })
      const data = await resp.json()
      if (resp.ok) {
        setResult({ ok: true, message: 'Edge proposal created for Ontology Lab review.', proposalId: data.proposalId })
      } else if (resp.status === 409) {
        setResult({ ok: false, message: data.error ?? 'A matching proposal already exists.' })
      } else {
        setResult({ ok: false, message: data.error ?? 'Failed to create proposal.' })
      }
    } catch {
      setResult({ ok: false, message: 'Request failed.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-[10px] text-text-muted/70 italic font-body">
        This creates a pending edge proposal for Ontology Lab review.
        It does not edit the graph directly.
      </div>

      <div className="text-[10px] font-body text-text-muted">
        From: <span className="text-text-secondary">{sourceNode.label}</span>
      </div>

      {result ? (
        <div className={`px-3 py-2 rounded text-xs font-body ${result.ok ? 'bg-emerald-900/20 text-emerald-300 border border-emerald-700/30' : 'bg-amber-900/20 text-amber-300 border border-amber-700/30'}`}>
          {result.message}
        </div>
      ) : null}

      {!result?.ok && (
        <form onSubmit={handleSubmit} className="space-y-2.5">
          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
              Edge type <span className="text-red-400">*</span>
            </label>
            <select
              value={edgeType}
              onChange={e => setEdgeType(e.target.value)}
              className="w-full font-body text-xs bg-house-bg border border-house-border text-text-secondary px-2 py-1.5 outline-none focus:border-house-muted"
            >
              {GRAPH_EDGE_TYPES.map(t => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
              Target node <span className="text-red-400">*</span>
            </label>
            <select
              value={targetId}
              onChange={e => setTargetId(e.target.value)}
              required
              className="w-full font-body text-xs bg-house-bg border border-house-border text-text-secondary px-2 py-1.5 outline-none focus:border-house-muted"
            >
              <option value="">Select target…</option>
              {targetOptions.map(n => (
                <option key={n.id} value={n.id}>{n.label}</option>
              ))}
            </select>
          </div>

          {canonicalLabel && (
            <div className="text-[10px] font-body text-text-muted bg-house-bg/50 border border-house-border/40 px-2 py-1.5 rounded">
              Preview: <span className="text-text-secondary">{canonicalLabel}</span>
            </div>
          )}

          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Rationale (optional)</label>
            <input
              type="text"
              value={rationale}
              onChange={e => setRationale(e.target.value)}
              maxLength={200}
              placeholder="Why propose this edge?"
              className="w-full font-body text-xs bg-house-bg border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting || !targetId}
              className="font-body text-xs px-3 py-1.5 border border-purple-600/40 text-purple-300 hover:bg-purple-600/10 transition-all disabled:opacity-40"
            >
              {submitting ? 'Submitting…' : 'Submit for review'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {result?.ok && (
        <button
          onClick={onClose}
          className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          Close
        </button>
      )}
    </div>
  )
}
