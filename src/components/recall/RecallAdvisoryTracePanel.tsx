'use client'

// Phase 39.7 — Runtime Recall Advisory Trace Panel
//
// Read-only display of recent runtime_recall_advisory_traces rows.
// Metadata-only: counts and instruction labels — no raw content rendered.
//
// Authority boundary (visible in panel footer):
//   Runtime advisory trace only.
//   Not Memory. Not evidence. Not prompt authority.
//   No raw content stored.

import { useState, useEffect, useCallback } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface AdvisoryTraceRow {
  id: string
  created_at: string
  route_surface: string
  presence_id: string
  room_context: string
  primary_response_instruction: string | null
  grounding_condition: string | null
  conflict_count: number
  active_source_count: number
  excluded_source_count: number
  confirmed_memory_count: number
  recent_continuity_count: number
  journal_count: number
  library_count: number
  cross_room_count: number
  archive_recall_count: number
  excluded_scope_count: number
  excluded_low_relevance_count: number
  excluded_expired_count: number
  advisory_inserted: boolean
  advisory_error: boolean
  error_code: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function fmtInstruction(s: string | null): string {
  if (!s) return '—'
  return s.replace(/_/g, ' ')
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-AU', {
      timeZone: 'Australia/Melbourne',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

function groundingColor(cond: string | null): string {
  if (cond === 'sufficient') return 'text-emerald-300/60'
  if (cond === 'insufficient') return 'text-red-300/50'
  return 'text-text-muted/40'
}

// ─────────────────────────────────────────────────────────────────────────────
// TRACE CARD
// ─────────────────────────────────────────────────────────────────────────────

function TraceCard({ trace }: { trace: AdvisoryTraceRow }) {
  const hasAnySources = trace.confirmed_memory_count +
    trace.recent_continuity_count + trace.journal_count +
    trace.library_count + trace.cross_room_count + trace.archive_recall_count > 0

  return (
    <div className={`border rounded px-2.5 py-2 bg-house-bg/15 ${
      trace.advisory_error
        ? 'border-red-300/15'
        : 'border-house-border/20'
    }`}>
      {/* Header row */}
      <div className="flex items-center gap-1.5 flex-wrap mb-1">
        <span className="font-mono text-[7px] text-text-muted/40">
          {fmtTime(trace.created_at)}
        </span>
        <span className="font-mono text-[7px] px-1 rounded bg-house-bg/50 text-text-muted/60">
          {trace.presence_id}
        </span>
        <span className="font-mono text-[7px] px-1 rounded bg-house-bg/40 text-text-muted/50">
          {trace.room_context}
        </span>
        <span className="font-mono text-[7px] px-1 rounded bg-house-bg/30 text-text-muted/40">
          {trace.route_surface}
        </span>
        {trace.advisory_error && (
          <span className="font-mono text-[7px] px-1 rounded text-red-300/50 bg-red-300/5 border border-red-300/10">
            advisory error
          </span>
        )}
        {!trace.advisory_inserted && !trace.advisory_error && (
          <span className="font-mono text-[7px] text-text-muted/30 italic">not inserted</span>
        )}
      </div>

      {/* Primary instruction */}
      <div className="font-mono text-[8px] text-text-secondary/70 mb-1">
        {fmtInstruction(trace.primary_response_instruction)}
      </div>

      {/* Counts row */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className={`font-mono text-[7px] ${groundingColor(trace.grounding_condition)}`}>
          {trace.grounding_condition ?? '—'}
        </span>
        <span className="font-mono text-[7px] text-text-muted/35">
          active {trace.active_source_count} · excluded {trace.excluded_source_count}
        </span>
        {trace.conflict_count > 0 && (
          <span className="font-mono text-[7px] text-amber-300/50">
            {trace.conflict_count} conflict{trace.conflict_count !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Source family counts (non-zero only) */}
      {hasAnySources && (
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          {trace.confirmed_memory_count > 0 && (
            <span className="font-mono text-[7px] text-emerald-300/50">mem:{trace.confirmed_memory_count}</span>
          )}
          {trace.recent_continuity_count > 0 && (
            <span className="font-mono text-[7px] text-text-muted/35">cont:{trace.recent_continuity_count}</span>
          )}
          {trace.journal_count > 0 && (
            <span className="font-mono text-[7px] text-text-muted/35">j:{trace.journal_count}</span>
          )}
          {trace.library_count > 0 && (
            <span className="font-mono text-[7px] text-text-muted/35">lib:{trace.library_count}</span>
          )}
          {trace.cross_room_count > 0 && (
            <span className="font-mono text-[7px] text-text-muted/35">xr:{trace.cross_room_count}</span>
          )}
          {trace.archive_recall_count > 0 && (
            <span className="font-mono text-[7px] text-text-muted/35">arc:{trace.archive_recall_count}</span>
          )}
          {trace.excluded_scope_count > 0 && (
            <span className="font-mono text-[7px] text-amber-300/30">scope↓{trace.excluded_scope_count}</span>
          )}
          {trace.excluded_low_relevance_count > 0 && (
            <span className="font-mono text-[7px] text-text-muted/30">rel↓{trace.excluded_low_relevance_count}</span>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PANEL
// ─────────────────────────────────────────────────────────────────────────────

export default function RecallAdvisoryTracePanel() {
  const [open, setOpen] = useState(false)
  const [traces, setTraces] = useState<AdvisoryTraceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [presenceFilter, setPresenceFilter] = useState('')
  const [routeFilter, setRouteFilter] = useState('')

  const loadTraces = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (presenceFilter) params.set('presence', presenceFilter)
      if (routeFilter)   params.set('route',    routeFilter)
      params.set('limit', '25')
      const res = await fetch(`/api/recall-advisory-traces?${params}`)
      if (!res.ok) return
      const data = await res.json()
      setTraces(data.traces ?? [])
    } catch {
      // silently fail — trace panel is non-critical
    } finally {
      setLoading(false)
    }
  }, [presenceFilter, routeFilter])

  useEffect(() => {
    if (!open) return
    loadTraces()
  }, [open, loadTraces])

  return (
    <div className="mt-5 border-t border-house-border pt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-body text-[10px] text-text-muted uppercase tracking-widest">
            Runtime Recall Advisory Trace
          </p>
          <p className="font-body text-[9px] text-text-muted/50 italic mt-0.5">
            Runtime advisory trace only. Not Memory. Not evidence. Not prompt authority. No raw content stored.
          </p>
        </div>
        <button
          onClick={() => setOpen(prev => !prev)}
          className="font-mono text-[9px] text-text-muted/50 border border-house-border/30 px-2 py-0.5 rounded hover:border-house-border/60 transition-colors shrink-0 ml-4"
        >
          {open ? 'collapse' : 'expand'}
        </button>
      </div>

      {open && (
        <div className="mt-3">
          {/* Filters */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <select
              value={presenceFilter}
              onChange={e => setPresenceFilter(e.target.value)}
              className="font-mono text-[8px] text-text-secondary/70 bg-house-bg border border-house-border/40 rounded px-2 py-0.5 outline-none"
            >
              <option value="">All presences</option>
              <option value="ari">Ari</option>
              <option value="eli">Eli</option>
            </select>
            <select
              value={routeFilter}
              onChange={e => setRouteFilter(e.target.value)}
              className="font-mono text-[8px] text-text-secondary/70 bg-house-bg border border-house-border/40 rounded px-2 py-0.5 outline-none"
            >
              <option value="">All routes</option>
              <option value="ari_chat">ari_chat</option>
              <option value="eli_chat">eli_chat</option>
              <option value="lounge_chat">lounge_chat</option>
            </select>
            <button
              onClick={loadTraces}
              className="font-mono text-[8px] text-text-muted/50 border border-house-border/30 px-2 py-0.5 rounded hover:border-house-border/60 transition-colors"
            >
              refresh
            </button>
          </div>

          {/* Content */}
          {loading && (
            <p className="font-mono text-[8px] text-text-muted/40 italic py-1">Loading traces…</p>
          )}

          {!loading && traces.length === 0 && (
            <p className="font-mono text-[8px] text-text-muted/40 italic py-1">
              No traces yet. Traces appear after Ari/Eli/Lounge chat responses.
            </p>
          )}

          {!loading && traces.length > 0 && (
            <div className="space-y-1.5">
              {traces.map(trace => (
                <TraceCard key={trace.id} trace={trace} />
              ))}
            </div>
          )}

          {/* Boundary footer */}
          <div className="mt-3 pt-2 border-t border-house-border/15">
            <p className="font-mono text-[7px] text-text-muted/35 italic">
              Runtime advisory trace only. Not Memory. Not evidence. Not prompt authority.
              No raw content stored. Do not use as recall source or prompt grounding.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
