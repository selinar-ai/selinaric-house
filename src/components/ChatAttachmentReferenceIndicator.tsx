'use client'

// Phase 34A — Chat attachment reference transparency indicator.
// Shown below an assistant message when chat attachments were used.
// Visually distinct from RecallIndicator (teal) and LibraryReferenceIndicator (blue).
// Uses amber/orange accent to distinguish from Library and Archive.

import { useState } from 'react'
import type { ChatAttachmentReference } from '@/lib/files/chat-attachment-types'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function statusLabel(ref: ChatAttachmentReference): string {
  if (ref.extractionStatus === 'extracted' && ref.usedInPrompt) {
    return `extracted, text included${ref.truncated ? ' (truncated)' : ''}`
  }
  if (ref.extractionStatus === 'extracted' && !ref.usedInPrompt) {
    return 'extracted, omitted (context budget)'
  }
  if (ref.extractionStatus === 'failed') {
    return 'failed, no readable text'
  }
  if (ref.extractionStatus === 'unsupported') {
    return 'unsupported file type'
  }
  if (ref.extractionStatus === 'too_large') {
    return 'too large'
  }
  return ref.extractionStatus
}

interface Props {
  references: ChatAttachmentReference[]
}

export default function ChatAttachmentReferenceIndicator({ references }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (references.length === 0) return null

  const usedCount = references.filter(r => r.usedInPrompt).length

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1.5 group"
      >
        <span className="font-body text-[10px] text-amber-400/80 group-hover:text-amber-400 transition-colors">
          Chat attachments: {references.length} {references.length === 1 ? 'file' : 'files'}
          {usedCount > 0 && usedCount < references.length ? ` (${usedCount} used)` : ''}
        </span>
        <span className="font-mono text-[9px] text-amber-400/60 group-hover:text-amber-400 transition-colors">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded && (
        <div className="mt-1.5 space-y-1.5 pl-2 border-l border-amber-400/20">
          {references.map((ref, i) => (
            <div key={`att-${i}`} className="space-y-0.5">
              <p className="font-body text-xs text-text-secondary leading-snug">
                {ref.fileName}
                <span className="text-text-muted ml-1.5 text-[10px]">
                  {formatBytes(ref.sizeBytes)}
                </span>
              </p>
              <p className="font-body text-[10px] text-amber-400/70">
                {statusLabel(ref)}
              </p>
              {ref.error && (
                <p className="font-body text-[10px] text-text-muted/60 italic">
                  {ref.error}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
