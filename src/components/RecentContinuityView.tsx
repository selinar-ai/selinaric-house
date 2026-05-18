'use client'

// Phase 35B — Recent Continuity Review
//
// Tara's inspection surface for recent session summaries.
// Read + correct. Not Memory. Not canonical.
//
// Actions: hide (stop injecting), delete (tombstone — prevents regeneration),
// restore (un-hide).

import { useState, useEffect, useCallback } from 'react'

interface ContinuitySession {
  id: string
  presence_id: string
  session_start: string
  session_end: string
  message_count: number
  classification: string
  summary: string
  source_message_ids: string[]
  status: string
  generated_at: string
  created_at: string
}

const CLASSIFICATION_LABELS: Record<string, { label: string; color: string }> = {
  transactional: { label: 'transactional', color: 'text-text-muted' },
  relational:    { label: 'relational',    color: 'text-blue-400' },
  significant:   { label: 'significant',   color: 'text-amber-400' },
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active:           { label: 'active',    color: 'text-green-400' },
  hidden:           { label: 'hidden',    color: 'text-yellow-400' },
  deleted_by_tara:  { label: 'deleted',   color: 'text-red-400' },
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

export default function RecentContinuityView() {
  const [sessions, setSessions]       = useState<ContinuitySession[]>([])
  const [loading, setLoading]         = useState(true)
  const [filter, setFilter]           = useState<'all' | 'eli' | 'ari'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'hidden' | 'deleted_by_tara'>('all')
  const [updating, setUpdating]       = useState<string | null>(null)

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter !== 'all') params.set('presenceId', filter)
      const res = await fetch(`/api/recent-continuity?${params.toString()}`)
      if (!res.ok) throw new Error('fetch failed')
      const data = await res.json()
      setSessions(data.sessions ?? [])
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { fetchSessions() }, [fetchSessions])

  async function handleStatusChange(id: string, newStatus: string) {
    setUpdating(id)
    try {
      const res = await fetch('/api/recent-continuity', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      })
      if (res.ok) {
        // Update locally
        setSessions(prev =>
          prev.map(s => s.id === id ? { ...s, status: newStatus } : s)
        )
      }
    } finally {
      setUpdating(null)
    }
  }

  const filtered = statusFilter === 'all'
    ? sessions
    : sessions.filter(s => s.status === statusFilter)

  const stats = {
    total: sessions.length,
    active: sessions.filter(s => s.status === 'active').length,
    hidden: sessions.filter(s => s.status === 'hidden').length,
    deleted: sessions.filter(s => s.status === 'deleted_by_tara').length,
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="border-b border-house-border bg-house-surface px-4 py-4 md:px-6 shrink-0">
        <h1 className="font-display text-xl font-light tracking-[0.15em] text-text-primary">
          RECENT CONTINUITY
        </h1>
        <p className="font-body text-xs text-text-muted mt-1">
          Session summaries injected into chat context. Not Memory — recent context only.
        </p>

        {/* Stats */}
        <div className="flex gap-4 mt-4 flex-wrap">
          {[
            { label: 'Total',    value: stats.total },
            { label: 'Active',   value: stats.active },
            { label: 'Hidden',   value: stats.hidden },
            { label: 'Deleted',  value: stats.deleted },
          ].map(card => (
            <div key={card.label} className="border border-house-border bg-house-bg px-3 py-2 min-w-[70px]">
              <p className="font-display text-lg font-light text-text-primary">{card.value}</p>
              <p className="font-body text-[10px] text-text-muted mt-0.5">{card.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="border-b border-house-border bg-house-bg px-4 py-2.5 md:px-6 shrink-0 flex flex-wrap gap-3 items-center">
        <div className="flex gap-1.5">
          {(['all', 'eli', 'ari'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`font-body text-[11px] px-2.5 py-1 border transition-colors ${
                filter === f
                  ? 'border-text-primary text-text-primary bg-house-surface'
                  : 'border-house-border text-text-muted hover:text-text-secondary'
              }`}
            >
              {f === 'all' ? 'Both' : f === 'eli' ? 'Eli' : 'Ari'}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-house-border" />
        <div className="flex gap-1.5">
          {(['all', 'active', 'hidden', 'deleted_by_tara'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`font-body text-[11px] px-2.5 py-1 border transition-colors ${
                statusFilter === s
                  ? 'border-text-primary text-text-primary bg-house-surface'
                  : 'border-house-border text-text-muted hover:text-text-secondary'
              }`}
            >
              {s === 'all' ? 'All' : s === 'deleted_by_tara' ? 'Deleted' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 md:px-6 space-y-2">
        {loading && (
          <p className="font-body text-xs text-text-muted py-8 text-center">Loading...</p>
        )}

        {!loading && filtered.length === 0 && (
          <p className="font-body text-xs text-text-muted py-8 text-center">
            No session summaries found.
          </p>
        )}

        {!loading && filtered.map(session => {
          const cls = CLASSIFICATION_LABELS[session.classification] ?? CLASSIFICATION_LABELS.transactional
          const st = STATUS_LABELS[session.status] ?? STATUS_LABELS.active
          const isUpdating = updating === session.id

          return (
            <div
              key={session.id}
              className={`border border-house-border bg-house-surface p-3 space-y-2 ${
                session.status === 'deleted_by_tara' ? 'opacity-50' : ''
              }`}
            >
              {/* Top row: presence + time + classification + status */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`font-display text-xs tracking-wider ${
                  session.presence_id === 'eli' ? 'text-eli-primary' : 'text-ari-primary'
                }`}>
                  {session.presence_id === 'eli' ? 'ELI' : 'ARI'}
                </span>
                <span className="font-body text-[10px] text-text-muted">
                  {formatTime(session.session_end)}
                </span>
                <span className="font-body text-[10px] text-text-muted">
                  ({timeAgo(session.session_end)})
                </span>
                <span className={`font-body text-[10px] ${cls.color}`}>
                  {cls.label}
                </span>
                <span className={`font-body text-[10px] ${st.color}`}>
                  [{st.label}]
                </span>
                <span className="font-body text-[10px] text-text-muted">
                  {session.message_count} msgs
                </span>
              </div>

              {/* Summary */}
              <p className="font-body text-xs text-text-secondary leading-relaxed">
                {session.summary}
              </p>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                {session.status === 'active' && (
                  <>
                    <button
                      onClick={() => handleStatusChange(session.id, 'hidden')}
                      disabled={isUpdating}
                      className="font-body text-[10px] text-yellow-400 hover:text-yellow-300 disabled:opacity-50"
                      title="Hide from chat context (can restore later)"
                    >
                      Hide
                    </button>
                    <button
                      onClick={() => handleStatusChange(session.id, 'deleted_by_tara')}
                      disabled={isUpdating}
                      className="font-body text-[10px] text-red-400 hover:text-red-300 disabled:opacity-50"
                      title="Delete — prevents regeneration permanently"
                    >
                      Delete
                    </button>
                  </>
                )}
                {session.status === 'hidden' && (
                  <>
                    <button
                      onClick={() => handleStatusChange(session.id, 'active')}
                      disabled={isUpdating}
                      className="font-body text-[10px] text-green-400 hover:text-green-300 disabled:opacity-50"
                      title="Restore to active context"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => handleStatusChange(session.id, 'deleted_by_tara')}
                      disabled={isUpdating}
                      className="font-body text-[10px] text-red-400 hover:text-red-300 disabled:opacity-50"
                      title="Delete — prevents regeneration permanently"
                    >
                      Delete
                    </button>
                  </>
                )}
                {session.status === 'deleted_by_tara' && (
                  <span className="font-body text-[10px] text-text-muted italic">
                    Tombstoned — will not regenerate
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
