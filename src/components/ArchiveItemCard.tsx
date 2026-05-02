'use client'

// Phase 27A + 29A — Archive item card.
// Collapsed: title, badges, metadata summary.
// Expanded: full content, all metadata, Memory actions (Phase 29A), curation actions.
// Eligibility toggles are disabled for non-canonical items — enforced here and in API.
// Phase 29A: individual Memory promotion actions in expanded view, keyed on canonical_status.

import { useState } from 'react'
import VoiceButton from '@/components/VoiceButton'
import SourceLink from '@/components/SourceLink'
import {
  ARCHIVE_LABEL,
  ARCHIVE_COLOR,
  STATUS_LABELS,
  STATUS_COLOR,
  CATEGORY_LABELS,
  VISIBILITY_LABELS,
  SENSITIVITY_LABELS,
  ALL_STATUSES,
  ALL_CATEGORIES,
  ALL_VISIBILITIES,
  ALL_SENSITIVITIES,
  canToggleEligibility,
  type ArchiveItem,
  type CanonicalStatus,
  type ArchiveCategory,
  type ArchiveVisibility,
  type Sensitivity,
} from '@/lib/archives'
import { isMemory, isMemoryCandidate, type MemoryBulkAction } from '@/lib/archive-memory'

interface Props {
  item:            ArchiveItem
  onRefresh:       () => void
  selected?:       boolean
  onToggleSelect?: (id: string) => void
}

export default function ArchiveItemCard({ item, onRefresh, selected = false, onToggleSelect }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [showFullContent, setShowFullContent] = useState(false)
  const [patching, setPatching] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState(item.review_notes ?? '')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [memoryActioning, setMemoryActioning] = useState(false)
  const [memoryError, setMemoryError] = useState<string | null>(null)

  const eligible = canToggleEligibility(item)
  const contentPreview = item.excerpt || item.raw_content.slice(0, 250)
  const contentFull = item.raw_content
  const hasMoreContent = item.raw_content.length > 250 && !item.excerpt
  const voicePresenceId: 'ari' | 'eli' =
    item.owner_presence === 'ari' || item.owner_presence === 'eli'
      ? item.owner_presence
      : 'eli'

  async function patch(updates: Record<string, unknown>) {
    setPatching(true)
    try {
      const res = await fetch(`/api/archives/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updates, updated_by: 'tara' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Update failed')
      onRefresh()
    } catch (err) {
      console.error('[archive] patch failed:', err)
    } finally {
      setPatching(false)
    }
  }

  async function handleDelete() {
    setPatching(true)
    try {
      const res = await fetch(`/api/archives/${item.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Delete failed')
      }
      onRefresh()
    } catch (err) {
      console.error('[archive] delete failed:', err)
      setDeleteConfirm(false)
    } finally {
      setPatching(false)
    }
  }

  async function handleNotesSave() {
    await patch({ review_notes: notesValue || null })
    setEditingNotes(false)
  }

  // Phase 29A — individual Memory action via bulk route with one ID
  async function handleMemoryAction(action: MemoryBulkAction, confirmedRisk = false) {
    // Confirm demote
    if (action === 'demote_memory' && !confirmedRisk) {
      if (!window.confirm('Remove this entry from Memory?\n\nIt will remain in the archive but will no longer be recall-eligible.')) return
      confirmedRisk = true
    }
    // Confirm promote
    if (action === 'confirm_memory' && !confirmedRisk) {
      if (!window.confirm('Mark this entry as Memory?\n\nIt may become available to manual recall and safe auto-recall.')) return
      confirmedRisk = true
    }

    setMemoryActioning(true)
    setMemoryError(null)
    try {
      const res = await fetch('/api/archive-memory/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids: [item.id], confirmedRisk }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        // Sensitive confirmation required — retry with confirmedRisk
        if (data.requiresConfirmation) {
          if (window.confirm(`⚠ ${data.warning}\n\nProceed anyway?`)) {
            setMemoryActioning(false)
            await handleMemoryAction(action, true)
          }
          return
        }
        throw new Error(data.error ?? 'Memory action failed')
      }
      onRefresh()
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : 'Memory action failed')
    } finally {
      setMemoryActioning(false)
    }
  }

  const archiveChipColor = ARCHIVE_COLOR[item.archive_name]
  const statusColor = STATUS_COLOR[item.canonical_status]

  return (
    <div className={`border-b border-house-border transition-colors duration-150 ${patching ? 'opacity-60' : ''} ${selected ? 'bg-house-bg/60' : ''}`}>
      <div className="flex items-stretch">

        {/* Checkbox column */}
        {onToggleSelect && (
          <div className="flex items-start pt-4 pl-3 pr-1 shrink-0">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(item.id)}
              onClick={e => e.stopPropagation()}
              className="accent-house-muted mt-0.5"
            />
          </div>
        )}

        {/* Collapsed header — always visible */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-1 text-left px-4 py-3.5 hover:bg-house-bg/40 transition-colors group min-w-0"
        >
        {/* Row 1: title + badges */}
        <div className="flex items-start gap-2 flex-wrap">
          <span className="font-body text-sm text-text-primary font-medium flex-1 min-w-0 leading-snug">
            {item.title}
          </span>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            <span className={`font-body text-[10px] px-1.5 py-0.5 rounded ${archiveChipColor}`}>
              {ARCHIVE_LABEL[item.archive_name]}
            </span>
            <span className={`font-body text-[10px] ${statusColor}`}>
              {STATUS_LABELS[item.canonical_status]}
            </span>
            <span className={`font-mono text-[10px] ${expanded ? 'text-text-secondary' : 'text-text-muted'} group-hover:text-text-secondary`}>
              {expanded ? '▾' : '▸'}
            </span>
          </div>
        </div>

        {/* Row 2: metadata summary */}
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          <span className="font-body text-xs text-text-muted">
            {CATEGORY_LABELS[item.category]}
          </span>
          <span className="text-text-muted text-[10px]">·</span>
          <span className="font-body text-xs text-text-muted">
            {item.source_origin}
          </span>
          {item.source_date && (
            <>
              <span className="text-text-muted text-[10px]">·</span>
              <span className="font-body text-xs text-text-muted">{item.source_date}</span>
            </>
          )}
          {item.import_label && (
            <>
              <span className="text-text-muted text-[10px]">·</span>
              <span className="font-body text-xs text-text-muted italic">{item.import_label}</span>
            </>
          )}
          <span className="ml-auto font-body text-xs text-text-muted">
            {VISIBILITY_LABELS[item.visibility]}
          </span>
        </div>
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-house-border/40 bg-house-bg/30 px-4 py-4 space-y-5">

          {/* Content */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <p className="font-body text-xs text-text-muted uppercase tracking-widest">Content</p>
              {/* Voice icon — reads the full archive entry content. Detail view only, never in collapsed rows. */}
              <VoiceButton
                text={contentFull}
                presenceId={voicePresenceId}
                buttonClass="min-w-[28px] min-h-[28px] text-xs"
              />
            </div>
            <p className="font-body text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
              {showFullContent ? contentFull : contentPreview}
              {hasMoreContent && !showFullContent && '…'}
            </p>
            {hasMoreContent && (
              <button
                onClick={() => setShowFullContent(s => !s)}
                className="font-body text-xs text-text-muted hover:text-text-secondary mt-2 transition-colors"
              >
                {showFullContent ? 'Collapse' : 'Show full content'}
              </button>
            )}
          </section>

          {/* Metadata */}
          <section className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <MetaRow label="Owner" value={item.owner_presence} />
            <MetaRow label="Sensitivity" value={SENSITIVITY_LABELS[item.sensitivity]} />
            {item.source_document && <MetaRow label="Source doc" value={item.source_document} />}
            {item.import_label && <MetaRow label="Import label" value={item.import_label} />}
            {item.duplicate_of && <MetaRow label="Duplicate of" value={item.duplicate_of.slice(0, 8) + '…'} />}
            {item.superseded_by && <MetaRow label="Superseded by" value={item.superseded_by.slice(0, 8) + '…'} />}
            <MetaRow label="Added" value={new Date(item.created_at).toLocaleDateString('en-AU')} />
          </section>

          {/* Review notes */}
          <section>
            <p className="font-body text-xs text-text-muted uppercase tracking-widest mb-2">Review notes</p>
            {editingNotes ? (
              <div className="space-y-2">
                <textarea
                  value={notesValue}
                  onChange={e => setNotesValue(e.target.value)}
                  rows={3}
                  className="w-full font-body text-xs bg-house-surface border border-house-border text-text-primary px-3 py-2 outline-none focus:border-house-muted resize-none"
                  placeholder="Notes on this item…"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleNotesSave}
                    disabled={patching}
                    className="font-body text-xs px-3 py-1 border border-house-border text-text-muted hover:text-text-secondary transition-all disabled:opacity-40"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setEditingNotes(false); setNotesValue(item.review_notes ?? '') }}
                    className="font-body text-xs px-3 py-1 text-text-muted hover:text-text-secondary transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setEditingNotes(true)}
                className="text-left w-full"
              >
                {item.review_notes
                  ? <p className="font-body text-sm text-text-secondary leading-relaxed">{item.review_notes}</p>
                  : <p className="font-body text-xs text-text-muted italic">Add review notes…</p>
                }
              </button>
            )}
          </section>

          {/* Eligibility */}
          <section>
            <p className="font-body text-xs text-text-muted uppercase tracking-widest mb-2">
              Eligibility {!eligible && <span className="normal-case ml-1 text-[10px]">(memory only)</span>}
            </p>
            <div className="flex gap-2 flex-wrap">
              {(
                [
                  { key: 'eligible_for_recall', label: 'Recall', value: item.eligible_for_recall },
                  { key: 'eligible_for_embedding', label: 'Embedding', value: item.eligible_for_embedding },
                  { key: 'eligible_for_graph', label: 'Graph', value: item.eligible_for_graph },
                ] as const
              ).map(({ key, label, value }) => (
                <button
                  key={key}
                  onClick={() => eligible && patch({ [key]: !value })}
                  disabled={!eligible || patching}
                  title={eligible ? undefined : 'Only memory items can be eligible'}
                  className={`
                    font-body text-xs px-3 py-1.5 border transition-all
                    ${value
                      ? 'border-green-400/40 text-green-400 bg-green-400/10'
                      : 'border-house-border text-text-muted'
                    }
                    ${eligible
                      ? 'hover:border-house-muted cursor-pointer'
                      : 'opacity-40 cursor-not-allowed'
                    }
                    disabled:opacity-40
                  `}
                >
                  {value ? '✓' : '○'} {label}
                </button>
              ))}
            </div>
          </section>

          {/* Source traceability — Phase 28E */}
          <section>
            <p className="font-body text-xs text-text-muted uppercase tracking-widest mb-1.5">Source</p>
            <SourceLink
              sourceId={item.source_id}
              archiveName={item.archive_name}
              sourceDocument={item.source_document}
            />
          </section>

          {/* Memory promotion — Phase 29A — keyed on canonical_status */}
          <section className="space-y-2">
            <p className="font-body text-xs text-text-muted uppercase tracking-widest">Memory</p>
            <div className="flex gap-2 flex-wrap">
              {/* needs_review — previously demoted; restoration is distinct from first-time candidacy */}
              {item.canonical_status === 'needs_review' && (
                <>
                  <button
                    onClick={() => handleMemoryAction('restore_candidate')}
                    disabled={memoryActioning}
                    className="font-body text-xs px-3 py-1.5 border border-house-border text-text-muted hover:text-text-secondary hover:border-house-muted transition-all disabled:opacity-40"
                  >
                    Restore candidate
                  </button>
                  <button
                    onClick={() => handleMemoryAction('confirm_memory')}
                    disabled={memoryActioning}
                    className="font-body text-xs px-3 py-1.5 border border-green-400/30 text-green-400 hover:bg-green-400/10 transition-all disabled:opacity-40"
                  >
                    Confirm Memory
                  </button>
                </>
              )}
              {/* Not yet in Memory workflow — ordinary first-time candidacy (staged, duplicate, etc.) */}
              {!isMemory(item.canonical_status) && !isMemoryCandidate(item.canonical_status) &&
               item.canonical_status !== 'archive_only' && item.canonical_status !== 'needs_review' && (
                <>
                  <button
                    onClick={() => handleMemoryAction('mark_candidate')}
                    disabled={memoryActioning}
                    className="font-body text-xs px-3 py-1.5 border border-house-border text-text-muted hover:text-text-secondary hover:border-house-muted transition-all disabled:opacity-40"
                  >
                    Mark candidate
                  </button>
                  <button
                    onClick={() => handleMemoryAction('confirm_memory')}
                    disabled={memoryActioning}
                    className="font-body text-xs px-3 py-1.5 border border-green-400/30 text-green-400 hover:bg-green-400/10 transition-all disabled:opacity-40"
                  >
                    Confirm Memory
                  </button>
                </>
              )}
              {/* canonical_candidate — Memory candidate */}
              {isMemoryCandidate(item.canonical_status) && (
                <>
                  <button
                    onClick={() => handleMemoryAction('confirm_memory')}
                    disabled={memoryActioning}
                    className="font-body text-xs px-3 py-1.5 border border-green-400/30 text-green-400 hover:bg-green-400/10 transition-all disabled:opacity-40"
                  >
                    Confirm Memory
                  </button>
                  <button
                    onClick={() => handleMemoryAction('reject_memory')}
                    disabled={memoryActioning}
                    className="font-body text-xs px-3 py-1.5 border border-red-400/20 text-red-400/60 hover:bg-red-400/10 transition-all disabled:opacity-40"
                  >
                    Reject Memory
                  </button>
                </>
              )}
              {/* canonical — Memory, can demote */}
              {isMemory(item.canonical_status) && (
                <>
                  <button
                    onClick={() => handleMemoryAction('demote_memory')}
                    disabled={memoryActioning}
                    className="font-body text-xs px-3 py-1.5 border border-house-border text-text-muted hover:text-text-secondary hover:border-house-muted transition-all disabled:opacity-40"
                  >
                    Demote Memory
                  </button>
                  <button
                    onClick={() => handleMemoryAction('reject_memory')}
                    disabled={memoryActioning}
                    className="font-body text-xs px-3 py-1.5 border border-red-400/20 text-red-400/60 hover:bg-red-400/10 transition-all disabled:opacity-40"
                  >
                    Reject Memory
                  </button>
                </>
              )}
              {/* archive_only — rejected/archive-only, can restore to candidate */}
              {item.canonical_status === 'archive_only' && (
                <button
                  onClick={() => handleMemoryAction('restore_candidate')}
                  disabled={memoryActioning}
                  className="font-body text-xs px-3 py-1.5 border border-house-border text-text-muted hover:text-text-secondary hover:border-house-muted transition-all disabled:opacity-40"
                >
                  Restore candidate
                </button>
              )}
            </div>
            {memoryError && (
              <p className="font-body text-xs text-red-400">{memoryError}</p>
            )}
          </section>

          {/* Curation actions */}
          <section className="space-y-3">
            <p className="font-body text-xs text-text-muted uppercase tracking-widest">Curation</p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {/* Status */}
              <div>
                <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Status</label>
                <select
                  value={item.canonical_status}
                  onChange={e => patch({ canonical_status: e.target.value as CanonicalStatus })}
                  disabled={patching}
                  className="w-full font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1.5 outline-none focus:border-house-muted disabled:opacity-40"
                >
                  {ALL_STATUSES.map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>

              {/* Visibility */}
              <div>
                <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Visibility</label>
                <select
                  value={item.visibility}
                  onChange={e => patch({ visibility: e.target.value as ArchiveVisibility })}
                  disabled={patching}
                  className="w-full font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1.5 outline-none focus:border-house-muted disabled:opacity-40"
                >
                  {ALL_VISIBILITIES.map(v => (
                    <option key={v} value={v}>{VISIBILITY_LABELS[v]}</option>
                  ))}
                </select>
              </div>

              {/* Category */}
              <div>
                <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Category</label>
                <select
                  value={item.category}
                  onChange={e => patch({ category: e.target.value as ArchiveCategory })}
                  disabled={patching}
                  className="w-full font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1.5 outline-none focus:border-house-muted disabled:opacity-40"
                >
                  {ALL_CATEGORIES.map(c => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </div>

              {/* Sensitivity */}
              <div>
                <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Sensitivity</label>
                <select
                  value={item.sensitivity}
                  onChange={e => patch({ sensitivity: e.target.value as Sensitivity })}
                  disabled={patching}
                  className="w-full font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1.5 outline-none focus:border-house-muted disabled:opacity-40"
                >
                  {ALL_SENSITIVITIES.map(s => (
                    <option key={s} value={s}>{SENSITIVITY_LABELS[s]}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick-mark canonical */}
            {item.canonical_status !== 'canonical' && (
              <button
                onClick={() => patch({ canonical_status: 'canonical' })}
                disabled={patching}
                className="font-body text-xs px-4 py-1.5 border border-green-400/30 text-green-400 hover:bg-green-400/10 transition-all disabled:opacity-40"
              >
                Mark as memory
              </button>
            )}

            {/* Soft delete */}
            <div className="pt-2 border-t border-house-border/40">
              {deleteConfirm ? (
                <div className="flex items-center gap-3">
                  <span className="font-body text-xs text-red-400">Remove this item?</span>
                  <button
                    onClick={handleDelete}
                    disabled={patching}
                    className="font-body text-xs px-3 py-1 border border-red-400/30 text-red-400 hover:bg-red-400/10 transition-all disabled:opacity-40"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(false)}
                    className="font-body text-xs text-text-muted hover:text-text-secondary"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="font-body text-xs text-text-muted hover:text-red-400/60 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-body text-[10px] text-text-muted tracking-wide block">{label}</span>
      <span className="font-body text-xs text-text-secondary">{value}</span>
    </div>
  )
}
