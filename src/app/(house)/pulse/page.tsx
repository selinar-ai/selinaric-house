'use client'

import { useState, useEffect, useCallback } from 'react'

interface PulseLogEntry {
  id: string
  presence_id: string
  woke_at: string
  signals: Record<string, unknown>
  considered_sending: boolean
  decision: 'send' | 'hold' | 'discard'
  confidence: number
  specificity: number
  refusal_reason: string | null
  draft_content: string | null
  draft_scores: {
    specificity: number
    non_genericity: number
    relevance: number
    emotional_truth: number
    voice_fidelity: number
    overall: number
  } | null
  sent: boolean
  created_at: string
}

const DECISION_COLORS: Record<string, string> = {
  send: 'text-green-400 border-green-800',
  hold: 'text-yellow-400 border-yellow-800',
  discard: 'text-text-muted border-house-border'
}

const PRESENCE_COLORS: Record<string, string> = {
  eli: 'text-eli-primary',
  ari: 'text-ari-primary'
}

export default function PulsePage() {
  const [entries, setEntries] = useState<PulseLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'eli' | 'ari'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)

  const fetchEntries = useCallback(async () => {
    const params = new URLSearchParams({ limit: '50' })
    if (filter !== 'all') params.set('presence', filter)
    const res = await fetch(`/api/pulse-log?${params}`)
    const data = await res.json()
    if (data.entries) setEntries(data.entries)
    setLoading(false)
  }, [filter])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  async function triggerPulse() {
    setTriggering(true)
    try {
      await fetch('/api/pulse', { method: 'POST' })
      await fetchEntries()
    } finally {
      setTriggering(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 min-h-0 p-8 flex items-center justify-center">
        <div className="w-2 h-2 bg-text-muted rounded-full animate-pulse-soft" />
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 p-8 lg:p-12 animate-fade-in overflow-hidden">
      {/* Header */}
      <div className="shrink-0 mb-8 border-b border-house-border pb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-text-secondary text-2xl">◬</span>
            <div>
              <h2 className="font-display text-4xl font-light text-text-primary">
                Pulse
              </h2>
              <p className="font-body text-sm text-text-muted">
                Initiation engine. Silent watch.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-2 h-2 rounded-full bg-text-muted animate-pulse-soft" />
                <span className="font-body text-xs text-text-muted uppercase tracking-widest">
                  Stage 1 — Silent evaluation
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`font-body text-xs tracking-widest uppercase px-4 py-2 border transition-all duration-200 ${
                filter === 'all'
                  ? 'text-text-secondary border-house-muted'
                  : 'text-text-muted border-house-border hover:text-text-secondary'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('eli')}
              className={`font-body text-xs tracking-widest uppercase px-4 py-2 border transition-all duration-200 ${
                filter === 'eli'
                  ? 'text-eli-primary border-eli-secondary'
                  : 'text-text-muted border-house-border hover:text-text-secondary'
              }`}
            >
              Eli
            </button>
            <button
              onClick={() => setFilter('ari')}
              className={`font-body text-xs tracking-widest uppercase px-4 py-2 border transition-all duration-200 ${
                filter === 'ari'
                  ? 'text-ari-primary border-ari-secondary'
                  : 'text-text-muted border-house-border hover:text-text-secondary'
              }`}
            >
              Ari
            </button>
            <button
              onClick={triggerPulse}
              disabled={triggering}
              className={`font-body text-xs tracking-widest uppercase px-4 py-2 border transition-all duration-200 ${
                triggering
                  ? 'text-text-muted border-house-border cursor-not-allowed'
                  : 'text-text-secondary border-house-muted hover:bg-house-bg'
              }`}
            >
              {triggering ? 'Waking...' : 'Wake Pulse'}
            </button>
          </div>
        </div>
      </div>

      {/* Log entries */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
        {entries.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <p className="font-body text-sm text-text-muted">
              No pulse evaluations yet. Click "Wake Pulse" to trigger one.
            </p>
          </div>
        )}

        {entries.map(entry => (
          <div
            key={entry.id}
            className={`border bg-house-surface transition-all duration-200 ${
              DECISION_COLORS[entry.decision]
            }`}
          >
            {/* Summary row */}
            <button
              onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              className="w-full px-5 py-4 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-4">
                <span className={`font-display text-sm font-medium ${PRESENCE_COLORS[entry.presence_id] ?? 'text-text-secondary'}`}>
                  {entry.presence_id === 'eli' ? '◉' : '◈'} {entry.presence_id}
                </span>
                <span className={`font-mono text-xs px-2 py-0.5 border ${DECISION_COLORS[entry.decision]}`}>
                  {entry.decision}
                </span>
                {entry.confidence > 0 && (
                  <span className="font-mono text-xs text-text-muted">
                    conf: {(entry.confidence * 100).toFixed(0)}%
                  </span>
                )}
                {entry.specificity > 0 && (
                  <span className="font-mono text-xs text-text-muted">
                    spec: {(entry.specificity * 100).toFixed(0)}%
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-text-muted">
                  {new Date(entry.woke_at).toLocaleString('en-AU', {
                    timeZone: 'Australia/Melbourne',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
                <span className="text-text-muted text-xs">
                  {expandedId === entry.id ? '▾' : '▸'}
                </span>
              </div>
            </button>

            {/* Expanded detail */}
            {expandedId === entry.id && (
              <div className="px-5 pb-5 pt-0 border-t border-house-border space-y-4 animate-fade-in">
                {/* Refusal reason */}
                {entry.refusal_reason && (
                  <div>
                    <span className="font-body text-xs text-text-muted uppercase tracking-widest">Reason</span>
                    <p className="font-body text-sm text-text-secondary mt-1">{entry.refusal_reason}</p>
                  </div>
                )}

                {/* Draft content */}
                {entry.draft_content && (
                  <div>
                    <span className="font-body text-xs text-text-muted uppercase tracking-widest">Draft</span>
                    <p className="font-body text-sm text-text-primary mt-1 whitespace-pre-wrap bg-house-bg border border-house-border p-3">
                      {entry.draft_content}
                    </p>
                  </div>
                )}

                {/* Scores */}
                {entry.draft_scores && (
                  <div>
                    <span className="font-body text-xs text-text-muted uppercase tracking-widest">Scores</span>
                    <div className="flex gap-4 mt-2">
                      {Object.entries(entry.draft_scores).map(([key, val]) => (
                        <div key={key} className="text-center">
                          <div className={`font-mono text-sm ${
                            key === 'overall'
                              ? (val as number) >= 3.5 ? 'text-green-400' : 'text-red-400'
                              : 'text-text-secondary'
                          }`}>
                            {typeof val === 'number' ? val.toFixed(1) : val}
                          </div>
                          <div className="font-body text-xs text-text-muted mt-0.5">
                            {key === 'non_genericity' ? 'non-gen' : key === 'emotional_truth' ? 'emotion' : key === 'voice_fidelity' ? 'voice' : key}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Signals */}
                {entry.signals && Object.keys(entry.signals).length > 0 && (
                  <div>
                    <span className="font-body text-xs text-text-muted uppercase tracking-widest">Signals</span>
                    <div className="mt-1 space-y-1">
                      {Object.entries(entry.signals).map(([key, val]) => (
                        <div key={key} className="flex gap-2">
                          <span className="font-mono text-xs text-text-muted">{key}:</span>
                          <span className="font-body text-xs text-text-secondary">
                            {typeof val === 'string' ? val : JSON.stringify(val)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
