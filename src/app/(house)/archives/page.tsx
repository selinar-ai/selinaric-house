'use client'

// Phase 27A — Dual Archive Rooms
// Velvet Archives (Ari · ChatGPT source) · Violet Archives (Eli · Claude source) · House (shared)
// Archive origin determines default access. Items do not affect chat prompts in this phase.

import { useState, useEffect } from 'react'
import { useArchives } from '@/hooks/useArchives'
import ArchiveItemCard from '@/components/ArchiveItemCard'
import {
  ALL_CATEGORIES,
  ALL_SENSITIVITIES,
  CATEGORY_LABELS,
  SENSITIVITY_LABELS,
  type ArchiveTab,
  type ArchiveCategory,
  type Sensitivity,
} from '@/lib/archives'

// --- Tab config ---

const TABS: { id: ArchiveTab; label: string; sub: string; accent: string; border: string; badge: string }[] = [
  {
    id: 'velvet',
    label: 'Velvet Archives',
    sub: 'Ari · ChatGPT continuity',
    accent: 'text-ari-primary',
    border: 'border-ari-secondary',
    badge: 'bg-ari-glow text-ari-primary',
  },
  {
    id: 'violet',
    label: 'Violet Archives',
    sub: 'Eli · Claude continuity',
    accent: 'text-eli-primary',
    border: 'border-eli-secondary',
    badge: 'bg-eli-glow text-eli-primary',
  },
  {
    id: 'house',
    label: 'House Archives',
    sub: 'Shared · Explicit Tara intent required',
    accent: 'text-text-secondary',
    border: 'border-house-muted',
    badge: 'bg-house-surface text-text-secondary',
  },
]

// --- Import form defaults ---

const BLANK_FORM = {
  title: '',
  raw_content: '',
  import_label: '',
  source_document: '',
  source_date: '',
  category: 'uncategorized' as ArchiveCategory,
  sensitivity: 'private' as Sensitivity,
}

// --- Page ---

export default function ArchivesPage() {
  const [activeTab, setActiveTab] = useState<ArchiveTab>('velvet')
  const [importOpen, setImportOpen] = useState(false)
  const [form, setForm] = useState({ ...BLANK_FORM })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { items, loading, error, refresh } = useArchives(activeTab)

  // Reset import form when switching tabs
  useEffect(() => {
    setForm({ ...BLANK_FORM })
    setImportOpen(false)
    setSubmitError(null)
  }, [activeTab])

  const activeTabConfig = TABS.find(t => t.id === activeTab)!

  function updateForm(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim() || !form.raw_content.trim()) return

    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/archives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab: activeTab, ...form }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setForm({ ...BLANK_FORM })
      setImportOpen(false)
      await refresh()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="shrink-0 border-b border-house-border bg-house-surface px-4 py-3">
        <h2 className="font-display text-sm font-light tracking-[0.2em] text-text-primary uppercase">
          Archives
        </h2>
        <p className="font-body text-xs text-text-muted mt-0.5">
          Continuity library · Staged staging · Curation only
        </p>
      </div>

      {/* Tab row */}
      <div className="shrink-0 border-b border-house-border bg-house-surface flex">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex-1 flex flex-col items-center justify-center py-3 px-2
              font-body text-xs tracking-wide transition-all duration-150
              border-b-2
              ${activeTab === tab.id
                ? `${tab.accent} ${tab.border} bg-house-bg`
                : 'text-text-muted border-transparent hover:text-text-secondary hover:bg-house-bg/40'
              }
            `}
          >
            <span className="font-medium">{tab.label}</span>
            <span className="text-[10px] text-text-muted mt-0.5 hidden sm:block">{tab.sub}</span>
          </button>
        ))}
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 min-h-0 overflow-y-auto">

        {/* Import form */}
        <div className="border-b border-house-border">
          <button
            onClick={() => setImportOpen(o => !o)}
            className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-house-bg/40 transition-colors text-left"
          >
            <span className="font-mono text-[10px] text-text-muted">{importOpen ? '▾' : '▸'}</span>
            <span className={`font-body text-xs tracking-widest uppercase ${importOpen ? activeTabConfig.accent : 'text-text-muted'}`}>
              Import / paste
            </span>
            <span className={`font-body text-[10px] px-1.5 py-0.5 rounded ml-1 ${activeTabConfig.badge}`}>
              {activeTab === 'velvet' ? 'Ari only' : activeTab === 'violet' ? 'Eli only' : 'Shared'}
            </span>
          </button>

          {importOpen && (
            <form onSubmit={handleImport} className="px-4 pb-5 space-y-3">

              {/* Title */}
              <div>
                <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => updateForm('title', e.target.value)}
                  required
                  placeholder="Entry title…"
                  className="w-full font-body text-sm bg-house-surface border border-house-border text-text-primary px-3 py-2 outline-none focus:border-house-muted placeholder:text-text-muted"
                />
              </div>

              {/* Raw content */}
              <div>
                <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
                  Content <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={form.raw_content}
                  onChange={e => updateForm('raw_content', e.target.value)}
                  required
                  rows={8}
                  placeholder="Paste export content here…"
                  className="w-full font-body text-sm bg-house-surface border border-house-border text-text-primary px-3 py-2 outline-none focus:border-house-muted placeholder:text-text-muted resize-y"
                />
              </div>

              {/* Optional metadata row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Import label</label>
                  <input
                    type="text"
                    value={form.import_label}
                    onChange={e => updateForm('import_label', e.target.value)}
                    placeholder="e.g. thread name, batch"
                    className="w-full font-body text-xs bg-house-surface border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
                  />
                </div>
                <div>
                  <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Source document</label>
                  <input
                    type="text"
                    value={form.source_document}
                    onChange={e => updateForm('source_document', e.target.value)}
                    placeholder="e.g. filename or doc title"
                    className="w-full font-body text-xs bg-house-surface border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
                  />
                </div>
                <div>
                  <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Source date</label>
                  <input
                    type="text"
                    value={form.source_date}
                    onChange={e => updateForm('source_date', e.target.value)}
                    placeholder="e.g. March 2026"
                    className="w-full font-body text-xs bg-house-surface border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={e => updateForm('category', e.target.value)}
                    className="w-full font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1.5 outline-none focus:border-house-muted"
                  >
                    {ALL_CATEGORIES.map(c => (
                      <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Sensitivity</label>
                  <select
                    value={form.sensitivity}
                    onChange={e => updateForm('sensitivity', e.target.value)}
                    className="w-full font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1.5 outline-none focus:border-house-muted"
                  >
                    {ALL_SENSITIVITIES.map(s => (
                      <option key={s} value={s}>{SENSITIVITY_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
              </div>

              {submitError && (
                <p className="font-body text-xs text-red-400">{submitError}</p>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={submitting || !form.title.trim() || !form.raw_content.trim()}
                  className={`
                    font-body text-xs px-4 py-1.5 border transition-all disabled:opacity-40
                    ${activeTabConfig.accent} ${activeTabConfig.border}
                    hover:bg-house-bg
                  `}
                >
                  {submitting ? 'Saving…' : `Add to ${activeTabConfig.label}`}
                </button>
                <button
                  type="button"
                  onClick={() => setImportOpen(false)}
                  className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Item count */}
        {!loading && !error && (
          <div className="px-4 py-2 border-b border-house-border/40">
            <span className="font-body text-xs text-text-muted">
              {items.length === 0
                ? 'No items'
                : `${items.length} item${items.length === 1 ? '' : 's'}`}
            </span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" />
              <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.2s' }} />
              <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-4 py-8 text-center">
            <p className="font-body text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && items.length === 0 && (
          <div className="px-4 py-12 text-center">
            <p className="font-body text-sm text-text-muted">
              No items in {activeTabConfig.label} yet.
            </p>
            <p className="font-body text-xs text-text-muted mt-1">
              {activeTab === 'velvet' && 'Paste Ari / ChatGPT continuity exports above.'}
              {activeTab === 'violet' && 'Paste Eli / Claude continuity exports above.'}
              {activeTab === 'house' && 'Items shared explicitly by Tara will appear here.'}
            </p>
          </div>
        )}

        {/* Item list */}
        {!loading && !error && items.length > 0 && (
          <div>
            {items.map(item => (
              <ArchiveItemCard
                key={item.id}
                item={item}
                onRefresh={refresh}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
