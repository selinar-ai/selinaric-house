'use client'

// Recall Review — event list with load-more pagination

import RecallEventRow, { type RecallEventSummary } from '@/components/RecallReview/RecallEventRow'

interface Props {
  events: RecallEventSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading: boolean
  hasMore: boolean
  onLoadMore: () => void
}

export default function RecallEventList({
  events,
  selectedId,
  onSelect,
  loading,
  hasMore,
  onLoadMore,
}: Props) {
  if (!loading && events.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="font-body text-sm text-text-muted italic text-center max-w-xs">
          No recall events found. Use archive recall in Ari or Eli chat, then return here to review what came back.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto">
        {events.map(event => (
          <RecallEventRow
            key={event.id}
            event={event}
            selected={event.id === selectedId}
            onSelect={onSelect}
          />
        ))}

        {loading && (
          <div className="flex justify-center items-center py-4 gap-1.5">
            {[0, 0.15, 0.3].map((delay, i) => (
              <div key={i} className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: `${delay}s` }} />
            ))}
          </div>
        )}

        {!loading && hasMore && (
          <div className="py-3 flex justify-center">
            <button
              onClick={onLoadMore}
              className="font-body text-xs text-text-muted hover:text-text-secondary tracking-widest uppercase transition-colors px-4 py-2 border border-house-border hover:border-house-muted"
            >
              Load more
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
