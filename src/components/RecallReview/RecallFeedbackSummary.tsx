// Recall Review — feedback summary display
// Used in event rows (compact) and detail panel (full).

const RATING_LABEL: Record<string, string> = {
  helpful:     'Helpful',
  not_helpful: 'Not helpful',
}

export interface FeedbackRow {
  id: string
  archive_item_id: string | null
  rating: string
  created_at: string
  updated_at?: string
}

interface CompactProps {
  summary: {
    total: number
    helpful: number
    not_helpful: number
    has_attention: boolean
  }
}

/** Compact one-line summary for event list rows */
export function FeedbackSummaryCompact({ summary }: CompactProps) {
  if (summary.total === 0) return null

  const parts: string[] = []
  if (summary.helpful > 0)     parts.push(`${summary.helpful} helpful`)
  if (summary.not_helpful > 0) parts.push(`${summary.not_helpful} not helpful`)

  return (
    <span className={`font-body text-[10px] ${summary.has_attention ? 'text-orange-400' : 'text-text-muted'}`}>
      {parts.join(' · ')}
    </span>
  )
}

interface FullProps {
  rows: FeedbackRow[]
  label?: string
  emptyMessage?: string
}

/** Full feedback list for detail panel */
export function FeedbackSummaryFull({ rows, label, emptyMessage }: FullProps) {
  if (rows.length === 0) {
    return (
      <p className="font-body text-xs text-text-muted italic">
        {emptyMessage ?? 'No feedback recorded.'}
      </p>
    )
  }

  return (
    <div>
      {label && (
        <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-2">
          {label}
        </p>
      )}
      <div className="space-y-1.5">
        {rows.map(fb => (
          <div key={fb.id} className="flex items-center gap-2">
            <span className={`font-body text-xs ${fb.rating === 'helpful' ? 'text-green-400' : 'text-orange-400'}`}>
              {RATING_LABEL[fb.rating] ?? fb.rating}
            </span>
            <span className="font-body text-[10px] text-text-muted">
              {new Date(fb.created_at).toLocaleString('en-AU', {
                timeZone: 'Australia/Melbourne',
                day: 'numeric', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
