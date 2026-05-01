'use client'

// Recall Review — right-pane event detail
// Fetches event detail from /api/archive-recall/events/[id] when eventId changes.
// Shows: event metadata, returned entries, overall feedback.

import { useState, useEffect } from 'react'
import MatchQualityBadge from '@/components/ui/MatchQualityBadge'
import RecallEntryCard, { type ResolvedEntry } from '@/components/RecallReview/RecallEntryCard'
import { FeedbackSummaryFull, type FeedbackRow } from '@/components/RecallReview/RecallFeedbackSummary'
import type { MatchQuality } from '@/lib/archive-recall'

interface EventDetail {
  id: string
  presence_id: 'ari' | 'eli'
  query: string
  normalised_query: string
  match_quality: MatchQuality
  entries_returned: number
  entry_ids: string[]
  session_id: string | null
  created_at: string
}

interface DetailPayload {
  event: EventDetail
  entries: ResolvedEntry[]
  overall_feedback: FeedbackRow[]
}

interface Props {
  eventId: string | null
}

const PRESENCE_LABEL: Record<string, string> = { ari: 'Ari', eli: 'Eli' }

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 items-baseline">
      <span className="font-body text-[10px] text-text-muted uppercase tracking-widest w-28 shrink-0">
        {label}
      </span>
      <span className="font-body text-xs text-text-secondary flex-1">
        {value}
      </span>
    </div>
  )
}

export default function RecallEventDetail({ eventId }: Props) {
  const [detail, setDetail]   = useState<DetailPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!eventId) { setDetail(null); return }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/archive-recall/events/${eventId}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        if (data.error) { setError(data.error); setDetail(null) }
        else setDetail(data as DetailPayload)
      })
      .catch(() => { if (!cancelled) setError('Failed to load event detail.') })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [eventId])

  if (!eventId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="font-body text-sm text-text-muted italic text-center">
          Select a recall event to inspect.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex gap-1.5">
          {[0, 0.15, 0.3].map((delay, i) => (
            <div key={i} className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: `${delay}s` }} />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 p-6">
        <p className="font-body text-xs text-red-400">{error}</p>
      </div>
    )
  }

  if (!detail) return null

  const { event, entries, overall_feedback } = detail

  const dt = new Date(event.created_at)
  const dateStr = dt.toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">

      {/* ── Event metadata ───────────────────────────────────────── */}
      <div>
        <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-3">
          Event
        </p>
        <div className="space-y-1.5">
          <MetaRow label="Presence"      value={PRESENCE_LABEL[event.presence_id] ?? event.presence_id} />
          <MetaRow label="Time"          value={dateStr} />
          <MetaRow label="Match quality" value={<MatchQualityBadge quality={event.match_quality} size="sm" />} />
          <MetaRow label="Entries"       value={`${event.entries_returned} returned`} />
          <MetaRow
            label="User message"
            value={
              <span className="font-body text-xs text-text-primary break-words">
                {event.query}
              </span>
            }
          />
          {event.normalised_query && event.normalised_query !== event.query && (
            <MetaRow
              label="Recall query"
              value={
                <span className="font-body text-xs text-text-secondary break-words">
                  {event.normalised_query}
                </span>
              }
            />
          )}
          {event.session_id && (
            <MetaRow
              label="Session"
              value={
                <span className="font-mono text-[10px] text-text-muted opacity-60">
                  {event.session_id}
                </span>
              }
            />
          )}
        </div>
      </div>

      {/* ── Returned entries ──────────────────────────────────────── */}
      <div>
        <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-3">
          Returned entries
        </p>
        {entries.length === 0 ? (
          <p className="font-body text-xs text-text-muted italic">
            No archive entries were returned for this query.
          </p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry, i) => (
              <RecallEntryCard key={entry.id} entry={entry} index={i} />
            ))}
          </div>
        )}
      </div>

      {/* ── Overall feedback ──────────────────────────────────────── */}
      <div>
        <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-3">
          Overall feedback
        </p>
        <FeedbackSummaryFull
          rows={overall_feedback}
          emptyMessage="No feedback recorded for this event yet."
        />
      </div>

    </div>
  )
}
