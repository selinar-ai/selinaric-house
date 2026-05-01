'use client'

// Recall Review — filter controls
// Presence / Match quality / Feedback / Attention

import type { MatchQuality } from '@/lib/archive-recall'

export interface RecallFilterState {
  presenceId: 'ari' | 'eli' | ''
  matchQuality: MatchQuality | ''
  mode: 'manual' | 'auto' | ''
  hasFeedback: 'true' | 'false' | ''
  needsAttention: boolean
}

interface Props {
  filters: RecallFilterState
  onChange: (next: RecallFilterState) => void
}

const SELECT_CLASS = `
  bg-house-bg border border-house-border text-text-secondary
  font-body text-xs px-2 py-1.5 h-8
  focus:outline-none focus:border-house-muted transition-colors
`

export default function RecallFilters({ filters, onChange }: Props) {
  function set<K extends keyof RecallFilterState>(key: K, value: RecallFilterState[K]) {
    onChange({ ...filters, [key]: value })
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Presence */}
      <select
        value={filters.presenceId}
        onChange={e => set('presenceId', e.target.value as RecallFilterState['presenceId'])}
        className={SELECT_CLASS}
        title="Filter by presence"
      >
        <option value="">All presences</option>
        <option value="ari">Ari</option>
        <option value="eli">Eli</option>
      </select>

      {/* Match quality */}
      <select
        value={filters.matchQuality}
        onChange={e => set('matchQuality', e.target.value as RecallFilterState['matchQuality'])}
        className={SELECT_CLASS}
        title="Filter by match quality"
      >
        <option value="">All quality</option>
        <option value="strong">Strong</option>
        <option value="medium">Medium</option>
        <option value="weak">Weak</option>
        <option value="none">None</option>
      </select>

      {/* Mode */}
      <select
        value={filters.mode}
        onChange={e => set('mode', e.target.value as RecallFilterState['mode'])}
        className={SELECT_CLASS}
        title="Filter by recall mode"
      >
        <option value="">All modes</option>
        <option value="manual">Manual</option>
        <option value="auto">Auto</option>
      </select>

      {/* Feedback */}
      <select
        value={filters.hasFeedback}
        onChange={e => set('hasFeedback', e.target.value as RecallFilterState['hasFeedback'])}
        className={SELECT_CLASS}
        title="Filter by feedback"
      >
        <option value="">All feedback</option>
        <option value="true">Has feedback</option>
        <option value="false">No feedback</option>
      </select>

      {/* Needs attention toggle */}
      <button
        onClick={() => set('needsAttention', !filters.needsAttention)}
        className={`
          h-8 px-2.5 font-body text-xs border transition-colors
          ${filters.needsAttention
            ? 'text-orange-400 border-orange-400/40 bg-orange-400/10'
            : 'text-text-muted border-house-border bg-house-bg hover:text-text-secondary hover:border-house-muted'
          }
        `}
      >
        Needs attention
      </button>
    </div>
  )
}
