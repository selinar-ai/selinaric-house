'use client'

// Phase 37H.3a — Graph-Assisted Candidate Suggestion Queue (Polished)
//
// Review ergonomics improves clarity. Review ergonomics does not create authority.
//
// Writes ONLY to graph_candidate_suggestions + events (via dismiss).
// No approve/promote actions. Dismiss only.

import { useState, useEffect, useCallback } from 'react'
import type { GraphCandidateSuggestion, HydratedGraphCandidateSuggestion } from '@/lib/graph/candidateSuggestionTypes'
import GraphSuggestionDetail from './GraphSuggestionDetail'
import GraphSuggestionCreateForm from './GraphSuggestionCreateForm'

type StatusFilter = 'pending_review' | 'dismissed' | 'all'

const FILTER_LABELS: Record<StatusFilter, string> = {
  pending_review: 'Pending',
  dismissed: 'Dismissed',
  all: 'All',
}

const EMPTY_MESSAGES: Record<StatusFilter, string> = {
  pending_review: 'No pending suggestions.',
  dismissed: 'No dismissed suggestions.',
  all: 'No suggestions found.',
}

export default function GraphSuggestionQueue() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending_review')
  const [suggestions, setSuggestions] = useState<GraphCandidateSuggestion[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hydratedDetail, setHydratedDetail] = useState<HydratedGraphCandidateSuggestion | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
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

  // Fetch hydrated detail when selection changes
  useEffect(() => {
    if (!selectedId) { setHydratedDetail(null); return }
    let cancelled = false
    setDetailLoading(true)
    fetch(`/api/graph-candidate-suggestions/${selectedId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (!cancelled) setHydratedDetail(data as HydratedGraphCandidateSuggestion | null) })
      .catch(() => { if (!cancelled) setHydratedDetail(null) })
      .finally(() => { if (!cancelled) setDetailLoading(false) })
    return () => { cancelled = true }
  }, [selectedId])

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

  const hasSelection = selectedId !== null

  return (
    <div>
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-house-border/40">
        <p className="font-body text-[11px] text-text-muted/70 leading-relaxed">
          Graph-assisted suggestions only — not Memory, not Held Truth, not prompt eligible.
          Each suggestion requires governed Memory Review or Held Truth pathway before it carries authority.
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
              {FILTER_LABELS[sf]}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-text-muted/50 font-body">{total}</span>
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
            <div className="px-4 py-8 text-center">
              <div className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 bg-purple-400/40 rounded-full animate-pulse" />
                <span className="w-1.5 h-1.5 bg-purple-400/40 rounded-full animate-pulse [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-purple-400/40 rounded-full animate-pulse [animation-delay:300ms]" />
              </div>
            </div>
          )}
          {error && (
            <div className="px-4 py-4 text-center text-xs text-red-300/70 font-body">{error}</div>
          )}
          {!loading && !error && suggestions.length === 0 && (
            <div className="px-4 py-8 text-center text-[11px] text-text-muted/40 font-body italic">
              {EMPTY_MESSAGES[statusFilter]}
            </div>
          )}
          {suggestions.map(s => {
            const isDismissed = s.status === 'dismissed'
            const isSelected = selectedId === s.id
            return (
              <button
                key={s.id}
                onClick={() => { setSelectedId(s.id); setShowCreate(false) }}
                className={`w-full text-left px-4 py-2 border-b border-house-border/15 transition-all ${
                  isSelected
                    ? 'bg-purple-900/15 border-l-2 border-l-purple-600/50'
                    : 'border-l-2 border-l-transparent hover:bg-house-surface/20'
                } ${isDismissed ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-body px-1 py-0.5 rounded border flex-shrink-0 ${
                    s.candidate_type === 'memory_candidate'
                      ? 'border-blue-700/30 text-blue-300'
                      : 'border-amber-700/30 text-amber-300'
                  }`}>
                    {s.candidate_type === 'memory_candidate' ? 'Mem' : 'HT'}
                  </span>
                  <span className="text-[11px] text-text-secondary font-body truncate flex-1">{s.proposed_label}</span>
                  <span className={`text-[9px] font-body px-1 py-0.5 rounded flex-shrink-0 ${
                    s.status === 'pending_review' ? 'text-yellow-300/70' : 'text-gray-500'
                  }`}>
                    {s.status === 'pending_review' ? 'pending' : s.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 pl-6">
                  <span className="text-[9px] text-text-muted/40 font-body capitalize">{s.evidence_strength}</span>
                  <span className="text-[9px] text-text-muted/30 font-body">{new Date(s.created_at).toLocaleDateString()}</span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Detail / Create panel */}
        <div className="w-[380px] flex-shrink-0 p-3 overflow-y-auto max-h-[600px]">
          {showCreate && (
            <GraphSuggestionCreateForm
              onClose={() => setShowCreate(false)}
              onCreated={() => { setShowCreate(false); fetchSuggestions() }}
            />
          )}
          {!showCreate && hasSelection && detailLoading && (
            <div className="flex items-center justify-center pt-12">
              <div className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 bg-purple-400/40 rounded-full animate-pulse" />
                <span className="w-1.5 h-1.5 bg-purple-400/40 rounded-full animate-pulse [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-purple-400/40 rounded-full animate-pulse [animation-delay:300ms]" />
              </div>
            </div>
          )}
          {!showCreate && hasSelection && !detailLoading && hydratedDetail && (
            <GraphSuggestionDetail
              hydrated={hydratedDetail}
              onDismiss={handleDismiss}
              dismissing={dismissing}
              onClose={() => setSelectedId(null)}
            />
          )}
          {!showCreate && hasSelection && !detailLoading && !hydratedDetail && (
            <div className="text-center pt-12">
              <div className="text-xs text-red-300/50 font-body">Could not load suggestion detail.</div>
              <button
                onClick={() => setSelectedId(null)}
                className="text-[10px] text-text-muted/50 font-body mt-2 hover:text-text-muted transition-colors"
              >
                Clear selection
              </button>
            </div>
          )}
          {!showCreate && !hasSelection && (
            <div className="text-[11px] text-text-muted/30 font-body italic text-center pt-12">
              Select a suggestion to view details,<br />or create a new one.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
