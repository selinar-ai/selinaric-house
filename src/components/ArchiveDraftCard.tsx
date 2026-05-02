'use client'

// Phase 27B — Archive draft card.
// Collapsed: proposed title, suggested memory status, draft status, category.
// Expanded: full proposed content, rationale, editable fields, approval actions.
// Tara is the approval gate. Nothing becomes an Archive Entry without her action.

import { useState } from 'react'
import {
  CATEGORY_LABELS,
  SENSITIVITY_LABELS,
  VISIBILITY_LABELS,
  DRAFT_STATUS_LABELS,
  DRAFT_STATUS_COLOR,
  SUGGESTED_MEMORY_LABELS,
  SUGGESTED_MEMORY_COLOR,
  ALL_CATEGORIES,
  ALL_SENSITIVITIES,
  ALL_VISIBILITIES,
  ALL_SUGGESTED_MEMORY_STATUSES,
  type ArchiveEntryDraft,
  type ArchiveCategory,
  type Sensitivity,
  type ArchiveVisibility,
  type SuggestedMemoryStatus,
} from '@/lib/archives'

interface Props {
  draft:           ArchiveEntryDraft
  onRefresh:       () => void
  selected?:       boolean
  onToggleSelect?: (id: string) => void
}

export default function ArchiveDraftCard({ draft, onRefresh, selected = false, onToggleSelect }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [patching, setPatching] = useState(false)
  const [editingContent, setEditingContent] = useState(false)
  const [titleValue, setTitleValue] = useState(draft.proposed_title)
  const [contentValue, setContentValue] = useState(draft.proposed_content)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const isPending = draft.draft_status === 'pending_review'
  const isResolved = !isPending

  const statusColor = DRAFT_STATUS_COLOR[draft.draft_status]
  const memoryColor = SUGGESTED_MEMORY_COLOR[draft.suggested_memory_status]

  async function patch(body: Record<string, unknown>) {
    setPatching(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/archive-drafts/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Update failed')
      onRefresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setPatching(false)
    }
  }

  async function handleApprove() {
    await patch({ action: 'approve' })
  }

  async function handleEditApprove() {
    await patch({
      action: 'edit_approve',
      proposed_title: titleValue,
      proposed_content: contentValue,
    })
    setEditingContent(false)
  }

  async function handleMerge() {
    await patch({ action: 'merge' })
  }

  async function handleArchiveOnly() {
    await patch({ action: 'archive_only' })
  }

  async function handleReject() {
    await patch({ action: 'reject' })
  }

  async function handleDelete() {
    setPatching(true)
    try {
      const res = await fetch(`/api/archive-drafts/${draft.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Delete failed')
      }
      onRefresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Delete failed')
      setDeleteConfirm(false)
    } finally {
      setPatching(false)
    }
  }

  const presenceLabel = draft.extracted_by === 'ari' ? '◈ Ari' : '◉ Eli'
  const presenceColor = draft.extracted_by === 'ari' ? 'text-ari-primary' : 'text-eli-primary'

  return (
    <div className={`border-b border-house-border transition-colors duration-150 ${patching ? 'opacity-60' : ''} ${selected ? 'bg-house-bg/60' : ''}`}>
      <div className="flex items-stretch">

        {/* Checkbox column */}
        {onToggleSelect && (
          <div className="flex items-start pt-3.5 pl-3 pr-1 shrink-0">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(draft.id)}
              onClick={e => e.stopPropagation()}
              className="accent-house-muted mt-0.5"
            />
          </div>
        )}

        {/* Collapsed header */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-1 text-left px-4 py-3 hover:bg-house-bg/40 transition-colors group min-w-0"
        >
        <div className="flex items-start gap-2 flex-wrap">
          <span className="font-body text-sm text-text-primary font-medium flex-1 min-w-0 leading-snug">
            {draft.proposed_title}
          </span>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            <span className={`font-body text-[10px] ${memoryColor}`}>
              {SUGGESTED_MEMORY_LABELS[draft.suggested_memory_status]}
            </span>
            <span className="text-text-muted text-[10px]">·</span>
            <span className={`font-body text-[10px] ${statusColor}`}>
              {DRAFT_STATUS_LABELS[draft.draft_status]}
            </span>
            <span className={`font-mono text-[10px] ${expanded ? 'text-text-secondary' : 'text-text-muted'} group-hover:text-text-secondary`}>
              {expanded ? '▾' : '▸'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className={`font-body text-xs ${presenceColor}`}>{presenceLabel}</span>
          <span className="text-text-muted text-[10px]">·</span>
          <span className="font-body text-xs text-text-muted">{CATEGORY_LABELS[draft.proposed_category]}</span>
          <span className="text-text-muted text-[10px]">·</span>
          <span className="font-body text-xs text-text-muted">{SENSITIVITY_LABELS[draft.proposed_sensitivity]}</span>
        </div>
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-house-border/40 bg-house-bg/30 px-4 py-4 space-y-5">

          {/* Proposed content */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="font-body text-xs text-text-muted uppercase tracking-widest">Proposed content</p>
              {isPending && !editingContent && (
                <button
                  onClick={() => setEditingContent(true)}
                  className="font-body text-[10px] text-text-muted hover:text-text-secondary transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
            {editingContent ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={titleValue}
                  onChange={e => setTitleValue(e.target.value)}
                  className="w-full font-body text-sm bg-house-surface border border-house-border text-text-primary px-3 py-2 outline-none focus:border-house-muted"
                  placeholder="Proposed title…"
                />
                <textarea
                  value={contentValue}
                  onChange={e => setContentValue(e.target.value)}
                  rows={6}
                  className="w-full font-body text-sm bg-house-surface border border-house-border text-text-primary px-3 py-2 outline-none focus:border-house-muted resize-y"
                  placeholder="Proposed content…"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingContent(false)}
                    className="font-body text-xs text-text-muted hover:text-text-secondary"
                  >
                    Done editing
                  </button>
                </div>
              </div>
            ) : (
              <p className="font-body text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                {draft.proposed_content}
              </p>
            )}
          </section>

          {/* Rationale */}
          {draft.extraction_rationale && (
            <section>
              <p className="font-body text-xs text-text-muted uppercase tracking-widest mb-2">
                {draft.extracted_by === 'ari' ? "Ari's rationale" : "Eli's rationale"}
              </p>
              <p className="font-body text-xs text-text-muted italic leading-relaxed">
                {draft.extraction_rationale}
              </p>
            </section>
          )}

          {/* Metadata */}
          <section className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div>
              <span className="font-body text-[10px] text-text-muted tracking-wide block">Category</span>
              {isPending ? (
                <select
                  value={draft.proposed_category}
                  onChange={e => patch({ proposed_category: e.target.value as ArchiveCategory })}
                  disabled={patching}
                  className="font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1 outline-none focus:border-house-muted disabled:opacity-40 w-full mt-0.5"
                >
                  {ALL_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
              ) : (
                <span className="font-body text-xs text-text-secondary">{CATEGORY_LABELS[draft.proposed_category]}</span>
              )}
            </div>
            <div>
              <span className="font-body text-[10px] text-text-muted tracking-wide block">Sensitivity</span>
              {isPending ? (
                <select
                  value={draft.proposed_sensitivity}
                  onChange={e => patch({ proposed_sensitivity: e.target.value as Sensitivity })}
                  disabled={patching}
                  className="font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1 outline-none focus:border-house-muted disabled:opacity-40 w-full mt-0.5"
                >
                  {ALL_SENSITIVITIES.map(s => <option key={s} value={s}>{SENSITIVITY_LABELS[s]}</option>)}
                </select>
              ) : (
                <span className="font-body text-xs text-text-secondary">{SENSITIVITY_LABELS[draft.proposed_sensitivity]}</span>
              )}
            </div>
            <div>
              <span className="font-body text-[10px] text-text-muted tracking-wide block">Visibility</span>
              {isPending ? (
                <select
                  value={draft.proposed_visibility}
                  onChange={e => patch({ proposed_visibility: e.target.value as ArchiveVisibility })}
                  disabled={patching}
                  className="font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1 outline-none focus:border-house-muted disabled:opacity-40 w-full mt-0.5"
                >
                  {ALL_VISIBILITIES.map(v => <option key={v} value={v}>{VISIBILITY_LABELS[v]}</option>)}
                </select>
              ) : (
                <span className="font-body text-xs text-text-secondary">{VISIBILITY_LABELS[draft.proposed_visibility]}</span>
              )}
            </div>
            <div>
              <span className="font-body text-[10px] text-text-muted tracking-wide block">Memory suggestion</span>
              {isPending ? (
                <select
                  value={draft.suggested_memory_status}
                  onChange={e => patch({ suggested_memory_status: e.target.value as SuggestedMemoryStatus })}
                  disabled={patching}
                  className="font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1 outline-none focus:border-house-muted disabled:opacity-40 w-full mt-0.5"
                >
                  {ALL_SUGGESTED_MEMORY_STATUSES.map(s => (
                    <option key={s} value={s}>{SUGGESTED_MEMORY_LABELS[s]}</option>
                  ))}
                </select>
              ) : (
                <span className={`font-body text-xs ${memoryColor}`}>{SUGGESTED_MEMORY_LABELS[draft.suggested_memory_status]}</span>
              )}
            </div>
            {draft.archive_item_id && (
              <div className="col-span-2">
                <span className="font-body text-[10px] text-text-muted tracking-wide block">Archive entry</span>
                <span className="font-mono text-[10px] text-text-secondary">{draft.archive_item_id}</span>
              </div>
            )}
          </section>

          {/* Approval actions */}
          {isPending && (
            <section className="space-y-3">
              <p className="font-body text-xs text-text-muted uppercase tracking-widest">Review</p>

              <div className="flex gap-2 flex-wrap">
                {/* Approve — creates archive entry with suggested status mapping */}
                <button
                  onClick={handleApprove}
                  disabled={patching}
                  className="font-body text-xs px-3 py-1.5 border border-green-400/30 text-green-400 hover:bg-green-400/10 transition-all disabled:opacity-40"
                >
                  Approve
                </button>

                {/* Edit + approve — saves edits then creates archive entry */}
                {editingContent && (
                  <button
                    onClick={handleEditApprove}
                    disabled={patching || !titleValue.trim() || !contentValue.trim()}
                    className="font-body text-xs px-3 py-1.5 border border-green-400/30 text-green-400 hover:bg-green-400/10 transition-all disabled:opacity-40"
                  >
                    Save edits + approve
                  </button>
                )}

                {/* Merge — creates archive entry as canonical/Memory */}
                <button
                  onClick={handleMerge}
                  disabled={patching}
                  title="Create as Memory (canonical)"
                  className="font-body text-xs px-3 py-1.5 border border-blue-400/30 text-blue-400 hover:bg-blue-400/10 transition-all disabled:opacity-40"
                >
                  Merge as Memory
                </button>

                {/* Archive only — creates entry but marks archive_only */}
                <button
                  onClick={handleArchiveOnly}
                  disabled={patching}
                  title="Keep in archive but not for memory"
                  className="font-body text-xs px-3 py-1.5 border border-house-border text-text-muted hover:text-text-secondary hover:border-house-muted transition-all disabled:opacity-40"
                >
                  Archive only
                </button>

                {/* Reject — no archive entry created */}
                <button
                  onClick={handleReject}
                  disabled={patching}
                  className="font-body text-xs px-3 py-1.5 border border-red-400/20 text-red-400/60 hover:bg-red-400/10 transition-all disabled:opacity-40"
                >
                  Reject
                </button>
              </div>
            </section>
          )}

          {/* Status info for resolved drafts */}
          {isResolved && (
            <section>
              <p className={`font-body text-xs ${statusColor}`}>
                {DRAFT_STATUS_LABELS[draft.draft_status]}
                {draft.archive_item_id && ' — archive entry created'}
              </p>
            </section>
          )}

          {actionError && (
            <p className="font-body text-xs text-red-400">{actionError}</p>
          )}

          {/* Delete */}
          <div className="pt-2 border-t border-house-border/40">
            {deleteConfirm ? (
              <div className="flex items-center gap-3">
                <span className="font-body text-xs text-red-400">Remove this draft?</span>
                <button
                  onClick={handleDelete}
                  disabled={patching}
                  className="font-body text-xs px-3 py-1 border border-red-400/30 text-red-400 hover:bg-red-400/10 disabled:opacity-40"
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
                Remove draft
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
