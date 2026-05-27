'use client'

// Phase 37D — Toolbar for the Relational Map.
// Filters, search, view toggle, export. No mutation actions.

import {
  GRAPH_NODE_TYPES,
  GRAPH_EDGE_TYPES,
  GRAPH_PRESENCE_SCOPES,
  GRAPH_AUTHORITY_STATUSES,
  GRAPH_SOURCE_TYPES,
} from '@/lib/graph/types'

export type ViewMode = 'graph' | 'table'

export interface MapFilterState {
  nodeType: string
  edgeType: string
  presenceScope: string
  authorityStatus: string
  sourceType: string
  search: string
}

export const BLANK_MAP_FILTERS: MapFilterState = {
  nodeType: '',
  edgeType: '',
  presenceScope: '',
  authorityStatus: '',
  sourceType: '',
  search: '',
}

// ─── Select Component ──────────────────────────────────────────────────────

function SelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (val: string) => void
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      aria-label={label}
      className="
        bg-house-surface border border-house-border rounded px-2 py-1.5
        text-text-secondary text-xs font-body
        focus:outline-none focus:border-house-muted
        min-w-[120px]
      "
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────

interface ToolbarProps {
  filters: MapFilterState
  onFiltersChange: (filters: MapFilterState) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onExport: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFitView: () => void
  hasData: boolean
}

const NODE_TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  ...GRAPH_NODE_TYPES.map(t => ({ value: t, label: t.replace(/_/g, ' ') })),
]

const EDGE_TYPE_OPTIONS = [
  { value: '', label: 'All relations' },
  ...GRAPH_EDGE_TYPES.map(t => ({ value: t, label: t.replace(/_/g, ' ') })),
]

const SCOPE_OPTIONS = [
  { value: '', label: 'All scopes' },
  ...GRAPH_PRESENCE_SCOPES.map(s => ({ value: s, label: s })),
]

const AUTHORITY_OPTIONS = [
  { value: '', label: 'All authority' },
  ...GRAPH_AUTHORITY_STATUSES.map(a => ({ value: a, label: a.replace(/_/g, ' ') })),
]

const SOURCE_TYPE_OPTIONS = [
  { value: '', label: 'All sources' },
  ...GRAPH_SOURCE_TYPES.map(s => ({ value: s, label: s.replace(/_/g, ' ') })),
]

export default function RelationalMapToolbar({
  filters,
  onFiltersChange,
  viewMode,
  onViewModeChange,
  onExport,
  onZoomIn,
  onZoomOut,
  onFitView,
  hasData,
}: ToolbarProps) {
  function update(key: keyof MapFilterState, value: string) {
    onFiltersChange({ ...filters, [key]: value })
  }

  const hasActiveFilters = filters.nodeType || filters.edgeType ||
    filters.presenceScope || filters.authorityStatus ||
    filters.sourceType || filters.search

  return (
    <div className="flex flex-col gap-2">
      {/* Row 1: View toggle + Search + Zoom + Export */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* View toggle */}
        <div className="flex bg-house-surface border border-house-border rounded overflow-hidden">
          <button
            onClick={() => onViewModeChange('graph')}
            className={`px-3 py-1.5 text-xs font-body transition-colors ${
              viewMode === 'graph'
                ? 'bg-house-muted text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Graph
          </button>
          <button
            onClick={() => onViewModeChange('table')}
            className={`px-3 py-1.5 text-xs font-body transition-colors ${
              viewMode === 'table'
                ? 'bg-house-muted text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Table
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search entities…"
          value={filters.search}
          onChange={e => update('search', e.target.value)}
          className="
            bg-house-surface border border-house-border rounded px-3 py-1.5
            text-text-secondary text-xs font-body placeholder:text-text-muted
            focus:outline-none focus:border-house-muted
            min-w-[160px] flex-1 max-w-[280px]
          "
        />

        <div className="flex-1" />

        {/* Zoom controls (graph mode only) */}
        {viewMode === 'graph' && (
          <div className="flex items-center gap-1">
            <button
              onClick={onZoomOut}
              className="text-text-muted hover:text-text-secondary text-xs px-1.5 py-1 border border-house-border rounded transition-colors"
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              onClick={onFitView}
              className="text-text-muted hover:text-text-secondary text-[10px] px-2 py-1 border border-house-border rounded transition-colors font-mono"
              aria-label="Fit view"
            >
              ⊞
            </button>
            <button
              onClick={onZoomIn}
              className="text-text-muted hover:text-text-secondary text-xs px-1.5 py-1 border border-house-border rounded transition-colors"
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
        )}

        {/* Export */}
        {hasData && (
          <button
            onClick={onExport}
            className="
              text-text-muted hover:text-text-secondary text-xs
              px-3 py-1.5 border border-house-border rounded
              transition-colors font-body
            "
          >
            Export Visible Graph
          </button>
        )}
      </div>

      {/* Row 2: Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <SelectFilter
          label="Node type"
          value={filters.nodeType}
          options={NODE_TYPE_OPTIONS}
          onChange={v => update('nodeType', v)}
        />
        <SelectFilter
          label="Edge type"
          value={filters.edgeType}
          options={EDGE_TYPE_OPTIONS}
          onChange={v => update('edgeType', v)}
        />
        <SelectFilter
          label="Scope"
          value={filters.presenceScope}
          options={SCOPE_OPTIONS}
          onChange={v => update('presenceScope', v)}
        />
        <SelectFilter
          label="Authority"
          value={filters.authorityStatus}
          options={AUTHORITY_OPTIONS}
          onChange={v => update('authorityStatus', v)}
        />
        <SelectFilter
          label="Source"
          value={filters.sourceType}
          options={SOURCE_TYPE_OPTIONS}
          onChange={v => update('sourceType', v)}
        />

        {hasActiveFilters && (
          <button
            onClick={() => onFiltersChange(BLANK_MAP_FILTERS)}
            className="text-text-muted text-xs hover:text-text-secondary transition-colors px-2 py-1"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
