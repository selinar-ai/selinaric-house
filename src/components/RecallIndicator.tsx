'use client'

// Phase 28A — Recall transparency indicator.
// Shown below an assistant message when archive recall was used.
// Quiet by default — expandable to show entry details.
// No emojis. Minimal surface. Does not announce itself loudly.

import { useState } from 'react'
import type { RecallEntry } from '@/lib/archive-recall'

const ARCHIVE_DISPLAY: Record<string, string> = {
  velvet: 'Velvet',
  violet: 'Violet',
  house: 'House',
}

const STATUS_DISPLAY: Record<string, string> = {
  canonical: 'Memory',
  canonical_candidate: 'Memory candidate',
}

interface Props {
  entries: RecallEntry[]
  accentClass: string
}

export default function RecallIndicator({ entries, accentClass }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (entries.length === 0) {
    return (
      <p className="font-body text-[10px] text-text-muted mt-2 italic">
        No recallable archive entries found.
      </p>
    )
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1.5 group"
      >
        <span className="font-body text-[10px] text-text-muted group-hover:text-text-secondary transition-colors">
          Recalled from Archives: {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </span>
        <span className="font-mono text-[9px] text-text-muted group-hover:text-text-secondary transition-colors">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded && (
        <div className="mt-1.5 pl-2 border-l border-house-border/40 space-y-2">
          {entries.map(entry => (
            <div key={entry.id}>
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className={`font-body text-[10px] font-medium ${accentClass}`}>
                  {entry.title}
                </span>
                <span className="font-body text-[9px] text-text-muted">
                  {ARCHIVE_DISPLAY[entry.archive_name] ?? entry.archive_name}
                </span>
                <span className="text-text-muted text-[9px]">·</span>
                <span className="font-body text-[9px] text-text-muted">
                  {STATUS_DISPLAY[entry.canonical_status] ?? entry.canonical_status}
                </span>
                <span className="text-text-muted text-[9px]">·</span>
                <span className="font-body text-[9px] text-text-muted capitalize">
                  {entry.category.replace(/_/g, ' ')}
                </span>
              </div>
              {(entry.source_document || entry.source_date) && (
                <p className="font-body text-[9px] text-text-muted mt-0.5">
                  {[entry.source_document, entry.source_date].filter(Boolean).join(' — ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
