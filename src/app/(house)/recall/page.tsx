'use client'

// Phase 28C + 29C — Recall Review Dashboard
// House-level review surface. Read-only. Shows both Ari and Eli recall events.
// Does not mutate archive_items, archive_sources, archive_entry_drafts, or any memory.
// Does not feed data into presence chat prompts.
// Phase 29C: HybridRecallPanel added — comparison only, no chat injection.

import { useState, useEffect, useCallback, useRef } from 'react'
import RecallFilters, { type RecallFilterState } from '@/components/RecallReview/RecallFilters'
import RecallSearch from '@/components/RecallReview/RecallSearch'
import RecallEventList from '@/components/RecallReview/RecallEventList'
import RecallEventDetail from '@/components/RecallReview/RecallEventDetail'
import AutoRecallSettingsPanel from '@/components/RecallReview/AutoRecallSettings'
import SemanticSearchPanel from '@/components/RecallReview/SemanticSearchPanel'
import EmbedBackfillPanel from '@/components/RecallReview/EmbedBackfillPanel'
import HybridRecallPanel from '@/components/RecallReview/HybridRecallPanel'
import type { RecallEventSummary } from '@/components/RecallReview/RecallEventRow'
import RecallPacketDebugPanel from '@/components/recall/RecallPacketDebugPanel'
import {
  inspectorDemoFixture,
  confirmedMemoryFixture,
  traceExcludedFixture,
  sourceConflictFixture,
  insufficientGroundFixture,
} from '@/lib/recall/recallPacketFixtures'
import { buildRecallPacketFromRuntimeSignals } from '@/lib/recall/recallCandidateAdapter'
import {
  inspectorDemoSignals,
  conflictSignals,
  insufficientSignals,
  topicShiftSignals,
} from '@/lib/recall/recallSignalFixtures'

const PAGE_SIZE = 50

// ─── Recall Packet Inspector — fixture-only, no live data ────────────────────
// Phase 39.3.1: static preview of the Context Authority Packet.
// Does not call buildRecallPacket() from the page.
// Does not fetch, retrieve, persist, or inject anything.

const RECALL_INSPECTOR_FIXTURES = {
  inspectorDemo:     inspectorDemoFixture,
  confirmedMemory:   confirmedMemoryFixture,
  traceExcluded:     traceExcludedFixture,
  sourceConflict:    sourceConflictFixture,
  insufficientGround: insufficientGroundFixture,
} as const

type InspectorFixtureName = keyof typeof RECALL_INSPECTOR_FIXTURES

const INSPECTOR_FIXTURE_OPTIONS: Array<{ value: InspectorFixtureName; label: string }> = [
  { value: 'inspectorDemo',     label: 'Mixed — Memory + Continuity + Trace excluded' },
  { value: 'confirmedMemory',   label: 'Confirmed Memory only' },
  { value: 'traceExcluded',     label: 'Memory + Trace excluded' },
  { value: 'sourceConflict',    label: 'Memory vs Held Truth conflict' },
  { value: 'insufficientGround', label: 'Insufficient ground' },
]

// ─── Adapter-generated preview ──────────────────────────────────────────────
// Phase 39.4.1: demonstrates RuntimeContextSignal[] → buildRecallPacket() chain.
// Static ID and timestamp — no Date.now(), no crypto.randomUUID(), no live data.

const DEMO_TIMESTAMP = '2026-06-03T00:00:00.000Z'

const ADAPTER_DEMO_PACKETS = {
  inspectorDemo: buildRecallPacketFromRuntimeSignals({
    packet_id:   'preview-adapter-demo',
    computed_at: DEMO_TIMESTAMP,
    presence:    'ari',
    room:        'ari_room',
    signals:     inspectorDemoSignals,
  }),
  conflictDemo: buildRecallPacketFromRuntimeSignals({
    packet_id:   'preview-conflict-demo',
    computed_at: DEMO_TIMESTAMP,
    presence:    'ari',
    room:        'ari_room',
    signals:     conflictSignals,
  }),
  insufficientDemo: buildRecallPacketFromRuntimeSignals({
    packet_id:   'preview-insufficient-demo',
    computed_at: DEMO_TIMESTAMP,
    presence:    'ari',
    room:        'ari_room',
    signals:     insufficientSignals,
  }),
  topicShiftDemo: buildRecallPacketFromRuntimeSignals({
    packet_id:     'preview-topic-shift-demo',
    computed_at:   DEMO_TIMESTAMP,
    presence:      'ari',
    room:          'ari_room',
    query_context: { topic_shift_detected: true },
    signals:       topicShiftSignals,
  }),
} as const

type AdapterDemoName = keyof typeof ADAPTER_DEMO_PACKETS

const ADAPTER_DEMO_OPTIONS: Array<{ value: AdapterDemoName; label: string }> = [
  { value: 'inspectorDemo',    label: 'Mixed — Memory + Continuity + Scope-blocked' },
  { value: 'conflictDemo',     label: 'Memory vs Held Truth conflict' },
  { value: 'insufficientDemo', label: 'Insufficient ground (empty signals)' },
  { value: 'topicShiftDemo',   label: 'Topic shift — Memory survives, continuity excluded' },
]

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
  const [inspectorOpen, setInspectorOpen]             = useState(false)
  const [selectedFixture, setSelectedFixture]         = useState<InspectorFixtureName>('inspectorDemo')
  const [previewMode, setPreviewMode]                 = useState<'fixture' | 'adapter'>('adapter')
  const [selectedAdapterDemo, setSelectedAdapterDemo] = useState<AdapterDemoName>('inspectorDemo')

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
    <div className="flex flex-col min-h-full">

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

        {/* ── Hybrid Recall Lab (Phase 29C) ────────────────────── */}
        <HybridRecallPanel />

        {/* ── Recall Packet Inspector (Phase 39.4.1) ───────────── */}
        {/* Demo preview only. No live recall. No DB reads. No prompt integration. No authority movement. */}
        <div className="mt-5 border-t border-house-border pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-body text-[10px] text-text-muted uppercase tracking-widest">
                Recall Packet Inspector
              </p>
              <p className="font-body text-[9px] text-text-muted/50 italic mt-0.5">
                Demo preview only. No live recall. No DB reads. No prompt integration. No authority movement.
              </p>
            </div>
            <button
              onClick={() => setInspectorOpen(prev => !prev)}
              className="font-mono text-[9px] text-text-muted/50 border border-house-border/30 px-2 py-0.5 rounded hover:border-house-border/60 transition-colors shrink-0 ml-4"
            >
              {inspectorOpen ? 'collapse' : 'expand'}
            </button>
          </div>
          {inspectorOpen && (
            <div className="mt-3">

              {/* Preview mode toggle */}
              <div className="flex items-center gap-2 mb-3">
                <span className="font-mono text-[8px] text-text-muted/35 shrink-0">Preview:</span>
                {(['adapter', 'fixture'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setPreviewMode(mode)}
                    className={`font-mono text-[8px] px-1.5 py-0.5 rounded border transition-colors ${
                      previewMode === mode
                        ? 'text-text-secondary/80 border-house-border/60 bg-house-bg/40'
                        : 'text-text-muted/40 border-house-border/20 hover:border-house-border/40'
                    }`}
                  >
                    {mode === 'adapter' ? 'Adapter-generated' : 'Fixture-only preview'}
                  </button>
                ))}
              </div>

              {/* Adapter-generated mode */}
              {previewMode === 'adapter' && (
                <div>
                  <p className="font-mono text-[8px] text-text-muted/40 italic mb-2">
                    Adapter-generated preview from demo runtime signals. No live recall. No DB reads. No prompt integration. No authority movement.
                  </p>
                  <div className="flex items-center gap-2 mb-3">
                    <label className="font-mono text-[8px] text-text-muted/40 shrink-0">Demo signals:</label>
                    <select
                      value={selectedAdapterDemo}
                      onChange={e => setSelectedAdapterDemo(e.target.value as AdapterDemoName)}
                      className="font-mono text-[9px] text-text-secondary/70 bg-house-bg border border-house-border/40 rounded px-2 py-0.5 outline-none focus:border-house-border/70"
                    >
                      {ADAPTER_DEMO_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <RecallPacketDebugPanel
                    packet={ADAPTER_DEMO_PACKETS[selectedAdapterDemo]}
                    title="Recall Packet Inspector"
                  />
                </div>
              )}

              {/* Static fixture mode */}
              {previewMode === 'fixture' && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <label className="font-mono text-[8px] text-text-muted/40 shrink-0">Fixture:</label>
                    <select
                      value={selectedFixture}
                      onChange={e => setSelectedFixture(e.target.value as InspectorFixtureName)}
                      className="font-mono text-[9px] text-text-secondary/70 bg-house-bg border border-house-border/40 rounded px-2 py-0.5 outline-none focus:border-house-border/70"
                    >
                      {INSPECTOR_FIXTURE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <RecallPacketDebugPanel
                    packet={RECALL_INSPECTOR_FIXTURES[selectedFixture]}
                    title="Recall Packet Inspector"
                  />
                </div>
              )}

            </div>
          )}
        </div>
      </div>

      {/* ── Filters + search ─────────────────────────────────────── */}
      <div className="border-b border-house-border bg-house-bg px-4 py-2.5 md:px-6 shrink-0 space-y-2">
        <RecallSearch value={search} onChange={setSearch} />
        <RecallFilters filters={filters} onChange={f => setFilters(f)} />
      </div>

      {/* ── Two-pane content ─────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:min-h-[480px] md:h-[calc(100vh-200px)]">

        {/* Left: event list */}
        <div className="
          flex flex-col
          w-full md:w-80 lg:w-96 shrink-0
          border-b md:border-b-0 md:border-r border-house-border
          overflow-hidden
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
