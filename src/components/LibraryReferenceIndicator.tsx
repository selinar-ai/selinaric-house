'use client'

// Phase 33L — Library reference transparency indicator.
// Shown below an assistant message when Library context was used.
// Visually distinct from RecallIndicator (blue accent, not presence accent).
// Expandable to show title, authority, collection, phase, retrieval reason.

import { useState } from 'react'
import type { LibraryReference } from '@/lib/library/chat-library-search'

const AUTHORITY_LABELS: Record<string, string> = {
  library_reference: 'Library reference',
  technical_reference: 'Technical reference',
  validation_record: 'Validation record',
  thread_handoff: 'Thread handoff',
  ui_request: 'UI request',
  architecture_law: 'Architecture law',
  archive_only: 'Archive only',
  canonical_candidate: 'Candidate',
  canonical_memory: 'Canonical Memory',
  superseded: 'Superseded',
}

interface Props {
  references: LibraryReference[]
}

export default function LibraryReferenceIndicator({ references }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (references.length === 0) return null

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1.5 group"
      >
        <span className="font-body text-[10px] text-blue-400/80 group-hover:text-blue-400 transition-colors">
          Referenced from Library: {references.length} {references.length === 1 ? 'item' : 'items'}
        </span>
        <span className="font-mono text-[9px] text-blue-400/60 group-hover:text-blue-400 transition-colors">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded && (
        <div className="mt-1.5 space-y-2 pl-2 border-l border-blue-400/20">
          {references.map(ref => (
            <div key={ref.id} className="space-y-0.5">
              <p className="font-body text-xs text-text-secondary leading-snug">
                {ref.title}
              </p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-body text-[10px] text-blue-400/70">
                  {AUTHORITY_LABELS[ref.effectiveAuthorityStatus] ?? ref.effectiveAuthorityStatus}
                </span>
                {ref.collection && (
                  <span className="font-body text-[10px] text-text-muted">
                    {ref.collection}
                  </span>
                )}
                {ref.phaseCode && (
                  <span className="font-body text-[10px] text-text-muted">
                    Phase {ref.phaseCode}{ref.phaseLabel ? ` — ${ref.phaseLabel}` : ''}
                  </span>
                )}
              </div>
              <p className="font-body text-[10px] text-text-muted/70 italic">
                {ref.retrievalReason}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
