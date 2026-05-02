'use client'

// Phase 27B — Full expanded view of a single archive source.
// Shows: content (with expand/collapse), metadata, extraction panel, associated drafts.
// Rendered inside ArchiveSourceCard when expanded.

import { useState } from 'react'
import ExtractionPanel from '@/components/ExtractionPanel'
import ArchiveDraftCard from '@/components/ArchiveDraftCard'
import { useArchiveDrafts } from '@/hooks/useArchiveDrafts'
import {
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_COLOR,
  type ArchiveSource,
} from '@/lib/archives'

interface Props {
  source: ArchiveSource
  onRefresh: () => void  // refresh the sources list
}

export default function ArchiveSourceView({ source, onRefresh }: Props) {
  const [showFullContent, setShowFullContent] = useState(false)
  const [activeView, setActiveView] = useState<'extract' | 'drafts'>('extract')

  // Remove / soft-delete state
  const [removeStage, setRemoveStage]           = useState<'idle' | 'confirm'>('idle')
  const [alsoDeleteDrafts, setAlsoDeleteDrafts] = useState(false)
  const [removing, setRemoving]                 = useState(false)
  const [removeError, setRemoveError]           = useState<string | null>(null)

  const {
    drafts,
    pendingDrafts,
    loading: draftsLoading,
    refresh: refreshDrafts,
  } = useArchiveDrafts({ sourceId: source.id, allStatuses: true })

  const contentPreview = source.raw_content.slice(0, 400)
  const hasMoreContent = source.raw_content.length > 400

  const statusColor = REVIEW_STATUS_COLOR[source.review_status]

  function handleExtracted() {
    // Refresh drafts and switch to drafts view to show new proposals
    refreshDrafts()
    onRefresh()
    setActiveView('drafts')
  }

  async function handleRemoveConfirm() {
    setRemoving(true)
    setRemoveError(null)
    try {
      const url = `/api/archive-sources/${source.id}${alsoDeleteDrafts ? '?deleteDrafts=true' : ''}`
      const res = await fetch(url, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      onRefresh()
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Remove failed.')
      setRemoving(false)
    }
  }

  return (
    <div className="border-t border-house-border/40 bg-house-bg/30 px-4 py-4 space-y-5">

      {/* Content preview */}
      <section>
        <p className="font-body text-xs text-text-muted uppercase tracking-widest mb-2">Content</p>
        <p className="font-body text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
          {showFullContent ? source.raw_content : contentPreview}
          {hasMoreContent && !showFullContent && '…'}
        </p>
        {hasMoreContent && (
          <button
            onClick={() => setShowFullContent(s => !s)}
            className="font-body text-xs text-text-muted hover:text-text-secondary mt-2 transition-colors"
          >
            {showFullContent ? 'Collapse' : `Show full content (${source.char_count.toLocaleString()} chars)`}
          </button>
        )}
      </section>

      {/* Metadata */}
      <section className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <div>
          <span className="font-body text-[10px] text-text-muted tracking-wide block">Status</span>
          <span className={`font-body text-xs ${statusColor}`}>{REVIEW_STATUS_LABELS[source.review_status]}</span>
        </div>
        <div>
          <span className="font-body text-[10px] text-text-muted tracking-wide block">Size</span>
          <span className="font-body text-xs text-text-secondary">{source.char_count.toLocaleString()} chars</span>
        </div>
        {source.source_date && (
          <div>
            <span className="font-body text-[10px] text-text-muted tracking-wide block">Source date</span>
            <span className="font-body text-xs text-text-secondary">{source.source_date}</span>
          </div>
        )}
        {source.source_document && (
          <div>
            <span className="font-body text-[10px] text-text-muted tracking-wide block">Source document</span>
            <span className="font-body text-xs text-text-secondary">{source.source_document}</span>
          </div>
        )}
        <div>
          <span className="font-body text-[10px] text-text-muted tracking-wide block">Added</span>
          <span className="font-body text-xs text-text-secondary">
            {new Date(source.created_at).toLocaleDateString('en-AU')}
          </span>
        </div>
        {source.notes && (
          <div className="col-span-2">
            <span className="font-body text-[10px] text-text-muted tracking-wide block">Notes</span>
            <span className="font-body text-xs text-text-secondary">{source.notes}</span>
          </div>
        )}
      </section>

      {/* Inner tab: Extract / Drafts */}
      <section>
        <div className="flex gap-0 border-b border-house-border/40 mb-4">
          <button
            onClick={() => setActiveView('extract')}
            className={`font-body text-xs px-3 py-2 border-b-2 transition-colors ${
              activeView === 'extract'
                ? 'border-house-muted text-text-secondary'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            Extract
          </button>
          <button
            onClick={() => setActiveView('drafts')}
            className={`font-body text-xs px-3 py-2 border-b-2 transition-colors ${
              activeView === 'drafts'
                ? 'border-house-muted text-text-secondary'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            Drafts
            {drafts.length > 0 && (
              <span className="ml-1.5 font-body text-[10px] text-text-muted">
                ({pendingDrafts.length > 0 ? `${pendingDrafts.length} pending` : drafts.length})
              </span>
            )}
          </button>
        </div>

        {activeView === 'extract' && (
          <ExtractionPanel source={source} onExtracted={handleExtracted} />
        )}

        {activeView === 'drafts' && (
          <div>
            {draftsLoading ? (
              <div className="flex gap-1 py-4">
                <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" />
                <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.2s' }} />
                <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.4s' }} />
              </div>
            ) : drafts.length === 0 ? (
              <p className="font-body text-xs text-text-muted py-2">
                No drafts yet. Use Extract to ask a presence to propose entries.
              </p>
            ) : (
              <div className="border border-house-border rounded-none">
                {drafts.map(draft => (
                  <ArchiveDraftCard
                    key={draft.id}
                    draft={draft}
                    onRefresh={refreshDrafts}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>
      {/* Remove conversation */}
      <section className="pt-2 border-t border-house-border/40">
        {removeStage === 'idle' && (
          <button
            onClick={() => setRemoveStage('confirm')}
            className="font-body text-xs text-text-muted hover:text-red-400/60 transition-colors"
          >
            Remove conversation
          </button>
        )}

        {removeStage === 'confirm' && (
          <div className="space-y-3">
            <p className="font-body text-xs text-text-secondary leading-relaxed">
              Remove this source conversation from the archive?
            </p>
            <p className="font-body text-[10px] text-text-muted leading-relaxed">
              This will hide it from Conversations and extraction. Existing approved Archive Entries will not be deleted.
            </p>

            {/* Pending drafts warning + optional checkbox */}
            {pendingDrafts.length > 0 && (
              <div className="border border-amber-400/20 bg-amber-400/5 px-3 py-2 space-y-2">
                <p className="font-body text-[10px] text-amber-400 leading-relaxed">
                  This source has {pendingDrafts.length} pending extraction draft{pendingDrafts.length !== 1 ? 's' : ''}.
                  Removing the source will not automatically remove those drafts.
                </p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alsoDeleteDrafts}
                    onChange={e => setAlsoDeleteDrafts(e.target.checked)}
                    className="accent-amber-400"
                  />
                  <span className="font-body text-[10px] text-text-muted">
                    Also remove pending drafts from this source
                  </span>
                </label>
              </div>
            )}

            {removeError && (
              <p className="font-body text-xs text-red-400">{removeError}</p>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={() => { setRemoveStage('idle'); setAlsoDeleteDrafts(false); setRemoveError(null) }}
                disabled={removing}
                className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveConfirm}
                disabled={removing}
                className="font-body text-xs px-3 py-1 border border-red-400/30 text-red-400 hover:bg-red-400/10 transition-all disabled:opacity-40"
              >
                {removing ? 'Removing…' : 'Remove conversation'}
              </button>
            </div>
          </div>
        )}
      </section>

    </div>
  )
}
