'use client'

// Phase 27B — Archive source card.
// Collapsed: title, review status, char count, source date/origin.
// Expanded: full ArchiveSourceView (content, extraction, drafts).

import { useState } from 'react'
import ArchiveSourceView from '@/components/ArchiveSourceView'
import {
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_COLOR,
  ARCHIVE_LABEL,
  ARCHIVE_COLOR,
  type ArchiveSource,
} from '@/lib/archives'

interface Props {
  source: ArchiveSource
  onRefresh: () => void
}

export default function ArchiveSourceCard({ source, onRefresh }: Props) {
  const [expanded, setExpanded] = useState(false)

  const statusColor = REVIEW_STATUS_COLOR[source.review_status]
  const archiveChipColor = ARCHIVE_COLOR[source.archive_name]

  function formatChars(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
    return String(n)
  }

  return (
    <div className="border-b border-house-border">
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left px-4 py-3.5 hover:bg-house-bg/40 transition-colors group"
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
              {REVIEW_STATUS_LABELS[source.review_status]}
            </span>
            <span className={`font-mono text-[10px] ${expanded ? 'text-text-secondary' : 'text-text-muted'} group-hover:text-text-secondary`}>
              {expanded ? '▾' : '▸'}
            </span>
          </div>
        </div>

        {/* Row 2: metadata summary */}
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          <span className="font-body text-xs text-text-muted">
            {source.source_origin}
          </span>
          {source.source_date && (
            <>
              <span className="text-text-muted text-[10px]">·</span>
              <span className="font-body text-xs text-text-muted">{source.source_date}</span>
            </>
          )}
          <span className="text-text-muted text-[10px]">·</span>
          <span className="font-body text-xs text-text-muted">
            {formatChars(source.char_count)} chars
          </span>
          <span className="ml-auto font-body text-xs text-text-muted">
            {new Date(source.created_at).toLocaleDateString('en-AU')}
          </span>
        </div>
      </button>

      {/* Expanded view */}
      {expanded && (
        <ArchiveSourceView
          source={source}
          onRefresh={onRefresh}
        />
      )}
    </div>
  )
}
