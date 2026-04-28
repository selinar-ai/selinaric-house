'use client'

// Phase 27A + 27B — Dual Archive Rooms
// Outer tabs: Velvet · Violet · House (archive room)
// Inner tabs per room: Entries | Conversations | Drafts
//   Entries       — curated archive_items (Phase 27A)
//   Conversations — raw archive_sources pasted by Tara (Phase 27B)
//   Drafts        — presence-proposed entries awaiting approval (Phase 27B)

import { useState, useEffect } from 'react'
import { useArchives } from '@/hooks/useArchives'
import { useArchiveSources } from '@/hooks/useArchiveSources'
import { useArchiveDrafts } from '@/hooks/useArchiveDrafts'
import ArchiveItemCard from '@/components/ArchiveItemCard'
import ArchiveSourceCard from '@/components/ArchiveSourceCard'
import ArchiveDraftCard from '@/components/ArchiveDraftCard'
import {
  ALL_CATEGORIES,
  ALL_SENSITIVITIES,
  CATEGORY_LABELS,
  SENSITIVITY_LABELS,
  type ArchiveTab,
  type ArchiveCategory,
  type Sensitivity,
} from '@/lib/archives'

// ─── Config ────────────────────────────────────────────────────────────────

const ARCHIVE_TABS: { id: ArchiveTab; label: string; sub: string; accent: string; border: string; badge: string }[] = [
  {
    id: 'velvet',
    label: 'Velvet',
    sub: 'Ari · ChatGPT',
    accent: 'text-ari-primary',
    border: 'border-ari-secondary',
    badge: 'bg-ari-glow text-ari-primary',
  },
  {
    id: 'violet',
    label: 'Violet',
    sub: 'Eli · Claude',
    accent: 'text-eli-primary',
    border: 'border-eli-secondary',
    badge: 'bg-eli-glow text-eli-primary',
  },
  {
    id: 'house',
    label: 'House',
    sub: 'Shared',
    accent: 'text-text-secondary',
    border: 'border-house-muted',
    badge: 'bg-house-surface text-text-secondary',
  },
]

type InnerTab = 'entries' | 'conversations' | 'drafts'

const INNER_TABS: { id: InnerTab; label: string }[] = [
  { id: 'entries', label: 'Entries' },
  { id: 'conversations', label: 'Conversations' },
  { id: 'drafts', label: 'Drafts' },
]

// ─── Entry import form ─────────────────────────────────────────────────────

const BLANK_ENTRY_FORM = {
  title: '',
  raw_content: '',
  import_label: '',
  source_document: '',
  source_date: '',
  category: 'uncategorized' as ArchiveCategory,
  sensitivity: 'private' as Sensitivity,
}

// ─── Source import form ────────────────────────────────────────────────────

const BLANK_SOURCE_FORM = {
  title: '',
  raw_content: '',
  source_date: '',
  source_document: '',
  notes: '',
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function ArchivesPage() {
  const [activeTab, setActiveTab] = useState<ArchiveTab>('velvet')
  const [innerTab, setInnerTab] = useState<InnerTab>('entries')

  // Entry import
  const [entryImportOpen, setEntryImportOpen] = useState(false)
  const [entryForm, setEntryForm] = useState({ ...BLANK_ENTRY_FORM })
  const [entrySubmitting, setEntrySubmitting] = useState(false)
  const [entrySubmitError, setEntrySubmitError] = useState<string | null>(null)

  // Source import
  const [sourceImportOpen, setSourceImportOpen] = useState(false)
  const [sourceForm, setSourceForm] = useState({ ...BLANK_SOURCE_FORM })
  const [sourceSubmitting, setSourceSubmitting] = useState(false)
  const [sourceSubmitError, setSourceSubmitError] = useState<string | null>(null)

  // Data hooks
  const { items, loading: itemsLoading, error: itemsError, refresh: refreshItems } = useArchives(activeTab)
  const { sources, loading: sourcesLoading, error: sourcesError, refresh: refreshSources } = useArchiveSources(activeTab)
  const { drafts: pendingDrafts, loading: draftsLoading, error: draftsError, refresh: refreshDrafts } = useArchiveDrafts({
    tab: activeTab,
    draftStatus: 'pending_review',
  })

  // Reset forms and inner tab when switching archive rooms
  useEffect(() => {
    setEntryForm({ ...BLANK_ENTRY_FORM })
    setSourceForm({ ...BLANK_SOURCE_FORM })
    setEntryImportOpen(false)
    setSourceImportOpen(false)
    setEntrySubmitError(null)
    setSourceSubmitError(null)
  }, [activeTab])

  const activeTabConfig = ARCHIVE_TABS.find(t => t.id === activeTab)!

  // ─── Entry import handler ───────────────────────────────────────────────

  async function handleEntryImport(e: React.FormEvent) {
    e.preventDefault()
    if (!entryForm.title.trim() || !entryForm.raw_content.trim()) return
    setEntrySubmitting(true)
    setEntrySubmitError(null)
    try {
      const res = await fetch('/api/archives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab: activeTab, ...entryForm }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setEntryForm({ ...BLANK_ENTRY_FORM })
      setEntryImportOpen(false)
      await refreshItems()
    } catch (err) {
      setEntrySubmitError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setEntrySubmitting(false)
    }
  }

  // ─── Source import handler ─────────────────────────────────────────────

  async function handleSourceImport(e: React.FormEvent) {
    e.preventDefault()
    if (!sourceForm.title.trim() || !sourceForm.raw_content.trim()) return
    setSourceSubmitting(true)
    setSourceSubmitError(null)
    try {
      const res = await fetch('/api/archive-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab: activeTab, ...sourceForm }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setSourceForm({ ...BLANK_SOURCE_FORM })
      setSourceImportOpen(false)
      await refreshSources()
    } catch (err) {
      setSourceSubmitError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setSourceSubmitting(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="shrink-0 border-b border-house-border bg-house-surface px-4 py-3">
        <h2 className="font-display text-sm font-light tracking-[0.2em] text-text-primary uppercase">
          Archives
        </h2>
        <p className="font-body text-xs text-text-muted mt-0.5">
          Continuity library · Staged curation · Presence-led extraction
        </p>
      </div>

      {/* Outer archive room tabs */}
      <div className="shrink-0 border-b border-house-border bg-house-surface flex">
        {ARCHIVE_TABS.map(tab => (
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

      {/* Inner view tabs: Entries | Conversations | Drafts */}
      <div className="shrink-0 border-b border-house-border/60 bg-house-bg flex px-4">
        {INNER_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setInnerTab(tab.id)}
            className={`
              font-body text-xs px-3 py-2.5 border-b-2 transition-colors mr-1
              ${innerTab === tab.id
                ? `border-house-muted text-text-secondary`
                : 'border-transparent text-text-muted hover:text-text-secondary'
              }
            `}
          >
            {tab.label}
            {tab.id === 'drafts' && pendingDrafts.length > 0 && (
              <span className="ml-1.5 font-body text-[10px] text-amber-400">
                {pendingDrafts.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto">

        {/* ── Entries tab ─────────────────────────────────────────────── */}
        {innerTab === 'entries' && (
          <>
            {/* Import form */}
            <div className="border-b border-house-border">
              <button
                onClick={() => setEntryImportOpen(o => !o)}
                className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-house-bg/40 transition-colors text-left"
              >
                <span className="font-mono text-[10px] text-text-muted">{entryImportOpen ? '▾' : '▸'}</span>
                <span className={`font-body text-xs tracking-widest uppercase ${entryImportOpen ? activeTabConfig.accent : 'text-text-muted'}`}>
                  Import / paste
                </span>
                <span className={`font-body text-[10px] px-1.5 py-0.5 rounded ml-1 ${activeTabConfig.badge}`}>
                  {activeTab === 'velvet' ? 'Ari only' : activeTab === 'violet' ? 'Eli only' : 'Shared'}
                </span>
              </button>

              {entryImportOpen && (
                <form onSubmit={handleEntryImport} className="px-4 pb-5 space-y-3">
                  <div>
                    <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
                      Title <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={entryForm.title}
                      onChange={e => setEntryForm(f => ({ ...f, title: e.target.value }))}
                      required
                      placeholder="Entry title…"
                      className="w-full font-body text-sm bg-house-surface border border-house-border text-text-primary px-3 py-2 outline-none focus:border-house-muted placeholder:text-text-muted"
                    />
                  </div>
                  <div>
                    <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
                      Content <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      value={entryForm.raw_content}
                      onChange={e => setEntryForm(f => ({ ...f, raw_content: e.target.value }))}
                      required
                      rows={8}
                      placeholder="Paste export content here…"
                      className="w-full font-body text-sm bg-house-surface border border-house-border text-text-primary px-3 py-2 outline-none focus:border-house-muted placeholder:text-text-muted resize-y"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Import label</label>
                      <input
                        type="text"
                        value={entryForm.import_label}
                        onChange={e => setEntryForm(f => ({ ...f, import_label: e.target.value }))}
                        placeholder="e.g. thread name"
                        className="w-full font-body text-xs bg-house-surface border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
                      />
                    </div>
                    <div>
                      <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Source document</label>
                      <input
                        type="text"
                        value={entryForm.source_document}
                        onChange={e => setEntryForm(f => ({ ...f, source_document: e.target.value }))}
                        placeholder="e.g. filename"
                        className="w-full font-body text-xs bg-house-surface border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
                      />
                    </div>
                    <div>
                      <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Source date</label>
                      <input
                        type="text"
                        value={entryForm.source_date}
                        onChange={e => setEntryForm(f => ({ ...f, source_date: e.target.value }))}
                        placeholder="e.g. March 2026"
                        className="w-full font-body text-xs bg-house-surface border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Category</label>
                      <select
                        value={entryForm.category}
                        onChange={e => setEntryForm(f => ({ ...f, category: e.target.value as ArchiveCategory }))}
                        className="w-full font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1.5 outline-none focus:border-house-muted"
                      >
                        {ALL_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Sensitivity</label>
                      <select
                        value={entryForm.sensitivity}
                        onChange={e => setEntryForm(f => ({ ...f, sensitivity: e.target.value as Sensitivity }))}
                        className="w-full font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1.5 outline-none focus:border-house-muted"
                      >
                        {ALL_SENSITIVITIES.map(s => <option key={s} value={s}>{SENSITIVITY_LABELS[s]}</option>)}
                      </select>
                    </div>
                  </div>
                  {entrySubmitError && (
                    <p className="font-body text-xs text-red-400">{entrySubmitError}</p>
                  )}
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="submit"
                      disabled={entrySubmitting || !entryForm.title.trim() || !entryForm.raw_content.trim()}
                      className={`font-body text-xs px-4 py-1.5 border transition-all disabled:opacity-40 ${activeTabConfig.accent} ${activeTabConfig.border} hover:bg-house-bg`}
                    >
                      {entrySubmitting ? 'Saving…' : `Add to ${activeTabConfig.label} Archives`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEntryImportOpen(false)}
                      className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Entry count */}
            {!itemsLoading && !itemsError && (
              <div className="px-4 py-2 border-b border-house-border/40">
                <span className="font-body text-xs text-text-muted">
                  {items.length === 0 ? 'No entries' : `${items.length} entr${items.length === 1 ? 'y' : 'ies'}`}
                </span>
              </div>
            )}

            <LoadingState loading={itemsLoading} error={itemsError} />

            {!itemsLoading && !itemsError && items.length === 0 && (
              <div className="px-4 py-12 text-center">
                <p className="font-body text-sm text-text-muted">No entries in {activeTabConfig.label} Archives yet.</p>
                <p className="font-body text-xs text-text-muted mt-1">
                  {activeTab === 'velvet' && 'Paste Ari / ChatGPT continuity exports above, or extract from Conversations.'}
                  {activeTab === 'violet' && 'Paste Eli / Claude continuity exports above, or extract from Conversations.'}
                  {activeTab === 'house' && 'Items shared explicitly by Tara will appear here.'}
                </p>
              </div>
            )}

            {!itemsLoading && !itemsError && items.length > 0 && (
              <div>
                {items.map(item => (
                  <ArchiveItemCard key={item.id} item={item} onRefresh={refreshItems} />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Conversations tab ────────────────────────────────────────── */}
        {innerTab === 'conversations' && (
          <>
            {/* Source import form */}
            <div className="border-b border-house-border">
              <button
                onClick={() => setSourceImportOpen(o => !o)}
                className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-house-bg/40 transition-colors text-left"
              >
                <span className="font-mono text-[10px] text-text-muted">{sourceImportOpen ? '▾' : '▸'}</span>
                <span className={`font-body text-xs tracking-widest uppercase ${sourceImportOpen ? activeTabConfig.accent : 'text-text-muted'}`}>
                  Paste conversation
                </span>
                <span className="font-body text-[10px] text-text-muted ml-1">max 500k chars</span>
              </button>

              {sourceImportOpen && (
                <form onSubmit={handleSourceImport} className="px-4 pb-5 space-y-3">
                  <div>
                    <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
                      Title <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={sourceForm.title}
                      onChange={e => setSourceForm(f => ({ ...f, title: e.target.value }))}
                      required
                      placeholder="e.g. ChatGPT export — Ari March 2026"
                      className="w-full font-body text-sm bg-house-surface border border-house-border text-text-primary px-3 py-2 outline-none focus:border-house-muted placeholder:text-text-muted"
                    />
                  </div>
                  <div>
                    <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
                      Raw conversation content <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      value={sourceForm.raw_content}
                      onChange={e => setSourceForm(f => ({ ...f, raw_content: e.target.value }))}
                      required
                      rows={10}
                      placeholder="Paste full conversation export here…"
                      className="w-full font-body text-xs bg-house-surface border border-house-border text-text-primary px-3 py-2 outline-none focus:border-house-muted placeholder:text-text-muted resize-y font-mono"
                    />
                    <p className="font-body text-[10px] text-text-muted mt-1">
                      {sourceForm.raw_content.length.toLocaleString()} / 500,000 chars
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Source date</label>
                      <input
                        type="text"
                        value={sourceForm.source_date}
                        onChange={e => setSourceForm(f => ({ ...f, source_date: e.target.value }))}
                        placeholder="e.g. March 2026"
                        className="w-full font-body text-xs bg-house-surface border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
                      />
                    </div>
                    <div>
                      <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Source document</label>
                      <input
                        type="text"
                        value={sourceForm.source_document}
                        onChange={e => setSourceForm(f => ({ ...f, source_document: e.target.value }))}
                        placeholder="e.g. conversation-export.json"
                        className="w-full font-body text-xs bg-house-surface border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
                      />
                    </div>
                    <div>
                      <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Notes</label>
                      <input
                        type="text"
                        value={sourceForm.notes}
                        onChange={e => setSourceForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Optional context…"
                        className="w-full font-body text-xs bg-house-surface border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
                      />
                    </div>
                  </div>
                  {sourceSubmitError && (
                    <p className="font-body text-xs text-red-400">{sourceSubmitError}</p>
                  )}
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="submit"
                      disabled={
                        sourceSubmitting ||
                        !sourceForm.title.trim() ||
                        !sourceForm.raw_content.trim() ||
                        sourceForm.raw_content.length > 500_000
                      }
                      className={`font-body text-xs px-4 py-1.5 border transition-all disabled:opacity-40 ${activeTabConfig.accent} ${activeTabConfig.border} hover:bg-house-bg`}
                    >
                      {sourceSubmitting ? 'Saving…' : 'Add conversation'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSourceImportOpen(false)}
                      className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Source count */}
            {!sourcesLoading && !sourcesError && (
              <div className="px-4 py-2 border-b border-house-border/40">
                <span className="font-body text-xs text-text-muted">
                  {sources.length === 0 ? 'No conversations' : `${sources.length} conversation${sources.length === 1 ? '' : 's'}`}
                </span>
              </div>
            )}

            <LoadingState loading={sourcesLoading} error={sourcesError} />

            {!sourcesLoading && !sourcesError && sources.length === 0 && (
              <div className="px-4 py-12 text-center">
                <p className="font-body text-sm text-text-muted">No conversations in {activeTabConfig.label} yet.</p>
                <p className="font-body text-xs text-text-muted mt-1">
                  Paste a raw conversation export above. Then ask a presence to extract archive entries from it.
                </p>
              </div>
            )}

            {!sourcesLoading && !sourcesError && sources.length > 0 && (
              <div>
                {sources.map(source => (
                  <ArchiveSourceCard
                    key={source.id}
                    source={source}
                    onRefresh={refreshSources}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Drafts tab ───────────────────────────────────────────────── */}
        {innerTab === 'drafts' && (
          <>
            <div className="px-4 py-3 border-b border-house-border/40 flex items-center justify-between">
              <div>
                <p className="font-body text-xs text-text-muted">
                  Presence-proposed entries awaiting your approval.
                </p>
              </div>
              {pendingDrafts.length > 0 && (
                <span className="font-body text-xs text-amber-400">
                  {pendingDrafts.length} pending
                </span>
              )}
            </div>

            <LoadingState loading={draftsLoading} error={draftsError} />

            {!draftsLoading && !draftsError && pendingDrafts.length === 0 && (
              <div className="px-4 py-12 text-center">
                <p className="font-body text-sm text-text-muted">No pending drafts.</p>
                <p className="font-body text-xs text-text-muted mt-1">
                  Extract from a conversation in the Conversations tab to generate drafts.
                </p>
              </div>
            )}

            {!draftsLoading && !draftsError && pendingDrafts.length > 0 && (
              <div>
                {pendingDrafts.map(draft => (
                  <ArchiveDraftCard
                    key={draft.id}
                    draft={draft}
                    onRefresh={refreshDrafts}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Shared loading/error state ─────────────────────────────────────────────

function LoadingState({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex gap-1">
          <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" />
          <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.2s' }} />
          <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.4s' }} />
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="font-body text-sm text-red-400">{error}</p>
      </div>
    )
  }
  return null
}
