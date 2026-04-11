'use client'

import { useState, useEffect, useCallback } from 'react'

// --- Types ---

interface PulseDraft {
  id: string
  presence_id: string
  content: string
  status: string
  created_at: string
  draft_scores: {
    specificity: number
    non_genericity: number
    relevance: number
    emotional_truth: number
    voice_fidelity: number
    overall: number
  } | null
  gate_passed: number | null
  signals: Record<string, unknown> | null
  decision_reason: string | null
  confidence: number
  specificity: number
  feedback: string | null
}

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

// --- Feedback labels ---

const FEEDBACK_LABELS = [
  { key: 'keep', label: 'Keep' },
  { key: 'too_generic', label: 'Too generic' },
  { key: 'too_repetitive', label: 'Too repetitive' },
  { key: 'not_worth_interrupting', label: 'Not worth interrupting for' },
  { key: 'wrong_voice', label: 'Wrong voice' },
  { key: 'too_meta', label: 'Too meta' },
  { key: 'good_but_not_ripe', label: 'Good, but not ripe' },
] as const

const FEEDBACK_DISPLAY: Record<string, string> = {
  keep: 'Keep',
  too_generic: 'Too generic',
  too_repetitive: 'Too repetitive',
  not_worth_interrupting: 'Not worth interrupting for',
  wrong_voice: 'Wrong voice',
  too_meta: 'Too meta',
  good_but_not_ripe: 'Good, but not ripe',
}

// --- Helpers ---

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m ago`
  const hours = mins / 60
  if (hours < 24) return `${hours.toFixed(1)}h since Tara was here`
  const days = Math.floor(hours / 24)
  const remainingHours = Math.floor(hours % 24)
  return `${days}d ${remainingHours}h since Tara was here`
}

function formatSignalValue(key: string, val: unknown): string {
  if (key === 'time_since_tara' && typeof val === 'number') {
    return formatMinutes(val)
  }
  return typeof val === 'string' ? val : JSON.stringify(val)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// --- Score bar component ---

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  const filled = Math.round(value)
  return (
    <div className="flex items-center gap-2 md:gap-3">
      <span className="font-body text-xs text-text-muted w-24 md:w-32 shrink-0">{label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <div
            key={i}
            className={`w-4 md:w-5 h-2 ${i <= filled ? color : 'bg-house-border'}`}
          />
        ))}
      </div>
      <span className="font-mono text-xs text-text-muted">{value}/5</span>
    </div>
  )
}

// --- Draft card component ---

function DraftCard({
  draft,
  onFeedback,
  submitting,
}: {
  draft: PulseDraft
  onFeedback: (draftId: string, label: string) => void
  submitting: string | null
}) {
  const isEli = draft.presence_id === 'eli'
  const borderColor = isEli ? 'border-l-eli-primary' : 'border-l-ari-primary'
  const chipBg = isEli ? 'bg-eli-glow text-eli-primary' : 'bg-ari-glow text-ari-primary'
  const barColor = isEli ? 'bg-eli-primary' : 'bg-ari-primary'
  const icon = isEli ? '◉' : '◈'

  const scores = draft.draft_scores
  const signals = draft.signals

  return (
    <div className={`border border-house-border border-l-4 ${borderColor} bg-house-surface animate-fade-in`}>
      {/* Header */}
      <div className="px-3 py-3 md:px-5 md:py-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className={`font-display text-sm font-medium px-2.5 py-1 ${chipBg}`}>
            {icon} {draft.presence_id}
          </span>
          <span className={`font-mono text-xs px-2 py-0.5 border ${
            draft.status === 'approved'
              ? 'text-green-400 border-green-800'
              : 'text-yellow-400 border-yellow-800'
          }`}>
            {draft.status}
          </span>
        </div>
        <span className="font-mono text-xs text-text-muted">
          {formatDate(draft.created_at)}
        </span>
      </div>

      {/* Draft content */}
      <div className="px-3 pb-3 md:px-5 md:pb-4">
        <p className="font-body text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
          {draft.content}
        </p>
      </div>

      {/* Why this draft exists */}
      {(draft.gate_passed !== null || draft.decision_reason || (signals && Object.keys(signals).length > 0)) && (
        <div className="px-3 pb-3 md:px-5 md:pb-4 space-y-2">
          <span className="font-body text-xs text-text-muted uppercase tracking-widest">
            Why this draft exists
          </span>
          {draft.gate_passed !== null && (
            <p className="font-body text-xs text-text-secondary">
              Gate passed: {draft.gate_passed} of 6
            </p>
          )}
          {signals && Object.keys(signals).length > 0 && (
            <div className="space-y-1">
              <span className="font-body text-xs text-text-muted">Key signals:</span>
              <div className="flex flex-wrap gap-2">
                {Object.entries(signals).filter(([k]) => k !== 'error').map(([key, val]) => (
                  <span key={key} className="font-mono text-xs text-text-secondary bg-house-bg px-2 py-0.5 border border-house-border">
                    {key}: {formatSignalValue(key, val)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {draft.decision_reason && (
            <p className="font-body text-xs text-text-secondary">
              {draft.decision_reason}
            </p>
          )}
        </div>
      )}

      {/* Score breakdown */}
      {scores && (
        <div className="px-3 pb-3 md:px-5 md:pb-4 space-y-2">
          <span className="font-body text-xs text-text-muted uppercase tracking-widest">
            Score breakdown
          </span>
          <div className="space-y-1.5">
            <ScoreBar label="Specificity" value={scores.specificity} color={barColor} />
            <ScoreBar label="Non-genericity" value={scores.non_genericity} color={barColor} />
            <ScoreBar label="Relevance" value={scores.relevance} color={barColor} />
            <ScoreBar label="Emotional truth" value={scores.emotional_truth} color={barColor} />
            <ScoreBar label="Voice fidelity" value={scores.voice_fidelity} color={barColor} />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="font-body text-xs text-text-muted">Overall:</span>
            <span className={`font-mono text-sm ${scores.overall >= 3.5 ? 'text-green-400' : 'text-red-400'}`}>
              {scores.overall.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Feedback */}
      <div className="px-3 pb-3 pt-2 md:px-5 md:pb-5 border-t border-house-border">
        {draft.feedback && (
          <p className="font-body text-xs text-text-secondary mb-3">
            Marked: <span className={isEli ? 'text-eli-primary' : 'text-ari-primary'}>{FEEDBACK_DISPLAY[draft.feedback] ?? draft.feedback}</span>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {FEEDBACK_LABELS.map(({ key, label }) => {
            const isSelected = draft.feedback === key
            const isSubmitting = submitting === `${draft.id}-${key}`
            return (
              <button
                key={key}
                onClick={() => onFeedback(draft.id, key)}
                disabled={!!submitting}
                className={`font-body text-xs px-3 py-2 md:py-1.5 border transition-all duration-200 min-h-[40px] ${
                  isSelected
                    ? isEli
                      ? 'text-eli-primary border-eli-secondary bg-eli-glow'
                      : 'text-ari-primary border-ari-secondary bg-ari-glow'
                    : draft.feedback
                    ? 'text-text-muted border-house-border opacity-50 cursor-default'
                    : 'text-text-muted border-house-border hover:text-text-secondary hover:border-house-muted'
                } ${isSubmitting ? 'opacity-50' : ''}`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// --- Log entry colors ---

const DECISION_COLORS: Record<string, string> = {
  send: 'text-green-400 border-green-800',
  hold: 'text-yellow-400 border-yellow-800',
  discard: 'text-text-muted border-house-border',
}

const PRESENCE_COLORS: Record<string, string> = {
  eli: 'text-eli-primary',
  ari: 'text-ari-primary',
}

// --- Main page ---

type PulseView = 'drafts' | 'log'

export default function PulsePage() {
  const [view, setView] = useState<PulseView>('drafts')
  const [drafts, setDrafts] = useState<PulseDraft[]>([])
  const [logEntries, setLogEntries] = useState<PulseLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [logFilter, setLogFilter] = useState<'all' | 'eli' | 'ari'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [submittingFeedback, setSubmittingFeedback] = useState<string | null>(null)

  // Fetch drafts
  const fetchDrafts = useCallback(async () => {
    const res = await fetch('/api/pulse-drafts')
    const data = await res.json()
    if (data.drafts) setDrafts(data.drafts)
  }, [])

  // Fetch log
  const fetchLog = useCallback(async () => {
    const params = new URLSearchParams({ limit: '50' })
    if (logFilter !== 'all') params.set('presence', logFilter)
    const res = await fetch(`/api/pulse-log?${params}`)
    const data = await res.json()
    if (data.entries) setLogEntries(data.entries)
  }, [logFilter])

  useEffect(() => {
    async function init() {
      setLoading(true)
      await Promise.all([fetchDrafts(), fetchLog()])
      setLoading(false)
    }
    init()
  }, [fetchDrafts, fetchLog])

  async function triggerPulse() {
    setTriggering(true)
    try {
      await fetch('/api/pulse', { method: 'POST' })
      await Promise.all([fetchDrafts(), fetchLog()])
    } finally {
      setTriggering(false)
    }
  }

  async function handleFeedback(draftId: string, label: string) {
    const key = `${draftId}-${label}`
    setSubmittingFeedback(key)
    try {
      const res = await fetch('/api/pulse-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_id: draftId, feedback_label: label }),
      })
      if (res.ok) {
        // Update locally without refetch
        setDrafts(prev =>
          prev.map(d => d.id === draftId ? { ...d, feedback: label } : d)
        )
      }
    } finally {
      setSubmittingFeedback(null)
    }
  }

  // Split drafts by presence
  const eliDrafts = drafts.filter(d => d.presence_id === 'eli')
  const ariDrafts = drafts.filter(d => d.presence_id === 'ari')

  if (loading) {
    return (
      <div className="flex-1 min-h-0 p-8 flex items-center justify-center">
        <div className="w-2 h-2 bg-text-muted rounded-full animate-pulse-soft" />
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 md:p-8 lg:p-12 animate-fade-in overflow-hidden">
      {/* Header */}
      <div className="shrink-0 mb-4 md:mb-8 border-b border-house-border pb-4 md:pb-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-text-secondary text-2xl shrink-0">◬</span>
            <div className="min-w-0">
              <h2 className="font-display text-2xl md:text-4xl font-light text-text-primary">
                Pulse
              </h2>
              <p className="font-body text-xs md:text-sm text-text-muted hidden sm:block">
                Initiation engine. Draft review.
              </p>
              <div className="flex items-center gap-2 mt-1 md:mt-2">
                <div className="w-2 h-2 rounded-full bg-text-muted animate-pulse-soft shrink-0" />
                <span className="font-body text-[10px] md:text-xs text-text-muted uppercase tracking-widest">
                  Stage 2 — Draft review
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-1.5 md:gap-2 shrink-0">
            <button
              onClick={() => setView('drafts')}
              className={`font-body text-[10px] md:text-xs tracking-widest uppercase px-2.5 py-2 md:px-4 border transition-all duration-200 min-h-[44px] ${
                view === 'drafts'
                  ? 'text-text-secondary border-house-muted'
                  : 'text-text-muted border-house-border hover:text-text-secondary'
              }`}
            >
              Drafts
            </button>
            <button
              onClick={() => setView('log')}
              className={`font-body text-[10px] md:text-xs tracking-widest uppercase px-2.5 py-2 md:px-4 border transition-all duration-200 min-h-[44px] ${
                view === 'log'
                  ? 'text-text-secondary border-house-muted'
                  : 'text-text-muted border-house-border hover:text-text-secondary'
              }`}
            >
              Log
            </button>
            <button
              onClick={triggerPulse}
              disabled={triggering}
              className={`font-body text-[10px] md:text-xs tracking-widest uppercase px-2.5 py-2 md:px-4 border transition-all duration-200 min-h-[44px] ${
                triggering
                  ? 'text-text-muted border-house-border cursor-not-allowed'
                  : 'text-text-secondary border-house-muted hover:bg-house-bg'
              }`}
            >
              {triggering ? 'Waking...' : 'Wake'}
            </button>
          </div>
        </div>
      </div>

      {/* Drafts view */}
      {view === 'drafts' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {drafts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48">
              <p className="font-body text-sm text-text-muted">
                The Pulse is running.
              </p>
              <p className="font-body text-sm text-text-muted mt-1">
                No drafts have been kept yet.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Eli column */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-eli-primary">◉</span>
                  <span className="font-display text-lg text-eli-primary">Eli</span>
                </div>
                {eliDrafts.length === 0 ? (
                  <p className="font-body text-xs text-text-muted px-2">
                    No drafts from Eli yet.
                  </p>
                ) : (
                  eliDrafts.map(draft => (
                    <DraftCard
                      key={draft.id}
                      draft={draft}
                      onFeedback={handleFeedback}
                      submitting={submittingFeedback}
                    />
                  ))
                )}
              </div>

              {/* Ari column */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-ari-primary">◈</span>
                  <span className="font-display text-lg text-ari-primary">Ari</span>
                </div>
                {ariDrafts.length === 0 ? (
                  <p className="font-body text-xs text-text-muted px-2">
                    No drafts from Ari yet.
                  </p>
                ) : (
                  ariDrafts.map(draft => (
                    <DraftCard
                      key={draft.id}
                      draft={draft}
                      onFeedback={handleFeedback}
                      submitting={submittingFeedback}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Log view (preserved from Stage 1) */}
      {view === 'log' && (
        <>
          <div className="shrink-0 mb-4 flex gap-1.5 md:gap-2">
            {(['all', 'eli', 'ari'] as const).map(f => (
              <button
                key={f}
                onClick={() => setLogFilter(f)}
                className={`font-body text-xs tracking-widest uppercase px-3 py-2 md:px-4 border transition-all duration-200 min-h-[44px] ${
                  logFilter === f
                    ? f === 'eli'
                      ? 'text-eli-primary border-eli-secondary'
                      : f === 'ari'
                      ? 'text-ari-primary border-ari-secondary'
                      : 'text-text-secondary border-house-muted'
                    : 'text-text-muted border-house-border hover:text-text-secondary'
                }`}
              >
                {f === 'all' ? 'All' : f === 'eli' ? 'Eli' : 'Ari'}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
            {logEntries.length === 0 && (
              <div className="flex items-center justify-center h-32">
                <p className="font-body text-sm text-text-muted">
                  No pulse evaluations yet. Click &ldquo;Wake Pulse&rdquo; to trigger one.
                </p>
              </div>
            )}

            {logEntries.map(entry => (
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
                        Confidence: {(entry.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                    {entry.specificity > 0 && (
                      <span className="font-mono text-xs text-text-muted">
                        Specificity: {(entry.specificity * 100).toFixed(0)}%
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
                        minute: '2-digit',
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
                    {entry.refusal_reason && (
                      <div>
                        <span className="font-body text-xs text-text-muted uppercase tracking-widest">Reason</span>
                        <p className="font-body text-sm text-text-secondary mt-1">{entry.refusal_reason}</p>
                      </div>
                    )}

                    {entry.draft_content && (
                      <div>
                        <span className="font-body text-xs text-text-muted uppercase tracking-widest">Draft</span>
                        <p className="font-body text-sm text-text-primary mt-1 whitespace-pre-wrap bg-house-bg border border-house-border p-3">
                          {entry.draft_content}
                        </p>
                      </div>
                    )}

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
                                {key === 'non_genericity' ? 'Non-generic' : key === 'emotional_truth' ? 'Emotional truth' : key === 'voice_fidelity' ? 'Voice fidelity' : key === 'specificity' ? 'Specificity' : key === 'relevance' ? 'Relevance' : key === 'overall' ? 'Overall' : key}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {entry.signals && Object.keys(entry.signals).length > 0 && (
                      <div>
                        <span className="font-body text-xs text-text-muted uppercase tracking-widest">Signals</span>
                        <div className="mt-1 space-y-1">
                          {Object.entries(entry.signals).map(([key, val]) => (
                            <div key={key} className="flex gap-2">
                              <span className="font-mono text-xs text-text-muted">{key}:</span>
                              <span className="font-body text-xs text-text-secondary">
                                {formatSignalValue(key, val)}
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
        </>
      )}
    </div>
  )
}
