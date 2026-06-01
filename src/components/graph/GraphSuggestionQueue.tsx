'use client'

// Phase 37H.2 — Graph-Assisted Candidate Suggestion Queue
//
// Graph-assisted suggestions only. Not Memory. Not Held Truth. Not prompt eligible.
// Memory Review / Held Truth governance still required.
//
// Writes ONLY to graph_candidate_suggestions + events (via dismiss).
// No approve/promote actions. Dismiss only.

import { useState, useEffect, useCallback } from 'react'
import type { GraphCandidateSuggestion } from '@/lib/graph/candidateSuggestionTypes'
import GraphSuggestionDetail from './GraphSuggestionDetail'
import GraphSuggestionCreateForm from './GraphSuggestionCreateForm'

type StatusFilter = 'pending_review' | 'dismissed' | 'all'

export default function GraphSuggestionQueue() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending_review')
  const [suggestions, setSuggestions] = useState<GraphCandidateSuggestion[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dismissing, setDismissing] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  const fetchSuggestions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      params.set('limit', '50')
      const res = await fetch(`/api/graph-candidate-suggestions?${params}`)
      const data = await res.json()
      setSuggestions(data.suggestions ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setError('Failed to load suggestions')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { fetchSuggestions() }, [fetchSuggestions])

  async function handleDismiss(id: string) {
    setDismissing(true)
    try {
      const res = await fetch(`/api/graph-candidate-suggestions/${id}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        setSelectedId(null)
        fetchSuggestions()
      }
    } catch { /* ignore */ }
    finally { setDismissing(false) }
  }

  const selected = suggestions.find(s => s.id === selectedId) ?? null

  return (
    <div>
      {/* Header */}
      <div className="px-4 py-3 border-b border-house-border/40 space-y-1">
        <p className="font-body text-xs text-text-muted">
          Graph-assisted suggestions only — not Memory, not Held Truth, not prompt eligible.
          Each suggestion must be reviewed through the governed Memory Review or Held Truth pathway before it carries any authority.
        </p>
      </div>

      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-house-border/40 flex items-center gap-3">
        <div className="flex gap-1">
          {(['pending_review', 'dismissed', 'all'] as StatusFilter[]).map(sf => (
            <button
              key={sf}
              onClick={() => { setStatusFilter(sf); setSelectedId(null) }}
              className={`font-body text-[10px] px-2 py-1 border rounded transition-all ${
                statusFilter === sf
                  ? 'border-purple-600/60 bg-purple-900/20 text-purple-300'
                  : 'border-house-border text-text-muted hover:border-purple-600/30'
              }`}
            >
              {sf === 'pending_review' ? 'Pending' : sf === 'dismissed' ? 'Dismissed' : 'All'}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-text-muted font-body">{total} suggestion{total !== 1 ? 's' : ''}</span>
        <div className="flex-1" />
        <button
          onClick={() => { setShowCreate(true); setSelectedId(null) }}
          className="font-body text-[10px] px-2.5 py-1 border border-purple-600/40 text-purple-300 hover:bg-purple-900/20 rounded transition-all"
        >
          + New Suggestion
        </button>
      </div>

      {/* Content: list + detail split */}
      <div className="flex min-h-[300px]">
        {/* List */}
        <div className="flex-1 border-r border-house-border/30">
          {loading && (
            <div className="px-4 py-6 text-center text-xs text-text-muted font-body">Loading...</div>
          )}
          {error && (
            <div className="px-4 py-3 text-xs text-red-300 font-body">{error}</div>
          )}
          {!loading && suggestions.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-text-muted/60 font-body italic">
              No suggestions found.
            </div>
          )}
          {suggestions.map(s => (
            <button
              key={s.id}
              onClick={() => { setSelectedId(s.id); setShowCreate(false) }}
              className={`w-full text-left px-4 py-2.5 border-b border-house-border/20 hover:bg-house-surface/30 transition-all ${
                selectedId === s.id ? 'bg-house-surface/50' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-[9px] font-body px-1 py-0.5 rounded border ${
                  s.candidate_type === 'memory_candidate'
                    ? 'border-blue-700/30 text-blue-300'
                    : 'border-amber-700/30 text-amber-300'
                }`}>
                  {s.candidate_type === 'memory_candidate' ? 'Mem' : 'HT'}
                </span>
                <span className="text-xs text-text-secondary font-body truncate flex-1">{s.proposed_label}</span>
                <span className={`text-[9px] font-body px-1 py-0.5 rounded ${
                  s.status === 'pending_review' ? 'text-yellow-300' : 'text-gray-400'
                }`}>
                  {s.status === 'pending_review' ? 'pending' : s.status}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[9px] text-text-muted/50 font-body capitalize">{s.evidence_strength}</span>
                <span className="text-[9px] text-text-muted/50 font-body">{new Date(s.created_at).toLocaleDateString()}</span>
                <span className="text-[9px] text-red-300/40 font-body">not prompt eligible</span>
              </div>
            </button>
          ))}
        </div>

        {/* Detail / Create panel */}
        <div className="w-[380px] flex-shrink-0 p-3 overflow-y-auto max-h-[600px]">
          {showCreate && (
            <GraphSuggestionCreateForm
              onClose={() => setShowCreate(false)}
              onCreated={() => { setShowCreate(false); fetchSuggestions() }}
            />
          )}
          {!showCreate && selected && (
            <GraphSuggestionDetail
              suggestion={selected}
              onDismiss={handleDismiss}
              dismissing={dismissing}
              onClose={() => setSelectedId(null)}
            />
          )}
          {!showCreate && !selected && (
            <div className="text-xs text-text-muted/40 font-body italic text-center pt-8">
              Select a suggestion to view details, or create a new one.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
