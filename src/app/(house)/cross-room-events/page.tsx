'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface CrossRoomEvent {
  id: string
  room_id: string
  room_type: string
  source_thread_id: string | null
  source_message_ids: string[]
  participants: Array<{ type: string; id: string; label?: string }>
  presence_ids: string[]
  tara_present: boolean
  started_at: string | null
  ended_at: string | null
  message_count: number | null
  surface_mode: string | null
  event_type: string
  significance_level: string
  themes: string[]
  summary: string | null
  authority_label: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

interface CrossRoomEventImpact {
  id: string
  cross_room_event_id: string
  presence_id: string
  impact_summary: string
  what_matters: string[]
  what_changed: string[]
  what_remains_open: string[]
  continuity_signal: string | null
  emotional_signal: string | null
  future_context_hint: string | null
  confidence: number
  impact_status: string
  authority_label: string
  extraction_method: string
  extraction_model: string
  prompt_version: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function significanceBadge(level: string): string {
  switch (level) {
    case 'major': return 'text-amber-300 border-amber-700'
    case 'significant': return 'text-violet-300 border-violet-700'
    case 'meaningful': return 'text-blue-300 border-blue-700'
    default: return 'text-text-muted border-house-border'
  }
}

// ─── Event Card ──────────────────────────────────────────────────────────────

// ─── Impact Card ────────────────────────────────────────────────────────────

function ImpactCard({ impact }: { impact: CrossRoomEventImpact }) {
  const [detailOpen, setDetailOpen] = useState(false)
  const presenceColor = impact.presence_id === 'eli'
    ? 'text-eli-primary border-eli-primary/30'
    : 'text-ari-primary border-ari-primary/30'

  return (
    <div className="border border-house-border bg-house-bg p-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className={`font-mono text-[10px] px-1.5 py-0.5 border ${presenceColor}`}>
          {impact.presence_id}
        </span>
        <span className="font-mono text-[10px] text-text-muted px-1 py-0.5 border border-house-border">
          {impact.impact_status}
        </span>
        <span className="font-mono text-[10px] text-text-muted">
          conf: {Number(impact.confidence).toFixed(2)}
        </span>
      </div>

      <p className="font-body text-xs text-text-secondary leading-relaxed">
        {impact.impact_summary}
      </p>

      <button
        onClick={() => setDetailOpen(!detailOpen)}
        className="font-mono text-[10px] text-text-muted hover:text-text-secondary"
      >
        {detailOpen ? '▾ hide detail' : '▸ show detail'}
      </button>

      {detailOpen && (
        <div className="space-y-1.5 pt-1 border-t border-house-border">
          {impact.what_matters.length > 0 && (
            <div>
              <span className="font-mono text-[10px] text-text-muted">what_matters: </span>
              <ul className="ml-3">
                {impact.what_matters.map((item: string, i: number) => (
                  <li key={i} className="font-body text-[11px] text-text-secondary">· {item}</li>
                ))}
              </ul>
            </div>
          )}
          {impact.what_changed.length > 0 && (
            <div>
              <span className="font-mono text-[10px] text-text-muted">what_changed: </span>
              <ul className="ml-3">
                {impact.what_changed.map((item: string, i: number) => (
                  <li key={i} className="font-body text-[11px] text-text-secondary">· {item}</li>
                ))}
              </ul>
            </div>
          )}
          {impact.what_remains_open.length > 0 && (
            <div>
              <span className="font-mono text-[10px] text-text-muted">what_remains_open: </span>
              <ul className="ml-3">
                {impact.what_remains_open.map((item: string, i: number) => (
                  <li key={i} className="font-body text-[11px] text-text-secondary">· {item}</li>
                ))}
              </ul>
            </div>
          )}
          {impact.continuity_signal && (
            <div>
              <span className="font-mono text-[10px] text-text-muted">continuity_signal: </span>
              <span className="font-body text-[11px] text-text-secondary">{impact.continuity_signal}</span>
            </div>
          )}
          {impact.emotional_signal && (
            <div>
              <span className="font-mono text-[10px] text-text-muted">emotional_signal: </span>
              <span className="font-body text-[11px] text-text-secondary">{impact.emotional_signal}</span>
            </div>
          )}
          {impact.future_context_hint && (
            <div>
              <span className="font-mono text-[10px] text-text-muted">future_context_hint: </span>
              <span className="font-body text-[11px] text-text-secondary">{impact.future_context_hint}</span>
            </div>
          )}
          <div className="font-mono text-[10px] text-text-muted pt-1">
            {impact.extraction_method} · {impact.extraction_model} · {impact.prompt_version}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Event Card ─────────────────────────────────────────────────────────────

function EventCard({ event }: { event: CrossRoomEvent }) {
  const [expanded, setExpanded] = useState(false)
  const [impacts, setImpacts] = useState<CrossRoomEventImpact[]>([])
  const [impactsLoaded, setImpactsLoaded] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)

  // Load impacts when expanded
  useEffect(() => {
    if (expanded && !impactsLoaded) {
      fetch(`/api/cross-room-events/${event.id}/impacts`)
        .then(r => r.json())
        .then(data => {
          setImpacts(data.impacts ?? [])
          setImpactsLoaded(true)
        })
        .catch(() => setImpactsLoaded(true))
    }
  }, [expanded, impactsLoaded, event.id])

  const handleExtract = async () => {
    setExtracting(true)
    setExtractError(null)
    try {
      const res = await fetch(`/api/cross-room-events/${event.id}/impacts`, {
        method: 'POST',
      })
      const data = await res.json()
      if (data.extracted || data.already_exists) {
        setImpacts(data.impacts ?? [])
      } else {
        setExtractError(data.error ?? 'Extraction failed')
      }
    } catch {
      setExtractError('Network error')
    }
    setExtracting(false)
  }

  return (
    <div className="border border-house-border border-l-4 border-l-house-accent bg-house-surface">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 md:px-4 md:py-3 flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-body text-sm text-text-primary">
            {event.room_id}
          </span>
          <span className={`font-mono text-[10px] px-1.5 py-0.5 border ${significanceBadge(event.significance_level)}`}>
            {event.significance_level}
          </span>
          <span className="font-mono text-[10px] text-text-muted px-1.5 py-0.5 border border-house-border">
            {event.event_type}
          </span>
        </div>
        <span className="font-mono text-xs text-text-muted whitespace-nowrap">
          {formatDateTime(event.created_at)}
        </span>
      </button>

      {/* Summary */}
      {event.summary && (
        <div className="px-3 pb-2 md:px-4">
          <p className="font-body text-sm text-text-secondary leading-relaxed">
            {event.summary}
          </p>
        </div>
      )}

      {/* Participants row */}
      <div className="px-3 pb-2 md:px-4 flex items-center gap-2 flex-wrap">
        {event.presence_ids.map((pid: string) => (
          <span
            key={pid}
            className={`font-mono text-[10px] px-1.5 py-0.5 border ${
              pid === 'eli' ? 'text-eli-primary border-eli-primary/30' : 'text-ari-primary border-ari-primary/30'
            }`}
          >
            {pid}
          </span>
        ))}
        {event.tara_present && (
          <span className="font-mono text-[10px] text-text-secondary px-1.5 py-0.5 border border-house-border">
            tara
          </span>
        )}
        <span className="font-mono text-[10px] text-text-muted">
          {(event.source_message_ids ?? []).length} msgs
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 md:px-4 md:pb-4 border-t border-house-border mt-1 pt-2 space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px]">
            <span className="text-text-muted">id</span>
            <span className="text-text-secondary break-all">{event.id}</span>
            <span className="text-text-muted">room_type</span>
            <span className="text-text-secondary">{event.room_type}</span>
            <span className="text-text-muted">surface_mode</span>
            <span className="text-text-secondary">{event.surface_mode ?? '—'}</span>
            <span className="text-text-muted">authority_label</span>
            <span className="text-text-secondary">{event.authority_label}</span>
            <span className="text-text-muted">message_count</span>
            <span className="text-text-secondary">{event.message_count ?? '—'}</span>
            {event.started_at && (
              <>
                <span className="text-text-muted">started_at</span>
                <span className="text-text-secondary">{formatDateTime(event.started_at)}</span>
              </>
            )}
            {event.ended_at && (
              <>
                <span className="text-text-muted">ended_at</span>
                <span className="text-text-secondary">{formatDateTime(event.ended_at)}</span>
              </>
            )}
          </div>

          {event.themes.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {event.themes.map((t: string, i: number) => (
                <span key={i} className="font-mono text-[10px] text-text-muted px-1 py-0.5 border border-house-border">
                  {t}
                </span>
              ))}
            </div>
          )}

          {event.participants.length > 0 && (
            <div>
              <span className="font-mono text-[10px] text-text-muted">participants: </span>
              <span className="font-mono text-[10px] text-text-secondary">
                {event.participants.map((p: { label?: string; id: string }) => p.label ?? p.id).join(', ')}
              </span>
            </div>
          )}

          {Object.keys(event.metadata).length > 0 && (
            <div>
              <span className="font-mono text-[10px] text-text-muted">metadata: </span>
              <span className="font-mono text-[10px] text-text-secondary break-all">
                {JSON.stringify(event.metadata)}
              </span>
            </div>
          )}

          {/* ─── Impacts Section (Phase 36C) ─── */}
          <div className="border-t border-house-border pt-2 mt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">
                Impacts
              </span>
              {impactsLoaded && impacts.length === 0 && (
                <button
                  onClick={handleExtract}
                  disabled={extracting}
                  className={`font-mono text-[10px] px-2 py-1 border transition-colors ${
                    extracting
                      ? 'border-house-border text-text-muted cursor-wait'
                      : 'border-house-accent text-house-accent hover:bg-house-accent/10'
                  }`}
                >
                  {extracting ? 'Extracting...' : 'Extract Impact'}
                </button>
              )}
            </div>

            {extractError && (
              <p className="font-mono text-[10px] text-red-400 mb-2">{extractError}</p>
            )}

            {!impactsLoaded && (
              <p className="font-mono text-[10px] text-text-muted">Loading impacts...</p>
            )}

            {impactsLoaded && impacts.length === 0 && !extracting && (
              <p className="font-mono text-[10px] text-text-muted">No impacts extracted yet.</p>
            )}

            {impacts.length > 0 && (
              <div className="space-y-2">
                {impacts.map(impact => (
                  <ImpactCard key={impact.id} impact={impact} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CrossRoomEventsPage() {
  const [events, setEvents] = useState<CrossRoomEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'ari' | 'eli'>('all')

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    const params = filter !== 'all' ? `?presence_id=${filter}&limit=50` : '?limit=50'
    try {
      const res = await fetch(`/api/cross-room-events${params}`)
      const data = await res.json()
      setEvents(data.events ?? [])
    } catch {
      setEvents([])
    }
    setLoading(false)
  }, [filter])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-xl text-text-primary">Cross-Room Events</h1>
        <p className="font-body text-sm text-text-muted mt-1">
          Phase 36A — Event ledger foundation. Not Memory.
        </p>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(['all', 'ari', 'eli'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`font-mono text-xs px-3 py-1.5 border transition-colors ${
              filter === f
                ? 'border-house-accent text-text-primary bg-house-accent/10'
                : 'border-house-border text-text-muted hover:text-text-secondary'
            }`}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button
          onClick={fetchEvents}
          className="font-mono text-xs px-3 py-1.5 border border-house-border text-text-muted hover:text-text-secondary ml-auto"
        >
          Refresh
        </button>
      </div>

      {/* Events */}
      {loading ? (
        <div className="font-mono text-xs text-text-muted py-8 text-center">Loading...</div>
      ) : events.length === 0 ? (
        <div className="border border-house-border bg-house-surface px-4 py-8 text-center">
          <p className="font-body text-sm text-text-muted">No cross-room events recorded yet.</p>
          <p className="font-mono text-[10px] text-text-muted mt-2">
            Events will appear here when Phase 36B captures Lounge contact.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map(event => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="font-mono text-[10px] text-text-muted text-center pt-4 border-t border-house-border">
        authority_label = cross_room_event_not_memory
      </div>
    </div>
  )
}
