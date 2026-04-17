'use client'

import { useState, useEffect, useCallback } from 'react'

interface SearchEntry {
  id: string
  presence_id: string
  room_slug: string
  query: string
  reason: string
  result_summary: string
  session_id: string | null
  created_at: string
}

type TimeWindow = 'all' | 'today'

interface Props {
  presenceId: 'ari' | 'eli'
  accentClass: string
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function SearchLogView({ presenceId, accentClass }: Props) {
  const [entries, setEntries] = useState<SearchEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('all')
  const [keyword, setKeyword] = useState('')
  const [debouncedKeyword, setDebouncedKeyword] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(keyword), 300)
    return () => clearTimeout(timer)
  }, [keyword])

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ presence: presenceId })
    if (timeWindow !== 'all') params.set('window', timeWindow)
    if (debouncedKeyword) params.set('q', debouncedKeyword)

    const res = await fetch(`/api/search-log?${params}`)
    if (res.ok) {
      const data = await res.json()
      setEntries(data)
    }
    setLoading(false)
  }, [presenceId, timeWindow, debouncedKeyword])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  const isNoResults = !loading && entries.length === 0

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="shrink-0 flex flex-col gap-2 mb-4">
        <div className="flex gap-1.5 md:gap-2">
          {(['all', 'today'] as TimeWindow[]).map(w => (
            <button
              key={w}
              onClick={() => setTimeWindow(w)}
              className={`font-body text-[10px] md:text-xs tracking-wider uppercase px-2.5 py-2 border transition-all duration-200 min-h-[40px] ${
                timeWindow === w
                  ? `${accentClass} border-current`
                  : 'text-text-muted border-house-border hover:text-text-secondary'
              }`}
            >
              {w === 'all' ? 'All time' : 'Today'}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder="Filter by keyword..."
          className="
            bg-house-bg border border-house-border
            px-3 py-2 font-body text-xs text-text-primary
            placeholder:text-text-muted outline-none
            focus:border-text-muted transition-colors duration-200
            max-w-xs
          "
        />
      </div>

      {/* Log */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
        {loading && (
          <div className="flex items-center justify-center h-24">
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" />
              <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.2s' }} />
              <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
        )}

        {isNoResults && (
          <div className="flex items-center justify-center h-24">
            <p className="font-body text-sm text-text-muted">
              {debouncedKeyword ? 'No searches match that filter.' : 'No searches logged yet.'}
            </p>
          </div>
        )}

        {entries.map(entry => (
          <div
            key={entry.id}
            className="border border-house-border bg-house-surface p-4 space-y-2 animate-fade-in"
          >
            {/* Header row */}
            <div className="flex items-center justify-between gap-2">
              <span className={`font-mono text-xs ${accentClass}`}>
                {presenceId === 'eli' ? '◉' : '◈'} {entry.room_slug}
              </span>
              <span className="font-mono text-xs text-text-muted">
                {formatDate(entry.created_at)}
              </span>
            </div>

            {/* Query */}
            <div>
              <span className="font-body text-[10px] text-text-muted uppercase tracking-widest">
                Query
              </span>
              <p className="font-body text-sm text-text-primary mt-0.5">
                {entry.query}
              </p>
            </div>

            {/* Reason */}
            <div>
              <span className="font-body text-[10px] text-text-muted uppercase tracking-widest">
                Reason
              </span>
              <p className="font-body text-xs text-text-secondary mt-0.5">
                {entry.reason}
              </p>
            </div>

            {/* Result summary */}
            <div>
              <span className="font-body text-[10px] text-text-muted uppercase tracking-widest">
                Result
              </span>
              <p className={`font-body text-xs mt-0.5 ${
                entry.result_summary === 'no useful results'
                  ? 'text-text-muted italic'
                  : 'text-text-secondary'
              }`}>
                {entry.result_summary === 'no useful results'
                  ? 'no useful results'
                  : entry.result_summary.length > 200
                    ? entry.result_summary.slice(0, 200) + '…'
                    : entry.result_summary
                }
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
