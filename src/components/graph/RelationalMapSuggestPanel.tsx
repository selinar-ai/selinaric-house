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
import { GRAPH_GRAIN_LEVELS } from '@/lib/graph/graphGrain'
import type { GraphMapNode, GraphMapEdge } from '@/lib/graph/relationalMapTypes'

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

// ─── Suggest Alias Form (Phase 37G.2) ─────────────────────────────────────

interface SuggestAliasFormProps {
  targetNode: GraphMapNode
  onClose: () => void
}

export function SuggestAliasForm({ targetNode, onClose }: SuggestAliasFormProps) {
  const [alias, setAlias] = useState('')
  const [rationale, setRationale] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string; proposalId?: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = alias.trim()
    if (!trimmed) return
    setSubmitting(true)
    setResult(null)
    try {
      const resp = await fetch('/api/graph-edit-proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edit_action_type: 'suggest_alias',
          target: {
            label: targetNode.label,
            nodeType: targetNode.nodeType,
            presenceScope: targetNode.presenceScope,
            runtimeKey: targetNode.id,
            proposalId: targetNode.proposalIds[0] ?? null,
          },
          proposed_alias: trimmed,
          grain_level: 'overview',
          rationale: rationale.trim() || 'Proposed alias from Relational Map UI.',
          selected_context: { mode: 'overview', include_midlevel: false, workspace_id: null },
        }),
      })
      const data = await resp.json()
      if (resp.ok) {
        setResult({ ok: true, message: 'Alias proposal created for Ontology Lab review.', proposalId: data.proposalId })
      } else if (resp.status === 409) {
        setResult({ ok: false, message: data.error ?? 'This alias already exists or has already been proposed.' })
      } else {
        setResult({ ok: false, message: data.error ?? 'Failed to create alias proposal.' })
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
        This creates a pending alias proposal for Ontology Lab review.
        It does not rename the node directly. It does not create Memory or Archive authority.
      </div>

      <div className="text-[10px] font-body text-text-muted">
        Node: <span className="text-text-secondary">{targetNode.label}</span>
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
              Proposed alias <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={alias}
              onChange={e => setAlias(e.target.value)}
              maxLength={60}
              required
              placeholder={`e.g. shorter name for ${targetNode.label}`}
              className="w-full font-body text-xs bg-house-bg border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
            />
          </div>

          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Rationale (optional)</label>
            <input
              type="text"
              value={rationale}
              onChange={e => setRationale(e.target.value)}
              maxLength={200}
              placeholder="Why propose this alias?"
              className="w-full font-body text-xs bg-house-bg border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting || !alias.trim()}
              className="font-body text-xs px-3 py-1.5 border border-purple-600/40 text-purple-300 hover:bg-purple-600/10 transition-all disabled:opacity-40"
            >
              {submitting ? 'Submitting…' : 'Submit for review'}
            </button>
            <button type="button" onClick={onClose} className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {result?.ok && (
        <button onClick={onClose} className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors">
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

// ─── Suggest Metadata Change Form (Phase 37G.3) ────────────────────────────

type MetadataAction = 'suggest_reclassify' | 'suggest_confidence_change' | 'suggest_salience_change'

interface SuggestMetadataChangeFormProps {
  targetNode?: GraphMapNode
  targetEdge?: GraphMapEdge
  onClose: () => void
}

const SCORE_OPTIONS = [0.50, 0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 1.00]

export function SuggestMetadataChangeForm({ targetNode, targetEdge, onClose }: SuggestMetadataChangeFormProps) {
  const [action, setAction] = useState<MetadataAction>('suggest_reclassify')
  const [reclassifyField, setReclassifyField] = useState(targetNode ? 'node_type' : 'edge_type')
  const [proposedValue, setProposedValue] = useState('')
  const [proposedScore, setProposedScore] = useState<number>(0.80)
  const [rationale, setRationale] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const isNode = !!targetNode
  const targetLabel = targetNode?.label ?? targetEdge?.label ?? ''
  const targetKind = isNode ? 'node' : 'edge'
  const targetRuntimeKey = targetNode?.id ?? targetEdge?.id ?? ''
  const currentNodeType = targetNode?.nodeType
  const currentEdgeType = targetEdge?.edgeType
  const currentConfidence = targetNode?.confidence ?? targetEdge?.confidence ?? null
  const currentSalience = targetNode?.salience ?? null

  const reclassifyFields = isNode ? ['node_type', 'grain_level'] : ['edge_type', 'edge_grain']

  function buildBody() {
    const base = {
      edit_action_type: action,
      target: {
        kind: targetKind,
        label: targetLabel,
        presenceScope: targetNode?.presenceScope ?? 'shared',
        runtimeKey: targetRuntimeKey,
        proposalId: targetNode?.proposalIds[0] ?? targetEdge?.proposalId ?? null,
        ...(isNode ? { nodeType: currentNodeType } : { edgeType: currentEdgeType }),
      },
      grain_level: 'overview',
      rationale: rationale.trim() || 'Proposed metadata change from Relational Map UI.',
      selected_context: { mode: 'overview', include_midlevel: false, workspace_id: null },
    }
    if (action === 'suggest_reclassify') {
      const currentVal = reclassifyField === 'node_type' ? currentNodeType :
                         reclassifyField === 'edge_type' ? currentEdgeType :
                         targetNode?.grainLevel ?? 'unknown'
      return { ...base, field: reclassifyField, current_value: currentVal, proposed_value: proposedValue }
    }
    if (action === 'suggest_confidence_change') {
      return { ...base, current_confidence: currentConfidence, proposed_confidence: proposedScore }
    }
    return { ...base, current_salience: currentSalience, proposed_salience: proposedScore }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setResult(null)
    try {
      const resp = await fetch('/api/graph-edit-proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody()),
      })
      const data = await resp.json()
      if (resp.ok) {
        setResult({ ok: true, message: 'Metadata-change proposal created for Ontology Lab review.' })
      } else if (resp.status === 409) {
        setResult({ ok: false, message: data.error ?? 'A matching metadata-change proposal already exists.' })
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
        This creates a pending metadata-change proposal for Ontology Lab review.
        It does not change the graph directly or create Memory authority.
      </div>
      <div className="text-[10px] font-body text-text-muted">
        Target: <span className="text-text-secondary">{targetLabel}</span>
      </div>

      {result ? (
        <div className={`px-3 py-2 rounded text-xs font-body ${result.ok ? 'bg-emerald-900/20 text-emerald-300 border border-emerald-700/30' : 'bg-amber-900/20 text-amber-300 border border-amber-700/30'}`}>
          {result.message}
        </div>
      ) : null}

      {!result?.ok && (
        <form onSubmit={handleSubmit} className="space-y-2.5">
          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Change type</label>
            <select value={action} onChange={e => { setAction(e.target.value as MetadataAction); setProposedValue('') }}
              className="w-full font-body text-xs bg-house-bg border border-house-border text-text-secondary px-2 py-1.5 outline-none focus:border-house-muted">
              <option value="suggest_reclassify">Reclassify</option>
              <option value="suggest_confidence_change">Confidence</option>
              {isNode && <option value="suggest_salience_change">Salience</option>}
            </select>
          </div>

          {action === 'suggest_reclassify' && (
            <>
              <div>
                <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Field</label>
                <select value={reclassifyField} onChange={e => { setReclassifyField(e.target.value); setProposedValue('') }}
                  className="w-full font-body text-xs bg-house-bg border border-house-border text-text-secondary px-2 py-1.5 outline-none focus:border-house-muted">
                  {reclassifyFields.map(f => <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Proposed value <span className="text-red-400">*</span></label>
                <select value={proposedValue} onChange={e => setProposedValue(e.target.value)} required
                  className="w-full font-body text-xs bg-house-bg border border-house-border text-text-secondary px-2 py-1.5 outline-none focus:border-house-muted">
                  <option value="">Select...</option>
                  {reclassifyField === 'node_type' && GRAPH_NODE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  {reclassifyField === 'edge_type' && GRAPH_EDGE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  {(reclassifyField === 'grain_level' || reclassifyField === 'edge_grain') && GRAPH_GRAIN_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </>
          )}

          {(action === 'suggest_confidence_change' || action === 'suggest_salience_change') && (
            <div>
              <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
                Proposed {action === 'suggest_confidence_change' ? 'confidence' : 'salience'} <span className="text-red-400">*</span>
              </label>
              <select value={proposedScore} onChange={e => setProposedScore(parseFloat(e.target.value))}
                className="w-full font-body text-xs bg-house-bg border border-house-border text-text-secondary px-2 py-1.5 outline-none focus:border-house-muted">
                {SCORE_OPTIONS.map(v => <option key={v} value={v}>{v.toFixed(2)}</option>)}
              </select>
              {action === 'suggest_confidence_change' && currentConfidence !== null && (
                <p className="text-[10px] text-text-muted mt-1">Current: {currentConfidence?.toFixed(2) ?? '-'}</p>
              )}
              {action === 'suggest_salience_change' && currentSalience !== null && (
                <p className="text-[10px] text-text-muted mt-1">Current: {currentSalience?.toFixed(2) ?? '-'}</p>
              )}
            </div>
          )}

          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Rationale (optional)</label>
            <input type="text" value={rationale} onChange={e => setRationale(e.target.value)} maxLength={200}
              placeholder="Why propose this change?"
              className="w-full font-body text-xs bg-house-bg border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted" />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={submitting || (action === 'suggest_reclassify' && !proposedValue)}
              className="font-body text-xs px-3 py-1.5 border border-purple-600/40 text-purple-300 hover:bg-purple-600/10 transition-all disabled:opacity-40">
              {submitting ? 'Submitting...' : 'Submit for review'}
            </button>
            <button type="button" onClick={onClose} className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {result?.ok && (
        <button onClick={onClose} className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors">Close</button>
      )}
    </div>
  )
}

// ─── Suggest Split Form (Phase 37G.3a) ────────────────────────────────────

interface SplitPart {
  label: string
  nodeType: string
  presenceScope: string
  grainLevel: string
  rationale: string
}

const BLANK_PART = (): SplitPart => ({
  label: '', nodeType: 'concept', presenceScope: 'shared', grainLevel: 'overview', rationale: '',
})

interface SuggestSplitFormProps {
  targetNode: GraphMapNode
  onClose: () => void
}

export function SuggestSplitForm({ targetNode, onClose }: SuggestSplitFormProps) {
  const [parts, setParts] = useState<SplitPart[]>([BLANK_PART(), BLANK_PART()])
  const [splitRationale, setSplitRationale] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  function updatePart(i: number, field: keyof SplitPart, value: string) {
    setParts(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p))
  }

  function addPart() {
    if (parts.length < 5) setParts(prev => [...prev, BLANK_PART()])
  }

  function removePart(i: number) {
    if (parts.length > 2) setParts(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setResult(null)
    try {
      const resp = await fetch('/api/graph-edit-proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edit_action_type: 'suggest_split',
          target: {
            kind: 'node',
            label: targetNode.label,
            nodeType: targetNode.nodeType,
            presenceScope: targetNode.presenceScope,
            runtimeKey: targetNode.id,
            proposalId: targetNode.proposalIds[0] ?? null,
            grainLevel: targetNode.grainLevel,
            derivedFromEdge: targetNode.derivedFromEdge,
          },
          proposed_parts: parts.map(p => ({
            label: p.label.trim(),
            nodeType: p.nodeType,
            presenceScope: p.presenceScope,
            grainLevel: p.grainLevel,
            rationale: p.rationale.trim() || undefined,
          })),
          split_rationale: splitRationale.trim() || 'Proposed split from Relational Map UI.',
          grain_level: 'overview',
          selected_context: { mode: 'overview', include_midlevel: false, workspace_id: null },
        }),
      })
      const data = await resp.json()
      if (resp.ok) {
        setResult({ ok: true, message: 'Split proposal created for Ontology Lab review.' })
      } else if (resp.status === 409) {
        setResult({ ok: false, message: data.error ?? 'A matching split proposal already exists.' })
      } else {
        setResult({ ok: false, message: data.error ?? 'Failed to create split proposal.' })
      }
    } catch {
      setResult({ ok: false, message: 'Request failed.' })
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = parts.length >= 2 && parts.every(p => p.label.trim().length > 0) && !submitting

  return (
    <div className="space-y-3">
      <div className="text-[10px] text-text-muted/70 italic font-body">
        This creates a pending split proposal for Ontology Lab review.
        It does not split the node, create replacement nodes, or move edges.
        It does not create Memory or Archive authority.
      </div>
      <div className="text-[10px] font-body text-text-muted">
        Node: <span className="text-text-secondary">{targetNode.label}</span>
      </div>

      {result ? (
        <div className={`px-3 py-2 rounded text-xs font-body ${result.ok ? 'bg-emerald-900/20 text-emerald-300 border border-emerald-700/30' : 'bg-amber-900/20 text-amber-300 border border-amber-700/30'}`}>
          {result.message}
        </div>
      ) : null}

      {!result?.ok && (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Split rationale (optional)</label>
            <input
              type="text"
              value={splitRationale}
              onChange={e => setSplitRationale(e.target.value)}
              maxLength={200}
              placeholder="Why should this node be split?"
              className="w-full font-body text-xs bg-house-bg border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
            />
          </div>

          {parts.map((part, i) => (
            <div key={i} className="border border-house-border/60 rounded px-3 py-2.5 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="font-body text-[10px] text-text-muted uppercase tracking-wider">Part {i + 1}</span>
                {parts.length > 2 && (
                  <button type="button" onClick={() => removePart(i)} className="font-body text-[10px] text-text-muted hover:text-red-400 transition-colors">
                    Remove
                  </button>
                )}
              </div>
              <div>
                <label className="font-body text-[10px] text-text-muted block mb-1">
                  Label <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={part.label}
                  onChange={e => updatePart(i, 'label', e.target.value)}
                  maxLength={80}
                  required
                  placeholder={`e.g. ${targetNode.label} Part ${i + 1}`}
                  className="w-full font-body text-xs bg-house-bg border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-body text-[10px] text-text-muted block mb-1">Node type</label>
                  <select value={part.nodeType} onChange={e => updatePart(i, 'nodeType', e.target.value)}
                    className="w-full font-body text-xs bg-house-bg border border-house-border text-text-secondary px-2 py-1.5 outline-none focus:border-house-muted">
                    {GRAPH_NODE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-body text-[10px] text-text-muted block mb-1">Scope</label>
                  <select value={part.presenceScope} onChange={e => updatePart(i, 'presenceScope', e.target.value)}
                    className="w-full font-body text-xs bg-house-bg border border-house-border text-text-secondary px-2 py-1.5 outline-none focus:border-house-muted">
                    {GRAPH_PRESENCE_SCOPES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>
          ))}

          {parts.length < 5 && (
            <button type="button" onClick={addPart}
              className="font-body text-[10px] text-text-muted hover:text-purple-300 border border-house-border/50 hover:border-purple-600/30 px-2.5 py-1 transition-all">
              + Add part (max 5)
            </button>
          )}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={!canSubmit}
              className="font-body text-xs px-3 py-1.5 border border-purple-600/40 text-purple-300 hover:bg-purple-600/10 transition-all disabled:opacity-40">
              {submitting ? 'Submitting...' : 'Submit for review'}
            </button>
            <button type="button" onClick={onClose} className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {result?.ok && (
        <button onClick={onClose} className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors">Close</button>
      )}
    </div>
  )
}
