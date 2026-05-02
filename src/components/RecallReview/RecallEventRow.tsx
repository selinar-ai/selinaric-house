// Recall Review — single event row in the event list

import MatchQualityBadge from '@/components/ui/MatchQualityBadge'
import { FeedbackSummaryCompact } from '@/components/RecallReview/RecallFeedbackSummary'
import type { MatchQuality } from '@/lib/archive-recall'

export interface RecallEventSummary {
  id: string
  presence_id: 'ari' | 'eli'
  query: string
  normalised_query: string
  match_quality: MatchQuality
  recall_mode: 'manual' | 'auto'
  retrieval_method: 'keyword' | 'semantic' | 'hybrid' | null
  semantic_score: number | null
  entries_returned: number
  created_at: string
  feedback_summary: {
    total: number
    helpful: number
    not_helpful: number
    has_attention: boolean
  }
}

interface Props {
  event: RecallEventSummary
  selected: boolean
  onSelect: (id: string) => void
}

const PRESENCE_LABEL: Record<string, string> = { ari: 'Ari', eli: 'Eli' }

export default function RecallEventRow({ event, selected, onSelect }: Props) {
  const dt = new Date(event.created_at)
  const dateStr = dt.toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <button
      onClick={() => onSelect(event.id)}
      className={`
        w-full text-left px-3 py-2.5 border-b border-house-border
        transition-colors duration-150
        ${selected
          ? 'bg-house-bg border-l-2 border-l-house-muted pl-[10px]'
          : 'bg-house-surface hover:bg-house-bg border-l-2 border-l-transparent'
        }
      `}
    >
      {/* Row 1: presence · query · badge */}
      <div className="flex items-start gap-2 flex-wrap">
        <span className="font-body text-[10px] text-text-muted shrink-0 uppercase tracking-widest mt-0.5">
          {PRESENCE_LABEL[event.presence_id] ?? event.presence_id}
        </span>
        <span className="font-body text-sm text-text-primary flex-1 min-w-0 truncate">
          {event.normalised_query || event.query}
        </span>
        <MatchQualityBadge quality={event.match_quality} />
      </div>

      {/* Row 2: entries count · mode · date · feedback */}
      <div className="flex items-center gap-3 mt-1 flex-wrap">
        <span className="font-body text-[10px] text-text-muted">
          {event.entries_returned} {event.entries_returned === 1 ? 'entry' : 'entries'}
        </span>
        {event.recall_mode === 'auto' && (
          <span className="font-body text-[9px] uppercase tracking-widest text-blue-400/80 border border-blue-400/30 px-1">
            auto
          </span>
        )}
        {event.retrieval_method === 'semantic' && (
          <span className="font-body text-[9px] uppercase tracking-widest text-emerald-400/80 border border-emerald-400/30 px-1">
            sem
          </span>
        )}
        {event.retrieval_method === 'hybrid' && (
          <span className="font-body text-[9px] uppercase tracking-widest text-violet-400/80 border border-violet-400/30 px-1">
            hybrid
          </span>
        )}
        <span className="font-body text-[10px] text-text-muted">
          {dateStr}
        </span>
        {event.feedback_summary.total > 0 && (
          <FeedbackSummaryCompact summary={event.feedback_summary} />
        )}
        {event.feedback_summary.has_attention && (
          <span className="font-body text-[10px] text-orange-400">· needs attention</span>
        )}
      </div>
    </button>
  )
}
