'use client'

// Phase 27D — Filter bar for Archive Conversations (Sources) tab.
// Client-side filtering against the already-loaded sources list.

import {
  REVIEW_STATUS_LABELS,
  ALL_REVIEW_STATUSES,
  type ReviewStatus,
  type SourceOrigin,
} from '@/lib/archives'

export interface SourceFilterState {
  search:        string
  review_status: ReviewStatus | ''
  source_origin: SourceOrigin | ''
}

export const BLANK_SOURCE_FILTERS: SourceFilterState = {
  search:        '',
  review_status: '',
  source_origin: '',
}

const SOURCE_ORIGINS: { value: SourceOrigin; label: string }[] = [
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'claude',  label: 'Claude' },
  { value: 'house',   label: 'House' },
  { value: 'manual',  label: 'Manual' },
  { value: 'unknown', label: 'Unknown' },
]

interface Props {
  value:    SourceFilterState
  onChange: (f: SourceFilterState) => void
}

export default function SourceFilters({ value, onChange }: Props) {
  const set = (patch: Partial<SourceFilterState>) => onChange({ ...value, ...patch })
  const isActive = value.search || value.review_status || value.source_origin

  return (
    <div className="px-4 py-2 border-b border-house-border/40 flex flex-wrap items-center gap-2">
      {/* Text search */}
      <input
        type="text"
        value={value.search}
        onChange={e => set({ search: e.target.value })}
        placeholder="Search title, filename…"
        className="font-body text-xs bg-house-surface border border-house-border text-text-primary px-2 py-1 outline-none focus:border-house-muted placeholder:text-text-muted w-44"
      />

      {/* Review status */}
      <select
        value={value.review_status}
        onChange={e => set({ review_status: e.target.value as ReviewStatus | '' })}
        className="font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1 outline-none focus:border-house-muted"
      >
        <option value="">All statuses</option>
        {ALL_REVIEW_STATUSES.map(s => (
          <option key={s} value={s}>{REVIEW_STATUS_LABELS[s]}</option>
        ))}
      </select>

      {/* Source origin */}
      <select
        value={value.source_origin}
        onChange={e => set({ source_origin: e.target.value as SourceOrigin | '' })}
        className="font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1 outline-none focus:border-house-muted"
      >
        <option value="">All origins</option>
        {SOURCE_ORIGINS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Clear */}
      {isActive && (
        <button
          onClick={() => onChange(BLANK_SOURCE_FILTERS)}
          className="font-body text-[10px] text-text-muted hover:text-text-secondary transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  )
}
