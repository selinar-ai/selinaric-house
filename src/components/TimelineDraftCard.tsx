'use client'

// Phase 23 — Draft card for the Timeline Pending view
// Shows full draft context with Keep / Edit & Keep / Dismiss actions.
// Edit & Keep opens an inline editor with edit reason before keeping.

import { useState } from 'react'
import type { TimelineDraft, GateResults } from '@/lib/timeline-drafts'

interface Props {
  draft:          TimelineDraft
  accentClass:    string
  accentColor:    string
  onKept:         (draft: TimelineDraft) => void
  onDismissed:    (draftId: string) => void
}

const SIGNIFICANCE_LABELS: Record<string, string> = {
  foundational: 'Foundational',
  significant:  'Significant',
  standard:     'Standard',
}

const GATE_LABEL: Record<string, string> = {
  durability:   'Durability',
  compression:  'Compression',
  absence_test: 'Absence test',
}

function GateRow({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`font-mono text-[10px] ${passed ? 'text-green-500' : 'text-text-muted'}`}>
        {passed ? 'pass' : 'fail'}
      </span>
      <span className="font-body text-xs text-text-muted">{label}</span>
    </div>
  )
}

export default function TimelineDraftCard({
  draft, accentClass, accentColor, onKept, onDismissed,
}: Props) {
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [editText, setEditText] = useState(draft.draft_text)
  const [editReason, setEditReason] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isAri = draft.presence === 'ari'
  const gate = draft.gate_results as GateResults | null

  async function handleKeep() {
    setWorking(true)
    setError(null)
    try {
      const res = await fetch('/api/timeline-drafts/keep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_id: draft.id }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to keep draft'); return }
      onKept({ ...draft, status: 'kept', kept_timeline_entry_id: data.entry?.id ?? null })
    } finally {
      setWorking(false)
    }
  }

  async function handleEditKeep() {
    if (!editReason.trim()) { setError('Edit reason is required.'); return }
    setWorking(true)
    setError(null)
    try {
      const res = await fetch('/api/timeline-drafts/keep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft_id:     draft.id,
          edited_text:  editText,
          edit_reason:  editReason,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to keep draft'); return }
      onKept({ ...draft, status: 'kept', kept_timeline_entry_id: data.entry?.id ?? null })
    } finally {
      setWorking(false)
    }
  }

  async function handleDismiss() {
    setWorking(true)
    setError(null)
    try {
      const res = await fetch('/api/timeline-drafts/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_id: draft.id }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed to dismiss'); return }
      onDismissed(draft.id)
    } finally {
      setWorking(false)
    }
  }

  const dateStr = new Date(draft.created_at).toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="border border-house-border bg-house-surface p-4 md:p-5 animate-fade-in">

      {/* Header row — presence + significance + type */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span
          className="font-body text-xs px-2 py-0.5 border font-medium"
          style={{ borderColor: accentColor + '60', color: accentColor }}
        >
          {isAri ? 'Ari' : 'Eli'}
        </span>
        <span className="font-body text-xs text-text-muted border border-house-border px-2 py-0.5">
          {SIGNIFICANCE_LABELS[draft.significance] ?? draft.significance}
        </span>
        <span className="font-body text-xs text-text-muted">
          {draft.entry_type}
        </span>
        <span className="font-body text-xs text-text-muted ml-auto">
          {dateStr}
        </span>
      </div>

      {/* Draft text — or inline editor */}
      {mode === 'view' ? (
        <p className="font-body text-sm text-text-secondary leading-relaxed mb-4 whitespace-pre-wrap">
          {draft.draft_text}
        </p>
      ) : (
        <div className="mb-4 space-y-3">
          <textarea
            value={editText}
            onChange={e => setEditText(e.target.value)}
            rows={4}
            className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary outline-none focus:border-current transition-colors resize-none"
          />
          <div>
            <label className="font-body text-xs text-text-muted block mb-1">
              Edit reason <span className="text-text-muted">(required)</span>
            </label>
            <input
              type="text"
              value={editReason}
              onChange={e => setEditReason(e.target.value)}
              placeholder="Correction, clarification, or archival integrity reason…"
              className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-current transition-colors"
            />
          </div>
        </div>
      )}

      {/* Decision reason */}
      {draft.decision_reason && (
        <div className="mb-4">
          <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-1">
            Why this exists
          </p>
          <p className="font-body text-xs text-text-secondary leading-relaxed">
            {draft.decision_reason}
          </p>
        </div>
      )}

      {/* Gate results */}
      {gate && (
        <div className="mb-4">
          <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-2">
            Timeline gate
          </p>
          <div className="space-y-1">
            {(Object.entries(GATE_LABEL) as Array<[keyof typeof GATE_LABEL, string]>).map(([key, label]) => (
              <GateRow key={key} label={label} passed={!!(gate as Record<string, boolean>)[key]} />
            ))}
          </div>
        </div>
      )}

      {/* Source context (light) */}
      {draft.source_context && (
        <div className="mb-4">
          <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-1">
            Source
          </p>
          <p className="font-body text-xs text-text-muted">
            {(draft.source_context as { source?: string; trigger?: string }).source ?? '—'}
            {(draft.source_context as { trigger?: string }).trigger
              ? ` · ${(draft.source_context as { trigger: string }).trigger}`
              : ''}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="font-body text-xs text-red-400 mb-3">{error}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-house-border/50">
        {mode === 'view' ? (
          <>
            <button
              onClick={handleKeep}
              disabled={working}
              className={`font-body text-xs tracking-widest uppercase px-3 py-2 border min-h-[44px] transition-colors ${
                working
                  ? 'text-text-muted border-house-border cursor-not-allowed'
                  : `${accentClass} border-current hover:bg-house-bg`
              }`}
            >
              Keep
            </button>
            <button
              onClick={() => { setMode('edit'); setEditText(draft.draft_text); setEditReason('') }}
              disabled={working}
              className="font-body text-xs tracking-widest uppercase px-3 py-2 border border-house-border text-text-muted hover:text-text-secondary hover:border-house-muted min-h-[44px] transition-colors"
            >
              Edit & Keep
            </button>
            <button
              onClick={handleDismiss}
              disabled={working}
              className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors min-h-[44px] px-3 py-2"
            >
              Dismiss
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleEditKeep}
              disabled={working}
              className={`font-body text-xs tracking-widest uppercase px-3 py-2 border min-h-[44px] transition-colors ${
                working
                  ? 'text-text-muted border-house-border cursor-not-allowed'
                  : `${accentClass} border-current hover:bg-house-bg`
              }`}
            >
              {working ? 'Saving…' : 'Save & Keep'}
            </button>
            <button
              onClick={() => { setMode('view'); setError(null) }}
              disabled={working}
              className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors min-h-[44px] px-3 py-2"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}
