'use client'

// Phase 29A — Semantic Search test panel
// Manual/debug only in Phase 29A — no chat integration.
// Calls POST /api/archive-recall/semantic with logEvent=true (logged to archive_recall_events).

import { useState } from 'react'
import type { SemanticCandidate } from '@/lib/archive-semantic'

interface SearchResult {
  entries:      SemanticCandidate[]
  matchQuality: string
  totalFound:   number
  recallEventId: string | null
}

const CATEGORY_LABELS: Record<string, string> = {
  relational_truth:       'Relational truth',
  identity_record:        'Identity record',
  architectural_history:  'Architectural history',
  poetic_symbolic:        'Poetic / symbolic',
  governance_law:         'Governance & law',
  ritual_practice:        'Ritual practice',
  health_care:            'Health & care',
  house_environment:      'House environment',
  personal_context:       'Personal context',
  superseded:             'Superseded',
  uncategorized:          'Uncategorised',
}

const ARCHIVE_LABELS: Record<string, string> = {
  velvet: 'Velvet',
  violet: 'Violet',
  house:  'House',
}

const STATUS_LABEL: Record<string, string> = {
  canonical:           'Memory',
  canonical_candidate: 'Memory candidate',
}

const INPUT_CLASS = `
  bg-house-bg border border-house-border text-text-primary
  font-body text-xs px-2 py-1.5 h-8
  focus:outline-none focus:border-house-muted transition-colors w-full
`

const SELECT_CLASS = `
  bg-house-bg border border-house-border text-text-secondary
  font-body text-xs px-2 py-1.5 h-8
  focus:outline-none focus:border-house-muted transition-colors
`

export default function SemanticSearchPanel() {
  const [open,       setOpen]       = useState(false)
  const [presenceId, setPresenceId] = useState<'ari' | 'eli'>('ari')
  const [query,      setQuery]      = useState('')
  const [result,     setResult]     = useState<SearchResult | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  async function handleSearch() {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/archive-recall/semantic', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ presenceId, query: query.trim(), logEvent: true }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Search failed'); return }
      setResult(data as SearchResult)
    } catch {
      setError('Request failed')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSearch()
  }

  return (
    <div className="mt-5 border-t border-house-border pt-4">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full"
      >
        <p className="font-body text-[10px] text-text-muted uppercase tracking-widest">
          Semantic Search
        </p>
        <span className="font-body text-[10px] text-text-muted ml-auto">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Controls */}
          <div className="flex gap-2 flex-wrap">
            <select
              value={presenceId}
              onChange={e => setPresenceId(e.target.value as 'ari' | 'eli')}
              className={SELECT_CLASS}
            >
              <option value="ari">Ari</option>
              <option value="eli">Eli</option>
            </select>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Semantic query…"
              className={`${INPUT_CLASS} flex-1 min-w-[160px]`}
            />
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="
                h-8 px-3 font-body text-xs border border-house-border
                bg-house-surface text-text-secondary
                hover:border-house-muted hover:text-text-primary
                disabled:opacity-40 disabled:cursor-not-allowed transition-colors
              "
            >
              {loading ? '…' : 'Search'}
            </button>
          </div>

          {/* Error */}
          {error && (
            <p className="font-body text-xs text-red-400">{error}</p>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="font-body text-[10px] text-text-muted">
                  {result.totalFound} result{result.totalFound !== 1 ? 's' : ''}
                </span>
                <span className="font-body text-[10px] text-text-muted">
                  quality: {result.matchQuality}
                </span>
                {result.recallEventId && (
                  <span className="font-mono text-[9px] text-text-muted opacity-50">
                    logged
                  </span>
                )}
              </div>

              {result.entries.length === 0 ? (
                <p className="font-body text-xs text-text-muted italic">
                  No results above similarity threshold.
                </p>
              ) : (
                result.entries.map((entry) => (
                  <div
                    key={entry.archive_item_id}
                    className="border border-house-border bg-house-surface px-3 py-2.5 space-y-1"
                  >
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className="font-body text-xs text-text-primary flex-1 min-w-0">
                        {entry.title}
                      </span>
                      <span className="font-mono text-[10px] text-emerald-400/80 shrink-0">
                        {(entry.similarity * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="font-body text-[10px] text-text-muted">
                        {ARCHIVE_LABELS[entry.archive_name] ?? entry.archive_name}
                      </span>
                      <span className="font-body text-[10px] text-text-muted">
                        {STATUS_LABEL[entry.canonical_status] ?? entry.canonical_status}
                      </span>
                      <span className="font-body text-[10px] text-text-muted">
                        {CATEGORY_LABELS[entry.category] ?? entry.category}
                      </span>
                      <span className="font-body text-[10px] text-text-muted">
                        {entry.sensitivity}
                      </span>
                    </div>
                    {entry.excerpt && (
                      <p className="font-body text-[10px] text-text-muted line-clamp-2">
                        {entry.excerpt}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
