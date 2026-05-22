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

function EventCard({ event }: { event: CrossRoomEvent }) {
  const [expanded, setExpanded] = useState(false)

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
