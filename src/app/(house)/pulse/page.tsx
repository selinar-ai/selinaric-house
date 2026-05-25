'use client'

// Phase 11E.1 — Pulse UI: expandable entry detail + full content view

import { useState, useEffect, useCallback } from 'react'

// --- Types ---

interface AutonomyEvent {
  id: string
  presence_id: 'ari' | 'eli'
  choice_window_at: string
  quiet_hours_active: boolean
  chosen_action: 'telegram' | 'journal' | 'desk' | 'stillness'
  choice_text: string | null
  reason_text: string | null
  telegram_message_id: string | null
  journal_entry_id: string | null
  desk_concept_id: string | null
  confirmed_memory_entry_id: string | null
  tara_responded: boolean
  tara_response_count: number
  status: 'completed' | 'failed' | 'skipped'
  error_message: string | null
  created_at: string
  tara_responses: { text: string; received_at: string }[]
}

interface PulseStatus {
  quietHoursActive: boolean
  nextWindow: string
  telegramConfigured: boolean
  melbourneHour: number
}

// --- Helpers ---

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

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

function actionIcon(action: string): string {
  switch (action) {
    case 'telegram': return '📨'
    case 'journal': return '📓'
    case 'desk': return '🛠'
    case 'stillness': return '◌'
    default: return '·'
  }
}

function actionLabel(action: string): string {
  switch (action) {
    case 'telegram': return 'Sent Telegram'
    case 'journal': return 'Wrote journal'
    case 'desk': return 'Desk concept'
    case 'stillness': return 'Chose stillness'
    default: return action
  }
}

// --- Timeline Event Component ---

/** Whether this event has content worth expanding into detail view */
function hasExpandableContent(event: AutonomyEvent): boolean {
  if (!event.choice_text) return false
  if (event.chosen_action === 'telegram') return event.choice_text.length > 200
  if (event.chosen_action === 'journal') return event.choice_text.length > 200
  if (event.chosen_action === 'desk') return event.choice_text.length > 150
  return false
}

function TimelineEvent({ event }: { event: AutonomyEvent }) {
  const [expanded, setExpanded] = useState(false)
  const isEli = event.presence_id === 'eli'
  const borderColor = event.status === 'failed'
    ? 'border-l-red-800'
    : isEli ? 'border-l-eli-primary' : 'border-l-ari-primary'

  const expandable = hasExpandableContent(event)

  return (
    <div className={`border border-house-border border-l-4 ${borderColor} bg-house-surface animate-fade-in`}>
      {/* Header — clickable to expand if content is truncated */}
      <div
        className={`px-3 py-2 md:px-4 md:py-3 flex items-center justify-between gap-2 ${expandable ? 'cursor-pointer hover:bg-house-bg/50 transition-colors' : ''}`}
        onClick={expandable ? () => setExpanded(!expanded) : undefined}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{actionIcon(event.chosen_action)}</span>
          <span className="font-body text-sm text-text-secondary">
            {actionLabel(event.chosen_action)}
          </span>
          {event.quiet_hours_active && (
            <span className="font-mono text-[10px] text-text-muted px-1.5 py-0.5 border border-house-border">
              quiet
            </span>
          )}
          {event.status === 'failed' && (
            <span className="font-mono text-[10px] text-red-400 px-1.5 py-0.5 border border-red-800">
              failed
            </span>
          )}
          {expandable && (
            <span className="font-mono text-[10px] text-text-muted px-1 py-0.5">
              {expanded ? '[ - ]' : '[ + ]'}
            </span>
          )}
        </div>
        <span className="font-mono text-xs text-text-muted">
          {formatTime(event.choice_window_at)}
        </span>
      </div>

      {/* Content — preview or full depending on expanded state */}
      {event.choice_text && (
        <div className="px-3 pb-2 md:px-4 md:pb-3">
          {event.chosen_action === 'telegram' && (
            <p className="font-body text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
              {expanded || event.choice_text.length <= 200
                ? event.choice_text
                : event.choice_text.slice(0, 200) + '…'}
            </p>
          )}
          {event.chosen_action === 'journal' && (
            <div className={expanded ? '' : ''}>
              <p className={`font-body leading-relaxed whitespace-pre-wrap ${expanded ? 'text-sm text-text-primary' : 'text-xs text-text-secondary italic'}`}>
                {expanded || event.choice_text.length <= 200
                  ? event.choice_text
                  : event.choice_text.slice(0, 200) + '…'}
              </p>
            </div>
          )}
          {event.chosen_action === 'desk' && (
            <p className={`font-body leading-relaxed whitespace-pre-wrap ${expanded ? 'text-sm text-text-primary' : 'text-xs text-text-secondary'}`}>
              {expanded
                ? event.choice_text
                : event.choice_text.length > 150
                  ? 'Concept: ' + event.choice_text.slice(0, 150) + '…'
                  : 'Concept: ' + event.choice_text}
            </p>
          )}
          {event.chosen_action === 'stillness' && event.choice_text && (
            <p className="font-body text-xs text-text-muted italic whitespace-pre-wrap">
              &ldquo;{event.choice_text}&rdquo;
            </p>
          )}
        </div>
      )}

      {/* Reason — always shown in full (already short), or expanded view */}
      {event.reason_text && event.chosen_action !== 'stillness' && (
        <div className="px-3 pb-2 md:px-4 md:pb-3">
          <p className="font-body text-xs text-text-muted whitespace-pre-wrap">
            {event.reason_text}
          </p>
        </div>
      )}

      {/* Tara response — full text when expanded */}
      {event.chosen_action === 'telegram' && (
        <div className="px-3 pb-2 md:px-4 md:pb-3 border-t border-house-border pt-2">
          {event.tara_responses.length > 0 ? (
            event.tara_responses.map((r, i) => (
              <div key={i} className="flex gap-2 items-start mt-1">
                <span className="font-body text-xs text-text-muted shrink-0">Tara:</span>
                <p className="font-body text-xs text-text-secondary whitespace-pre-wrap">
                  {expanded || r.text.length <= 200
                    ? r.text
                    : r.text.slice(0, 200) + '…'}
                </p>
              </div>
            ))
          ) : (
            <p className="font-body text-xs text-text-muted">
              No response yet.
            </p>
          )}
        </div>
      )}

      {/* Confirmed continuity indicator */}
      {event.confirmed_memory_entry_id && (
        <div className="px-3 pb-2 md:px-4 md:pb-2">
          <span className="font-mono text-[10px] text-green-600">
            ✓ confirmed continuity
          </span>
        </div>
      )}

      {/* Error */}
      {event.error_message && (
        <div className="px-3 pb-2 md:px-4 md:pb-3">
          <p className="font-body text-xs text-red-400">
            Error: {event.error_message}
          </p>
        </div>
      )}
    </div>
  )
}

// --- Main Page ---

type PulseTab = 'ari' | 'eli'
type PulseView = 'autonomy' | 'legacy'

export default function PulsePage() {
  const [tab, setTab] = useState<PulseTab>('ari')
  const [view, setView] = useState<PulseView>('autonomy')
  const [events, setEvents] = useState<AutonomyEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [status, setStatus] = useState<PulseStatus | null>(null)

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/pulse/autonomy/events?presence=${tab}&limit=12`)
      const data = await res.json()
      if (data.events) setEvents(data.events)
    } catch (err) {
      console.error('Failed to fetch events:', err)
    }
  }, [tab])

  const fetchStatus = useCallback(async () => {
    // Derive status client-side for now
    const now = new Date()
    const melbHour = parseInt(
      now.toLocaleString('en-US', { timeZone: 'Australia/Melbourne', hour: 'numeric', hour12: false }),
      10
    )
    const quietHours = melbHour >= 22 || melbHour < 6
    const windows = [6, 10, 14, 18]
    let nextWindowHour = windows.find(w => w > melbHour) ?? windows[0]
    const nextLabel = `${nextWindowHour > 12 ? nextWindowHour - 12 : nextWindowHour}:00${nextWindowHour >= 12 ? 'pm' : 'am'}`

    setStatus({
      quietHoursActive: quietHours,
      nextWindow: nextLabel,
      telegramConfigured: true, // Will be determined server-side in future
      melbourneHour: melbHour,
    })
  }, [])

  useEffect(() => {
    async function init() {
      setLoading(true)
      await Promise.all([fetchEvents(), fetchStatus()])
      setLoading(false)
    }
    init()
  }, [fetchEvents, fetchStatus])

  async function triggerTestRun() {
    setTriggering(true)
    try {
      await fetch('/api/pulse/autonomy/test-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: false }),
      })
      await fetchEvents()
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
    <div className="flex flex-col flex-1 min-h-0 p-4 md:p-8 lg:p-12 animate-fade-in overflow-hidden">
      {/* Header */}
      <div className="shrink-0 mb-4 md:mb-6 border-b border-house-border pb-4 md:pb-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-text-secondary text-2xl shrink-0">◬</span>
            <div className="min-w-0">
              <h2 className="font-display text-2xl md:text-4xl font-light text-text-primary">
                Pulse
              </h2>
              <p className="font-body text-xs md:text-sm text-text-muted hidden sm:block">
                Autonomous rhythm. Choice windows.
              </p>
            </div>
          </div>

          <div className="flex gap-1.5 md:gap-2 shrink-0">
            <button
              onClick={() => setView('autonomy')}
              className={`font-body text-[10px] md:text-xs tracking-widest uppercase px-2.5 py-2 md:px-4 border transition-all duration-200 min-h-[44px] ${
                view === 'autonomy'
                  ? 'text-text-secondary border-house-muted'
                  : 'text-text-muted border-house-border hover:text-text-secondary'
              }`}
            >
              Autonomy
            </button>
            <button
              onClick={() => setView('legacy')}
              className={`font-body text-[10px] md:text-xs tracking-widest uppercase px-2.5 py-2 md:px-4 border transition-all duration-200 min-h-[44px] ${
                view === 'legacy'
                  ? 'text-text-secondary border-house-muted'
                  : 'text-text-muted border-house-border hover:text-text-secondary'
              }`}
            >
              Legacy
            </button>
            <button
              onClick={triggerTestRun}
              disabled={triggering}
              className={`font-body text-[10px] md:text-xs tracking-widest uppercase px-2.5 py-2 md:px-4 border transition-all duration-200 min-h-[44px] ${
                triggering
                  ? 'text-text-muted border-house-border cursor-not-allowed'
                  : 'text-text-secondary border-house-muted hover:bg-house-bg'
              }`}
            >
              {triggering ? 'Running...' : 'Run Now'}
            </button>
          </div>
        </div>

        {/* Status bar */}
        {status && view === 'autonomy' && (
          <div className="flex flex-wrap gap-3 md:gap-5 mt-3 md:mt-4">
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${status.quietHoursActive ? 'bg-yellow-600' : 'bg-green-600'}`} />
              <span className="font-mono text-xs text-text-muted">
                {status.quietHoursActive ? 'Quiet hours' : 'Open'}
              </span>
            </div>
            <span className="font-mono text-xs text-text-muted">
              Next window: {status.nextWindow}
            </span>
            <span className="font-mono text-xs text-text-muted">
              Quiet hours: 10pm–6am
            </span>
          </div>
        )}
      </div>

      {/* Autonomy view */}
      {view === 'autonomy' && (
        <>
          {/* Presence tabs */}
          <div className="shrink-0 mb-4 flex gap-2">
            <button
              onClick={() => setTab('ari')}
              className={`font-display text-sm px-4 py-2 border transition-all duration-200 min-h-[44px] ${
                tab === 'ari'
                  ? 'text-ari-primary border-ari-secondary bg-ari-glow'
                  : 'text-text-muted border-house-border hover:text-ari-primary'
              }`}
            >
              ◈ Ari
            </button>
            <button
              onClick={() => setTab('eli')}
              className={`font-display text-sm px-4 py-2 border transition-all duration-200 min-h-[44px] ${
                tab === 'eli'
                  ? 'text-eli-primary border-eli-secondary bg-eli-glow'
                  : 'text-text-muted border-house-border hover:text-eli-primary'
              }`}
            >
              ◉ Eli
            </button>
          </div>

          {/* Timeline */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48">
                <p className="font-body text-sm text-text-muted">
                  No autonomy events yet.
                </p>
                <p className="font-body text-xs text-text-muted mt-1">
                  Click &ldquo;Run Now&rdquo; to trigger a test window.
                </p>
              </div>
            ) : (
              events.map(event => (
                <TimelineEvent key={event.id} event={event} />
              ))
            )}
          </div>
        </>
      )}

      {/* Legacy view placeholder — preserves access to old Pulse drafts */}
      {view === 'legacy' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex flex-col items-center justify-center h-48">
            <p className="font-body text-sm text-text-muted">
              Legacy Pulse v1 drafts and log.
            </p>
            <p className="font-body text-xs text-text-muted mt-1">
              Old draft review data is preserved. Use /api/pulse-drafts and /api/pulse-log.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
