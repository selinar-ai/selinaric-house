'use client'

// Phase 37C — Filters toolbar for graph proposal review

import { GRAPH_AUTHORITY_STATUSES, GRAPH_PRESENCE_SCOPES, GRAPH_SOURCE_TYPES } from '@/lib/graph/types'

export interface ProposalFilterState {
  status: string
  proposalType: string
  presenceScope: string
  authorityStatus: string
  sourceType: string
  search: string
}

export const BLANK_FILTERS: ProposalFilterState = {
  status: 'pending_review',
  proposalType: '',
  presenceScope: '',
  authorityStatus: '',
  sourceType: '',
  search: '',
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'approved_graph', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'needs_more_evidence', label: 'Needs Evidence' },
  { value: 'workspace_only', label: 'Workspace Only' },
  { value: 'superseded', label: 'Superseded' },
]

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'node', label: 'Node' },
  { value: 'edge', label: 'Edge' },
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

export default function GraphProposalFilters({
  filters,
  onChange,
}: {
  filters: ProposalFilterState
  onChange: (filters: ProposalFilterState) => void
}) {
  function update(key: keyof ProposalFilterState, value: string) {
    onChange({ ...filters, [key]: value })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SelectFilter
        label="Status"
        value={filters.status}
        options={STATUS_OPTIONS}
        onChange={v => update('status', v)}
      />
      <SelectFilter
        label="Type"
        value={filters.proposalType}
        options={TYPE_OPTIONS}
        onChange={v => update('proposalType', v)}
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
        label="Source Type"
        value={filters.sourceType}
        options={SOURCE_TYPE_OPTIONS}
        onChange={v => update('sourceType', v)}
      />

      <input
        type="text"
        placeholder="Search proposals…"
        value={filters.search}
        onChange={e => update('search', e.target.value)}
        className="
          bg-house-surface border border-house-border rounded px-3 py-1.5
          text-text-secondary text-xs font-body placeholder:text-text-muted
          focus:outline-none focus:border-house-muted
          min-w-[160px] flex-1 max-w-[280px]
        "
      />

      {(filters.status !== 'pending_review' || filters.proposalType || filters.presenceScope || filters.authorityStatus || filters.search) && (
        <button
          onClick={() => onChange(BLANK_FILTERS)}
          className="text-text-muted text-xs hover:text-text-secondary transition-colors px-2 py-1"
        >
          Clear
        </button>
      )}
    </div>
  )
}
