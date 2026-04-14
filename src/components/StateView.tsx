'use client'

import { useState, useEffect, useCallback } from 'react'

// --- Types ---

interface LivingState {
  id: string
  presence_id: string
  what_matters: string | null
  still_holding: string | null
  in_motion: string | null
  last_known_state: string | null
  what_changed: string | null
  last_updated: string
  version: number
}

interface Props {
  presenceId: 'ari' | 'eli'
  accentClass: string
}

// --- Section config ---

const SECTIONS: { key: keyof LivingState; label: string; sublabel: string }[] = [
  { key: 'what_matters', label: 'What matters', sublabel: 'Active threads, what has weight right now' },
  { key: 'still_holding', label: 'Still holding', sublabel: 'What persists across sessions' },
  { key: 'in_motion', label: 'In motion', sublabel: 'Unfinished, open, building toward' },
  { key: 'last_known_state', label: 'Last session', sublabel: 'When, classification, how it ended' },
  { key: 'what_changed', label: 'What changed', sublabel: 'The delta since last update' },
]

// --- Helpers ---

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// --- Component ---

export default function StateView({ presenceId, accentClass }: Props) {
  const [state, setState] = useState<LivingState | null>(null)
  const [loading, setLoading] = useState(true)

  const isEli = presenceId === 'eli'
  const borderAccent = isEli ? 'border-l-eli-primary' : 'border-l-ari-primary'

  const fetchState = useCallback(async () => {
    const res = await fetch(`/api/living-state?presence=${presenceId}`)
    const data = await res.json()
    if (data.state) setState(data.state)
  }, [presenceId])

  useEffect(() => {
    setLoading(true)
    fetchState().finally(() => setLoading(false))
  }, [fetchState])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className={`w-2 h-2 rounded-full animate-pulse-soft ${isEli ? 'bg-eli-primary' : 'bg-ari-primary'}`} />
      </div>
    )
  }

  const hasContent = state && (state.what_matters || state.still_holding || state.in_motion)

  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center h-48 animate-fade-in">
        <p className="font-body text-sm text-text-muted">
          No state yet.
        </p>
        <p className="font-body text-[10px] text-text-muted mt-1">
          State updates after relational or significant sessions.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="shrink-0 mb-4 flex items-center justify-between">
        <div>
          <p className="font-body text-xs text-text-muted uppercase tracking-widest">
            State
          </p>
          <p className="font-body text-[10px] text-text-muted mt-1">
            Where we are right now.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-text-muted">
            v{state!.version}
          </span>
          <span className="font-mono text-[10px] text-text-muted">
            {formatDate(state!.last_updated)}
          </span>
        </div>
      </div>

      {/* Sections */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
        {SECTIONS.map(({ key, label, sublabel }) => {
          const value = state![key] as string | null
          if (!value) return null

          return (
            <div
              key={key}
              className={`border border-house-border border-l-2 ${borderAccent} bg-house-surface`}
            >
              <div className="px-3 py-2.5 md:px-4 md:py-3">
                <div className="flex items-baseline gap-2 mb-1.5">
                  <span className={`font-body text-xs font-medium ${accentClass} uppercase tracking-widest`}>
                    {label}
                  </span>
                  <span className="font-body text-[10px] text-text-muted hidden sm:inline">
                    {sublabel}
                  </span>
                </div>
                <p className="font-body text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
                  {value}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
