'use client'

// Phase 28C — Recall Review Dashboard
// House-level review surface. Read-only. Shows both Ari and Eli recall events.
// Does not mutate archive_items, archive_sources, archive_entry_drafts, or any memory.
// Does not feed data into presence chat prompts.

import { useState, useEffect, useCallback, useRef } from 'react'
import RecallFilters, { type RecallFilterState } from '@/components/RecallReview/RecallFilters'
import RecallSearch from '@/components/RecallReview/RecallSearch'
import RecallEventList from '@/components/RecallReview/RecallEventList'
import RecallEventDetail from '@/components/RecallReview/RecallEventDetail'
import AutoRecallSettingsPanel from '@/components/RecallReview/AutoRecallSettings'
import SemanticSearchPanel from '@/components/RecallReview/SemanticSearchPanel'
import EmbedBackfillPanel from '@/components/RecallReview/EmbedBackfillPanel'
import type { RecallEventSummary } from '@/components/RecallReview/RecallEventRow'

const PAGE_SIZE = 50

const DEFAULT_FILTERS: RecallFilterState = {
  presenceId:     '',
  matchQuality:   '',
  mode:           '',
  hasFeedback:    '',
  needsAttention: false,
}

interface Stats {
  total: number
  strong: number
  weak_or_none: number
  has_attention: number
}

function buildUrl(filters: RecallFilterState, q: string, offset: number) {
  const params = new URLSearchParams()
  if (filters.presenceId)   params.set('presenceId',    filters.presenceId)
  if (filters.matchQuality) params.set('matchQuality',  filters.matchQuality)
  if (filters.mode)         params.set('mode',          filters.mode)
  if (filters.hasFeedback)  params.set('hasFeedback',   filters.hasFeedback)
  if (filters.needsAttention) params.set('needsAttention', 'true')
  if (q.trim())             params.set('q', q.trim())
  params.set('limit',  String(PAGE_SIZE))
  params.set('offset', String(offset))
  return `/api/archive-recall/events?${params.toString()}`
}

export default function RecallReviewPage() {
  const [filters, setFilters]         = useState<RecallFilterState>(DEFAULT_FILTERS)
  const [search, setSearch]           = useState('')
  const [events, setEvents]           = useState<RecallEventSummary[]>([])
  const [stats, setStats]             = useState<Stats | null>(null)
  const [total, setTotal]             = useState(0)
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [loading, setLoading]         = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [offset, setOffset]           = useState(0)
  const searchTimeoutRef              = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch events — reset=true clears list and starts fresh
  const fetchEvents = useCallback(async (
    currentFilters: RecallFilterState,
    currentSearch: string,
    currentOffset: number,
    reset: boolean
  ) => {
    if (reset) setLoading(true)
    else       setLoadingMore(true)

    try {
      const url = buildUrl(currentFilters, currentSearch, currentOffset)
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()

      const incoming = (data.events ?? []) as RecallEventSummary[]
      if (reset) {
        setEvents(incoming)
        setStats(data.stats ?? null)
        setTotal(data.total ?? 0)
        setOffset(incoming.length)
        // Auto-select first event on fresh load if nothing selected
        if (incoming.length > 0 && !selectedId) setSelectedId(incoming[0].id)
      } else {
        setEvents(prev => [...prev, ...incoming])
        setOffset(prev => prev + incoming.length)
      }
    } catch {
      // silently fail — empty state handles it
    } finally {
      if (reset) setLoading(false)
      else       setLoadingMore(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Initial load
  useEffect(() => {
    fetchEvents(filters, search, 0, true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-fetch when filters change
  useEffect(() => {
    setSelectedId(null)
    fetchEvents(filters, search, 0, true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  // Debounce search
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      setSelectedId(null)
      fetchEvents(filters, search, 0, true)
    }, 350)
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  function handleLoadMore() {
    fetchEvents(filters, search, offset, false)
  }

  const hasMore = events.length < total

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Page header ──────────────────────────────────────────── */}
      <div className="border-b border-house-border bg-house-surface px-4 py-4 md:px-6 shrink-0">
        <h1 className="font-display text-xl font-light tracking-[0.15em] text-text-primary">
          RECALL REVIEW
        </h1>
        <p className="font-body text-xs text-text-muted mt-1">
          Archive recall events, feedback, and match quality.
        </p>

        {/* ── Summary cards ──────────────────────────────────────── */}
        {stats && (
          <div className="flex gap-4 mt-4 flex-wrap">
            {[
              { label: 'Total events',   value: stats.total },
              { label: 'Strong matches', value: stats.strong },
              { label: 'Weak / none',    value: stats.weak_or_none },
              { label: 'Needs attention', value: stats.has_attention },
            ].map(card => (
              <div key={card.label} className="border border-house-border bg-house-bg px-3 py-2 min-w-[80px]">
                <p className="font-display text-lg font-light text-text-primary">{card.value}</p>
                <p className="font-body text-[10px] text-text-muted mt-0.5">{card.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Auto-Recall Settings (Phase 28D) ───────────────────── */}
        <div className="mt-5 border-t border-house-border pt-4">
          <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-2">
            Auto-Recall Trial
          </p>
          <AutoRecallSettingsPanel />
        </div>

        {/* ── Semantic Search (Phase 29A) ──────────────────────── */}
        <SemanticSearchPanel />

        {/* ── Embedding Backfill (Phase 29A) ───────────────────── */}
        <EmbedBackfillPanel />
      </div>

      {/* ── Filters + search ─────────────────────────────────────── */}
      <div className="border-b border-house-border bg-house-bg px-4 py-2.5 md:px-6 shrink-0 space-y-2">
        <RecallSearch value={search} onChange={setSearch} />
        <RecallFilters filters={filters} onChange={f => setFilters(f)} />
      </div>

      {/* ── Two-pane content ─────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">

        {/* Left: event list */}
        <div className="
          flex flex-col
          w-full md:w-80 lg:w-96 shrink-0
          border-b md:border-b-0 md:border-r border-house-border
          overflow-hidden
          md:h-full
          max-h-72 md:max-h-none
        ">
          <div className="px-3 py-2 border-b border-house-border bg-house-surface shrink-0">
            <span className="font-body text-[10px] text-text-muted uppercase tracking-widest">
              {loading ? 'Loading…' : `${total} event${total !== 1 ? 's' : ''}`}
            </span>
          </div>
          <RecallEventList
            events={events}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={loading || loadingMore}
            hasMore={hasMore}
            onLoadMore={handleLoadMore}
          />
        </div>

        {/* Right: event detail */}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col bg-house-bg">
          <RecallEventDetail eventId={selectedId} />
        </div>

      </div>
    </div>
  )
}
