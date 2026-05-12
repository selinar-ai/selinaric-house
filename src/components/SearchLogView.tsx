'use client'

import { useState, useEffect, useCallback } from 'react'
import VoiceButton from '@/components/VoiceButton'

interface LibraryResultEntry {
  itemId: string
  title: string
  collection: string
  itemType: string
  presenceScope: string
  authorityStatus: string
  score: number
  rank: number
  matchedFields: string[]
  matchedFiles: { fileId: string; fileName: string; fileType: string; extractionMethod: string | null; ocrQuality: string | null; matchedField: string }[]
  snippets: { field: string; text: string }[]
}

interface SearchEntry {
  id: string
  presence_id: string
  room_slug: string
  query: string
  reason: string
  result_summary: string
  session_id: string | null
  created_at: string
  source_type?: 'web' | 'library'
  library_results?: LibraryResultEntry[] | null
  used_in_response?: boolean
}

type TimeWindow = 'all' | 'today'
type SourceFilter = 'all' | 'web' | 'library'

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
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
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
    if (sourceFilter !== 'all') params.set('source', sourceFilter)

    const res = await fetch(`/api/search-log?${params}`)
    if (res.ok) {
      const data = await res.json()
      setEntries(data)
    }
    setLoading(false)
  }, [presenceId, timeWindow, debouncedKeyword, sourceFilter])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  const isNoResults = !loading && entries.length === 0

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="shrink-0 flex flex-col gap-2 mb-4">
        <div className="flex gap-1.5 md:gap-2 flex-wrap">
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
          <span className="w-px bg-house-border self-stretch mx-0.5" />
          {(['all', 'web', 'library'] as SourceFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={`font-body text-[10px] md:text-xs tracking-wider uppercase px-2.5 py-2 border transition-all duration-200 min-h-[40px] ${
                sourceFilter === s
                  ? `${accentClass} border-current`
                  : 'text-text-muted border-house-border hover:text-text-secondary'
              }`}
            >
              {s === 'all' ? 'All sources' : s === 'web' ? 'Web' : 'Library'}
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

        {entries.map(entry => {
          const isLibrary = entry.source_type === 'library'
          return (
          <div
            key={entry.id}
            className="border border-house-border bg-house-surface p-4 space-y-2 animate-fade-in"
          >
            {/* Header row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`font-mono text-xs ${accentClass}`}>
                  {presenceId === 'eli' ? '◉' : '◈'} {entry.room_slug}
                </span>
                <span className={`font-body text-[10px] uppercase tracking-widest px-1.5 py-0.5 border ${
                  isLibrary
                    ? 'text-blue-400 border-blue-400/30'
                    : 'text-text-muted border-house-border'
                }`}>
                  {isLibrary ? 'Library' : 'Web'}
                </span>
                {isLibrary && entry.used_in_response && (
                  <span className="font-body text-[10px] text-green-400 tracking-wider">
                    used in response
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {entry.result_summary && entry.result_summary !== 'no useful results' && entry.result_summary !== 'No useful Library results found.' && (
                  <VoiceButton
                    text={`${entry.query}. ${entry.result_summary}`}
                    presenceId={presenceId}
                    accentClass={accentClass}
                    buttonClass="min-w-[32px] min-h-[32px]"
                  />
                )}
                <span className="font-mono text-xs text-text-muted">
                  {formatDate(entry.created_at)}
                </span>
              </div>
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

            {/* Library results detail */}
            {isLibrary && entry.library_results && entry.library_results.length > 0 && (
              <div>
                <span className="font-body text-[10px] text-text-muted uppercase tracking-widest">
                  Found
                </span>
                <div className="mt-1 space-y-1.5">
                  {entry.library_results.slice(0, 5).map((lr, idx) => (
                    <div key={idx} className="font-body text-xs text-text-secondary pl-2 border-l border-house-border">
                      <p className="text-text-primary">{lr.title}</p>
                      <p className="text-text-muted">
                        {lr.authorityStatus} · {lr.presenceScope} · score: {lr.score}
                        {lr.matchedFields.length > 0 && ` · matched: ${lr.matchedFields.join(', ')}`}
                      </p>
                      {lr.matchedFiles && lr.matchedFiles.length > 0 && (
                        <p className="text-text-muted">
                          files: {lr.matchedFiles.map(f => f.fileName).join(', ')}
                          {lr.matchedFiles.some(f => f.ocrQuality === 'noisy') && (
                            <span className="text-red-400 ml-1">(noisy OCR)</span>
                          )}
                        </p>
                      )}
                      {lr.snippets && lr.snippets.length > 0 && (
                        <p className="text-text-muted italic mt-0.5 truncate">
                          {lr.snippets[0].text.length > 120
                            ? lr.snippets[0].text.slice(0, 120) + '…'
                            : lr.snippets[0].text}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Web result summary (for non-Library entries) */}
            {!isLibrary && (
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
            )}

            {/* Library no-results fallback */}
            {isLibrary && (!entry.library_results || entry.library_results.length === 0) && (
              <div>
                <span className="font-body text-[10px] text-text-muted uppercase tracking-widest">
                  Result
                </span>
                <p className="font-body text-xs mt-0.5 text-text-muted italic">
                  No useful Library results found.
                </p>
              </div>
            )}
          </div>
          )
        })}
      </div>
    </div>
  )
}
