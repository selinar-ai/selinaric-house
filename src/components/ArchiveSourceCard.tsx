'use client'

// Phase 27B + 27D — Archive source card.
// Collapsed: title, review status, char count, source date/origin, curation counts.
// Expanded: full ArchiveSourceView (content, extraction, drafts, remove).
// Phase 27D: checkbox prop for bulk selection; count badges (drafts / entries).
// Phase 28E: defaultExpanded prop for deep-link navigation.

import { useState } from 'react'
import ArchiveSourceView from '@/components/ArchiveSourceView'
import {
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_COLOR,
  ARCHIVE_LABEL,
  ARCHIVE_COLOR,
  type SourceWithCounts,
} from '@/lib/archives'

interface Props {
  source:          SourceWithCounts
  onRefresh:       () => void
  defaultExpanded?: boolean
  selected?:       boolean
  onToggleSelect?: (id: string) => void
}

export default function ArchiveSourceCard({
  source, onRefresh,
  defaultExpanded = false,
  selected = false,
  onToggleSelect,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const statusColor     = REVIEW_STATUS_COLOR[source.review_status] ?? 'text-text-muted'
  const archiveChipColor = ARCHIVE_COLOR[source.archive_name]

  function formatChars(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1000)      return `${(n / 1000).toFixed(1)}k`
    return String(n)
  }

  return (
    <div className={`border-b border-house-border transition-colors duration-150 ${selected ? 'bg-house-bg/60' : ''}`}>
      <div className="flex items-stretch">
        {/* Checkbox column */}
        {onToggleSelect && (
          <div className="flex items-start pt-4 pl-3 pr-1 shrink-0">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(source.id)}
              onClick={e => e.stopPropagation()}
              className="accent-house-muted mt-0.5"
            />
          </div>
        )}

        {/* Collapsed header */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-1 text-left px-4 py-3.5 hover:bg-house-bg/40 transition-colors group min-w-0"
        >
          {/* Row 1: title + badges */}
          <div className="flex items-start gap-2 flex-wrap">
            <span className="font-body text-sm text-text-primary font-medium flex-1 min-w-0 leading-snug">
              {source.title}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`font-body text-[10px] px-1.5 py-0.5 rounded ${archiveChipColor}`}>
                {ARCHIVE_LABEL[source.archive_name]}
              </span>
              <span className={`font-body text-[10px] ${statusColor}`}>
                {REVIEW_STATUS_LABELS[source.review_status] ?? source.review_status}
              </span>
              <span className={`font-mono text-[10px] ${expanded ? 'text-text-secondary' : 'text-text-muted'} group-hover:text-text-secondary`}>
                {expanded ? '▾' : '▸'}
              </span>
            </div>
          </div>

          {/* Row 2: metadata + counts */}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="font-body text-xs text-text-muted">{source.source_origin}</span>
            {source.source_date && (
              <>
                <span className="text-text-muted text-[10px]">·</span>
                <span className="font-body text-xs text-text-muted">{source.source_date}</span>
              </>
            )}
            <span className="text-text-muted text-[10px]">·</span>
            <span className="font-body text-xs text-text-muted">{formatChars(source.char_count)} chars</span>

            {/* Curation counts */}
            {source.draft_count > 0 && (
              <>
                <span className="text-text-muted text-[10px]">·</span>
                <span className="font-body text-[10px] text-text-muted">
                  {source.pending_draft_count > 0
                    ? <span className="text-amber-400">{source.pending_draft_count} pending</span>
                    : null}
                  {source.pending_draft_count > 0 && source.draft_count > source.pending_draft_count ? ', ' : ''}
                  {source.draft_count > source.pending_draft_count
                    ? `${source.draft_count} drafts`
                    : source.pending_draft_count > 0 ? '' : `${source.draft_count} drafts`}
                </span>
              </>
            )}
            {source.entry_count > 0 && (
              <>
                <span className="text-text-muted text-[10px]">·</span>
                <span className="font-body text-[10px] text-green-400/80">
                  {source.entry_count} entr{source.entry_count === 1 ? 'y' : 'ies'}
                </span>
              </>
            )}

            <span className="ml-auto font-body text-xs text-text-muted">
              {new Date(source.created_at).toLocaleDateString('en-AU')}
            </span>
          </div>
        </button>
      </div>

      {/* Expanded view */}
      {expanded && (
        <ArchiveSourceView source={source} onRefresh={onRefresh} />
      )}
    </div>
  )
}
