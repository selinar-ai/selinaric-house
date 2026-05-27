'use client'

// Phase 37C — Bulk action toolbar for graph proposals

import { useState } from 'react'

interface BulkToolbarProps {
  selectedCount: number
  onAction: (action: string, reason?: string) => void
  onClear: () => void
  onExport: () => void
  loading: boolean
}

function ConfirmModal({
  action,
  count,
  onConfirm,
  onCancel,
}: {
  action: string
  count: number
  onConfirm: (reason: string) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState('')

  const actionLabels: Record<string, string> = {
    approved_graph: 'approve',
    rejected: 'reject',
    needs_more_evidence: 'mark as needs evidence',
    workspace_only: 'mark as workspace only',
    superseded: 'supersede',
    pending_review: 'restore to pending review',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-house-surface border border-house-border rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <h3 className="font-display text-lg text-text-primary mb-3">
          Confirm Bulk Action
        </h3>

        <p className="text-text-secondary text-sm font-body mb-2">
          You are about to <strong>{actionLabels[action] ?? action}</strong> {count} graph proposal{count !== 1 ? 's' : ''}.
        </p>

        <div className="bg-house-bg border border-house-border rounded p-3 mb-4">
          <p className="text-text-muted text-xs font-body leading-relaxed">
            This changes graph proposal review status only.
            It does not create Memory.
            It does not create Archive authority.
            It does not inject prompt truth.
          </p>
        </div>

        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Reason (optional)…"
          rows={2}
          className="
            w-full bg-house-bg border border-house-border rounded px-3 py-2 mb-4
            text-text-secondary text-xs font-body placeholder:text-text-muted
            focus:outline-none focus:border-house-muted resize-none
          "
        />

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-text-muted text-xs font-body hover:text-text-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            className="
              px-4 py-1.5 rounded text-xs font-body
              bg-house-muted/40 text-text-secondary border border-house-border
              hover:bg-house-muted/60 transition-colors
            "
          >
            Confirm bulk update
          </button>
        </div>
      </div>
    </div>
  )
}

export default function GraphProposalBulkToolbar({
  selectedCount,
  onAction,
  onClear,
  onExport,
  loading,
}: BulkToolbarProps) {
  const [confirmAction, setConfirmAction] = useState<string | null>(null)

  if (selectedCount === 0) return null

  function handleAction(action: string) {
    setConfirmAction(action)
  }

  function handleConfirm(reason: string) {
    if (confirmAction) {
      onAction(confirmAction, reason || undefined)
    }
    setConfirmAction(null)
  }

  const btnClass = `
    px-3 py-1 rounded text-[11px] font-body
    border border-house-border
    transition-colors disabled:opacity-40
  `

  return (
    <>
      <div className="
        flex items-center gap-3 px-4 py-2
        bg-house-surface/80 border border-house-border rounded
        animate-fade-in
      ">
        <span className="text-text-secondary text-xs font-body shrink-0">
          {selectedCount} selected
        </span>

        <div className="h-4 w-px bg-house-border" />

        <div className="flex items-center gap-2 flex-wrap">
          <button
            disabled={loading}
            onClick={() => handleAction('approved_graph')}
            className={`${btnClass} bg-emerald-900/20 text-emerald-300 hover:bg-emerald-900/40`}
          >
            Approve Selected
          </button>
          <button
            disabled={loading}
            onClick={() => handleAction('rejected')}
            className={`${btnClass} bg-red-900/20 text-red-300 hover:bg-red-900/40`}
          >
            Reject Selected
          </button>
          <button
            disabled={loading}
            onClick={() => handleAction('workspace_only')}
            className={`${btnClass} bg-slate-800/30 text-slate-300 hover:bg-slate-800/50`}
          >
            Workspace Only
          </button>
          <button
            disabled={loading}
            onClick={() => handleAction('needs_more_evidence')}
            className={`${btnClass} bg-blue-900/20 text-blue-300 hover:bg-blue-900/40`}
          >
            Needs Evidence
          </button>
          <button
            disabled={loading}
            onClick={onExport}
            className={`${btnClass} bg-house-muted/20 text-text-secondary hover:bg-house-muted/40`}
          >
            Export Selection
          </button>
        </div>

        <div className="flex-1" />

        <button
          onClick={onClear}
          className="text-text-muted text-xs hover:text-text-secondary transition-colors"
        >
          Clear
        </button>
      </div>

      {confirmAction && (
        <ConfirmModal
          action={confirmAction}
          count={selectedCount}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </>
  )
}
