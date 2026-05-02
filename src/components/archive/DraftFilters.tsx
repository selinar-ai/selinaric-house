'use client'

// Phase 27D — Filter bar for Archive Drafts tab.

import {
  DRAFT_STATUS_LABELS,
  ALL_DRAFT_STATUSES,
  CATEGORY_LABELS,
  ALL_CATEGORIES,
  SUGGESTED_MEMORY_LABELS,
  ALL_SUGGESTED_MEMORY_STATUSES,
  type DraftStatus,
  type ArchiveCategory,
  type SuggestedMemoryStatus,
} from '@/lib/archives'

export interface DraftFilterState {
  search:                  string
  draft_status:            DraftStatus | ''
  extracted_by:            'ari' | 'eli' | ''
  suggested_memory_status: SuggestedMemoryStatus | ''
  category:                ArchiveCategory | ''
}

export const BLANK_DRAFT_FILTERS: DraftFilterState = {
  search:                  '',
  draft_status:            'pending_review',
  extracted_by:            '',
  suggested_memory_status: '',
  category:                '',
}

interface Props {
  value:    DraftFilterState
  onChange: (f: DraftFilterState) => void
}

export default function DraftFilters({ value, onChange }: Props) {
  const set = (patch: Partial<DraftFilterState>) => onChange({ ...value, ...patch })
  const isActive = value.search || value.draft_status !== 'pending_review'
    || value.extracted_by || value.suggested_memory_status || value.category

  return (
    <div className="px-4 py-2 border-b border-house-border/40 flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={value.search}
        onChange={e => set({ search: e.target.value })}
        placeholder="Search draft title…"
        className="font-body text-xs bg-house-surface border border-house-border text-text-primary px-2 py-1 outline-none focus:border-house-muted placeholder:text-text-muted w-40"
      />

      <select
        value={value.draft_status}
        onChange={e => set({ draft_status: e.target.value as DraftStatus | '' })}
        className="font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1 outline-none focus:border-house-muted"
      >
        <option value="">All statuses</option>
        {ALL_DRAFT_STATUSES.map(s => (
          <option key={s} value={s}>{DRAFT_STATUS_LABELS[s]}</option>
        ))}
      </select>

      <select
        value={value.extracted_by}
        onChange={e => set({ extracted_by: e.target.value as 'ari' | 'eli' | '' })}
        className="font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1 outline-none focus:border-house-muted"
      >
        <option value="">Ari + Eli</option>
        <option value="ari">Ari only</option>
        <option value="eli">Eli only</option>
      </select>

      <select
        value={value.suggested_memory_status}
        onChange={e => set({ suggested_memory_status: e.target.value as SuggestedMemoryStatus | '' })}
        className="font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1 outline-none focus:border-house-muted"
      >
        <option value="">All memory suggestions</option>
        {ALL_SUGGESTED_MEMORY_STATUSES.map(s => (
          <option key={s} value={s}>{SUGGESTED_MEMORY_LABELS[s]}</option>
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

      {isActive && (
        <button
          onClick={() => onChange(BLANK_DRAFT_FILTERS)}
          className="font-body text-[10px] text-text-muted hover:text-text-secondary transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  )
}
