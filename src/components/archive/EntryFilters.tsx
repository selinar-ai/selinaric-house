'use client'

// Phase 27D — Filter bar for Archive Entries tab.
// Phase 29A — memory_status removed; canonical_status covers Memory filtering.

import {
  STATUS_LABELS,
  ALL_STATUSES,
  CATEGORY_LABELS,
  ALL_CATEGORIES,
  type CanonicalStatus,
  type ArchiveCategory,
} from '@/lib/archives'

export interface EntryFilterState {
  search:            string
  canonical_status:  CanonicalStatus | ''
  category:          ArchiveCategory | ''
  has_linked_source: 'yes' | 'no' | ''
}

export const BLANK_ENTRY_FILTERS: EntryFilterState = {
  search:            '',
  canonical_status:  '',
  category:          '',
  has_linked_source: '',
}

interface Props {
  value:    EntryFilterState
  onChange: (f: EntryFilterState) => void
}

export default function EntryFilters({ value, onChange }: Props) {
  const set = (patch: Partial<EntryFilterState>) => onChange({ ...value, ...patch })
  const isActive = value.search || value.canonical_status || value.category || value.has_linked_source

  return (
    <div className="px-4 py-2 border-b border-house-border/40 flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={value.search}
        onChange={e => set({ search: e.target.value })}
        placeholder="Search title, content…"
        className="font-body text-xs bg-house-surface border border-house-border text-text-primary px-2 py-1 outline-none focus:border-house-muted placeholder:text-text-muted w-44"
      />

      <select
        value={value.canonical_status}
        onChange={e => set({ canonical_status: e.target.value as CanonicalStatus | '' })}
        className="font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1 outline-none focus:border-house-muted"
      >
        <option value="">All statuses</option>
        {ALL_STATUSES.map(s => (
          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
        ))}
      </select>

      <select
        value={value.category}
        onChange={e => set({ category: e.target.value as ArchiveCategory | '' })}
        className="font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1 outline-none focus:border-house-muted"
      >
        <option value="">All categories</option>
        {ALL_CATEGORIES.map(c => (
          <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
        ))}
      </select>

      <select
        value={value.has_linked_source}
        onChange={e => set({ has_linked_source: e.target.value as 'yes' | 'no' | '' })}
        className="font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1 outline-none focus:border-house-muted"
      >
        <option value="">Any source</option>
        <option value="yes">Has linked source</option>
        <option value="no">No linked source</option>
      </select>

      {isActive && (
        <button
          onClick={() => onChange(BLANK_ENTRY_FILTERS)}
          className="font-body text-[10px] text-text-muted hover:text-text-secondary transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  )
}
