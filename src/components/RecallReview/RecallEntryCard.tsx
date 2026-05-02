// Recall Review — per-entry card in event detail panel
// Shows resolved archive_item fields, rank info, and per-entry feedback.

import { FeedbackSummaryFull, type FeedbackRow } from '@/components/RecallReview/RecallFeedbackSummary'
import SourceLink from '@/components/SourceLink'

const CATEGORY_DISPLAY: Record<string, string> = {
  relationship_philosophy: 'Relationship philosophy',
  naming:                  'Naming',
  identity:                'Identity',
  creative:                'Creative',
  technical:               'Technical',
  governance:              'Governance',
  emotional:               'Emotional',
  shared_decision:         'Shared decision',
  milestone:               'Milestone',
  operational:             'Operational',
  misc:                    'Misc',
}

export interface ResolvedEntry {
  id: string
  unavailable?: boolean
  title?: string
  archive_name?: string
  archive_label?: string
  owner_presence?: string
  visibility?: string
  source_origin?: string
  category?: string
  canonical_status?: string
  status_label?: string
  sensitivity?: string
  source_document?: string | null
  source_date?: string | null
  source_id?: string | null
  has_linked_source?: boolean
  excerpt?: string | null
  rank_score?: number | null
  rank_reason?: string | null
  feedback?: FeedbackRow[]
}

interface Props {
  entry: ResolvedEntry
  index: number
}

export default function RecallEntryCard({ entry, index }: Props) {
  if (entry.unavailable) {
    return (
      <div className="border border-house-border bg-house-surface px-3 py-2.5">
        <p className="font-body text-xs text-text-muted italic">Entry no longer available</p>
        <p className="font-mono text-[10px] text-text-muted mt-0.5 opacity-50">{entry.id}</p>
      </div>
    )
  }

  const sourceStr = [entry.source_document, entry.source_date].filter(Boolean).join(' — ')
  const categoryLabel = CATEGORY_DISPLAY[entry.category ?? ''] ?? (entry.category ?? '').replace(/_/g, ' ')

  return (
    <div className="border border-house-border bg-house-surface px-3 py-2.5 space-y-2">
      {/* Header */}
      <div className="flex items-start gap-2 flex-wrap">
        <span className="font-body text-[10px] text-text-muted shrink-0 mt-0.5 tabular-nums w-4">
          {index + 1}.
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-body text-sm font-medium text-text-primary">
            {entry.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="font-body text-[10px] text-text-muted">
              {entry.archive_label ?? entry.archive_name}
            </span>
            <span className="text-text-muted text-[9px]">·</span>
            <span className="font-body text-[10px] text-text-muted">
              {entry.status_label ?? entry.canonical_status}
            </span>
            {categoryLabel && (
              <>
                <span className="text-text-muted text-[9px]">·</span>
                <span className="font-body text-[10px] text-text-muted capitalize">{categoryLabel}</span>
              </>
            )}
            {entry.sensitivity && entry.sensitivity !== 'standard' && (
              <>
                <span className="text-text-muted text-[9px]">·</span>
                <span className="font-body text-[10px] text-text-muted capitalize">{entry.sensitivity}</span>
              </>
            )}
          </div>
          {sourceStr && (
            <p className="font-body text-[10px] text-text-muted mt-0.5">{sourceStr}</p>
          )}
        </div>
      </div>

      {/* Rank info */}
      <div className="flex items-center gap-3 flex-wrap pl-6">
        <div>
          <span className="font-body text-[10px] text-text-muted uppercase tracking-widest">Rank score </span>
          <span className="font-mono text-[10px] text-text-secondary">
            {entry.rank_score != null ? entry.rank_score : '—'}
          </span>
        </div>
        <div>
          <span className="font-body text-[10px] text-text-muted uppercase tracking-widest">Rank reason </span>
          <span className="font-mono text-[10px] text-text-secondary">
            {entry.rank_reason ?? 'Rank reason not stored for this event.'}
          </span>
        </div>
      </div>

      {/* Excerpt */}
      {entry.excerpt && (
        <p className="font-body text-xs text-text-secondary leading-relaxed pl-6 border-l border-house-border/40">
          {entry.excerpt.slice(0, 300)}{entry.excerpt.length > 300 ? '…' : ''}
        </p>
      )}

      {/* Per-entry feedback */}
      {entry.feedback && entry.feedback.length > 0 && (
        <div className="pl-6">
          <FeedbackSummaryFull
            rows={entry.feedback}
            label="Entry feedback"
          />
        </div>
      )}

      {/* Source traceability — Phase 28E */}
      <div className="pl-6 pt-1">
        <SourceLink
          sourceId={entry.source_id}
          archiveName={entry.archive_name}
          sourceDocument={entry.source_document}
        />
      </div>
    </div>
  )
}
