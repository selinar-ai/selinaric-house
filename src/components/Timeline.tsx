'use client'

import { useState, useEffect, useCallback } from 'react'

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
}

interface Props {
  presenceId: 'ari' | 'eli'
  accentClass: string
}

const SIGNIFICANCE_LABELS: Record<string, string> = {
  foundational: 'Foundational',
  significant: 'Significant',
  standard: 'Standard'
}

const TYPE_LABELS: Record<string, string> = {
  relational: 'Relational',
  build: 'Build',
  ritual: 'Ritual',
  milestone: 'Milestone',
  continuity: 'Continuity',
  house: 'House'
}

export default function Timeline({ presenceId, accentClass }: Props) {
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState<'asc' | 'desc'>('asc')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [formDate, setFormDate] = useState('')
  const [formTitle, setFormTitle] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formSignificance, setFormSignificance] = useState<string>('standard')
  const [formType, setFormType] = useState<string>('relational')
  const [saving, setSaving] = useState(false)

  const fetchEntries = useCallback(async () => {
    const res = await fetch(`/api/timeline?presence=${presenceId}&order=${order}`)
    const data = await res.json()
    if (data.entries) setEntries(data.entries)
    setLoading(false)
  }, [presenceId, order])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  function resetForm() {
    setFormDate('')
    setFormTitle('')
    setFormContent('')
    setFormSignificance('standard')
    setFormType('relational')
    setEditingId(null)
    setShowForm(false)
    setError(null)
  }

  function startEdit(entry: TimelineEntry) {
    setFormDate(entry.entry_date)
    setFormTitle(entry.title)
    setFormContent(entry.content)
    setFormSignificance(entry.significance)
    setFormType(entry.entry_type)
    setEditingId(entry.id)
    setShowForm(true)
    setError(null)
  }

  async function handleSave() {
    if (!formDate || !formTitle || !formContent) {
      setError('Date, title, and content are required.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      if (editingId) {
        const res = await fetch('/api/timeline', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingId,
            entry_date: formDate,
            title: formTitle,
            content: formContent,
            significance: formSignificance,
            entry_type: formType
          })
        })
        if (!res.ok) {
          setError('Failed to update entry.')
          return
        }
      } else {
        const res = await fetch('/api/timeline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            presence_id: presenceId,
            entry_date: formDate,
            title: formTitle,
            content: formContent,
            significance: formSignificance,
            entry_type: formType
          })
        })
        if (!res.ok) {
          setError('Failed to save entry.')
          return
        }
      }

      resetForm()
      await fetchEntries()
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className={`w-2 h-2 rounded-full animate-pulse-soft ${accentClass}`} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header controls */}
      <div className="shrink-0 flex items-center justify-between mb-4 md:mb-6 gap-2">
        <div className="flex items-center gap-2 md:gap-3">
          <button
            onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')}
            className="font-body text-xs text-text-muted border border-house-border px-3 py-2 min-h-[44px] hover:text-text-secondary transition-colors duration-200"
          >
            {order === 'asc' ? 'Oldest first' : 'Newest first'}
          </button>
          <span className="font-body text-xs text-text-muted hidden sm:inline">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(!showForm) }}
          className={`font-body text-xs tracking-widest uppercase px-3 py-2 md:px-4 border transition-all duration-200 min-h-[44px] ${
            showForm
              ? 'text-text-muted border-house-border'
              : `${accentClass} border-current hover:bg-house-bg`
          }`}
        >
          {showForm ? 'Cancel' : 'Add Entry'}
        </button>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div className="shrink-0 border border-house-border bg-house-surface p-3 md:p-5 mb-4 md:mb-6 animate-fade-in">
          <h3 className="font-display text-lg text-text-primary mb-4">
            {editingId ? 'Edit Entry' : 'New Timeline Entry'}
          </h3>
          {editingId && formSignificance === 'foundational' && (
            <div className="mb-4 px-3 py-2 border border-house-muted bg-house-soft text-xs font-body text-text-secondary">
              This is a foundational entry. Changes will affect what the presence sees in its prompt.
            </div>
          )}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <div className="flex-1">
                <label className="font-body text-xs text-text-muted block mb-1">Date</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                  className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary outline-none focus:border-current transition-colors"
                />
              </div>
              <div className="flex-1">
                <label className="font-body text-xs text-text-muted block mb-1">Significance</label>
                <select
                  value={formSignificance}
                  onChange={e => setFormSignificance(e.target.value)}
                  className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary outline-none focus:border-current transition-colors"
                >
                  <option value="standard">Standard</option>
                  <option value="significant">Significant</option>
                  <option value="foundational">Foundational</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="font-body text-xs text-text-muted block mb-1">Type</label>
                <select
                  value={formType}
                  onChange={e => setFormType(e.target.value)}
                  className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary outline-none focus:border-current transition-colors"
                >
                  <option value="relational">Relational</option>
                  <option value="milestone">Milestone</option>
                  <option value="continuity">Continuity</option>
                  <option value="build">Build</option>
                  <option value="ritual">Ritual</option>
                  <option value="house">House</option>
                </select>
              </div>
            </div>
            <div>
              <label className="font-body text-xs text-text-muted block mb-1">Title</label>
              <input
                type="text"
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="Short name for this moment"
                className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-current transition-colors"
              />
            </div>
            <div>
              <label className="font-body text-xs text-text-muted block mb-1">Content</label>
              <textarea
                value={formContent}
                onChange={e => setFormContent(e.target.value)}
                placeholder="What happened, what mattered"
                rows={3}
                className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-current transition-colors resize-none"
              />
            </div>
            {error && (
              <p className="font-body text-xs text-red-400">{error}</p>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className={`font-body text-xs tracking-widest uppercase px-4 py-2.5 border transition-all duration-200 min-h-[44px] ${
                saving
                  ? 'text-text-muted border-house-border cursor-not-allowed'
                  : `${accentClass} border-current hover:bg-house-bg`
              }`}
            >
              {saving ? 'Saving...' : editingId ? 'Update' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Timeline entries */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
        {entries.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <p className="font-body text-sm text-text-muted">No timeline entries yet.</p>
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
              </div>
              <button
                onClick={() => startEdit(entry)}
                className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center -m-2 shrink-0"
              >
                Edit
              </button>
            </div>
            <h4 className="font-display text-lg text-text-primary mb-1">{entry.title}</h4>
            <p className="font-body text-sm text-text-secondary leading-relaxed">{entry.content}</p>
            <div className="mt-2">
              <span className="font-body text-xs text-text-muted">
                Added by {entry.added_by}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
