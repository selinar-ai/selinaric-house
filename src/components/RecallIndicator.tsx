'use client'

// Phase 28A + 28B — Recall transparency indicator.
// Shown below an assistant message when archive recall was used.
// Phase 28B adds: feedback controls (per-entry + overall), match quality display,
// status_label from server, rank_reason in expanded view.
// No emojis. Minimal surface. Does not announce itself loudly.

import { useState, useCallback } from 'react'
import type { RecallEntry, MatchQuality } from '@/lib/archive-recall'

const ARCHIVE_DISPLAY: Record<string, string> = {
  velvet: 'Velvet',
  violet: 'Violet',
  house:  'House',
}

type FeedbackRating = 'helpful' | 'not_helpful' | null

async function submitFeedback(
  recallEventId: string,
  rating: 'helpful' | 'not_helpful',
  archiveItemId?: string | null
): Promise<void> {
  try {
    await fetch('/api/archive-recall/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recallEventId,
        archiveItemId: archiveItemId ?? null,
        rating,
      }),
    })
  } catch {
    // Non-critical — swallow silently
  }
}

interface Props {
  entries: RecallEntry[]
  accentClass: string
  recallEventId?: string | null
  matchQuality?: MatchQuality
}

export default function RecallIndicator({ entries, accentClass, recallEventId, matchQuality }: Props) {
  const [expanded, setExpanded] = useState(false)
  // Map of key → rating. Key is entry.id for per-entry, 'overall' for the session.
  const [ratings, setRatings] = useState<Record<string, FeedbackRating>>({})

  const handleRate = useCallback(async (
    rating: 'helpful' | 'not_helpful',
    archiveItemId?: string
  ) => {
    if (!recallEventId) return
    const key = archiveItemId ?? 'overall'
    const current = ratings[key]
    // Toggle: clicking the same rating again clears it; clicking different replaces it
    const next: FeedbackRating = current === rating ? null : rating
    setRatings(prev => ({ ...prev, [key]: next }))
    if (next) {
      await submitFeedback(recallEventId, next, archiveItemId)
    }
  }, [recallEventId, ratings])

  const hasFeedback = !!recallEventId
  const overallRating = ratings['overall']

  if (entries.length === 0) {
    return (
      <p className="font-body text-[10px] text-text-muted mt-2 italic">
        No recallable archive entries found.
      </p>
    )
  }

  const qualityLabel =
    matchQuality && matchQuality !== 'strong' && matchQuality !== 'none'
      ? ` · ${matchQuality} match`
      : ''

  return (
    <div className="mt-2">
      {/* Header row: expand toggle + quality label + overall feedback */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1.5 group"
        >
          <span className="font-body text-[10px] text-text-muted group-hover:text-text-secondary transition-colors">
            Recalled from Archives: {entries.length} {entries.length === 1 ? 'entry' : 'entries'}{qualityLabel}
          </span>
          <span className="font-mono text-[9px] text-text-muted group-hover:text-text-secondary transition-colors">
            {expanded ? '▾' : '▸'}
          </span>
        </button>

        {/* Overall feedback — sits right of the label */}
        {hasFeedback && (
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => handleRate('helpful')}
              title="This recall was helpful"
              className={`font-mono text-[10px] leading-none transition-colors ${
                overallRating === 'helpful'
                  ? accentClass
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              ↑
            </button>
            <button
              onClick={() => handleRate('not_helpful')}
              title="This recall was not helpful"
              className={`font-mono text-[10px] leading-none transition-colors ${
                overallRating === 'not_helpful'
                  ? 'text-red-400'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              ↓
            </button>
          </div>
        )}
      </div>

      {/* Expanded entry list */}
      {expanded && (
        <div className="mt-1.5 pl-2 border-l border-house-border/40 space-y-2">
          {entries.map(entry => {
            const entryRating = ratings[entry.id]
            return (
              <div key={entry.id}>
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className={`font-body text-[10px] font-medium ${accentClass}`}>
                    {entry.title}
                  </span>
                  <span className="font-body text-[9px] text-text-muted">
                    {ARCHIVE_DISPLAY[entry.archive_name] ?? entry.archive_name}
                  </span>
                  <span className="text-text-muted text-[9px]">·</span>
                  {/* Use server-computed status_label if available, fall back gracefully */}
                  <span className="font-body text-[9px] text-text-muted">
                    {entry.status_label ?? entry.canonical_status}
                  </span>
                  <span className="text-text-muted text-[9px]">·</span>
                  <span className="font-body text-[9px] text-text-muted capitalize">
                    {entry.category.replace(/_/g, ' ')}
                  </span>

                  {/* Per-entry feedback */}
                  {hasFeedback && (
                    <div className="flex items-center gap-1 ml-auto shrink-0">
                      <button
                        onClick={() => handleRate('helpful', entry.id)}
                        title="This entry was helpful"
                        className={`font-mono text-[9px] leading-none transition-colors ${
                          entryRating === 'helpful'
                            ? accentClass
                            : 'text-text-muted hover:text-text-secondary'
                        }`}
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => handleRate('not_helpful', entry.id)}
                        title="This entry was not helpful"
                        className={`font-mono text-[9px] leading-none transition-colors ${
                          entryRating === 'not_helpful'
                            ? 'text-red-400'
                            : 'text-text-muted hover:text-text-secondary'
                        }`}
                      >
                        ↓
                      </button>
                    </div>
                  )}
                </div>

                {/* Source line */}
                {(entry.source_document || entry.source_date) && (
                  <p className="font-body text-[9px] text-text-muted mt-0.5">
                    {[entry.source_document, entry.source_date].filter(Boolean).join(' — ')}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
