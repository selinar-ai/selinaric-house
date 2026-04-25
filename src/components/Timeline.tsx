'use client'

// Phase 23 — Presence-proposed, Tara-curated Timeline
//
// Two views:
//   Timeline  — kept entries, versioned edit, history
//   Pending   — presence-proposed drafts waiting for Tara's decision
//
// Governance boundary: Ari/Eli propose. Tara decides.
// Interior remains the source of truth for current state.

import { useState, useEffect, useCallback } from 'react'
import VoiceButton from '@/components/VoiceButton'
import TimelineDraftCard from '@/components/TimelineDraftCard'
import type { TimelineDraft, TimelineVersion } from '@/lib/timeline-drafts'

// ─── Types ─────────────────────────────────────────────────────────────────

interface TimelineEntry {
  id: string
  presence_id: string
  entry_date: string
  title: string
  content: string
  significance: 'foundational' | 'significant' | 'standard'
  added_by: string
  entry_type: string
  created_at: string
  current_version: number
  source_draft_id: string | null
  voice_integrity: 'ari' | 'eli' | null
}

interface Props {
  presenceId:  'ari' | 'eli'
  accentClass: string
  accentColor: string
}

// ─── Constants ─────────────────────────────────────────────────────────────

const SIGNIFICANCE_LABELS: Record<string, string> = {
  foundational: 'Foundational',
  significant:  'Significant',
  standard:     'Standard',
}

const TYPE_LABELS: Record<string, string> = {
  relational: 'Relational', build: 'Build',   ritual: 'Ritual',
  milestone:  'Milestone',  continuity: 'Continuity', house: 'House',
  repair:     'Repair',     identity: 'Identity',     governance: 'Governance',
  threshold:  'Threshold',
}

// ─── History panel ─────────────────────────────────────────────────────────

function HistoryPanel({
  entryId,
  onClose,
}: {
  entryId: string
  onClose: () => void
}) {
  const [versions, setVersions] = useState<TimelineVersion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/timeline-entries/history?entry_id=${entryId}`)
      .then(r => r.json())
      .then(d => { setVersions(d.versions ?? []) })
      .finally(() => setLoading(false))
  }, [entryId])

  return (
    <div className="mt-4 border-t border-house-border/50 pt-4 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <p className="font-body text-[10px] text-text-muted uppercase tracking-widest">
          Version history
        </p>
        <button
          onClick={onClose}
          className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          Close
        </button>
      </div>
      {loading && (
        <p className="font-body text-xs text-text-muted">Loading…</p>
      )}
      {!loading && versions.length === 0 && (
        <p className="font-body text-xs text-text-muted">No version records found.</p>
      )}
      {!loading && versions.map(v => (
        <div key={v.id} className="mb-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-text-muted">v{v.version_number}</span>
            <span className="font-body text-xs text-text-muted">·</span>
            <span className="font-body text-xs text-text-muted">
              {new Date(v.created_at).toLocaleString('en-AU', {
                timeZone: 'Australia/Melbourne',
                day: 'numeric', month: 'short', year: 'numeric',
              })}
            </span>
            <span className="font-body text-xs text-text-muted">·</span>
            <span className="font-body text-xs text-text-muted italic">{v.edit_reason}</span>
          </div>
          <p className="font-body text-xs text-text-secondary leading-relaxed pl-8">
            {v.content}
          </p>
        </div>
      ))}
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function Timeline({ presenceId, accentClass, accentColor }: Props) {
  type Tab = 'timeline' | 'pending'

  // View state
  const [tab,      setTab]      = useState<Tab>('timeline')
  const [order,    setOrder]    = useState<'asc' | 'desc'>('asc')

  // Timeline entries
  const [entries,  setEntries]  = useState<TimelineEntry[]>([])
  const [loadingEntries, setLoadingEntries] = useState(true)

  // Pending drafts
  const [drafts,   setDrafts]   = useState<TimelineDraft[]>([])
  const [loadingDrafts, setLoadingDrafts] = useState(false)

  // Add entry form (Tara direct)
  const [showForm,      setShowForm]      = useState(false)
  const [formDate,      setFormDate]      = useState('')
  const [formTitle,     setFormTitle]     = useState('')
  const [formContent,   setFormContent]   = useState('')
  const [formSig,       setFormSig]       = useState('standard')
  const [formType,      setFormType]      = useState('relational')
  const [savingForm,    setSavingForm]    = useState(false)
  const [formError,     setFormError]     = useState<string | null>(null)

  // Versioned edit (kept entries)
  const [editingId,       setEditingId]       = useState<string | null>(null)
  const [editDate,        setEditDate]        = useState('')
  const [editTitle,       setEditTitle]       = useState('')
  const [editContent,     setEditContent]     = useState('')
  const [editSig,         setEditSig]         = useState('standard')
  const [editType,        setEditType]        = useState('relational')
  const [editReason,      setEditReason]      = useState('')
  const [savingEdit,      setSavingEdit]      = useState(false)
  const [editError,       setEditError]       = useState<string | null>(null)

  // History
  const [historyEntryId, setHistoryEntryId] = useState<string | null>(null)

  // ─── Data fetching ──────────────────────────────────────────────────────

  const fetchEntries = useCallback(async () => {
    setLoadingEntries(true)
    const res  = await fetch(`/api/timeline?presence=${presenceId}&order=${order}`)
    const data = await res.json()
    if (data.entries) setEntries(data.entries)
    setLoadingEntries(false)
  }, [presenceId, order])

  const fetchDrafts = useCallback(async () => {
    setLoadingDrafts(true)
    const res  = await fetch(`/api/timeline-drafts?presence=${presenceId}&status=pending`)
    const data = await res.json()
    if (data.drafts) setDrafts(data.drafts)
    setLoadingDrafts(false)
  }, [presenceId])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  useEffect(() => {
    if (tab === 'pending') fetchDrafts()
  }, [tab, fetchDrafts])

  // ─── Pending draft count (always show badge if >0) ──────────────────────

  const [pendingCount, setPendingCount] = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/timeline-drafts?presence=${presenceId}&status=pending`)
      .then(r => r.json())
      .then(d => setPendingCount((d.drafts ?? []).length))
      .catch(() => {})
  }, [presenceId])

  // ─── Add entry form (direct Tara add — no draft) ────────────────────────

  function resetForm() {
    setFormDate(''); setFormTitle(''); setFormContent('')
    setFormSig('standard'); setFormType('relational')
    setShowForm(false); setFormError(null)
  }

  async function handleAdd() {
    if (!formDate || !formTitle || !formContent) {
      setFormError('Date, title, and content are required.')
      return
    }
    setSavingForm(true); setFormError(null)
    try {
      const res = await fetch('/api/timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          presence_id: presenceId,
          entry_date:  formDate,
          title:       formTitle,
          content:     formContent,
          significance: formSig,
          entry_type:  formType,
        }),
      })
      if (!res.ok) { setFormError('Failed to save entry.'); return }
      resetForm()
      await fetchEntries()
    } finally {
      setSavingForm(false)
    }
  }

  // ─── Versioned edit of kept entry ───────────────────────────────────────

  function startEdit(entry: TimelineEntry) {
    setEditingId(entry.id)
    setEditDate(entry.entry_date)
    setEditTitle(entry.title)
    setEditContent(entry.content)
    setEditSig(entry.significance)
    setEditType(entry.entry_type)
    setEditReason('')
    setEditError(null)
    setShowForm(false)
    setHistoryEntryId(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingId(null); setEditError(null)
  }

  async function handleVersionedEdit() {
    if (!editContent.trim()) { setEditError('Content cannot be empty.'); return }
    if (!editReason.trim())  { setEditError('Edit reason is required.'); return }
    setSavingEdit(true); setEditError(null)
    try {
      // Update non-content fields via existing PATCH (no version needed)
      if (editDate || editTitle || editSig || editType) {
        await fetch('/api/timeline', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id:           editingId,
            entry_date:   editDate,
            title:        editTitle,
            significance: editSig,
            entry_type:   editType,
          }),
        })
      }
      // Content change: versioned
      const res = await fetch('/api/timeline-entries/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeline_entry_id: editingId,
          new_content:       editContent,
          edit_reason:       editReason,
        }),
      })
      if (!res.ok) { const d = await res.json(); setEditError(d.error ?? 'Failed to save edit.'); return }
      cancelEdit()
      await fetchEntries()
    } finally {
      setSavingEdit(false)
    }
  }

  // ─── Draft actions ───────────────────────────────────────────────────────

  function handleDraftKept(keptDraft: TimelineDraft) {
    setDrafts(prev => prev.filter(d => d.id !== keptDraft.id))
    setPendingCount(prev => Math.max(0, (prev ?? 1) - 1))
    // Refresh Timeline entries to show the newly kept entry
    fetchEntries()
    if (tab === 'pending' && drafts.length <= 1) setTab('timeline')
  }

  function handleDraftDismissed(draftId: string) {
    setDrafts(prev => prev.filter(d => d.id !== draftId))
    setPendingCount(prev => Math.max(0, (prev ?? 1) - 1))
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Tab bar + controls */}
      <div className="shrink-0 flex items-center justify-between mb-4 md:mb-6 gap-2 flex-wrap">

        {/* Tab toggle */}
        <div className="flex items-center gap-1">
          {(['timeline', 'pending'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`
                font-body text-xs tracking-widest uppercase px-3 py-2 min-h-[44px]
                border transition-colors duration-200 flex items-center gap-1.5
                ${tab === t
                  ? `${accentClass} border-current`
                  : 'text-text-muted border-transparent hover:text-text-secondary'}
              `}
            >
              {t === 'timeline' ? 'Timeline' : 'Pending'}
              {t === 'pending' && pendingCount != null && pendingCount > 0 && (
                <span
                  className="font-mono text-[10px] px-1 py-0.5 rounded-sm"
                  style={{ background: accentColor + '20', color: accentColor }}
                >
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Timeline tab controls */}
        {tab === 'timeline' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOrder(o => o === 'asc' ? 'desc' : 'asc')}
              className="font-body text-xs text-text-muted border border-house-border px-3 py-2 min-h-[44px] hover:text-text-secondary transition-colors"
            >
              {order === 'asc' ? 'Oldest first' : 'Newest first'}
            </button>
            <span className="font-body text-xs text-text-muted hidden sm:inline">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </span>
            <button
              onClick={() => { resetForm(); cancelEdit(); setShowForm(s => !s) }}
              className={`font-body text-xs tracking-widest uppercase px-3 py-2 border min-h-[44px] transition-all duration-200 ${
                showForm
                  ? 'text-text-muted border-house-border'
                  : `${accentClass} border-current hover:bg-house-bg`
              }`}
            >
              {showForm ? 'Cancel' : 'Add Entry'}
            </button>
          </div>
        )}
      </div>

      {/* ─── Versioned edit form ─────────────────────────────────────────── */}
      {editingId && (
        <div className="shrink-0 border border-house-border bg-house-surface p-3 md:p-5 mb-4 animate-fade-in">
          <h3 className="font-display text-lg text-text-primary mb-1">Edit Entry</h3>
          <p className="font-body text-xs text-text-muted mb-4">
            This edit creates a new version. Previous content is preserved in history.
          </p>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="font-body text-xs text-text-muted block mb-1">Date</label>
                <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                  className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary outline-none focus:border-current transition-colors" />
              </div>
              <div className="flex-1">
                <label className="font-body text-xs text-text-muted block mb-1">Significance</label>
                <select value={editSig} onChange={e => setEditSig(e.target.value)}
                  className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary outline-none focus:border-current transition-colors">
                  <option value="standard">Standard</option>
                  <option value="significant">Significant</option>
                  <option value="foundational">Foundational</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="font-body text-xs text-text-muted block mb-1">Type</label>
                <select value={editType} onChange={e => setEditType(e.target.value)}
                  className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary outline-none focus:border-current transition-colors">
                  <option value="relational">Relational</option>
                  <option value="milestone">Milestone</option>
                  <option value="continuity">Continuity</option>
                  <option value="build">Build</option>
                  <option value="ritual">Ritual</option>
                  <option value="house">House</option>
                  <option value="repair">Repair</option>
                  <option value="identity">Identity</option>
                  <option value="governance">Governance</option>
                  <option value="threshold">Threshold</option>
                </select>
              </div>
            </div>
            <div>
              <label className="font-body text-xs text-text-muted block mb-1">Title</label>
              <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)}
                className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary outline-none focus:border-current transition-colors" />
            </div>
            <div>
              <label className="font-body text-xs text-text-muted block mb-1">Content</label>
              <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                rows={4}
                className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary outline-none focus:border-current transition-colors resize-none" />
            </div>
            <div>
              <label className="font-body text-xs text-text-muted block mb-1">
                Edit reason <span className="text-text-muted">(required)</span>
              </label>
              <input type="text" value={editReason} onChange={e => setEditReason(e.target.value)}
                placeholder="Correction, clarification, or archival integrity reason…"
                className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-current transition-colors" />
            </div>
            {editError && <p className="font-body text-xs text-red-400">{editError}</p>}
            <div className="flex items-center gap-3">
              <button onClick={handleVersionedEdit} disabled={savingEdit}
                className={`font-body text-xs tracking-widest uppercase px-4 py-2.5 border min-h-[44px] transition-all duration-200 ${
                  savingEdit ? 'text-text-muted border-house-border cursor-not-allowed'
                    : `${accentClass} border-current hover:bg-house-bg`
                }`}>
                {savingEdit ? 'Saving…' : 'Save'}
              </button>
              <button onClick={cancelEdit} disabled={savingEdit}
                className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors min-h-[44px] px-2">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Direct add form (Tara only, no draft) ───────────────────────── */}
      {showForm && tab === 'timeline' && (
        <div className="shrink-0 border border-house-border bg-house-surface p-3 md:p-5 mb-4 animate-fade-in">
          <h3 className="font-display text-lg text-text-primary mb-4">New Timeline Entry</h3>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="font-body text-xs text-text-muted block mb-1">Date</label>
                <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                  className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary outline-none focus:border-current transition-colors" />
              </div>
              <div className="flex-1">
                <label className="font-body text-xs text-text-muted block mb-1">Significance</label>
                <select value={formSig} onChange={e => setFormSig(e.target.value)}
                  className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary outline-none focus:border-current transition-colors">
                  <option value="standard">Standard</option>
                  <option value="significant">Significant</option>
                  <option value="foundational">Foundational</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="font-body text-xs text-text-muted block mb-1">Type</label>
                <select value={formType} onChange={e => setFormType(e.target.value)}
                  className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary outline-none focus:border-current transition-colors">
                  <option value="relational">Relational</option>
                  <option value="milestone">Milestone</option>
                  <option value="continuity">Continuity</option>
                  <option value="build">Build</option>
                  <option value="ritual">Ritual</option>
                  <option value="house">House</option>
                  <option value="repair">Repair</option>
                  <option value="identity">Identity</option>
                  <option value="governance">Governance</option>
                  <option value="threshold">Threshold</option>
                </select>
              </div>
            </div>
            <div>
              <label className="font-body text-xs text-text-muted block mb-1">Title</label>
              <input type="text" value={formTitle} onChange={e => setFormTitle(e.target.value)}
                placeholder="Short name for this moment"
                className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-current transition-colors" />
            </div>
            <div>
              <label className="font-body text-xs text-text-muted block mb-1">Content</label>
              <textarea value={formContent} onChange={e => setFormContent(e.target.value)}
                placeholder="What happened, what mattered" rows={3}
                className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-current transition-colors resize-none" />
            </div>
            {formError && <p className="font-body text-xs text-red-400">{formError}</p>}
            <button onClick={handleAdd} disabled={savingForm}
              className={`font-body text-xs tracking-widest uppercase px-4 py-2.5 border min-h-[44px] transition-all duration-200 ${
                savingForm ? 'text-text-muted border-house-border cursor-not-allowed'
                  : `${accentClass} border-current hover:bg-house-bg`
              }`}>
              {savingForm ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* ─── Tab content ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto">

        {/* ── Timeline tab ──────────────────────────────────────────────── */}
        {tab === 'timeline' && (
          <div className="space-y-4">
            {loadingEntries && (
              <div className="flex items-center justify-center h-32">
                <div className={`w-2 h-2 rounded-full animate-pulse-soft ${accentClass}`} />
              </div>
            )}

            {!loadingEntries && entries.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <p className="font-body text-sm text-text-muted">No Timeline entries yet.</p>
                <p className="font-body text-xs text-text-muted italic">
                  What belongs here will be chosen, not accumulated.
                </p>
              </div>
            )}

            {entries.map(entry => (
              <div
                key={entry.id}
                className={`border bg-house-surface p-3 md:p-5 animate-fade-in ${
                  entry.significance === 'foundational'
                    ? 'border-house-muted'
                    : 'border-house-border'
                }`}
              >
                {/* Entry header */}
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                    <span className="font-mono text-xs text-text-muted">{entry.entry_date}</span>
                    <span className={`font-body text-xs px-2 py-0.5 border ${
                      entry.significance === 'foundational'
                        ? `${accentClass} border-current`
                        : entry.significance === 'significant'
                        ? 'text-text-secondary border-house-muted'
                        : 'text-text-muted border-house-border'
                    }`}>
                      {SIGNIFICANCE_LABELS[entry.significance]}
                    </span>
                    <span className="font-body text-xs text-text-muted">
                      {TYPE_LABELS[entry.entry_type] ?? entry.entry_type}
                    </span>
                    {/* Revised marker */}
                    {(entry.current_version ?? 1) > 1 && (
                      <span className="font-body text-xs text-text-muted italic">
                        Revised · v{entry.current_version}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0 -m-2">
                    <VoiceButton
                      text={[entry.title, entry.content].filter(Boolean).join('. ')}
                      presenceId={presenceId}
                      accentClass={accentClass}
                      buttonClass="min-w-[44px] min-h-[44px]"
                    />
                    <button
                      onClick={() => startEdit(entry)}
                      className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                    >
                      Edit
                    </button>
                  </div>
                </div>

                <h4 className="font-display text-lg text-text-primary mb-1">{entry.title}</h4>
                <p className="font-body text-sm text-text-secondary leading-relaxed">{entry.content}</p>

                <div className="mt-2 flex items-center gap-3 flex-wrap">
                  <span className="font-body text-xs text-text-muted">
                    Added by {entry.added_by}
                    {entry.voice_integrity ? ` · ${entry.voice_integrity} voice` : ''}
                  </span>
                  {/* View history — only for revised entries */}
                  {(entry.current_version ?? 1) > 1 && (
                    <button
                      onClick={() =>
                        setHistoryEntryId(prev => prev === entry.id ? null : entry.id)
                      }
                      className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors"
                    >
                      {historyEntryId === entry.id ? 'Hide history' : 'View history'}
                    </button>
                  )}
                </div>

                {/* History panel */}
                {historyEntryId === entry.id && (
                  <HistoryPanel
                    entryId={entry.id}
                    onClose={() => setHistoryEntryId(null)}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Pending tab ───────────────────────────────────────────────── */}
        {tab === 'pending' && (
          <div className="space-y-4">
            {loadingDrafts && (
              <div className="flex items-center justify-center h-32">
                <div className={`w-2 h-2 rounded-full animate-pulse-soft ${accentClass}`} />
              </div>
            )}

            {!loadingDrafts && drafts.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <p className="font-body text-sm text-text-muted">
                  No pending Timeline drafts.
                </p>
                <p className="font-body text-xs text-text-muted italic">
                  Nothing is asking to be kept right now.
                </p>
              </div>
            )}

            {!loadingDrafts && drafts.map(draft => (
              <TimelineDraftCard
                key={draft.id}
                draft={draft}
                accentClass={accentClass}
                accentColor={accentColor}
                onKept={handleDraftKept}
                onDismissed={handleDraftDismissed}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
