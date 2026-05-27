'use client'

// Phase 37C — Graph Review / Ontology Lab
//
// The graph may reveal relationship.
// The graph may propose meaning.
// The graph does not crown truth.
//
// Proposal is not approval.
// Approval is not Memory.
// Graph authority is not Memory authority.

import { useState, useEffect, useCallback } from 'react'
import GraphProposalFilters, { type ProposalFilterState, BLANK_FILTERS } from '@/components/graph/GraphProposalFilters'
import GraphProposalTable from '@/components/graph/GraphProposalTable'
import GraphProposalInspector from '@/components/graph/GraphProposalInspector'
import GraphProposalBulkToolbar from '@/components/graph/GraphProposalBulkToolbar'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Proposal {
  id: string
  proposal_type: string
  status: string
  presence_scope: string
  authority_status: string
  node_type: string | null
  edge_type: string | null
  proposed_label: string
  proposed_summary: string | null
  proposed_payload: Record<string, unknown>
  confidence: number
  salience: number
  reason: string
  safe_wording: string | null
  prompt_eligible: boolean
  primary_source_type: string
  primary_source_id: string
  proposed_by: string
  generation_model: string | null
  generation_version: string
  created_at: string
  updated_at: string
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function OntologyLabPage() {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [filters, setFilters] = useState<ProposalFilterState>(BLANK_FILTERS)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' | 'error' } | null>(null)

  // ─── Fetch proposals ──────────────────────────────────────────────────────

  const fetchProposals = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.status) params.set('status', filters.status)
      if (filters.proposalType) params.set('proposal_type', filters.proposalType)
      if (filters.presenceScope) params.set('presence_scope', filters.presenceScope)
      if (filters.authorityStatus) params.set('authority_status', filters.authorityStatus)
      if (filters.sourceType) params.set('source_type', filters.sourceType)
      if (filters.search) params.set('search', filters.search)
      params.set('limit', '100')

      const resp = await fetch(`/api/graph-proposals?${params.toString()}`)
      if (resp.ok) {
        const data = await resp.json()
        setProposals(data.proposals ?? [])
      }
    } catch {
      showToast('Failed to load proposals', 'error')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    fetchProposals()
  }, [fetchProposals])

  // ─── Toast ────────────────────────────────────────────────────────────────

  function showToast(message: string, type: 'success' | 'warning' | 'error') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  // ─── Selection ────────────────────────────────────────────────────────────

  function handleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleToggleAll() {
    const allVisibleSelected = proposals.every(p => selectedIds.has(p.id))
    if (allVisibleSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(proposals.map(p => p.id)))
    }
  }

  function handleClearSelection() {
    setSelectedIds(new Set())
  }

  function handleRowClick(id: string) {
    setActiveId(prev => prev === id ? null : id)
  }

  // ─── Bulk actions ─────────────────────────────────────────────────────────

  async function handleBulkAction(newStatus: string, reason?: string) {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    if (ids.length > 100) {
      showToast('Maximum 100 proposals per bulk action.', 'warning')
      return
    }

    setBulkLoading(true)
    try {
      const resp = await fetch('/api/graph-proposals/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalIds: ids, status: newStatus, reason }),
      })

      if (resp.ok) {
        const data = await resp.json()
        if (data.skipped > 0) {
          showToast(`Updated ${data.updated} proposals. ${data.skipped} skipped.`, 'warning')
        } else {
          showToast(`Updated ${data.updated} proposals.`, 'success')
        }
        setSelectedIds(new Set())
        fetchProposals()
      } else {
        const data = await resp.json()
        showToast(data.error ?? 'Bulk action failed', 'error')
      }
    } catch {
      showToast('Bulk action failed', 'error')
    } finally {
      setBulkLoading(false)
    }
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  function handleExport() {
    const selected = proposals.filter(p => selectedIds.has(p.id))
    if (selected.length === 0) return

    const exportData = {
      exported_at: new Date().toISOString(),
      count: selected.length,
      proposals: selected,
    }

    const json = JSON.stringify(exportData, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `graph-proposals-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)

    showToast(`Exported ${selected.length} proposals.`, 'success')
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-4 md:px-8 lg:px-12 pt-4 md:pt-8 pb-2 md:pb-4 border-b border-house-border">
        <div className="hidden md:flex items-center gap-3 mb-3">
          <span className="text-text-secondary text-2xl shrink-0">⬢</span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-4xl font-light text-text-primary">
              Graph Review / Ontology Lab
            </h2>
            <p className="font-body text-sm text-text-muted">
              Governed review for graph proposals. Not Memory.
            </p>
          </div>
        </div>

        {/* Governance notice */}
        <div className="bg-house-bg border border-house-border rounded px-3 py-2 mb-3">
          <p className="text-text-muted text-[11px] font-body leading-relaxed">
            Graph proposal only — not Memory, not Archive authority, not prompt truth until reviewed.
          </p>
        </div>

        {/* Filters */}
        <GraphProposalFilters filters={filters} onChange={setFilters} />
      </div>

      {/* Main content area */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left: table */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Bulk toolbar */}
          <div className="shrink-0 px-4 md:px-8 py-2">
            <GraphProposalBulkToolbar
              selectedCount={selectedIds.size}
              onAction={handleBulkAction}
              onClear={handleClearSelection}
              onExport={handleExport}
              loading={bulkLoading}
            />
          </div>

          {/* Table */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-8">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-text-muted text-xs font-body animate-pulse">Loading proposals…</p>
              </div>
            ) : proposals.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <p className="text-text-muted text-sm font-body mb-1">
                    {filters.status || filters.proposalType || filters.presenceScope || filters.authorityStatus || filters.search
                      ? 'No proposals match these filters.'
                      : 'No graph proposals are waiting for review.'}
                  </p>
                  <p className="text-text-muted text-xs font-body opacity-60">
                    Proposals are created by the graph pipeline from source records.
                  </p>
                </div>
              </div>
            ) : (
              <GraphProposalTable
                proposals={proposals}
                selectedIds={selectedIds}
                activeId={activeId}
                onSelect={handleSelect}
                onToggleAll={handleToggleAll}
                onRowClick={handleRowClick}
              />
            )}
          </div>
        </div>

        {/* Right: inspector */}
        {activeId && (
          <div className="
            w-[380px] shrink-0 border-l border-house-border
            bg-house-surface overflow-hidden
            hidden lg:flex flex-col
          ">
            <GraphProposalInspector
              proposalId={activeId}
              onStatusChange={fetchProposals}
              onClose={() => setActiveId(null)}
            />
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`
          fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded shadow-lg
          text-xs font-body animate-fade-in
          ${toast.type === 'success' ? 'bg-emerald-900/90 text-emerald-200 border border-emerald-700/40' : ''}
          ${toast.type === 'warning' ? 'bg-amber-900/90 text-amber-200 border border-amber-700/40' : ''}
          ${toast.type === 'error' ? 'bg-red-900/90 text-red-200 border border-red-700/40' : ''}
        `}>
          {toast.message}
        </div>
      )}
    </div>
  )
}
