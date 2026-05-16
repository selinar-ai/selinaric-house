'use client'

// Phase 27A + 27B + 27D + 29A + 29B — Dual Archive Rooms
// Outer tabs: Velvet · Violet · House (archive room)
// Inner tabs per room: Entries | Conversations | Drafts | Memory Review | Graph
//   Entries       — curated archive_items (Phase 27A)
//   Conversations — raw archive_sources pasted by Tara (Phase 27B)
//   Drafts        — presence-proposed entries awaiting approval (Phase 27B)
//   Memory Review — Memory promotion queue (Phase 29A)
//   Graph         — concept graph extraction and candidate review (Phase 29B)
// Phase 27D: client-side filters per tab, selection + bulk actions
// Phase 29A: Memory bulk actions, Memory Review tab, audit cards — keyed on canonical_status
// Phase 29B: Graph extraction panel + candidate review tab (nodes + edges)

import { useState, useEffect, useRef } from 'react'
import { useArchives } from '@/hooks/useArchives'
import { useArchiveSources } from '@/hooks/useArchiveSources'
import { useArchiveDrafts } from '@/hooks/useArchiveDrafts'
import ArchiveItemCard from '@/components/ArchiveItemCard'
import ArchiveSourceCard from '@/components/ArchiveSourceCard'
import ArchiveDraftCard from '@/components/ArchiveDraftCard'
import ArchiveMarkdownImport from '@/components/ArchiveMarkdownImport'
import SourceFilters, { type SourceFilterState, BLANK_SOURCE_FILTERS } from '@/components/archive/SourceFilters'
import DraftFilters,  { type DraftFilterState,  BLANK_DRAFT_FILTERS  } from '@/components/archive/DraftFilters'
import EntryFilters,  { type EntryFilterState,  BLANK_ENTRY_FILTERS  } from '@/components/archive/EntryFilters'
import MemoryAuditCards from '@/components/archive/MemoryAuditCards'
import EligibilityGovernancePanel from '@/components/archive/EligibilityGovernancePanel'
import GraphExtractionPanel from '@/components/archive/GraphExtractionPanel'
import GraphCandidatesTab from '@/components/archive/GraphCandidatesTab'
import {
  ALL_CATEGORIES,
  ALL_SENSITIVITIES,
  ALL_STATUSES,
  CATEGORY_LABELS,
  SENSITIVITY_LABELS,
  STATUS_LABELS,
  type ArchiveTab,
  type ArchiveCategory,
  type Sensitivity,
  type CanonicalStatus,
} from '@/lib/archives'
import type { MemoryBulkAction } from '@/lib/archive-memory'

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

type InnerTab = 'entries' | 'conversations' | 'drafts' | 'memory' | 'graph'

const INNER_TABS: { id: InnerTab; label: string }[] = [
  { id: 'entries',       label: 'Entries' },
  { id: 'conversations', label: 'Conversations' },
  { id: 'drafts',        label: 'Drafts' },
  { id: 'memory',        label: 'Memory Review' },
  { id: 'graph',         label: 'Graph' },
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
  // Phase 28E — deep-link state from URL params (?archive=X&tab=conversations&sourceId=Y)
  const [highlightSourceId, setHighlightSourceId] = useState<string | null>(null)
  const deepLinkInitialised = useRef(false)

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
  // Phase 27D: load all statuses so DraftFilters can filter by any status.
  // pendingDrafts is derived inside the hook for the tab badge.
  const { drafts: allDrafts, pendingDrafts, loading: draftsLoading, error: draftsError, refresh: refreshDrafts } = useArchiveDrafts({
    tab: activeTab,
    allStatuses: true,
  })

  // Phase 27D — filter state
  const [sourceFilters, setSourceFilters] = useState<SourceFilterState>({ ...BLANK_SOURCE_FILTERS })
  const [draftFilters,  setDraftFilters]  = useState<DraftFilterState>({ ...BLANK_DRAFT_FILTERS })
  const [entryFilters,  setEntryFilters]  = useState<EntryFilterState>({ ...BLANK_ENTRY_FILTERS })
  // Phase 29A — Memory Review filter (preset to canonical_candidate by default)
  const [memoryFilters, setMemoryFilters] = useState<EntryFilterState>({
    ...BLANK_ENTRY_FILTERS,
    canonical_status: 'canonical_candidate',
  })

  // Phase 27D — selection state
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([])
  const [selectedDraftIds,  setSelectedDraftIds]  = useState<string[]>([])
  const [selectedEntryIds,  setSelectedEntryIds]  = useState<string[]>([])

  // Phase 27D — bulk action state
  const [bulking,   setBulking]   = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)

  // Phase 29A — Memory Review selection
  const [selectedMemoryIds, setSelectedMemoryIds] = useState<string[]>([])
  const [memoryBulking,     setMemoryBulking]     = useState(false)
  const [memoryBulkError,   setMemoryBulkError]   = useState<string | null>(null)

  // Phase 29B — Graph candidates refresh key (incremented after extraction to force reload)
  const [graphRefreshKey, setGraphRefreshKey] = useState(0)

  // Reset forms, filters, and selections when switching archive rooms
  useEffect(() => {
    setEntryForm({ ...BLANK_ENTRY_FORM })
    setSourceForm({ ...BLANK_SOURCE_FORM })
    setEntryImportOpen(false)
    setSourceImportOpen(false)
    setEntrySubmitError(null)
    setSourceSubmitError(null)
    setSourceFilters({ ...BLANK_SOURCE_FILTERS })
    setDraftFilters({ ...BLANK_DRAFT_FILTERS })
    setEntryFilters({ ...BLANK_ENTRY_FILTERS })
    setMemoryFilters({ ...BLANK_ENTRY_FILTERS, canonical_status: 'canonical_candidate' })
    setSelectedSourceIds([])
    setSelectedDraftIds([])
    setSelectedEntryIds([])
    setSelectedMemoryIds([])
    setBulkError(null)
    setMemoryBulkError(null)
    setGraphRefreshKey(0)
  }, [activeTab])

  // Clear selections when switching inner tabs
  useEffect(() => {
    setSelectedSourceIds([])
    setSelectedDraftIds([])
    setSelectedEntryIds([])
    setSelectedMemoryIds([])
    setBulkError(null)
    setMemoryBulkError(null)
  }, [innerTab])

  // Phase 28E — read deep-link URL params on first mount only
  useEffect(() => {
    if (deepLinkInitialised.current) return
    deepLinkInitialised.current = true

    const params = new URLSearchParams(window.location.search)
    const archiveParam  = params.get('archive')
    const tabParam      = params.get('tab')
    const sourceIdParam = params.get('sourceId')

    if (archiveParam && (archiveParam === 'velvet' || archiveParam === 'violet' || archiveParam === 'house')) {
      setActiveTab(archiveParam)
    }
    if (tabParam === 'conversations' || tabParam === 'entries' || tabParam === 'drafts') {
      setInnerTab(tabParam as InnerTab)
    }
    if (sourceIdParam) {
      setHighlightSourceId(sourceIdParam)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const activeTabConfig = ARCHIVE_TABS.find(t => t.id === activeTab)!

  // ─── Phase 27D: client-side filtered lists ─────────────────────────────

  const filteredSources = sources.filter(s => {
    const q = sourceFilters.search.toLowerCase()
    if (q && !s.title.toLowerCase().includes(q) && !(s.source_document ?? '').toLowerCase().includes(q)) return false
    if (sourceFilters.review_status && s.review_status !== sourceFilters.review_status) return false
    if (sourceFilters.source_origin && s.source_origin !== sourceFilters.source_origin) return false
    return true
  })

  const filteredDrafts = allDrafts.filter(d => {
    const q = draftFilters.search.toLowerCase()
    if (q && !d.proposed_title.toLowerCase().includes(q)) return false
    if (draftFilters.draft_status && d.draft_status !== draftFilters.draft_status) return false
    if (draftFilters.extracted_by && d.extracted_by !== draftFilters.extracted_by) return false
    if (draftFilters.suggested_memory_status && d.suggested_memory_status !== draftFilters.suggested_memory_status) return false
    if (draftFilters.category && d.proposed_category !== draftFilters.category) return false
    return true
  })

  function applyEntryFilter(filterState: EntryFilterState) {
    return items.filter(i => {
      const q = filterState.search.toLowerCase()
      if (q) {
        // Phase 28F: tokenized search — all tokens must appear somewhere across title + content
        const tokens = q.split(/\s+/).filter(t => t.length > 1)
        if (tokens.length > 0) {
          const titleLower = i.title.toLowerCase()
          const contentLower = i.raw_content.toLowerCase()
          const allMatch = tokens.every(t => titleLower.includes(t) || contentLower.includes(t))
          if (!allMatch) return false
        }
      }
      if (filterState.canonical_status && i.canonical_status !== filterState.canonical_status) return false
      if (filterState.category && i.category !== filterState.category) return false
      if (filterState.has_linked_source === 'yes' && !i.source_id) return false
      if (filterState.has_linked_source === 'no' && i.source_id) return false
      return true
    })
  }

  const filteredItems  = applyEntryFilter(entryFilters)
  const filteredMemory = applyEntryFilter(memoryFilters)

  // ─── Phase 27D: selection toggle helpers ───────────────────────────────

  function toggleSourceSelect(id: string) {
    setSelectedSourceIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function toggleAllSources() {
    setSelectedSourceIds(prev =>
      prev.length === filteredSources.length ? [] : filteredSources.map(s => s.id)
    )
  }

  function toggleDraftSelect(id: string) {
    setSelectedDraftIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function toggleAllDrafts() {
    const pending = filteredDrafts.filter(d => d.draft_status === 'pending_review')
    setSelectedDraftIds(prev =>
      prev.length === pending.length ? [] : pending.map(d => d.id)
    )
  }

  function toggleEntrySelect(id: string) {
    setSelectedEntryIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function toggleAllEntries() {
    setSelectedEntryIds(prev =>
      prev.length === filteredItems.length ? [] : filteredItems.map(i => i.id)
    )
  }

  function toggleMemorySelect(id: string) {
    setSelectedMemoryIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function toggleAllMemory() {
    setSelectedMemoryIds(prev =>
      prev.length === filteredMemory.length ? [] : filteredMemory.map(i => i.id)
    )
  }

  // ─── Phase 27D: bulk action handlers ───────────────────────────────────

  async function handleSourceBulk(action: 'mark_reviewed' | 'mark_skipped' | 'remove') {
    if (action === 'remove' && !window.confirm(
      `Soft-delete ${selectedSourceIds.length} conversation${selectedSourceIds.length === 1 ? '' : 's'}? This cannot be undone from the UI.`
    )) return
    setBulking(true)
    setBulkError(null)
    try {
      const res = await fetch('/api/archive-sources/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids: selectedSourceIds }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Bulk action failed')
      setSelectedSourceIds([])
      await refreshSources()
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Bulk action failed')
    } finally {
      setBulking(false)
    }
  }

  async function handleDraftBulk(action: 'reject' | 'archive_only') {
    setBulking(true)
    setBulkError(null)
    try {
      const res = await fetch('/api/archive-drafts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids: selectedDraftIds }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Bulk action failed')
      setSelectedDraftIds([])
      await refreshDrafts()
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Bulk action failed')
    } finally {
      setBulking(false)
    }
  }

  async function handleEntryBulk(action: 'set_status' | 'set_category' | 'set_sensitivity', value: string) {
    setBulking(true)
    setBulkError(null)
    try {
      const res = await fetch('/api/archives/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids: selectedEntryIds, value }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Bulk action failed')
      setSelectedEntryIds([])
      await refreshItems()
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Bulk action failed')
    } finally {
      setBulking(false)
    }
  }

  // Phase 30 — Memory bulk handler with reason prompt for confirm/reject/hold
  async function handleMemoryBulk(
    action: MemoryBulkAction,
    sourceIds: string[],
    setIds: (ids: string[]) => void,
    confirmedRisk = false
  ) {
    const count = sourceIds.length
    const plural = count === 1 ? 'y' : 'ies'

    // Confirm promote — enhanced guardrail for batch
    if (action === 'confirm_memory' && !confirmedRisk) {
      const reason = window.prompt(
        `You are about to mark ${count} archive entr${plural} as Confirmed Memory.\n\n` +
        `Memory entries may become available to manual recall and safe auto-recall.\n\n` +
        `Enter a reason (optional) or press OK to continue, Cancel to abort:`
      )
      if (reason === null) return // cancelled
      confirmedRisk = true
      return handleMemoryBulkExecute(action, sourceIds, setIds, confirmedRisk, reason.trim() || undefined)
    }
    // Confirm reject
    if (action === 'reject_memory' && !confirmedRisk) {
      const reason = window.prompt(
        `You are about to reject ${count} archive entr${plural} for Memory.\n\n` +
        `They will remain in the archive as Archive Only.\n\n` +
        `Enter a reason (optional) or press OK to continue, Cancel to abort:`
      )
      if (reason === null) return
      confirmedRisk = true
      return handleMemoryBulkExecute(action, sourceIds, setIds, confirmedRisk, reason.trim() || undefined)
    }
    // Hold pending
    if (action === 'hold_pending') {
      const reason = window.prompt(
        `Hold ${count} entr${plural} as pending — no status change will occur.\n\n` +
        `Enter a note (optional) or press OK to continue, Cancel to abort:`
      )
      if (reason === null) return
      return handleMemoryBulkExecute(action, sourceIds, setIds, false, reason.trim() || undefined)
    }
    // Confirm demote
    if (action === 'demote_memory' && !confirmedRisk) {
      if (!window.confirm(
        `You are about to remove ${count} archive entr${plural} from Memory.\n\n` +
        `They will remain in the archive but will no longer be recall-eligible.\n\nContinue?`
      )) return
      confirmedRisk = true
    }

    return handleMemoryBulkExecute(action, sourceIds, setIds, confirmedRisk)
  }

  async function handleMemoryBulkExecute(
    action: MemoryBulkAction,
    sourceIds: string[],
    setIds: (ids: string[]) => void,
    confirmedRisk: boolean,
    reason?: string
  ) {
    setMemoryBulking(true)
    setMemoryBulkError(null)
    try {
      const res = await fetch('/api/archive-memory/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids: sourceIds, confirmedRisk, reason }),
      })
      const data = await res.json()
      if (!data.success) {
        if (data.requiresConfirmation) {
          if (window.confirm(`⚠ ${data.warning}\n\nProceed anyway?`)) {
            setMemoryBulking(false)
            await handleMemoryBulkExecute(action, sourceIds, setIds, true, reason)
          }
          return
        }
        throw new Error(data.error ?? 'Memory bulk action failed')
      }
      setIds([])
      await refreshItems()
    } catch (err) {
      setMemoryBulkError(err instanceof Error ? err.message : 'Memory action failed')
    } finally {
      setMemoryBulking(false)
    }
  }

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
            {tab.id === 'memory' && (() => {
              const candidateCount = items.filter(i => i.canonical_status === 'canonical_candidate').length
              return candidateCount > 0 ? (
                <span className="ml-1.5 font-body text-[10px] text-amber-400">
                  {candidateCount}
                </span>
              ) : null
            })()}
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

            {/* Entry filters */}
            {!itemsLoading && !itemsError && items.length > 0 && (
              <EntryFilters value={entryFilters} onChange={setEntryFilters} />
            )}

            {/* Entry bulk action bar */}
            {selectedEntryIds.length > 0 && (
              <div className="sticky top-0 z-10 px-4 py-2 bg-house-surface border-b border-house-border flex flex-wrap items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedEntryIds.length === filteredItems.length}
                  ref={el => { if (el) el.indeterminate = selectedEntryIds.length > 0 && selectedEntryIds.length < filteredItems.length }}
                  onChange={toggleAllEntries}
                  className="accent-house-muted"
                />
                <span className="font-body text-xs text-text-muted">{selectedEntryIds.length} selected</span>
                <select
                  defaultValue=""
                  onChange={e => { if (e.target.value) { handleEntryBulk('set_status', e.target.value); e.target.value = '' } }}
                  disabled={bulking}
                  className="font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1 outline-none focus:border-house-muted disabled:opacity-40"
                >
                  <option value="">Set status…</option>
                  {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
                <select
                  defaultValue=""
                  onChange={e => { if (e.target.value) { handleEntryBulk('set_category', e.target.value); e.target.value = '' } }}
                  disabled={bulking}
                  className="font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1 outline-none focus:border-house-muted disabled:opacity-40"
                >
                  <option value="">Set category…</option>
                  {ALL_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
                <select
                  defaultValue=""
                  onChange={e => { if (e.target.value) { handleEntryBulk('set_sensitivity', e.target.value); e.target.value = '' } }}
                  disabled={bulking}
                  className="font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1 outline-none focus:border-house-muted disabled:opacity-40"
                >
                  <option value="">Set sensitivity…</option>
                  {ALL_SENSITIVITIES.map(s => <option key={s} value={s}>{SENSITIVITY_LABELS[s]}</option>)}
                </select>
                {/* Phase 29A — Memory actions in entry bulk bar */}
                <span className="text-text-muted text-[10px]">·</span>
                <button
                  onClick={() => handleMemoryBulk('mark_candidate', selectedEntryIds, setSelectedEntryIds)}
                  disabled={bulking || memoryBulking}
                  className="font-body text-xs px-2 py-1 border border-house-border text-text-muted hover:text-text-secondary hover:border-house-muted transition-all disabled:opacity-40"
                >
                  Candidate
                </button>
                <button
                  onClick={() => handleMemoryBulk('confirm_memory', selectedEntryIds, setSelectedEntryIds)}
                  disabled={bulking || memoryBulking}
                  className="font-body text-xs px-2 py-1 border border-green-400/30 text-green-400 hover:bg-green-400/10 transition-all disabled:opacity-40"
                >
                  Confirm Memory
                </button>
                <button
                  onClick={() => handleMemoryBulk('reject_memory', selectedEntryIds, setSelectedEntryIds)}
                  disabled={bulking || memoryBulking}
                  className="font-body text-xs px-2 py-1 border border-red-400/20 text-red-400/60 hover:bg-red-400/10 transition-all disabled:opacity-40"
                >
                  Reject Memory
                </button>
                <button
                  onClick={() => setSelectedEntryIds([])}
                  className="ml-auto font-body text-[10px] text-text-muted hover:text-text-secondary transition-colors"
                >
                  Clear
                </button>
                {(bulkError || memoryBulkError) && (
                  <p className="font-body text-xs text-red-400 w-full">{bulkError ?? memoryBulkError}</p>
                )}
              </div>
            )}

            {/* Entry count + select-all */}
            {!itemsLoading && !itemsError && (
              <div className="px-4 py-2 border-b border-house-border/40 flex items-center gap-3">
                {filteredItems.length > 0 && (
                  <input
                    type="checkbox"
                    checked={selectedEntryIds.length === filteredItems.length && filteredItems.length > 0}
                    ref={el => { if (el) el.indeterminate = selectedEntryIds.length > 0 && selectedEntryIds.length < filteredItems.length }}
                    onChange={toggleAllEntries}
                    className="accent-house-muted"
                  />
                )}
                <span className="font-body text-xs text-text-muted">
                  {filteredItems.length === 0
                    ? 'No entries'
                    : `${filteredItems.length} entr${filteredItems.length === 1 ? 'y' : 'ies'}`}
                  {items.length !== filteredItems.length && ` of ${items.length}`}
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

            {!itemsLoading && !itemsError && filteredItems.length === 0 && items.length > 0 && (
              <div className="px-4 py-8 text-center">
                <p className="font-body text-sm text-text-muted">No entries match the current filters.</p>
              </div>
            )}

            {!itemsLoading && !itemsError && filteredItems.length > 0 && (
              <div>
                {filteredItems.map(item => (
                  <ArchiveItemCard
                    key={item.id}
                    item={item}
                    onRefresh={refreshItems}
                    selected={selectedEntryIds.includes(item.id)}
                    onToggleSelect={toggleEntrySelect}
                  />
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

            {/* Markdown file import */}
            <ArchiveMarkdownImport
              activeTab={activeTab}
              tabConfig={activeTabConfig}
              onImported={refreshSources}
            />

            {/* Source filters */}
            {!sourcesLoading && !sourcesError && sources.length > 0 && (
              <SourceFilters value={sourceFilters} onChange={setSourceFilters} />
            )}

            {/* Source bulk action bar */}
            {selectedSourceIds.length > 0 && (
              <div className="sticky top-0 z-10 px-4 py-2 bg-house-surface border-b border-house-border flex flex-wrap items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedSourceIds.length === filteredSources.length}
                  ref={el => { if (el) el.indeterminate = selectedSourceIds.length > 0 && selectedSourceIds.length < filteredSources.length }}
                  onChange={toggleAllSources}
                  className="accent-house-muted"
                />
                <span className="font-body text-xs text-text-muted">{selectedSourceIds.length} selected</span>
                <button
                  onClick={() => handleSourceBulk('mark_reviewed')}
                  disabled={bulking}
                  className="font-body text-xs px-3 py-1 border border-house-border text-text-muted hover:text-text-secondary hover:border-house-muted transition-all disabled:opacity-40"
                >
                  Mark reviewed
                </button>
                <button
                  onClick={() => handleSourceBulk('mark_skipped')}
                  disabled={bulking}
                  className="font-body text-xs px-3 py-1 border border-house-border text-text-muted hover:text-text-secondary hover:border-house-muted transition-all disabled:opacity-40"
                >
                  Skip
                </button>
                <button
                  onClick={() => handleSourceBulk('remove')}
                  disabled={bulking}
                  className="font-body text-xs px-3 py-1 border border-red-400/20 text-red-400/60 hover:bg-red-400/10 transition-all disabled:opacity-40"
                >
                  Remove
                </button>
                <button
                  onClick={() => setSelectedSourceIds([])}
                  className="ml-auto font-body text-[10px] text-text-muted hover:text-text-secondary transition-colors"
                >
                  Clear
                </button>
                {bulkError && <p className="font-body text-xs text-red-400 w-full">{bulkError}</p>}
              </div>
            )}

            {/* Source count + select-all */}
            {!sourcesLoading && !sourcesError && (
              <div className="px-4 py-2 border-b border-house-border/40 flex items-center gap-3">
                {filteredSources.length > 0 && (
                  <input
                    type="checkbox"
                    checked={selectedSourceIds.length === filteredSources.length && filteredSources.length > 0}
                    ref={el => { if (el) el.indeterminate = selectedSourceIds.length > 0 && selectedSourceIds.length < filteredSources.length }}
                    onChange={toggleAllSources}
                    className="accent-house-muted"
                  />
                )}
                <span className="font-body text-xs text-text-muted">
                  {filteredSources.length === 0
                    ? 'No conversations'
                    : `${filteredSources.length} conversation${filteredSources.length === 1 ? '' : 's'}`}
                  {sources.length !== filteredSources.length && ` of ${sources.length}`}
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

            {!sourcesLoading && !sourcesError && filteredSources.length === 0 && sources.length > 0 && (
              <div className="px-4 py-8 text-center">
                <p className="font-body text-sm text-text-muted">No conversations match the current filters.</p>
              </div>
            )}

            {!sourcesLoading && !sourcesError && filteredSources.length > 0 && (
              <div>
                {/* Phase 28E — show notice if deep-linked source isn't found in this archive */}
                {highlightSourceId && !sources.some(s => s.id === highlightSourceId) && (
                  <div className="px-4 py-2.5 border-b border-house-border/40">
                    <p className="font-body text-xs text-text-muted italic">
                      Linked source conversation not found — it may have been removed or belongs to a different archive.
                    </p>
                  </div>
                )}
                {filteredSources.map(source => (
                  <ArchiveSourceCard
                    key={source.id}
                    source={source}
                    onRefresh={refreshSources}
                    defaultExpanded={source.id === highlightSourceId}
                    selected={selectedSourceIds.includes(source.id)}
                    onToggleSelect={toggleSourceSelect}
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
              <p className="font-body text-xs text-text-muted">
                Presence-proposed entries awaiting your approval.
              </p>
              {pendingDrafts.length > 0 && (
                <span className="font-body text-xs text-amber-400">
                  {pendingDrafts.length} pending
                </span>
              )}
            </div>

            {/* Draft filters */}
            {!draftsLoading && !draftsError && allDrafts.length > 0 && (
              <DraftFilters value={draftFilters} onChange={setDraftFilters} />
            )}

            {/* Draft bulk action bar */}
            {selectedDraftIds.length > 0 && (
              <div className="sticky top-0 z-10 px-4 py-2 bg-house-surface border-b border-house-border flex flex-wrap items-center gap-2">
                {(() => {
                  const pendingFiltered = filteredDrafts.filter(d => d.draft_status === 'pending_review')
                  return (
                    <input
                      type="checkbox"
                      checked={selectedDraftIds.length === pendingFiltered.length}
                      ref={el => { if (el) el.indeterminate = selectedDraftIds.length > 0 && selectedDraftIds.length < pendingFiltered.length }}
                      onChange={toggleAllDrafts}
                      className="accent-house-muted"
                    />
                  )
                })()}
                <span className="font-body text-xs text-text-muted">{selectedDraftIds.length} selected</span>
                <button
                  onClick={() => handleDraftBulk('reject')}
                  disabled={bulking}
                  className="font-body text-xs px-3 py-1 border border-red-400/20 text-red-400/60 hover:bg-red-400/10 transition-all disabled:opacity-40"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleDraftBulk('archive_only')}
                  disabled={bulking}
                  className="font-body text-xs px-3 py-1 border border-house-border text-text-muted hover:text-text-secondary hover:border-house-muted transition-all disabled:opacity-40"
                >
                  Archive only
                </button>
                <button
                  onClick={() => setSelectedDraftIds([])}
                  className="ml-auto font-body text-[10px] text-text-muted hover:text-text-secondary transition-colors"
                >
                  Clear
                </button>
                {bulkError && <p className="font-body text-xs text-red-400 w-full">{bulkError}</p>}
              </div>
            )}

            {/* Draft count + select-all */}
            {!draftsLoading && !draftsError && (
              <div className="px-4 py-2 border-b border-house-border/40 flex items-center gap-3">
                {(() => {
                  const pendingFiltered = filteredDrafts.filter(d => d.draft_status === 'pending_review')
                  return pendingFiltered.length > 0 ? (
                    <input
                      type="checkbox"
                      checked={selectedDraftIds.length === pendingFiltered.length && pendingFiltered.length > 0}
                      ref={el => { if (el) el.indeterminate = selectedDraftIds.length > 0 && selectedDraftIds.length < pendingFiltered.length }}
                      onChange={toggleAllDrafts}
                      className="accent-house-muted"
                    />
                  ) : null
                })()}
                <span className="font-body text-xs text-text-muted">
                  {filteredDrafts.length === 0
                    ? 'No drafts'
                    : `${filteredDrafts.length} draft${filteredDrafts.length === 1 ? '' : 's'}`}
                  {allDrafts.length !== filteredDrafts.length && ` of ${allDrafts.length}`}
                </span>
              </div>
            )}

            <LoadingState loading={draftsLoading} error={draftsError} />

            {!draftsLoading && !draftsError && allDrafts.length === 0 && (
              <div className="px-4 py-12 text-center">
                <p className="font-body text-sm text-text-muted">No pending drafts.</p>
                <p className="font-body text-xs text-text-muted mt-1">
                  Extract from a conversation in the Conversations tab to generate drafts.
                </p>
              </div>
            )}

            {!draftsLoading && !draftsError && filteredDrafts.length === 0 && allDrafts.length > 0 && (
              <div className="px-4 py-8 text-center">
                <p className="font-body text-sm text-text-muted">No drafts match the current filters.</p>
              </div>
            )}

            {!draftsLoading && !draftsError && filteredDrafts.length > 0 && (
              <div>
                {filteredDrafts.map(draft => (
                  <ArchiveDraftCard
                    key={draft.id}
                    draft={draft}
                    onRefresh={refreshDrafts}
                    selected={selectedDraftIds.includes(draft.id)}
                    onToggleSelect={draft.draft_status === 'pending_review' ? toggleDraftSelect : undefined}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Memory Review tab ────────────────────────────────────────── */}
        {innerTab === 'memory' && (
          <>
            <div className="px-4 py-3 border-b border-house-border/40 space-y-1">
              <p className="font-body text-xs text-text-muted">
                Memory promotion queue. Confirm candidates as Memory, reject them, or hold for later review.
                Only Confirmed Memory entries are recall-eligible. Confirming Memory does not auto-approve graph nodes.
              </p>
            </div>

            {/* Audit summary cards */}
            {!itemsLoading && !itemsError && items.length > 0 && (
              <MemoryAuditCards items={items} />
            )}

            {/* Phase 30B: Eligibility governance panel */}
            {!itemsLoading && !itemsError && items.length > 0 && (
              <EligibilityGovernancePanel />
            )}

            {/* Memory Review filters */}
            {!itemsLoading && !itemsError && items.length > 0 && (
              <EntryFilters value={memoryFilters} onChange={setMemoryFilters} />
            )}

            {/* Memory Review bulk action bar */}
            {selectedMemoryIds.length > 0 && (
              <div className="sticky top-0 z-10 px-4 py-2 bg-house-surface border-b border-house-border flex flex-wrap items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedMemoryIds.length === filteredMemory.length}
                  ref={el => { if (el) el.indeterminate = selectedMemoryIds.length > 0 && selectedMemoryIds.length < filteredMemory.length }}
                  onChange={toggleAllMemory}
                  className="accent-house-muted"
                />
                <span className="font-body text-xs text-text-muted">{selectedMemoryIds.length} selected</span>
                <button
                  onClick={() => handleMemoryBulk('mark_candidate', selectedMemoryIds, setSelectedMemoryIds)}
                  disabled={memoryBulking}
                  className="font-body text-xs px-3 py-1 border border-house-border text-text-muted hover:text-text-secondary hover:border-house-muted transition-all disabled:opacity-40"
                >
                  Candidate
                </button>
                <button
                  onClick={() => handleMemoryBulk('confirm_memory', selectedMemoryIds, setSelectedMemoryIds)}
                  disabled={memoryBulking}
                  className="font-body text-xs px-3 py-1 border border-green-400/30 text-green-400 hover:bg-green-400/10 transition-all disabled:opacity-40"
                >
                  Confirm Memory
                </button>
                <button
                  onClick={() => handleMemoryBulk('reject_memory', selectedMemoryIds, setSelectedMemoryIds)}
                  disabled={memoryBulking}
                  className="font-body text-xs px-3 py-1 border border-red-400/20 text-red-400/60 hover:bg-red-400/10 transition-all disabled:opacity-40"
                >
                  Reject Memory
                </button>
                <button
                  onClick={() => handleMemoryBulk('demote_memory', selectedMemoryIds, setSelectedMemoryIds)}
                  disabled={memoryBulking}
                  className="font-body text-xs px-3 py-1 border border-house-border text-text-muted hover:text-text-secondary transition-all disabled:opacity-40"
                >
                  Demote
                </button>
                <button
                  onClick={() => handleMemoryBulk('hold_pending', selectedMemoryIds, setSelectedMemoryIds)}
                  disabled={memoryBulking}
                  className="font-body text-xs px-3 py-1 border border-blue-400/20 text-blue-400/60 hover:bg-blue-400/10 transition-all disabled:opacity-40"
                >
                  Hold / Keep pending
                </button>
                <button
                  onClick={() => handleMemoryBulk('restore_candidate', selectedMemoryIds, setSelectedMemoryIds)}
                  disabled={memoryBulking}
                  className="font-body text-xs px-3 py-1 border border-house-border text-text-muted hover:text-text-secondary transition-all disabled:opacity-40"
                >
                  Restore
                </button>
                <button
                  onClick={() => setSelectedMemoryIds([])}
                  className="ml-auto font-body text-[10px] text-text-muted hover:text-text-secondary transition-colors"
                >
                  Clear
                </button>
                {memoryBulkError && <p className="font-body text-xs text-red-400 w-full">{memoryBulkError}</p>}
              </div>
            )}

            {/* Count + select-all */}
            {!itemsLoading && !itemsError && (
              <div className="px-4 py-2 border-b border-house-border/40 flex items-center gap-3">
                {filteredMemory.length > 0 && (
                  <input
                    type="checkbox"
                    checked={selectedMemoryIds.length === filteredMemory.length && filteredMemory.length > 0}
                    ref={el => { if (el) el.indeterminate = selectedMemoryIds.length > 0 && selectedMemoryIds.length < filteredMemory.length }}
                    onChange={toggleAllMemory}
                    className="accent-house-muted"
                  />
                )}
                <span className="font-body text-xs text-text-muted">
                  {filteredMemory.length === 0
                    ? 'No entries'
                    : `${filteredMemory.length} entr${filteredMemory.length === 1 ? 'y' : 'ies'}`}
                  {items.length !== filteredMemory.length && ` of ${items.length}`}
                </span>
              </div>
            )}

            <LoadingState loading={itemsLoading} error={itemsError} />

            {/* Empty states */}
            {!itemsLoading && !itemsError && items.length === 0 && (
              <div className="px-4 py-12 text-center">
                <p className="font-body text-sm text-text-muted">No entries in {activeTabConfig.label} Archives yet.</p>
              </div>
            )}
            {!itemsLoading && !itemsError && filteredMemory.length === 0 && items.length > 0 && (
              <div className="px-4 py-10 text-center space-y-1">
                {memoryFilters.canonical_status === 'canonical_candidate' && (
                  <>
                    <p className="font-body text-sm text-text-muted">No Memory candidates yet.</p>
                    <p className="font-body text-xs text-text-muted">
                      Archive Entries can be marked as candidates from the Entries tab.
                    </p>
                  </>
                )}
                {memoryFilters.canonical_status === 'canonical' && (
                  <p className="font-body text-sm text-text-muted">No Confirmed Memory entries match these filters.</p>
                )}
                {memoryFilters.canonical_status === 'archive_only' && (
                  <p className="font-body text-sm text-text-muted">No Archive Only entries match these filters.</p>
                )}
                {!memoryFilters.canonical_status && (
                  <p className="font-body text-sm text-text-muted">No entries match the current filters.</p>
                )}
              </div>
            )}

            {!itemsLoading && !itemsError && filteredMemory.length > 0 && (
              <div>
                {filteredMemory.map(item => (
                  <ArchiveItemCard
                    key={item.id}
                    item={item}
                    onRefresh={refreshItems}
                    selected={selectedMemoryIds.includes(item.id)}
                    onToggleSelect={toggleMemorySelect}
                  />
                ))}
              </div>
            )}
          </>
        )}
        {/* ── Graph tab ───────────────────────────────────────────────── */}
        {innerTab === 'graph' && (
          <>
            <div className="px-4 py-3 border-b border-house-border/40 space-y-1">
              <p className="font-body text-xs text-text-muted">
                Concept graph extraction and candidate review.
                Nodes and edges proposed by extraction require your approval before they enter the graph.
              </p>
              <p className="font-body text-[11px] text-text-muted/60">
                Approving a graph node allows it in graph recall. It does not promote the source archive item to Memory.
              </p>
            </div>

            {/* Graph Extraction admin panel */}
            <div className="px-4 py-3 border-b border-house-border/40">
              <GraphExtractionPanel
                archiveName={activeTab}
                onDone={() => setGraphRefreshKey(k => k + 1)}
              />
            </div>

            {/* Candidate review — key includes graphRefreshKey to reload after extraction */}
            <GraphCandidatesTab
              key={`${activeTab}-graph-${graphRefreshKey}`}
              archiveName={activeTab}
            />
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
