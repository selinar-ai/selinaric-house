'use client'

// Phase 24C — Calibration summary block for /reflections.
// Collapsible. Shows: total reviewed, useful %, top miss label, by-type breakdown.
// Fetches from GET /api/reflection-calibration?presenceId=...

import { useState, useEffect, useCallback } from 'react'
import type { CalibrationSummary, LabelCounts } from '@/lib/reflections/calibration-types'

const LABEL_DISPLAY: Record<string, string> = {
  useful:              'Useful',
  too_vague:           'Too vague',
  wrong_lane:          'Wrong lane',
  not_worth_carrying:  'Not worth carrying',
  good_but_early:      'Good but early',
}

const TYPE_DISPLAY: Record<string, string> = {
  pattern:      'Pattern',
  lesson:       'Lesson',
  tension:      'Tension',
  model_update: 'Model update',
}

function pct(n: number, total: number): string {
  if (total === 0) return '—'
  return `${Math.round((n / total) * 100)}%`
}

function topMissLabel(labels: LabelCounts, usefulCount: number): string | null {
  const miss = (Object.entries(labels) as [string, number][])
    .filter(([k]) => k !== 'useful')
    .sort((a, b) => b[1] - a[1])
  if (!miss.length || miss[0][1] === 0) return null
  // Only surface miss if it's >= 20% of reviewed
  const total = Object.values(labels).reduce((s, v) => s + v, 0)
  if (total === 0) return null
  if (miss[0][1] / total < 0.2) return null
  return LABEL_DISPLAY[miss[0][0]] ?? miss[0][0]
}

interface Props {
  presenceId: 'ari' | 'eli'
}

export default function ReflectionCalibrationSummary({ presenceId }: Props) {
  const [open, setOpen]           = useState(false)
  const [summary, setSummary]     = useState<CalibrationSummary | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const fetch_ = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/reflection-calibration?presenceId=${presenceId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setSummary(data as CalibrationSummary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calibration')
    } finally {
      setLoading(false)
    }
  }, [presenceId])

  // Refetch when presenceId changes
  useEffect(() => {
    setSummary(null)
    if (open) fetch_()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenceId])

  function handleToggle() {
    const next = !open
    setOpen(next)
    if (next && !summary && !loading) fetch_()
  }

  const accentClass = presenceId === 'eli' ? 'text-eli-primary' : 'text-ari-primary'

  return (
    <div className="border-b border-house-border">
      {/* Toggle row */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-house-surface/40 transition-colors"
      >
        <span className="font-mono text-[10px] text-text-muted">{open ? '▾' : '▸'}</span>
        <span className="font-body text-xs text-text-muted tracking-widest uppercase">
          Calibration
        </span>
        {summary && summary.reviewedCount > 0 && !open && (
          <span className="font-body text-[10px] text-text-muted ml-1">
            {summary.reviewedCount} reviewed · {pct(summary.labels.useful, summary.reviewedCount)} useful
          </span>
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {loading && (
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" />
              <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.2s' }} />
              <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.4s' }} />
            </div>
          )}

          {error && (
            <p className="font-body text-xs text-red-400">{error}</p>
          )}

          {!loading && !error && summary && (
            <>
              {summary.reviewedCount === 0 ? (
                <p className="font-body text-xs text-text-muted">No reviewed reflections yet.</p>
              ) : (
                <>
                  {/* Overview row */}
                  <div className="flex flex-wrap gap-x-5 gap-y-1">
                    <div>
                      <span className="font-body text-[10px] text-text-muted uppercase tracking-widest">Reviewed</span>
                      <p className="font-mono text-sm text-text-primary">{summary.reviewedCount}</p>
                    </div>
                    <div>
                      <span className="font-body text-[10px] text-text-muted uppercase tracking-widest">Useful</span>
                      <p className={`font-mono text-sm ${accentClass}`}>
                        {pct(summary.labels.useful, summary.reviewedCount)}
                      </p>
                    </div>
                    {topMissLabel(summary.labels, summary.labels.useful) && (
                      <div>
                        <span className="font-body text-[10px] text-text-muted uppercase tracking-widest">Top miss</span>
                        <p className="font-mono text-sm text-text-secondary">
                          {topMissLabel(summary.labels, summary.labels.useful)}
                        </p>
                      </div>
                    )}
                    <div>
                      <span className="font-body text-[10px] text-text-muted uppercase tracking-widest">Total</span>
                      <p className="font-mono text-sm text-text-muted">{summary.totalReflections}</p>
                    </div>
                  </div>

                  {/* By-type breakdown */}
                  {Object.keys(summary.byType).length > 0 && (
                    <div>
                      <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-1.5">
                        By type
                      </p>
                      <div className="space-y-1">
                        {(Object.entries(summary.byType) as [string, LabelCounts][]).map(([type, counts]) => {
                          const total = Object.values(counts).reduce((s, v) => s + v, 0)
                          if (total === 0) return null
                          return (
                            <div key={type} className="flex items-center gap-3">
                              <span className="font-body text-xs text-text-muted w-24 shrink-0">
                                {TYPE_DISPLAY[type] ?? type}
                              </span>
                              <div className="flex gap-1 flex-1 min-w-0">
                                {(Object.entries(counts) as [string, number][])
                                  .filter(([, v]) => v > 0)
                                  .map(([label, count]) => (
                                    <span
                                      key={label}
                                      title={`${LABEL_DISPLAY[label] ?? label}: ${count}`}
                                      className={`font-mono text-[10px] px-1 py-0.5 border border-house-border ${
                                        label === 'useful' ? accentClass : 'text-text-muted'
                                      }`}
                                    >
                                      {count}
                                    </span>
                                  ))}
                              </div>
                              <span className="font-body text-[10px] text-text-muted shrink-0">
                                {pct(counts.useful, total)} useful
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Label legend */}
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 pt-1 border-t border-house-border/50">
                    {(Object.entries(summary.labels) as [string, number][]).map(([label, count]) => (
                      <span key={label} className="font-body text-[10px] text-text-muted">
                        <span className={label === 'useful' ? accentClass : ''}>
                          {count}
                        </span>
                        {' '}{LABEL_DISPLAY[label] ?? label}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
